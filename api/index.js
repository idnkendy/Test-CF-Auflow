
// ... existing config and helpers ...
const FALLBACK_GEMINI_API_KEY = ""; 
const TEST_ACCESS_TOKEN = ""; 
const TEST_MEDIA_ID = ""; 
const TEST_PROJECT_ID = ""; 
const DEFAULT_SUPABASE_URL = 'https://mtlomjjlgvsjpudxlspq.supabase.co';
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10bG9tampsZ3ZzanB1ZHhsc3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMzAwMjcsImV4cCI6MjA3ODkwNjAyN30.6K-rSAFVJxQPLVjZKdJpBspb5tHE1dZiry4lS6u6JzQ";
const ONEWISE_PROXY_URL_CREATE = "https://new-rest.onewise.app/api/fix/create-video-veo3";
const ONEWISE_PROXY_URL_CHECK = "https://new-rest.onewise.app/api/fix/task-status";
const ONEWISE_PROXY_AUTH = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ODcsInJvbGUiOjMsImlhdCI6MTc2NjI4NTg2Mn0.zLqDOTRuYAnavQyNWFoZL6NdEVXBUqbdfujnLwY199E";

const HEADERS = {
    'content-type': 'text/plain;charset=UTF-8', 
    'origin': 'https://labs.google',
    'referer': 'https://labs.google/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

function cleanToken(token) {
    if (!token) return "";
    return token.trim().replace(/^["']|["']$/g, '');
}

async function getGeminiKeySecurely(env) {
    if (env.VIDEO_KV) {
        const cachedKey = await env.VIDEO_KV.get('GEMINI_ACTIVE_KEY');
        if (cachedKey) return cleanToken(cachedKey);
    }
    if (env.GEMINI_API_KEY) return cleanToken(env.GEMINI_API_KEY);
    if (FALLBACK_GEMINI_API_KEY && FALLBACK_GEMINI_API_KEY.length > 10) return cleanToken(FALLBACK_GEMINI_API_KEY);
    const sbUrl = cleanToken(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
    const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || DEFAULT_SUPABASE_KEY);
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
                        const cleanedKey = cleanToken(key);
                        if (env.VIDEO_KV) await env.VIDEO_KV.put('GEMINI_ACTIVE_KEY', cleanedKey, { expirationTtl: 300 });
                        return cleanedKey;
                    }
                }
            }
        } catch (e) {
            console.error("[Proxy] Exception fetching key from Supabase:", e);
        }
    }
    throw new Error("GEMINI_API_KEY not configured.");
}

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

async function resetAllUsageCounts(env) {
    const sbUrl = cleanToken(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
    const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || DEFAULT_SUPABASE_KEY);
    try {
        await fetch(`${sbUrl}/rest/v1/video_accounts?is_active=eq.true`, {
            method: 'PATCH',
            headers: {
                'apikey': sbKey,
                'Authorization': `Bearer ${sbKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ usage_count: 0 })
        });
    } catch (e) { console.error("Failed to reset usage counts:", e); }
}

async function incrementAccountUsage(env, accountId, currentUsage) {
    const sbUrl = cleanToken(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
    const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || DEFAULT_SUPABASE_KEY);
    try {
        await fetch(`${sbUrl}/rest/v1/video_accounts?id=eq.${accountId}`, {
            method: 'PATCH',
            headers: {
                'apikey': sbKey,
                'Authorization': `Bearer ${sbKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ usage_count: (currentUsage || 0) + 1 })
        });
    } catch (e) { console.error(`[DB Update] Exception incrementing usage for account ${accountId}:`, e); }
}

async function getAllAccounts(env) {
    const sbUrl = cleanToken(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
    const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || DEFAULT_SUPABASE_KEY);
    try {
        const response = await fetch(`${sbUrl}/rest/v1/video_accounts?select=id,access_token,auth_cookies,project_id,usage_count,usage_limit&is_active=eq.true&access_token=not.is.null&order=updated_at.desc`, {
            method: 'GET',
            headers: {
                'apikey': sbKey,
                'Authorization': `Bearer ${sbKey}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) throw new Error("Lỗi kết nối DB Supabase");
        let accounts = await response.json();
        if (!accounts || accounts.length === 0) throw new Error("Hệ thống đang cập nhật tài khoản Video. Vui lòng thử lại sau.");
        let availableAccounts = accounts.filter(acc => {
            const used = acc.usage_count || 0;
            const limit = acc.usage_limit || 50; 
            return used < limit;
        });
        if (availableAccounts.length === 0) {
            await resetAllUsageCounts(env);
            accounts = accounts.map(acc => ({ ...acc, usage_count: 0 }));
            availableAccounts = accounts; 
        }
        if (availableAccounts.length > 5) {
             const topFresh = availableAccounts.slice(0, 5).sort(() => Math.random() - 0.5);
             const others = availableAccounts.slice(5).sort(() => Math.random() - 0.5);
             return [...topFresh, ...others];
        }
        return availableAccounts.sort(() => Math.random() - 0.5);
    } catch (e) {
        throw new Error(e.message || "Không thể lấy thông tin xác thực từ hệ thống.");
    }
}

async function executeWithFailover(env, accounts, operationName, callback) {
    let lastError = null;
    for (const account of accounts) {
        if (!account.project_id) continue;
        try {
            const result = await callback(account);
            if (operationName !== 'CheckStatus' && operationName !== 'UploadImage' && operationName !== 'CheckFlowStatus') {
                 incrementAccountUsage(env, account.id, account.usage_count).catch(err => console.error("Failed to increment usage post-success:", err));
            }
            return result; 
        } catch (e) {
            lastError = e;
            const msg = e.message || "";
            const isRetryable = msg.includes("401") || msg.includes("403") || msg.includes("429") || msg.includes("500") || msg.includes("502") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("UNAUTHENTICATED") || msg.includes("PERMISSION_DENIED");
            if (isRetryable) { console.warn(`[${operationName}] Account ${account.id} failed. Switching. Error: ${msg}`); continue; } 
            else { console.error(`[${operationName}] Permanent Error: ${msg}`); throw e; }
        }
    }
    throw lastError || new Error(`All accounts failed for ${operationName}`);
}

async function performUpload(authData, base64Data, imageAspectRatio) {
    const { access_token: token, auth_cookies: cookies, project_id: projectId } = authData;
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const aspectRatioEnum = imageAspectRatio || "IMAGE_ASPECT_RATIO_LANDSCAPE";
    const payload = {
        "imageInput": { 
            "aspectRatio": aspectRatioEnum, 
            "isUserUploaded": true, 
            "mimeType": "image/jpeg", 
            "rawImageBytes": cleanBase64 
        },
        "clientContext": { 
            "sessionId": ";" + Date.now(), 
            "tool": "PINHOLE", 
            "projectId": projectId,
            "userPaygateTier": "PAYGATE_TIER_TWO"
        }
    };
    const res = await fetch('https://aisandbox-pa.googleapis.com/v1:uploadUserImage', {
        method: 'POST',
        headers: { 
            ...HEADERS, 
            'authorization': `Bearer ${cleanToken(token)}`,
            'cookie': cookies || ''
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Upload Failed (${res.status}): ${errText}`);
    }
    const data = await res.json();
    const mediaId = data.mediaGenerationId?.mediaGenerationId || data.mediaGenerationId || data.imageOutput?.image?.id;
    if (!mediaId) throw new Error("No mediaId found in upload response");
    return mediaId;
}

async function uploadImage(env, accounts, base64Data, imageAspectRatio) {
    return executeWithFailover(env, accounts, "UploadImage", async (authData) => {
        return await performUpload(authData, base64Data, imageAspectRatio);
    });
}

async function triggerGeneration(env, accounts, prompt, mediaId, videoAspectRatio, imageData, imageAspectRatio) {
    return executeWithFailover(env, accounts, "CreateVideo", async (authData) => {
        const { access_token: token, auth_cookies: cookies, project_id: projectId } = authData;
        let activeMediaId = mediaId;
        if (imageData) {
            activeMediaId = await performUpload(authData, imageData, imageAspectRatio);
        }
        const sceneId = crypto.randomUUID();
        const aspectRatioEnum = videoAspectRatio || "VIDEO_ASPECT_RATIO_LANDSCAPE";
        const modelKey = (aspectRatioEnum === "VIDEO_ASPECT_RATIO_PORTRAIT") 
            ? "veo_3_1_i2v_s_fast_portrait_ultra" 
            : "veo_3_1_i2v_s_fast_ultra";
        const payload = {
            "clientContext": {
                "sessionId": ";" + Date.now(),
                "projectId": projectId,
                "tool": "PINHOLE",
                "userPaygateTier": "PAYGATE_TIER_TWO"
            },
            "requests": [{
                "aspectRatio": aspectRatioEnum,
                "seed": Math.floor(Date.now() / 1000), 
                "textInput": { "prompt": prompt },
                "videoModelKey": modelKey, 
                "startImage": { "mediaId": activeMediaId },
                "metadata": { "sceneId": sceneId }
            }]
        };
        const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoStartImage', {
            method: 'POST',
            headers: { ...HEADERS, 'authorization': `Bearer ${cleanToken(token)}`, 'cookie': cookies || '' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Trigger Failed (${res.status})`);
        const data = await res.json();
        const operationName = data.operations?.[0]?.operation?.name || data.operations?.[0]?.name;
        return { task_id: operationName, scene_id: sceneId };
    });
}

// --- NEW ACTION: FLOW MEDIA CREATE (GEM_PIX_2) VIA PROXY (START TASK) ---
// Updated to support multiple image inputs (Source + References)
async function triggerFlowMediaCreate(env, accounts, prompt, imageData, imageAspectRatio, dynamicToken, numberOfImages = 1, imageModelName = "GEM_PIX_2", inputImages = []) {
    return executeWithFailover(env, accounts, "CreateFlowImage", async (authData) => {
        const { access_token: token, auth_cookies: cookies, project_id: projectId } = authData;
        
        // Handle uploading multiple images
        const imageInputList = [];
        
        // Determine which images to upload. Priority: inputImages array, fallback to single imageData
        let imagesToUpload = [];
        if (inputImages && Array.isArray(inputImages) && inputImages.length > 0) {
            imagesToUpload = inputImages;
        } else if (imageData) {
            imagesToUpload = [imageData];
        }

        // Loop upload to get mediaIds
        for (const imgBase64 of imagesToUpload) {
            if (imgBase64) {
                const mediaId = await performUpload(authData, imgBase64, imageAspectRatio);
                // All uploaded images are added as REFERENCE inputs
                imageInputList.push({
                    "name": mediaId,
                    "imageInputType": "IMAGE_INPUT_TYPE_REFERENCE"
                });
            }
        }
        
        const flowUrl = `https://aisandbox-pa.googleapis.com/v1/projects/${projectId}/flowMedia:batchGenerateImages`;
        const sessionId = ";" + Date.now();

        // Create multiple request objects (batch generation)
        const requests = [];
        for(let i=0; i<numberOfImages; i++) {
            requests.push({
                "clientContext": {
                    "recaptchaToken": dynamicToken,
                    "sessionId": sessionId,
                    "projectId": projectId,
                    "tool": "PINHOLE"
                },
                "seed": Math.floor(Math.random() * 1000000) + i,
                "imageModelName": imageModelName, 
                "imageAspectRatio": imageAspectRatio || "IMAGE_ASPECT_RATIO_LANDSCAPE",
                "prompt": prompt || "enhance the resolution and quality of this image",
                "imageInputs": imageInputList // Send array of uploaded mediaIds
            });
        }

        const payload = {
            "body_json": {
                "clientContext": {
                    "recaptchaToken": dynamicToken, 
                    "sessionId": sessionId,
                    "projectId": projectId,
                    "tool": "PINHOLE"
                },
                "requests": requests
            },
            "flow_auth_token": cleanToken(token),
            "flow_url": flowUrl
        };

        const res = await fetch(ONEWISE_PROXY_URL_CREATE, {
            method: 'POST',
            headers: {
                'Authorization': ONEWISE_PROXY_AUTH,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Flow Media Trigger Failed (${res.status}): ${errText}`);
        }
        
        const data = await res.json();
        
        if (data.success && data.taskId) {
            return { status: 'pending', taskId: data.taskId, projectId: projectId };
        }
        
        throw new Error("Invalid response from Flow Proxy (No Task ID)");
    });
}

// --- NEW ACTION: FLOW MEDIA UPSCALE ---
async function triggerFlowMediaUpscale(env, accounts, mediaId, projectId, dynamicToken) {
    return executeWithFailover(env, accounts, "UpscaleFlowImage", async (authData) => {
        const { access_token: token } = authData;
        const activeProjectId = projectId || authData.project_id;
        const flowUrl = `https://aisandbox-pa.googleapis.com/v1/flow/upsampleImage`; 
        const sessionId = ";" + Date.now();
        const payload = {
            "body_json": {
                "clientContext": {
                    "recaptchaToken": dynamicToken,
                    "sessionId": sessionId,
                    "projectId": activeProjectId,
                    "tool": "PINHOLE"
                },
                "mediaId": mediaId,
                "targetResolution": "UPSAMPLE_IMAGE_RESOLUTION_2K"
            },
            "flow_auth_token": cleanToken(token),
            "flow_url": flowUrl
        };
        const res = await fetch(ONEWISE_PROXY_URL_CREATE, {
            method: 'POST',
            headers: {
                'Authorization': ONEWISE_PROXY_AUTH,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Flow Upscale Failed (${res.status}): ${errText}`);
        }
        const data = await res.json();
        if (data.success && data.taskId) {
            return { status: 'pending', taskId: data.taskId };
        }
        throw new Error("Invalid response from Flow Proxy (Upscale)");
    });
}

async function checkFlowStatus(env, accounts, taskId) {
    return executeWithFailover(env, accounts, "CheckFlowStatus", async (authData) => {
        const url = `${ONEWISE_PROXY_URL_CHECK}?taskId=${taskId}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': ONEWISE_PROXY_AUTH,
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) throw new Error(`Check Status Failed (${res.status})`);
        const data = await res.json();
        return data; 
    });
}

async function triggerUpscale(env, accounts, mediaId) {
    return executeWithFailover(env, accounts, "UpscaleVideo", async (authData) => {
        const { access_token: token, auth_cookies: cookies, project_id: projectId } = authData;
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
                "sessionId": ";" + Date.now(),
                "projectId": projectId,
                "tool": "PINHOLE",
                "userPaygateTier": "PAYGATE_TIER_TWO"
            }
        };
        const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoUpsampleVideo', {
            method: 'POST',
            headers: { ...HEADERS, 'authorization': `Bearer ${cleanToken(token)}`, 'cookie': cookies || '' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Upscale Trigger Failed (${res.status})`);
        const data = await res.json();
        const operationName = data.operations?.[0]?.operation?.name || data.operations?.[0]?.name;
        return { task_id: operationName, scene_id: sceneId };
    });
}

async function checkStatus(env, accounts, task_id, scene_id) {
    return executeWithFailover(env, accounts, "CheckStatus", async (authData) => {
        const { access_token: token, auth_cookies: cookies } = authData;
        const payload = {
            "operations": [{
                "operation": { "name": task_id },
                "sceneId": scene_id,
                "status": "MEDIA_GENERATION_STATUS_ACTIVE"
            }]
        };
        const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus', {
            method: 'POST',
            headers: { ...HEADERS, 'authorization': `Bearer ${cleanToken(token)}`, 'cookie': cookies || '' },
            body: JSON.stringify(payload)
        });
        if (res.status === 404 || res.status === 403 || res.status === 400) throw new Error(`NotFound/Permission (${res.status})`);
        if (!res.ok) throw new Error(`Check Status Failed (${res.status})`);
        const data = await res.json();
        const opResult = data.operations?.[0];
        if (!opResult) throw new Error("Operation not found");
        const status = opResult.status;
        if (["MEDIA_GENERATION_STATUS_SUCCESSFUL", "MEDIA_GENERATION_STATUS_COMPLETED", "DONE"].includes(status)) {
            let vidUrl = opResult.operation?.metadata?.video?.fifeUrl || opResult.videoFiles?.[0]?.url || opResult.response?.videoUrl;
            let mediaId = opResult.response?.id || opResult.operation?.response?.id || opResult.mediaGenerationId;
            if (vidUrl) return { status: 'completed', video_url: vidUrl, mediaId: mediaId };
            return { status: 'failed', message: 'Video URL not found' };
        }
        if (status === "MEDIA_GENERATION_STATUS_FAILED") return { status: 'failed', message: JSON.stringify(opResult) };
        return { status: 'processing' };
    });
}

async function handleSePayWebhook(request, env) {
    try {
        const body = await request.json();
        const content = body.content || body.description || "";
        const amount = body.transferAmount || body.amount || 0;
        const match = content.match(/OPZ\d+/i);
        const transactionCode = match ? match[0].toUpperCase() : null;
        if (!transactionCode) return new Response(JSON.stringify({ success: false, message: "No transaction code" }), { status: 200 });
        const sbUrl = cleanToken(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
        const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || DEFAULT_SUPABASE_KEY);
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

async function handleProxyDownload(request) {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Expose-Headers': 'Content-Length, Content-Type' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    try {
        let url;
        if (request.method === 'POST') { const body = await request.json(); url = body.url; } 
        else { const u = new URL(request.url); url = u.searchParams.get('url'); }
        if (!url) return new Response("Missing URL", { status: 400, headers: corsHeaders });
        const response = await fetch(url);
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
        return new Response(response.body, { status: response.status, headers: newHeaders });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
}

export default {
    async fetch(request, env, ctx) {
        const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With' };
        if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
        const sendJson = (data, status = 200) => new Response(JSON.stringify(data), { status: status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        const url = new URL(request.url);
        const path = url.pathname;
        if (path.includes('/sepay-webhook')) return handleSePayWebhook(request, env);
        if (path.includes('/proxy-download')) return handleProxyDownload(request);
        try {
            let body = {};
            if (request.method !== 'GET' && request.method !== 'HEAD') { body = await request.json(); }
            let action = body.action || '';
            if (!action) {
                if (path.includes('/gemini-proxy')) action = 'gemini_proxy';
                else if (path.includes('/auth')) action = 'auth';
                else if (path.includes('/upload')) action = 'upload';
                else if (path.includes('/create')) action = 'create';
                else if (path.includes('/flow-create')) action = 'flow_create';
                else if (path.includes('/flow-check')) action = 'flow_check';
                else if (path.includes('/flow-upscale')) action = 'flow_upscale'; 
                else if (path.includes('/upscale')) action = 'upscale';
                else if (path.includes('/check')) action = 'check';
            }
            if (action === 'gemini_proxy') {
                const { data, status } = await handleGeminiProxy(body, env, request);
                return sendJson(data, status); 
            } else if (action === 'auth') {
                return sendJson({ status: "connected", token: "managed-by-worker" });
            } else if (action === 'upload') {
                const accounts = await getAllAccounts(env);
                const mediaId = await uploadImage(env, accounts, body.image, body.imageAspectRatio);
                return sendJson({ mediaId });
            } else if (action === 'create') {
                const accounts = await getAllAccounts(env);
                const result = await triggerGeneration(env, accounts, body.prompt, body.mediaId, body.videoAspectRatio, body.image, body.imageAspectRatio);
                return sendJson(result);
            } else if (action === 'flow_create' || action === 'flow_media_create') {
                const accounts = await getAllAccounts(env);
                const count = body.numberOfImages || 1;
                const modelName = body.imageModelName || "GEM_PIX_2";
                // Pass array of images (inputImages)
                const result = await triggerFlowMediaCreate(env, accounts, body.prompt, body.image, body.imageAspectRatio, body.dynamicToken, count, modelName, body.images);
                return sendJson(result);
            } else if (action === 'flow_upscale') {
                const accounts = await getAllAccounts(env);
                const specificAccounts = body.projectId ? accounts.filter(acc => acc.project_id === body.projectId) : accounts;
                const accountsToUse = specificAccounts.length > 0 ? specificAccounts : accounts;
                const result = await triggerFlowMediaUpscale(env, accountsToUse, body.mediaId, body.projectId, body.dynamicToken);
                return sendJson(result);
            } else if (action === 'flow_check') {
                const accounts = await getAllAccounts(env);
                const result = await checkFlowStatus(env, accounts, body.taskId);
                return sendJson(result);
            } else if (action === 'upscale') {
                const accounts = await getAllAccounts(env);
                const result = await triggerUpscale(env, accounts, body.mediaId);
                return sendJson(result);
            } else if (action === 'check') {
                const accounts = await getAllAccounts(env);
                const result = await checkStatus(env, accounts, body.task_id, body.scene_id);
                return sendJson(result);
            } else {
                return sendJson({ status: "ok", message: "Cloudflare Worker is running", request_path: path });
            }
        } catch (error) { return sendJson({ error: true, message: error.message || String(error) }, 500); }
    }
};
