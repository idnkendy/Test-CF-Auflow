
// --- CẤU HÌNH (TOKEN MỚI NHẤT) ---
const PROJECT_ID = "eb9c4bc9-54aa-4068-b146-c0a8076f7d7a";

// Token mới nhất
const T1 = "ya29.a0ATi6K2skDQEHlhWqykzF8xsy4zg9_-At9HnAux4GSTv69_7NidKIhqMXGn7FsTQvLtL5Cg_dr2fag4W-btZvcLl_IyY_jQj";
const T2 = "LuC2eZ8BciFYD6OfyRBc1zeQEIzi0oKe8NneiilXuVWKEciBClIvg27ZrAg2A3a3LU6zOXm3VOtVRhsBOHo8PJ3TdQIyywVnBtt-";
const T3 = "mLLge-txPMgczxHQPmDAx3qoS4r_vxoaniZYukJZfQKaAIcvtRuAgUxz0pxB2KKMeaso1ePdwuRkIxU-FJQdb3ppon9pcsKvwZfG";
const T4 = "m1PWlZ_nGLVvWIuw0xo6xesGXSEnsy0P7DxBf42XgRKpTHaIsw4_BtP_AHl2n1wTHkx4aCgYKAccSARQSFQHGX2MiNqwPwi4lWBt9GARzx27g1Q0370";
const FALLBACK_TOKEN = T1 + T2 + T3 + T4;

const HEADERS = {
    'content-type': 'text/plain;charset=UTF-8',
    'origin': 'https://labs.google',
    'referer': 'https://labs.google/fx/tools/flow',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function getAccessToken() {
    return FALLBACK_TOKEN;
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

    const res = await fetch('https://aisandbox-pa.googleapis.com/v1:uploadUserImage', {
        method: 'POST',
        headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
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

    const res = await fetch('https://aisandbox-pa.googleapis.com/v1:video:batchAsyncGenerateVideoStartImage', {
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

async function checkStatus(token, task_id, scene_id) {
    const payload = {
        "operations": [{
            "operation": { "name": task_id },
            "sceneId": scene_id,
            "status": "MEDIA_GENERATION_STATUS_ACTIVE"
        }]
    };

    const res = await fetch('https://aisandbox-pa.googleapis.com/v1:video:batchCheckAsyncVideoGenerationStatus', {
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
        
        if (vidUrl) return { status: 'completed', video_url: vidUrl };
        return { status: 'failed', message: 'Video URL not found in response' };
    }
    
    if (status === "MEDIA_GENERATION_STATUS_FAILED") {
        return { status: 'failed', message: JSON.stringify(opResult) };
    }

    return { status: 'processing' };
}

export default {
    async fetch(request, env, ctx) {
        // --- CORS Headers ---
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        };

        // Handle OPTIONS request
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

        try {
            // --- Parse Body ---
            let body = {};
            try {
                if (request.method !== 'GET' && request.method !== 'HEAD') {
                    body = await request.json();
                }
            } catch (e) {
                // Ignore if body is empty or not JSON
            }

            // --- Determine Action ---
            const url = new URL(request.url);
            const path = url.pathname;
            let action = body.action || '';

            // Map URL paths to actions if action not provided in body
            if (!action) {
                if (path.endsWith('/auth')) action = 'auth';
                else if (path.endsWith('/upload')) action = 'upload';
                else if (path.endsWith('/create')) action = 'create';
                else if (path.endsWith('/check')) action = 'check';
            }

            // --- ROUTER ---
            if (action === 'auth') {
                const token = await getAccessToken();
                return sendJson({ token });
            } 
            else if (action === 'upload') {
                const { token, image } = body;
                const activeToken = token || await getAccessToken();
                const mediaId = await uploadImage(activeToken, image);
                return sendJson({ mediaId });
            }
            else if (action === 'create') {
                const { token, prompt, mediaId } = body;
                const activeToken = token || await getAccessToken();
                const result = await triggerGeneration(activeToken, prompt, mediaId);
                return sendJson(result);
            }
            else if (action === 'check') {
                const { task_id, scene_id, token } = body;
                const activeToken = token || await getAccessToken();
                const result = await checkStatus(activeToken, task_id, scene_id);
                return sendJson(result);
            }
            else {
                return sendJson({ 
                    error: `Action not found: ${action || path}`,
                    info: "Cloudflare Worker is running. Use /auth, /upload, /create, /check endpoints."
                }, 404);
            }

        } catch (error) {
            return sendJson({ 
                error: true, 
                message: error.message || String(error)
            }, 500);
        }
    }
};
