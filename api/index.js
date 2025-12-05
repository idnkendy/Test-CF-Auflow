
// --- CẤU HÌNH ---
// Lấy các biến này từ Cloudflare Worker Settings (Environment Variables)
// ADMIN_SECRET (Để bảo vệ endpoint update_token)
// SUPABASE_URL, SUPABASE_SERVICE_KEY (Để xử lý Webhook thanh toán & Lấy Key)
// GEMINI_API_KEY (KEY DỰ PHÒNG)

// !!! QUAN TRỌNG: DÁN API KEY CỦA BẠN VÀO ĐÂY NẾU CHƯA CẤU HÌNH ENV !!!
const FALLBACK_GEMINI_API_KEY = ""; 

// Fallback credentials from client source if Env vars are missing
const DEFAULT_SUPABASE_URL = 'https://mtlomjjlgvsjpudxlspq.supabase.co';
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10bG9tampsZ3ZzanB1ZHhsc3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMzAwMjcsImV4cCI6MjA3ODkwNjAyN30.6K-rSAFVJxQPLVjZKdJpBspb5tHE1dZiry4lS6u6JzQ";

const HEADERS = {
    'content-type': 'text/plain;charset=UTF-8', // Google bắt buộc text/plain
    'origin': 'https://labs.google',
    'referer': 'https://labs.google/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

// --- LOGIC LẤY KEY GEMINI TỪ SUPABASE (Server-Side) ---
async function getGeminiKeySecurely(env) {
    if (env.VIDEO_KV) {
        const cachedKey = await env.VIDEO_KV.get('GEMINI_ACTIVE_KEY');
        if (cachedKey) return cachedKey;
    }

    if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
    if (FALLBACK_GEMINI_API_KEY && FALLBACK_GEMINI_API_KEY.length > 10) return FALLBACK_GEMINI_API_KEY;

    const sbUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const sbKey = env.SUPABASE_SERVICE_KEY || DEFAULT_SUPABASE_KEY;

    if (sbUrl && sbKey) {
        try {
            const response = await fetch(`${sbUrl}/rest/v1/api_keys?select=key_value&is_active=eq.true`, {
                headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                    const randomIndex = Math.floor(Math.random() * data.length);
                    const key = data[randomIndex].key_value;
                    if (key) {
                        if (env.VIDEO_KV) await env.VIDEO_KV.put('GEMINI_ACTIVE_KEY', key, { expirationTtl: 300 });
                        return key;
                    }
                }
            }
        } catch (e) {
            console.error("[Proxy] Exception fetching key from Supabase:", e);
        }
    }
    throw new Error("GEMINI_API_KEY not configured.");
}

// --- PROXY HANDLER (Image/Text Generation) ---
async function handleGeminiProxy(body, env, request) {
    const { model, payload, method = 'generateContent' } = body;
    const apiKey = await getGeminiKeySecurely(env);
    const version = 'v1beta'; 
    const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:${method}?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        data = await response.json();
    } else {
        const text = await response.text();
        data = { 
            error: { 
                message: `Upstream Google Error (${response.status}): ${text.substring(0, 200)}...`, 
                status: response.status,
                type: 'upstream_error'
            } 
        };
    }
    return { data, status: response.status, ok: response.ok };
}

// --- VIDEO GENERATION AUTH (Lấy từ bảng video_accounts) ---
async function getAuthData(env) {
    const sbUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const sbKey = env.SUPABASE_SERVICE_KEY || DEFAULT_SUPABASE_KEY;

    try {
        const response = await fetch(`${sbUrl}/rest/v1/video_accounts?select=access_token,auth_cookies,project_id&is_active=eq.true&access_token=not.is.null`, {
            method: 'GET',
            headers: {
                'apikey': sbKey,
                'Authorization': `Bearer ${sbKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error("Lỗi kết nối DB Supabase");
        
        const accounts = await response.json();
        
        if (!accounts || accounts.length === 0) {
            throw new Error("Hệ thống đang cập nhật tài khoản Video. Vui lòng thử lại sau.");
        }

        const randomAccount = accounts[Math.floor(Math.random() * accounts.length)];
        
        if (!randomAccount.project_id) {
             const validAccounts = accounts.filter(acc => acc.project_id);
             if (validAccounts.length > 0) {
                 const fallback = validAccounts[Math.floor(Math.random() * validAccounts.length)];
                 return { token: fallback.access_token, cookies: fallback.auth_cookies, projectId: fallback.project_id };
             } else {
                 throw new Error("Tài khoản chưa được cấu hình Project ID. Vui lòng liên hệ Admin.");
             }
        }
        
        return { 
            token: randomAccount.access_token, 
            cookies: randomAccount.auth_cookies, 
            projectId: randomAccount.project_id 
        };

    } catch (e) {
        console.error("Get Auth Data Error:", e);
        throw new Error(e.message || "Không thể lấy thông tin xác thực từ hệ thống.");
    }
}

// --- VIDEO GENERATION FUNCTIONS (Veo) ---
async function uploadImage(authData, base64Data) {
    const { token, cookies } = authData;
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

    const payload = {
        "imageInput": { 
            "aspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE", 
            "isUserUploaded": true, 
            "mimeType": "image/jpeg", 
            "rawImageBytes": cleanBase64 
        },
        "clientContext": { "sessionId": ";" + Date.now(), "tool": "ASSET_MANAGER" }
    };

    // Keep v1:uploadUserImage as it likely maps to a root verb
    const res = await fetch('https://aisandbox-pa.googleapis.com/v1:uploadUserImage', {
        method: 'POST',
        headers: { 
            ...HEADERS, 
            'authorization': `Bearer ${token}`,
            'cookie': cookies || ''
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Upload Failed (${res.status}): ${errText}`);
    }
    const data = await res.json();

    let mediaId = data.mediaGenerationId?.mediaGenerationId || data.mediaGenerationId || data.imageOutput?.image?.id;
    if (!mediaId) throw new Error("No mediaId found in upload response");
    return mediaId;
}

async function triggerGeneration(authData, prompt, mediaId) {
    const { token, cookies, projectId } = authData;
    const sceneId = crypto.randomUUID();

    const payload = {
        "clientContext": {
            "sessionId": ";" + Date.now(),
            "projectId": projectId,
            "tool": "PINHOLE",
            "userPaygateTier": "PAYGATE_TIER_TWO"
        },
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
        headers: { 
            ...HEADERS, 
            'authorization': `Bearer ${token}`,
            'cookie': cookies || ''
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Trigger Failed (${res.status}): ${errText}`);
    }
    const data = await res.json();

    const opItem = data.operations?.[0];
    const operationName = opItem?.operation?.name || opItem?.name;
    if (!operationName) throw new Error("No operation name returned in trigger response");

    return { task_id: operationName, scene_id: sceneId };
}

async function triggerUpscale(authData, mediaId) {
    const { token, cookies, projectId } = authData;
    const sceneId = crypto.randomUUID();
    
    // Using the payload structure from the python snippet
    const payload = {
        "requests": [{
            "aspectRatio": "VIDEO_ASPECT_RATIO_LANDSCAPE",
            "seed": Math.floor(Date.now() / 1000),
            "videoInput": { "mediaId": mediaId },
            "videoModelKey": "veo_2_1080p_upsampler_8s",
            "metadata": { "sceneId": sceneId }
        }],
        "clientContext": {
            "sessionId": ";" + Date.now(),
            "projectId": projectId,
            "tool": "PINHOLE",
            "userPaygateTier": "PAYGATE_TIER_TWO"
        }
    };

    const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoUpsampleVideo', {
        method: 'POST',
        headers: { 
            ...HEADERS, 
            'authorization': `Bearer ${token}`,
            'cookie': cookies || ''
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Upscale Trigger Failed (${res.status}): ${errText}`);
    }
    const data = await res.json();
    
    const opItem = data.operations?.[0];
    const operationName = opItem?.operation?.name || opItem?.name;
    if (!operationName) throw new Error("No operation name returned in upscale trigger response");
    
    return { task_id: operationName, scene_id: sceneId };
}

async function checkStatus(authData, task_id, scene_id) {
    const { token, cookies } = authData;
    const payload = {
        "operations": [{
            "operation": { "name": task_id },
            "sceneId": scene_id,
            "status": "MEDIA_GENERATION_STATUS_ACTIVE"
        }]
    };

    const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus', {
        method: 'POST',
        headers: { 
            ...HEADERS, 
            'authorization': `Bearer ${token}`,
            'cookie': cookies || ''
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Check Status Failed (${res.status})`);

    const data = await res.json();
    const opResult = data.operations?.[0];
    if (!opResult) return { status: 'processing' };

    const status = opResult.status;

    if (["MEDIA_GENERATION_STATUS_SUCCESSFUL", "MEDIA_GENERATION_STATUS_COMPLETED", "DONE"].includes(status)) {
        let vidUrl = opResult.operation?.metadata?.video?.fifeUrl || 
                     opResult.videoFiles?.[0]?.url || 
                     opResult.response?.videoUrl;

        // Extract Media ID for potential upscaling
        let mediaId = opResult.response?.id || 
                      opResult.operation?.response?.id ||
                      opResult.mediaGenerationId;

        if (vidUrl) return { status: 'completed', video_url: vidUrl, mediaId: mediaId };
        return { status: 'failed', message: 'Video URL not found in response' };
    }

    if (status === "MEDIA_GENERATION_STATUS_FAILED") {
        return { status: 'failed', message: JSON.stringify(opResult) };
    }

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
        
        const sbUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
        const sbKey = env.SUPABASE_SERVICE_KEY || DEFAULT_SUPABASE_KEY;

        const response = await fetch(`${sbUrl}/rest/v1/rpc/webhook_approve_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` },
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

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Helper to send JSON response
        const sendJson = (data, status = 200) => {
            return new Response(JSON.stringify(data), {
                status: status,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        };

        const url = new URL(request.url);
        const path = url.pathname;

        if (path.includes('/sepay-webhook')) return handleSePayWebhook(request, env);

        try {
            let body = {};
            try {
                if (request.method !== 'GET' && request.method !== 'HEAD') {
                    body = await request.json();
                }
            } catch (e) {
                // Ignore if body is empty or not JSON
            }

            let action = body.action || '';

            if (!action) {
                if (path.includes('/gemini-proxy')) action = 'gemini_proxy';
                else if (path.includes('/auth')) action = 'auth';
                else if (path.includes('/upload')) action = 'upload';
                else if (path.includes('/create')) action = 'create';
                else if (path.includes('/upscale')) action = 'upscale';
                else if (path.includes('/check')) action = 'check';
                else if (path.includes('/update-token')) action = 'update_token';
            }

            // --- ROUTER ---
            if (action === 'gemini_proxy') {
                const { data, status } = await handleGeminiProxy(body, env, request);
                return sendJson(data, status); 
            }
            else if (action === 'auth') {
                const authData = await getAuthData(env);
                return sendJson({ status: "connected", token: authData.token ? "active" : null });
            } 
            else if (action === 'upload') {
                const authData = await getAuthData(env);
                const mediaId = await uploadImage(authData, body.image);
                return sendJson({ mediaId });
            }
            else if (action === 'create') {
                const authData = await getAuthData(env);
                const result = await triggerGeneration(authData, body.prompt, body.mediaId);
                return sendJson(result);
            }
            else if (action === 'upscale') {
                const authData = await getAuthData(env);
                const result = await triggerUpscale(authData, body.mediaId);
                return sendJson(result);
            }
            else if (action === 'check') {
                const authData = await getAuthData(env);
                const result = await checkStatus(authData, body.task_id, body.scene_id);
                return sendJson(result);
            }
            else if (action === 'update_token') {
                return sendJson({ status: "deprecated", message: "Bot should update Supabase video_accounts table directly." });
            }
            else {
                return sendJson({ 
                    status: "ok", 
                    message: "Cloudflare Worker is running", 
                    request_path: path,
                    detected_action: action || "none"
                }, 200);
            }

        } catch (error) {
            return sendJson({ 
                error: true, 
                message: error.message || String(error)
            }, 500);
        }
    }
};