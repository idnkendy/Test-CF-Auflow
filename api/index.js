
// --- CẤU HÌNH ---
// Lấy các biến này từ Cloudflare Worker Settings (Environment Variables)
// CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN
// ADMIN_SECRET (Để bảo vệ endpoint update_token)

const PROJECT_ID = "eb9c4bc9-54aa-4068-b146-c0a8076f7d7a";

const HEADERS = {
    'content-type': 'text/plain;charset=UTF-8',
    'origin': 'https://labs.google',
    'referer': 'https://labs.google/fx/tools/flow',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// Hàm xin Token mới từ Google bằng Refresh Token (Cơ chế 1: Chính thống)
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
    await env.VIDEO_KV.put('GOOGLE_TOKEN', newAccessToken, { expirationTtl: 3000 });
    return newAccessToken;
}

// Hàm lấy Token: Ưu tiên Cache KV -> Refresh Token
async function getAccessToken(env) {
    try {
        // 1. Thử lấy từ KV (Token này có thể do Python Script bơm vào hoặc do lần refresh trước)
        const kvToken = await env.VIDEO_KV.get('GOOGLE_TOKEN');
        if (kvToken) {
            return kvToken;
        }
        
        // 2. Nếu không có trong KV, thử dùng Refresh Token (nếu đã cấu hình)
        if (env.REFRESH_TOKEN) {
             return await refreshAccessToken(env);
        }

        throw new Error("No token available. Please run the Python Helper script or configure OAuth.");

    } catch (e) {
        console.error("Auth Error:", e);
        throw e;
    }
}

async function uploadImage(token, base64Data) {
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

    const res = await fetch('https://aisandbox-pa.googleapis.com/v1/uploadUserImage', {
        method: 'POST',
        headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Upload Failed (${res.status}): ${errText}`);
    }
    const data = await res.json();
    
    // Handle various response formats from Google
    let mediaId = data.mediaGenerationId?.mediaGenerationId || data.mediaGenerationId || data.imageOutput?.image?.id;
    
    if (!mediaId) throw new Error("No mediaId found in upload response");
    return mediaId;
}

async function triggerGeneration(token, prompt, mediaId) {
    const sceneId = crypto.randomUUID();
    
    const payload = {
        "clientContext": {
            "sessionId": ";" + Date.now(),
            "projectId": PROJECT_ID,
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
        headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
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
        "clientContext": {
            "sessionId": ";" + Date.now()
        }
    };

    const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoUpsampleVideo', {
        method: 'POST',
        headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
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

async function checkStatus(token, task_id, scene_id) {
    const payload = {
        "operations": [{
            "operation": { "name": task_id },
            "sceneId": scene_id,
            "status": "MEDIA_GENERATION_STATUS_ACTIVE"
        }]
    };

    const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus', {
        method: 'POST',
        headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
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

        const sendJson = (data, status = 200) => {
            return new Response(JSON.stringify(data), {
                status: status,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        };

        try {
            let body = {};
            try {
                if (request.method !== 'GET' && request.method !== 'HEAD') {
                    body = await request.json();
                }
            } catch (e) {}

            const url = new URL(request.url);
            const path = url.pathname;
            let action = body.action || '';

            // Routing
            if (!action) {
                if (path.includes('/auth')) action = 'auth';
                else if (path.includes('/update-token')) action = 'update_token'; // Endpoint for Python script
                else if (path.includes('/upload')) action = 'upload';
                else if (path.includes('/create')) action = 'create';
                else if (path.includes('/upscale')) action = 'upscale';
                else if (path.includes('/check')) action = 'check';
            }

            // --- API HANDLERS ---

            if (action === 'auth') {
                const token = await getAccessToken(env);
                return sendJson({ token });
            }
            
            // ACTION: UPDATE TOKEN (Called by Python Script)
            else if (action === 'update_token') {
                const { token, secret } = body;
                // Bảo mật cơ bản: Kiểm tra secret key
                const adminSecret = env.ADMIN_SECRET || "opzen_admin_secret_123";
                
                if (secret !== adminSecret) {
                    return sendJson({ error: "Unauthorized: Sai Admin Secret" }, 401);
                }
                
                if (!token) return sendJson({ error: "Token is empty" }, 400);

                await env.VIDEO_KV.put('GOOGLE_TOKEN', token);
                return sendJson({ success: true, message: "Token đã được cập nhật thành công từ Python Script" });
            }

            else if (action === 'upload') {
                const { image } = body;
                const token = await getAccessToken(env);
                const mediaId = await uploadImage(token, image);
                return sendJson({ mediaId });
            }
            else if (action === 'create') {
                const { prompt, mediaId } = body;
                const token = await getAccessToken(env);
                const result = await triggerGeneration(token, prompt, mediaId);
                return sendJson(result);
            }
            else if (action === 'upscale') {
                const { mediaId } = body;
                const token = await getAccessToken(env);
                const result = await triggerUpscale(token, mediaId);
                return sendJson(result);
            }
            else if (action === 'check') {
                const { task_id, scene_id } = body;
                const token = await getAccessToken(env);
                const result = await checkStatus(token, task_id, scene_id);
                return sendJson(result);
            }
            else {
                return sendJson({ status: "ok", message: "Video API Worker Running" }, 200);
            }

        } catch (error) {
            return sendJson({ error: true, message: error.message || String(error) }, 500);
        }
    }
};
