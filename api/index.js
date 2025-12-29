
// ... existing config and helpers ...
const FALLBACK_GEMINI_API_KEY = ""; 
const TEST_ACCESS_TOKEN = ""; 
const TEST_MEDIA_ID = ""; 
const TEST_PROJECT_ID = ""; 
const DEFAULT_SUPABASE_URL = 'https://mtlomjjlgvsjpudxlspq.supabase.co';

// QUAN TRỌNG: DÁN SERVICE ROLE KEY (SECRET) VÀO ĐÂY ĐỂ WORKER CÓ QUYỀN TRỪ USAGE
// NẾU KHÔNG CÓ KHÓA NÀY, VIỆC CẬP NHẬT DATABASE SẼ THẤT BẠI (LỖI 401/403)
const SUPABASE_SERVICE_ROLE_KEY = ""; 

const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10bG9tampsZ3ZzanB1ZHhsc3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMzAwMjcsImV4cCI6MjA3ODkwNjAyN30.6K-rSAFVJxQPLVjZKdJpBspb5tHE1dZiry4lS6u6JzQ";

// UPDATED PROXY CONFIGURATION
const ONEWISE_PROXY_URL_CREATE = "https://flow-api.nanoai.pics/api/fix/create-video-veo3";
const ONEWISE_PROXY_URL_CHECK = "https://flow-api.nanoai.pics/api/fix/task-status";
// Updated Token from request
const ONEWISE_PROXY_AUTH = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ODcsInJvbGUiOjMsImlhdCI6MTc2NjkwNzI2OH0.qd76QwKE8PCazfvyCmcgbyE0GV7VLQvJKCtxP4ADqcE";

// --- RUNNINGHUB CONFIGURATION (Moved from Frontend) ---
const RUNNINGHUB_API_KEY = '01a2e547c40744d4961df371645e981b';
const UPSCALE_QUALITY_WEBAPP_ID = "1977269629011808257";
const UPSCALE_FAST_WEBAPP_ID = "1983430456135852034";

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
    const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_KEY);
    if (sbUrl && sbKey) {
        try {
            const response = await fetch(`${sbUrl}/rest/v1/api_keys?select=key_value&is_active=eq.true`, {
                headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                    const randomIndex = Math.floor(Math.random() * data.length);
                    return cleanToken(data[randomIndex].key_value);
                }
            }
        } catch (e) { console.error("[Proxy] Key fetch error:", e); }
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
        data = { error: { message: `Upstream Error (${response.status})`, status: response.status } };
    }
    return { data, status: response.status, ok: response.ok };
}

// ... existing resetAllUsageCounts ...
async function resetAllUsageCounts(env) {
    const sbUrl = cleanToken(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
    const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_KEY);
    try {
        await fetch(`${sbUrl}/rest/v1/video_accounts?is_active=eq.true`, {
            method: 'PATCH',
            headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ usage_count: 0 })
        });
    } catch (e) {}
}

// ... existing incrementAccountUsage ...
async function incrementAccountUsage(env, accountId, currentUsage) {
    const sbUrl = cleanToken(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
    const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_KEY);
    try {
        await fetch(`${sbUrl}/rest/v1/video_accounts?id=eq.${accountId}`, {
            method: 'PATCH',
            headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ usage_count: (currentUsage || 0) + 1 })
        });
    } catch (e) {}
}

// ... existing getAllAccounts ...
async function getAllAccounts(env, ignoreQuota = false) {
    const sbUrl = cleanToken(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
    const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_KEY);
    try {
        const response = await fetch(`${sbUrl}/rest/v1/video_accounts?select=id,access_token,auth_cookies,project_id,usage_count,usage_limit&is_active=eq.true&access_token=not.is.null&order=updated_at.desc`, {
            method: 'GET',
            headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error("DB Error");
        let accounts = await response.json();
        if (!accounts || accounts.length === 0) throw new Error("No accounts");
        
        if (ignoreQuota) return accounts;

        let availableAccounts = accounts.filter(acc => (acc.usage_count || 0) < (acc.usage_limit || 50));
        if (availableAccounts.length === 0) {
            await resetAllUsageCounts(env);
            availableAccounts = accounts.map(acc => ({ ...acc, usage_count: 0 }));
        }
        return availableAccounts.sort(() => Math.random() - 0.5);
    } catch (e) { throw new Error("Acc Fetch Error"); }
}

// ... existing executeWithFailover ...
async function executeWithFailover(env, accounts, operationName, callback) {
    let lastError = null;
    for (const account of accounts) {
        if (!account.project_id) continue;
        try {
            const QUOTA_CONSUMING_OPS = ['CreateVideo', 'CreateFlowImage', 'UpscaleFlowImage', 'UpscaleVideo', 'Upscale', 'CreateVideoWithRefs'];
            if (QUOTA_CONSUMING_OPS.includes(operationName)) {
                 incrementAccountUsage(env, account.id, account.usage_count).catch(e => console.error(e));
            }
            const result = await callback(account);
            return result; 
        } catch (e) {
            lastError = e;
            const msg = e.message || "";
            const isRetryable = msg.includes("401") || msg.includes("403") || msg.includes("429") || msg.includes("500") || msg.includes("502") || msg.includes("RESOURCE_EXHAUSTED");
            if (isRetryable) continue; 
            else throw e; 
        }
    }
    throw lastError || new Error(`All accounts failed for ${operationName}`);
}

// ... existing performUpload ...
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
    if (!res.ok) throw new Error(`Upload Failed (${res.status})`);
    const data = await res.json();
    return data.mediaGenerationId?.mediaGenerationId || data.mediaGenerationId || data.imageOutput?.image?.id;
}

// ... existing uploadImage ...
async function uploadImage(env, accounts, base64Data, imageAspectRatio) {
    return executeWithFailover(env, accounts, "UploadImage", async (authData) => {
        return await performUpload(authData, base64Data, imageAspectRatio);
    });
}

// ... existing triggerGenerationWithRefs ...
async function triggerGenerationWithRefs(env, accounts, prompt, videoAspectRatio, referenceImagesData) {
    return executeWithFailover(env, accounts, "CreateVideoWithRefs", async (authData) => {
        const { access_token: token, project_id: projectId, id: accountId } = authData;
        const sceneId = crypto.randomUUID();
        const sessionId = ";" + Date.now();
        const aspectRatioEnum = videoAspectRatio || "VIDEO_ASPECT_RATIO_LANDSCAPE";
        
        const modelKey = (aspectRatioEnum === "VIDEO_ASPECT_RATIO_PORTRAIT") 
            ? "veo_3_0_r2v_fast_portrait_ultra" 
            : "veo_3_0_r2v_fast_ultra";

        const uploadedMediaIds = [];
        for (const imgData of referenceImagesData) {
            if (imgData && imgData.data) {
                const mediaId = await performUpload(authData, imgData.data, imgData.aspectRatio);
                if (mediaId) uploadedMediaIds.push(mediaId);
            }
        }

        if (uploadedMediaIds.length === 0) throw new Error("Failed to upload reference images.");

        const refImages = uploadedMediaIds.map(mid => ({
            "imageUsageType": "IMAGE_USAGE_TYPE_ASSET",
            "mediaId": mid
        }));

        const requestItem = {
            "aspectRatio": aspectRatioEnum,
            "seed": Math.floor(Date.now() / 1000), 
            "textInput": { "prompt": prompt },
            "videoModelKey": modelKey, 
            "metadata": { "sceneId": sceneId },
            "referenceImages": refImages
        };

        const googleUrl = 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoReferenceImages';

        const payload = {
            "body_json": {
                "clientContext": {
                    "recaptchaToken": "", 
                    "sessionId": sessionId,
                    "projectId": projectId,
                    "tool": "PINHOLE",
                    "userPaygateTier": "PAYGATE_TIER_TWO"
                },
                "requests": [requestItem]
            },
            "flow_auth_token": cleanToken(token),
            "flow_url": googleUrl
        };

        const res = await safeFetchUpstream(ONEWISE_PROXY_URL_CREATE, {
            method: 'POST',
            headers: { 
                'Authorization': ONEWISE_PROXY_AUTH,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(res.error?.message || `Proxy Trigger Failed`);
        if (res.data && res.data.taskId) return { task_id: res.data.taskId, scene_id: sceneId, account_id: accountId };
        throw new Error("Proxy response missing taskId");
    });
}

// ... existing triggerGeneration ...
async function triggerGeneration(env, accounts, prompt, mediaId, videoAspectRatio, imageData, imageAspectRatio) {
    return executeWithFailover(env, accounts, "CreateVideo", async (authData) => {
        const { access_token: token, project_id: projectId, id: accountId } = authData;
        let activeMediaId = mediaId;
        if (imageData) {
            activeMediaId = await performUpload(authData, imageData, imageAspectRatio);
        }
        
        const sceneId = crypto.randomUUID();
        const sessionId = ";" + Date.now();
        const aspectRatioEnum = videoAspectRatio || "VIDEO_ASPECT_RATIO_LANDSCAPE";
        const isI2V = !!activeMediaId;
        
        let modelKey = "";
        if (isI2V) {
             modelKey = (aspectRatioEnum === "VIDEO_ASPECT_RATIO_PORTRAIT") 
                ? "veo_3_1_i2v_s_fast_portrait_ultra" 
                : "veo_3_1_i2v_s_fast_ultra";
        } else {
             modelKey = (aspectRatioEnum === "VIDEO_ASPECT_RATIO_PORTRAIT")
                ? "veo_3_1_t2v_fast_portrait_ultra"
                : "veo_3_1_t2v_fast_ultra";
        }

        const requestItem = {
            "aspectRatio": aspectRatioEnum,
            "seed": Math.floor(Date.now() / 1000), 
            "textInput": { "prompt": prompt },
            "videoModelKey": modelKey, 
            "metadata": { "sceneId": sceneId }
        };

        if (isI2V) {
            requestItem.startImage = { "mediaId": activeMediaId };
        }

        const googleUrl = isI2V 
            ? 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoStartImage'
            : 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoText';

        const payload = {
            "body_json": {
                "clientContext": {
                    "recaptchaToken": "", 
                    "sessionId": sessionId,
                    "projectId": projectId,
                    "tool": "PINHOLE",
                    "userPaygateTier": "PAYGATE_TIER_TWO"
                },
                "requests": [requestItem]
            },
            "flow_auth_token": cleanToken(token),
            "flow_url": googleUrl
        };

        const res = await safeFetchUpstream(ONEWISE_PROXY_URL_CREATE, {
            method: 'POST',
            headers: { 'Authorization': ONEWISE_PROXY_AUTH, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(res.error?.message || `Proxy Trigger Failed`);
        if (res.data && res.data.taskId) return { task_id: res.data.taskId, scene_id: sceneId, account_id: accountId };
        throw new Error("Proxy response missing taskId");
    });
}

// ... existing safeFetchUpstream ...
const safeFetchUpstream = async (url, options) => {
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        if (text.trim().startsWith("<") || text.includes("<!DOCTYPE")) {
             return { ok: false, status: res.status, error: { message: `Upstream HTML Error`, code: "UPSTREAM_HTML_ERROR" } };
        }
        try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; } 
        catch (e) { return { ok: false, status: res.status, error: { message: `Invalid JSON`, code: "INVALID_JSON" } }; }
    } catch (err) { return { ok: false, status: 502, error: { message: err.message, code: "NETWORK_ERROR" } }; }
}

// ... existing triggerFlowMediaCreate ...
async function triggerFlowMediaCreate(env, accounts, prompt, imageData, imageAspectRatio, numberOfImages = 1, imageModelName = "GEM_PIX_2", inputImages = []) {
    return executeWithFailover(env, accounts, "CreateFlowImage", async (authData) => {
        const { access_token: token, project_id: projectId } = authData;
        const imageInputList = [];
        let imagesToUpload = [];
        if (inputImages && Array.isArray(inputImages) && inputImages.length > 0) imagesToUpload = inputImages;
        else if (imageData) imagesToUpload = [imageData];

        for (const imgBase64 of imagesToUpload) {
            if (imgBase64) {
                const mediaId = await performUpload(authData, imgBase64, imageAspectRatio);
                imageInputList.push({ "name": mediaId, "imageInputType": "IMAGE_INPUT_TYPE_REFERENCE" });
            }
        }
        
        const flowUrl = `https://aisandbox-pa.googleapis.com/v1/projects/${projectId}/flowMedia:batchGenerateImages`;
        const sessionId = ";" + Date.now();
        const requests = [];
        for(let i=0; i<numberOfImages; i++) {
            requests.push({
                "clientContext": { "sessionId": sessionId, "projectId": projectId, "tool": "PINHOLE" },
                "seed": Math.floor(Math.random() * 1000000) + i,
                "imageModelName": imageModelName, 
                "imageAspectRatio": imageAspectRatio || "IMAGE_ASPECT_RATIO_LANDSCAPE",
                "prompt": prompt || "enhance",
                "imageInputs": imageInputList 
            });
        }
        const payload = {
            "body_json": { "clientContext": { "sessionId": sessionId, "projectId": projectId, "tool": "PINHOLE" }, "requests": requests },
            "flow_auth_token": cleanToken(token),
            "flow_url": flowUrl
        };
        const result = await safeFetchUpstream(ONEWISE_PROXY_URL_CREATE, { method: 'POST', headers: { 'Authorization': ONEWISE_PROXY_AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!result.ok) throw new Error(result.error?.message || `Flow Media Trigger Failed`);
        if (result.data.success && result.data.taskId) return { status: 'pending', taskId: result.data.taskId, projectId: projectId };
        throw new Error("Invalid response from Flow Proxy");
    });
}

// ... existing triggerFlowMediaUpscale ...
async function triggerFlowMediaUpscale(env, accounts, mediaId, projectId, targetResolution) {
    return executeWithFailover(env, accounts, "UpscaleFlowImage", async (authData) => {
        const { access_token: token } = authData;
        const activeProjectId = projectId || authData.project_id;
        const flowUrl = `https://aisandbox-pa.googleapis.com/v1/flow/upsampleImage`; 
        const sessionId = ";" + Date.now();
        const payload = {
            "body_json": {
                "clientContext": { "sessionId": sessionId, "projectId": activeProjectId, "tool": "PINHOLE" },
                "mediaId": mediaId,
                "targetResolution": targetResolution || "UPSAMPLE_IMAGE_RESOLUTION_2K"
            },
            "flow_auth_token": cleanToken(token),
            "flow_url": flowUrl
        };
        const result = await safeFetchUpstream(ONEWISE_PROXY_URL_CREATE, { method: 'POST', headers: { 'Authorization': ONEWISE_PROXY_AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!result.ok) throw new Error(result.error?.message || `Flow Upscale Failed`);
        if (result.data.success && result.data.taskId) return { status: 'pending', taskId: result.data.taskId };
        throw new Error("Invalid response from Flow Proxy");
    });
}

// ... existing checkFlowStatus ...
async function checkFlowStatus(env, accounts, taskId) {
    const url = `${ONEWISE_PROXY_URL_CHECK}?taskId=${taskId}`;
    const result = await safeFetchUpstream(url, { method: 'GET', headers: { 'Authorization': ONEWISE_PROXY_AUTH, 'Content-Type': 'application/json' } });
    if (!result.ok) throw new Error(result.error?.message || `Check Status Failed`);
    return result.data; 
}

// ... existing triggerUpscale ...
async function triggerUpscale(env, accounts, mediaId) {
    return executeWithFailover(env, accounts, "UpscaleVideo", async (authData) => {
        const { access_token: token, auth_cookies: cookies, project_id: projectId } = authData;
        const sceneId = crypto.randomUUID();
        const payload = {
            "requests": [{ "aspectRatio": "VIDEO_ASPECT_RATIO_LANDSCAPE", "seed": Math.floor(Date.now() / 1000), "videoInput": { "mediaId": mediaId }, "videoModelKey": "veo_2_1080p_upsampler_8s", "metadata": { "sceneId": sceneId } }],
            "clientContext": { "sessionId": ";" + Date.now(), "projectId": projectId, "tool": "PINHOLE", "userPaygateTier": "PAYGATE_TIER_TWO" }
        };
        const res = await fetch('https://aisandbox-pa.googleapis.com/v1:uploadUserImage', { method: 'POST', headers: { ...HEADERS, 'authorization': `Bearer ${cleanToken(token)}`, 'cookie': cookies || '' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`Upscale Trigger Failed`);
        const data = await res.json();
        const operationName = data.operations?.[0]?.operation?.name || data.operations?.[0]?.name;
        return { task_id: operationName, scene_id: sceneId };
    });
}

// ... existing checkStatus ...
async function checkStatus(env, accounts, googleOperationName, account_id) {
    const targetAccount = accounts.find(a => String(a.id) === String(account_id));
    if (!targetAccount) {
        return { status: 'failed', message: `Original account (ID: ${account_id}) not found or unavailable.` };
    }

    return executeWithFailover(env, [targetAccount], "CheckStatus", async (authData) => {
        const { access_token: token, auth_cookies: cookies } = authData;
        
        const payload = { 
            "operations": [{ 
                "operation": { "name": googleOperationName }, 
                "status": "MEDIA_GENERATION_STATUS_ACTIVE" 
            }] 
        };

        const res = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus', { 
            method: 'POST', 
            headers: { ...HEADERS, 'authorization': `Bearer ${cleanToken(token)}`, }, 
            body: JSON.stringify(payload) 
        });
        
        if (res.status === 404 || res.status === 403) throw new Error(`NotFound/Permission (Account ID: ${authData.id})`);
        if (!res.ok) throw new Error(`Check Status Failed (${res.status})`);
        
        const data = await res.json();
        const opResult = data.operations?.[0];
        
        if (!opResult) throw new Error("Operation not found in response");
        const status = opResult.status;
        
        if (["MEDIA_GENERATION_STATUS_SUCCESSFUL", "MEDIA_GENERATION_STATUS_COMPLETED", "DONE"].includes(status)) {
            let vidUrl = opResult.operation?.metadata?.video?.fifeUrl || opResult.result?.video?.url || opResult.result?.video?.fifeUrl || opResult.operation?.response?.video?.url || opResult.videoFiles?.[0]?.url || opResult.response?.videoUrl;
            let mediaId = opResult.mediaGenerationId || opResult.result?.id || opResult.response?.id || opResult.operation?.response?.id;
            if (!vidUrl && opResult.operation?.metadata?.video?.servingBaseUri) vidUrl = opResult.operation.metadata.video.fifeUrl;
            if (vidUrl) return { status: 'completed', video_url: vidUrl, mediaId: mediaId };
            const debugKeys = JSON.stringify(opResult).substring(0, 200);
            return { status: 'failed', message: `Video URL not found in successful response. Preview: ${debugKeys}...` };
        }
        
        if (status === "MEDIA_GENERATION_STATUS_FAILED") {
             let errorMsg = "Generation Failed";
             try { 
                 if (opResult.operation?.error?.message) errorMsg = opResult.operation.error.message;
                 else if (opResult.error?.message) errorMsg = opResult.error.message;
             } catch(e) {}
             return { status: 'failed', message: errorMsg };
        }
        return { status: 'processing' };
    });
}

// ... existing handleSePayWebhook ...
async function handleSePayWebhook(request, env) {
    try {
        const body = await request.json();
        const content = body.content || body.description || "";
        const amount = body.transferAmount || body.amount || 0;
        const match = content.match(/OPZ\d+/i);
        const transactionCode = match ? match[0].toUpperCase() : null;
        if (!transactionCode) return new Response(JSON.stringify({ success: false, message: "No transaction code" }), { status: 200 });
        const sbUrl = cleanToken(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
        const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_KEY);
        const response = await fetch(`${sbUrl}/rest/v1/rpc/webhook_approve_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` },
            body: JSON.stringify({ p_transaction_code: transactionCode, p_amount: amount })
        });
        return new Response(JSON.stringify(await response.json()), { status: 200 });
    } catch (e) { return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 }); }
}

// ... existing handleProxyDownload ...
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

// --- NEW FUNCTION: RUNNINGHUB PROXY ---
async function handleRunningHubProxy(action, body) {
    let url = '';
    let payload = {};

    if (action === 'upscale_create' || action === 'runninghub_create') {
        url = 'https://www.runninghub.ai/task/openapi/ai-app/run';
        payload = body; // Pass entire body payload (webappId, apiKey, nodeInfoList)
        // Inject API Key securely
        payload.apiKey = RUNNINGHUB_API_KEY;
    } 
    else if (action === 'upscale_check' || action === 'runninghub_check') {
        url = 'https://www.runninghub.ai/task/openapi/outputs';
        payload = { 
            apiKey: RUNNINGHUB_API_KEY, 
            taskId: body.taskId 
        };
    } else {
        throw new Error("Invalid RunningHub action");
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    return data;
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
            
            // Map paths to actions
            if (!action) {
                if (path.includes('/gemini-proxy')) action = 'gemini_proxy';
                else if (path.includes('/auth')) action = 'auth';
                else if (path.includes('/upload')) action = 'upload';
                else if (path.includes('/create')) action = 'create';
                else if (path.includes('/flow-create')) action = 'flow_create';
                else if (path.includes('/flow-check')) action = 'flow_check';
                else if (path.includes('/flow-upscale')) action = 'flow_upscale'; 
                else if (path.includes('/upscale-create')) action = 'upscale_create'; // New
                else if (path.includes('/upscale-check')) action = 'upscale_check';   // New
                else if (path.includes('/upscale')) action = 'upscale'; // Old Veo upscale
                else if (path.includes('/check')) action = 'check';
            }

            if (action === 'upscale_create' || action === 'upscale_check') {
                const result = await handleRunningHubProxy(action, body);
                return sendJson(result);
            }
            
            // ... existing action handlers ...
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
                if (body.referenceImages && Array.isArray(body.referenceImages)) {
                    const result = await triggerGenerationWithRefs(env, accounts, body.prompt, body.videoAspectRatio, body.referenceImages);
                    return sendJson(result);
                } else {
                    const result = await triggerGeneration(env, accounts, body.prompt, body.mediaId, body.videoAspectRatio, body.image, body.imageAspectRatio);
                    return sendJson(result);
                }
            } else if (action === 'flow_create' || action === 'flow_media_create') {
                const accounts = await getAllAccounts(env);
                const count = body.numberOfImages || 1;
                const modelName = body.imageModelName || "GEM_PIX_2";
                const result = await triggerFlowMediaCreate(env, accounts, body.prompt, body.image, body.imageAspectRatio, count, modelName, body.images);
                return sendJson(result);
            } else if (action === 'flow_upscale') {
                const allAccounts = await getAllAccounts(env, true);
                let specificAccounts = [];
                if (body.projectId) {
                    specificAccounts = allAccounts.filter(acc => acc.project_id === body.projectId);
                }
                if (body.projectId && specificAccounts.length === 0) {
                    return sendJson({ status: 'failed', message: `Account not found for Project ID: ${body.projectId}. Cannot upscale.` }, 400);
                }
                const accountsToUse = specificAccounts.length > 0 ? specificAccounts : allAccounts;
                const result = await triggerFlowMediaUpscale(env, accountsToUse, body.mediaId, body.projectId, body.targetResolution);
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
                const { task_id, account_id } = body;
                let googleOperationName = null;
                if (task_id && task_id.length > 20 && task_id.includes('-')) {
                     try {
                         const proxyUrl = `${ONEWISE_PROXY_URL_CHECK}?taskId=${task_id}`;
                         const proxyRes = await fetch(proxyUrl, {
                             method: 'GET',
                             headers: { 'Authorization': ONEWISE_PROXY_AUTH, 'Content-Type': 'application/json' }
                         });
                         const proxyData = await proxyRes.json();
                         if (!proxyData.success) return sendJson({ status: 'processing', message: "Initializing task..." });
                         const operations = proxyData.result?.operations;
                         if (operations && operations.length > 0) {
                             const opData = operations[0];
                             googleOperationName = opData.operation?.name || opData.name;
                         } else {
                             return sendJson({ status: 'processing', message: "Waiting for operation allocation..." });
                         }
                     } catch (e) {
                         console.error("Proxy Resolution Error:", e);
                         return sendJson({ status: 'processing', message: "Connecting to task registry..." });
                     }
                } else {
                    googleOperationName = task_id;
                }
                if (googleOperationName) {
                    const accounts = await getAllAccounts(env, true);
                    const result = await checkStatus(env, accounts, googleOperationName, account_id);
                    return sendJson(result);
                }
                return sendJson({ status: 'processing', message: "Waiting for operation name..." });
            } else {
                return sendJson({ status: "ok", message: "Cloudflare Worker is running", request_path: path });
            }
        } catch (error) { return sendJson({ error: true, message: error.message || String(error) }, 500); }
    }
};
