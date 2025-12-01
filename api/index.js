
// --- CẤU HÌNH ---
// Lấy các biến này từ Cloudflare Worker Settings (Environment Variables)
// CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN
// ADMIN_SECRET (Để bảo vệ endpoint update_token)
// SUPABASE_URL, SUPABASE_SERVICE_KEY (Để xử lý Webhook thanh toán & Lấy Key)
// GEMINI_API_KEY (KEY DỰ PHÒNG)

const PROJECT_ID = "eb9c4bc9-54aa-4068-b146-c0a8076f7d7a";

const HEADERS = {
    'content-type': 'text/plain;charset=UTF-8',
    'origin': 'https://labs.google',
    'referer': 'https://labs.google/fx/tools/flow',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// Hàm xin Token mới từ Google bằng Refresh Token (Cho Video Gen - Veo)
async function refreshAccessToken(env) {
    console.log("[Auth] Refreshing Access Token via OAuth...");
    
    if (!env.CLIENT_ID || !env.CLIENT_SECRET || !env.REFRESH_TOKEN) {
        throw new Error("Missing OAuth Environment Variables");
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: env.CLIENT_ID,
            client_secret: env.CLIENT_SECRET,
            refresh_token: env.REFRESH_TOKEN,
            grant_type: 'refresh_token'
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Failed to refresh token: ${data.error_description || data.error}`);
    }

    const newAccessToken = data.access_token;
    if (env.VIDEO_KV) {
        await env.VIDEO_KV.put('GOOGLE_TOKEN', newAccessToken, { expirationTtl: 3000 });
    }
    return newAccessToken;
}

// Hàm lấy Token Video Gen
async function getAccessToken(env) {
    try {
        if (env.VIDEO_KV) {
            const kvToken = await env.VIDEO_KV.get('GOOGLE_TOKEN');
            if (kvToken) return kvToken;
        }
        if (env.REFRESH_TOKEN) {
             return await refreshAccessToken(env);
        }
        throw new Error("No token available. Please configure OAuth variables.");
    } catch (e) {
        console.error("Auth Error:", e);
        throw e;
    }
}

// --- LOGIC LẤY KEY GEMINI TỪ SUPABASE (Server-Side) ---
async function getGeminiKeySecurely(env) {
    // 1. Nếu có biến môi trường GEMINI_API_KEY, dùng nó làm dự phòng hoặc ưu tiên tùy logic
    // Nhưng theo yêu cầu, ta sẽ ưu tiên lấy từ Supabase để bạn dễ quản lý "usage"
    
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
        // Kiểm tra cache trong KV trước để đỡ tốn request gọi DB (Cache ngắn hạn 60s)
        if (env.VIDEO_KV) {
            const cachedKey = await env.VIDEO_KV.get('GEMINI_ACTIVE_KEY');
            if (cachedKey) return cachedKey;
        }

        console.log("[Proxy] Fetching API Key from Supabase...");
        try {
            // Lấy 1 key cụ thể (ví dụ: 'google_gemini_api_key')
            // Bạn có thể đổi tên key này trong bảng app_config trên Supabase
            const response = await fetch(`${env.SUPABASE_URL}/rest/v1/app_config?key_name=eq.google_gemini_api_key&select=value`, {
                headers: {
                    'apikey': env.SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
                }
            });
            
            if (!response.ok) throw new Error("Failed to connect to Supabase");
            
            const data = await response.json();
            
            if (data && data.length > 0 && data[0].value) {
                const key = data[0].value;
                
                // Cache key này vào KV trong 5 phút để giảm tải cho Supabase
                if (env.VIDEO_KV) {
                    await env.VIDEO_KV.put('GEMINI_ACTIVE_KEY', key, { expirationTtl: 300 });
                }
                return key;
            }
        } catch (e) {
            console.error("Failed to fetch key from Supabase:", e);
        }
    }

    // Fallback: Dùng biến môi trường nếu không lấy được từ Supabase
    if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;

    throw new Error("GEMINI_API_KEY not configured on Server (Supabase/Env)");
}

// --- PROXY HANDLER (Image/Text Generation) ---
async function handleGeminiProxy(body, env) {
    const { model, payload, method = 'generateContent' } = body;
    
    // Lấy Key an toàn từ Supabase/Env
    const apiKey = await getGeminiKeySecurely(env);
    
    const version = 'v1beta'; 
    const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:${method}?key=${apiKey}`;

    console.log(`[Gemini Proxy] Calling Google: ${model}:${method}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!response.ok) {
        console.error("[Gemini Proxy] Google Error:", data);
        // Trả lỗi về client nhưng TUYỆT ĐỐI KHÔNG trả về API Key trong message lỗi
        const errMessage = data.error?.message || "Error from Google API";
        const safeMessage = errMessage.replace(apiKey, 'HIDDEN_KEY');
        throw new Error(safeMessage);
    }

    return data;
}

// --- VIDEO GENERATION FUNCTIONS (Veo) ---
async function uploadImage(token, base64Data) {
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const payload = {
        "imageInput": { "aspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE", "isUserUploaded": true, "mimeType": "image/jpeg", "rawImageBytes": cleanBase64 },
        "clientContext": { "sessionId": ";" + Date.now(), "tool": "ASSET_MANAGER" }
    };
    const res = await fetch('https://aisandbox-pa.googleapis.com/v1/uploadUserImage', {
        method: 'POST',
        headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    let mediaId = data.mediaGenerationId?.mediaGenerationId || data.mediaGenerationId || data.imageOutput?.image?.id;
    if (!mediaId) throw new Error("No mediaId found in upload response");
    return mediaId;
}

async function triggerGeneration(token, prompt, mediaId) {
    const sceneId = crypto.randomUUID();
    const payload = {
        "clientContext": { "sessionId": ";" + Date.now(), "projectId": PROJECT_ID, "tool": "PINHOLE", "userPaygateTier": "PAYGATE_TIER_TWO" },
        "requests": [{
            "aspectRatio": "VIDEO_ASPECT_RATIO_LANDSCAPE",
            "seed": Math.floor(Date.now() / 1000), 
            "textInput": { "prompt": prompt },
            "videoModelKey": "veo_3_1_i2v_s_fast_ultra",
            "startImage": { "mediaId": mediaId },
            "metadata": { "sceneId": sceneId }
        }]
    };
    const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoStartImage', {
        method: 'POST',
        headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    const opItem = data.operations?.[0];
    const operationName = opItem?.operation?.name || opItem?.name;
    if (!operationName) throw new Error("No operation name returned");
    return { task_id: operationName, scene_id: sceneId };
}

async function triggerUpscale(token, mediaId) {
    const sceneId = crypto.randomUUID();
    const payload = {
        "requests": [{
            "aspectRatio": "VIDEO_ASPECT_RATIO_LANDSCAPE",
            "seed": Math.floor(Date.now() / 1000),
            "videoInput": { "mediaId": mediaId },
            "videoModelKey": "veo_2_1080p_upsampler_8s",
            "metadata": { "sceneId": sceneId }
        }],
        "clientContext": { "sessionId": ";" + Date.now() }
    };
    const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoUpsampleVideo', {
        method: 'POST',
        headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    const opItem = data.operations?.[0];
    const operationName = opItem?.operation?.name || opItem?.name;
    if (!operationName) throw new Error("No operation name returned");
    return { task_id: operationName, scene_id: sceneId };
}

async function checkStatus(token, task_id, scene_id) {
    const payload = {
        "operations": [{ "operation": { "name": task_id }, "sceneId": scene_id, "status": "MEDIA_GENERATION_STATUS_ACTIVE" }]
    };
    const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus', {
        method: 'POST',
        headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    const opResult = data.operations?.[0];
    if (!opResult) return { status: 'processing' };
    const status = opResult.status;
    if (["MEDIA_GENERATION_STATUS_SUCCESSFUL", "MEDIA_GENERATION_STATUS_COMPLETED", "DONE"].includes(status)) {
        let vidUrl = opResult.operation?.metadata?.video?.fifeUrl || opResult.videoFiles?.[0]?.url || opResult.response?.videoUrl;
        let mediaId = opResult.response?.id || opResult.operation?.response?.id || opResult.mediaGenerationId;
        if (vidUrl) return { status: 'completed', video_url: vidUrl, mediaId: mediaId };
        return { status: 'failed', message: 'Video URL not found' };
    }
    if (status === "MEDIA_GENERATION_STATUS_FAILED") return { status: 'failed', message: JSON.stringify(opResult) };
    return { status: 'processing' };
}

async function handleSePayWebhook(request, env) {
    try {
        const body = await request.json();
        const content = body.content || body.description || "";
        const amount = body.transferAmount || body.amount || 0;
        const match = content.match(/OPZ\d+/i);
        const transactionCode = match ? match[0].toUpperCase() : null;

        if (!transactionCode) return new Response(JSON.stringify({ success: false, message: "No transaction code" }), { status: 200 });
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error("Missing Supabase Config");

        const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/webhook_approve_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` },
            body: JSON.stringify({ p_transaction_code: transactionCode, p_amount: amount })
        });
        return new Response(JSON.stringify(await response.json()), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
    }
}

export default {
    async fetch(request, env, ctx) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        };

        if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

        const url = new URL(request.url);
        const path = url.pathname;

        if (path.includes('/sepay-webhook')) return handleSePayWebhook(request, env);

        const sendJson = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        try {
            let body = {};
            try { if (request.method !== 'GET') body = await request.json(); } catch (e) {}
            let action = body.action || '';

            // Map URL path to action if not present in body
            if (!action) {
                if (path.includes('/gemini-proxy')) action = 'gemini_proxy';
                else if (path.includes('/auth')) action = 'auth';
                else if (path.includes('/upload')) action = 'upload';
                else if (path.includes('/create')) action = 'create';
                else if (path.includes('/upscale')) action = 'upscale';
                else if (path.includes('/check')) action = 'check';
            }

            // --- ROUTING ---
            if (action === 'gemini_proxy') {
                const result = await handleGeminiProxy(body, env);
                return sendJson(result);
            }
            else if (action === 'auth') {
                const token = await getAccessToken(env);
                return sendJson({ token });
            }
            else if (action === 'upload') {
                const mediaId = await uploadImage(await getAccessToken(env), body.image);
                return sendJson({ mediaId });
            }
            else if (action === 'create') {
                const result = await triggerGeneration(await getAccessToken(env), body.prompt, body.mediaId);
                return sendJson(result);
            }
            else if (action === 'upscale') {
                const result = await triggerUpscale(await getAccessToken(env), body.mediaId);
                return sendJson(result);
            }
            else if (action === 'check') {
                const result = await checkStatus(await getAccessToken(env), body.task_id, body.scene_id);
                return sendJson(result);
            }
            else {
                return sendJson({ status: "ok", message: "Worker Active" });
            }

        } catch (error) {
            return sendJson({ error: true, message: error.message }, 500);
        }
    }
};
