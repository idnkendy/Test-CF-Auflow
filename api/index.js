
// ... existing config and helpers ...
const FALLBACK_GEMINI_API_KEY = ""; 
const TEST_ACCESS_TOKEN = ""; 
const TEST_MEDIA_ID = ""; 
const TEST_PROJECT_ID = ""; 
const DEFAULT_SUPABASE_URL = 'https://mtlomjjlgvsjpudxlspq.supabase.co';

const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10bG9tampsZ3ZzanB1ZHhsc3BxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzMzMDAyNywiZXhwIjoyMDc4OTA2MDI3fQ.ze3shkFofoW18JutY_HAHv0dVGgEFYkCTV7GKWUfHc8"; 

const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10bG9tampsZ3ZzanB1ZHhsc3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMzAwMjcsImV4cCI6MjA3ODkwNjAyN30.6K-rSAFVJxQPLVjZKdJpBspb5tHE1dZiry4lS6u6JzQ";

const ONEWISE_PROXY_URL_CREATE = "https://flow-api.nanoai.pics/api/fix/create-video-veo3";
const ONEWISE_PROXY_URL_CHECK = "https://flow-api.nanoai.pics/api/fix/task-status";
const ONEWISE_PROXY_AUTH = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ODcsInJvbGUiOjMsImlhdCI6MTc2ODU1NTAxNH0.cC0pkdy1S-0ZdCzpnW1jGON1jId70d7iI5lWsddIUjU";

const RUNNINGHUB_API_KEYS = [
    '01a2e547c40744d4961df371645e981b',
    '921962784549478f806e829ac2ce1e0a'
];
const UPSCALE_QUALITY_WEBAPP_ID = "1977269629011808257";
const UPSCALE_FAST_WEBAPP_ID = "1983430456135852034";

const LADIFLOW_API_KEY = "SDKKdws6CcfC0QHwfwqkUrCb"; 
const LADIFLOW_API_URL = "https://api.service.ladiflow.com/1.0/customer/create-or-update";

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

function getRandomRunningHubKey() {
    const randomIndex = Math.floor(Math.random() * RUNNINGHUB_API_KEYS.length);
    return RUNNINGHUB_API_KEYS[randomIndex];
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

async function uploadImage(env, accounts, base64Data, imageAspectRatio) {
    return executeWithFailover(env, accounts, "UploadImage", async (authData) => {
        return await performUpload(authData, base64Data, imageAspectRatio);
    });
}

async function triggerGenerationWithRefs(env, accounts, prompt, videoAspectRatio, referenceImagesData) {
    return executeWithFailover(env, accounts, "CreateVideoWithRefs", async (authData) => {
        const { access_token: token, project_id: projectId, id: accountId } = authData;
        const sceneId = crypto.randomUUID();
        const sessionId = ";" + Date.now();
        const aspectRatioEnum = videoAspectRatio || "VIDEO_ASPECT_RATIO_LANDSCAPE";
        
        const modelKey = (aspectRatioEnum === "VIDEO_ASPECT_RATIO_PORTRAIT") 
            ? "veo_3_1_r2v_fast_portrait_ultra" 
            : "veo_3_1_r2v_fast_landscape_ultra";

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

async function triggerGeneration(env, accounts, prompt, mediaId, videoAspectRatio, imageData, imageAspectRatio, endImageData) {
    return executeWithFailover(env, accounts, "CreateVideo", async (authData) => {
        const { access_token: token, project_id: projectId, id: accountId } = authData;
        let activeMediaId = mediaId;
        
        if (imageData) {
            activeMediaId = await performUpload(authData, imageData, imageAspectRatio);
        }
        
        let activeEndMediaId = null;
        if (endImageData) {
            activeEndMediaId = await performUpload(authData, endImageData, imageAspectRatio);
        }
        
        const sceneId = crypto.randomUUID();
        const sessionId = ";" + Date.now();
        const aspectRatioEnum = videoAspectRatio || "VIDEO_ASPECT_RATIO_LANDSCAPE";
        const isI2V = !!activeMediaId;
        const isDoubleImage = !!(activeMediaId && activeEndMediaId);
        
        let modelKey = "";
        let googleUrl = "";

        if (isDoubleImage) {
            modelKey = (aspectRatioEnum === "VIDEO_ASPECT_RATIO_PORTRAIT") 
               ? "veo_3_1_i2v_s_fast_portrait_ultra_fl" 
               : "veo_3_1_i2v_s_fast_ultra_fl";
            
            googleUrl = 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoStartAndEndImage';
        } else if (isI2V) {
             modelKey = (aspectRatioEnum === "VIDEO_ASPECT_RATIO_PORTRAIT") 
                ? "veo_3_1_i2v_s_fast_portrait_ultra" 
                : "veo_3_1_i2v_s_fast_ultra";
             googleUrl = 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoStartImage';
        } else {
             modelKey = (aspectRatioEnum === "VIDEO_ASPECT_RATIO_PORTRAIT")
                ? "veo_3_1_t2v_fast_portrait_ultra"
                : "veo_3_1_t2v_fast_ultra";
             googleUrl = 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoText';
        }

        const requestItem = {
            "aspectRatio": aspectRatioEnum,
            "seed": Math.floor(Date.now() / 1000), 
            "textInput": { "prompt": prompt },
            "videoModelKey": modelKey, 
            "metadata": { "sceneId": sceneId }
        };

        if (isDoubleImage) {
            requestItem.startImage = { "mediaId": activeMediaId };
            requestItem.endImage = { "mediaId": activeEndMediaId };
        } else if (isI2V) {
            requestItem.startImage = { "mediaId": activeMediaId };
        }

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

async function checkFlowStatus(env, accounts, taskId) {
    const url = `${ONEWISE_PROXY_URL_CHECK}?taskId=${taskId}`;
    const result = await safeFetchUpstream(url, { method: 'GET', headers: { 'Authorization': ONEWISE_PROXY_AUTH, 'Content-Type': 'application/json' } });
    if (!result.ok) throw new Error(result.error?.message || `Check Status Failed`);
    return result.data; 
}

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

async function checkStatus(env, accounts, googleOperationName, account_id) {
    const targetAccount = accounts.find(a => String(a.id) === String(account_id));
    if (!targetAccount) {
        return { status: 'failed', message: `Original account (ID: ${account_id}) not found or unavailable.`, step: 'checking_status' };
    }

    return executeWithFailover(env, [targetAccount], "CheckStatus", async (authData) => {
        const { access_token: token, auth_cookies: cookies } = authData;
        
        const payload = { 
            "operations": [{ 
                "operation": { "name": googleOperationName }, 
                "status": "MEDIA_GENERATION_STATUS_ACTIVE" 
            }] 
        };

        const res = await fetch('https://aisandbox-pa.googleapis.com/v1:batchCheckAsyncVideoGenerationStatus', { 
            method: 'POST', 
            headers: { ...HEADERS, 'authorization': `Bearer ${cleanToken(token)}`, }, 
            body: JSON.stringify(payload) 
        });
        
        if (res.status === 404 || res.status === 403) throw new Error(`NotFound/Permission (Account ID: ${authData.id})`);
        
        if (!res.ok) {
            let errorMsg = `Check Status Failed (${res.status})`;
            try {
                const errJson = await res.json();
                if (errJson.error && errJson.error.message) {
                    errorMsg += `: ${errJson.error.message}`;
                } else {
                    errorMsg += `: ${JSON.stringify(errJson)}`;
                }
            } catch (e) {
                const text = await res.text();
                errorMsg += `: ${text.substring(0, 200)}`;
            }
            throw new Error(errorMsg);
        }
        
        const data = await res.json();
        const opResult = data.operations?.[0];
        
        if (!opResult) throw new Error("Operation not found in response");
        const status = opResult.status;
        
        if (["MEDIA_GENERATION_STATUS_SUCCESSFUL", "MEDIA_GENERATION_STATUS_COMPLETED", "DONE"].includes(status)) {
            let vidUrl = opResult.operation?.metadata?.video?.fifeUrl || opResult.result?.video?.url || opResult.result?.video?.fifeUrl || opResult.operation?.response?.video?.url || opResult.videoFiles?.[0]?.url || opResult.response?.videoUrl;
            let mediaId = opResult.mediaGenerationId || opResult.result?.id || opResult.response?.id || opResult.operation?.response?.id;
            if (!vidUrl && opResult.operation?.metadata?.video?.servingBaseUri) vidUrl = opResult.operation.metadata.video.fifeUrl;
            if (vidUrl) return { status: 'completed', video_url: vidUrl, mediaId: mediaId, step: 'checking_status' };
            const debugKeys = JSON.stringify(opResult).substring(0, 200);
            return { status: 'failed', message: `Video URL not found in successful response. Preview: ${debugKeys}...`, step: 'checking_status' };
        }
        
        if (status === "MEDIA_GENERATION_STATUS_FAILED") {
             let errorMsg = "Generation Failed";
             try { 
                 if (opResult.operation?.error?.message) errorMsg = opResult.operation.error.message;
                 else if (opResult.error?.message) errorMsg = opResult.error.message;
             } catch(e) {}
             return { status: 'failed', message: errorMsg, step: 'checking_status' };
        }
        return { status: 'processing', step: 'checking_status', message: 'Google is generating video...' };
    });
}

async function sendToLadiPage(data) {
    if (!LADIFLOW_API_KEY) {
        console.warn("[LadiFlow] API Key missing, skipping sync.");
        return { success: false, message: "Missing API Key" };
    }

    try {
        const nameParts = (data.name || "").trim().split(' ');
        const lastName = nameParts.length > 1 ? nameParts.pop() : "";
        const firstName = nameParts.join(" ") || data.name;

        const payload = {
            email: data.email,
            phone: data.phone || "",
            first_name: firstName, 
            last_name: lastName, 
            tags: data.tags 
        };

        const response = await fetch(LADIFLOW_API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'api-key': LADIFLOW_API_KEY 
            },
            body: JSON.stringify(payload)
        });
        
        const responseText = await response.text();
        let responseJson;
        try { responseJson = JSON.parse(responseText); } catch(e) { responseJson = responseText; }

        if (!response.ok) {
            console.error(`[LadiFlow] Error ${response.status}:`, responseText);
            return { success: false, message: `LadiFlow Error (${response.status})`, details: responseJson };
        }
        
        return { 
            success: true, 
            message: "Sync successful", 
            ladiflow_response: responseJson 
        };

    } catch (e) {
        console.error("[LadiFlow] Network error:", e);
        return { success: false, message: e.message || "Network Error" };
    }
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
        const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_KEY);
        
        const response = await fetch(`${sbUrl}/rest/v1/rpc/webhook_approve_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` },
            body: JSON.stringify({ p_transaction_code: transactionCode, p_amount: amount })
        });
        
        const result = await response.json();

        if (result && !result.error && LADIFLOW_API_KEY) {
            const txQuery = await fetch(`${sbUrl}/rest/v1/transactions?select=user_id,customer_email,customer_name,customer_phone&transaction_code=eq.${transactionCode}&limit=1`, {
                headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
            });
            const txData = await txQuery.json();
            
            if (txData && txData.length > 0) {
                const tx = txData[0];
                const userId = tx.user_id;

                const countQuery = await fetch(`${sbUrl}/rest/v1/transactions?user_id=eq.${userId}&status=eq.completed&select=id`, {
                    headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Range': '0-1' }
                });
                
                const countData = await countQuery.json();
                
                if (countData.length === 1) {
                    await sendToLadiPage({
                        email: tx.customer_email,
                        phone: tx.customer_phone,
                        name: tx.customer_name,
                        tags: ["696d3c9b4cb43700128d7061"]
                    });
                }
            }
        }

        return new Response(JSON.stringify(result), { status: 200 });
    } catch (e) { return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 }); }
}

async function handlePolarWebhook(request, env) {
    try {
        const body = await request.json();
        console.log("[Polar] Received Webhook:", JSON.stringify(body).substring(0, 200) + "...");
        
        if (body.type !== 'order.created') {
             return new Response("Event Ignored (Not order.created)", { status: 200 });
        }

        const data = body.data;
        const customer_email = data.customer_email || (data.customer && data.customer.email) || data.email;
        const amount = data.subtotal_amount || data.amount || data.total_amount; 

        if (!customer_email) {
            console.error("[Polar] No Email in Payload");
            return new Response("No Email in Payload", { status: 200 });
        }

        const PLANS = {
            999:   { credits: 1000,  days: 7,   name: "Weekly Pass", id: "plan_global_weekly" },
            2900:  { credits: 4000,  days: 30,  name: "Pro Monthly", id: "plan_global_monthly" },
            24900: { credits: 48000, days: 365, name: "Yearly Elite", id: "plan_global_yearly" },
            600:   { credits: 1000,  days: 0,   name: "Credit Booster", id: "plan_global_credit" },
            50:    { credits: 50,    days: 1,   name: "Test Plan", id: "plan_test" }
        };

        let plan = PLANS[amount];

        if (!plan && data.product && data.product.name) {
            const productName = data.product.name.toLowerCase();
            const foundKey = Object.keys(PLANS).find(key => {
                const p = PLANS[key];
                return p.name.toLowerCase().includes(productName) || productName.includes(p.name.toLowerCase());
            });
            if (foundKey) {
                plan = PLANS[foundKey];
            }
        }

        if (!plan) {
            console.warn(`[Polar] Unknown plan for amount: ${amount}`);
            return new Response(`Unknown Plan Amount: ${amount}`, { status: 200 });
        }

        const sbUrl = cleanToken(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
        const sbKey = cleanToken(env.SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_KEY);

        let userQuery = await fetch(`${sbUrl}/rest/v1/profiles?email=ilike.${customer_email}&select=id,credits,subscription_end,full_name,active_plan_id`, {
            headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
        });
        
        let users = await userQuery.json();
        if (!users || users.length === 0) {
            return new Response("User not found", { status: 200 }); 
        }

        const user = users[0];
        const now = new Date();

        let updatedCredits = 0;
        let newSubscriptionEnd = user.subscription_end;

        if (plan.days > 0) {
            // Đây là Gói Đăng Ký (Subscription)
            
            // KIỂM TRA: Có phải là mua gói khác loại (nâng cấp) hay không?
            // Nếu active_plan_id khác với plan.id -> CỘNG DỒN
            // Nếu trùng -> RESET (Gia hạn)
            const isDifferentPlan = user.active_plan_id && user.active_plan_id !== plan.id;
            
            if (isDifferentPlan) {
                // TRƯỜNG HỢP NÂNG CẤP/CHUYỂN GÓI (Ví dụ: Tuần lên Tháng) -> CỘNG DỒN
                updatedCredits = (user.credits || 0) + plan.credits;
                
                let currentEnd = user.subscription_end ? new Date(user.subscription_end) : new Date();
                if (currentEnd < now) currentEnd = now;
                
                currentEnd.setDate(currentEnd.getDate() + plan.days);
                newSubscriptionEnd = currentEnd.toISOString();
                
                console.log(`[Polar] UPGRADE/SWITCH detected for ${customer_email}. Cumulative applied.`);
            } else {
                // TRƯỜNG HỢP GIA HẠN GÓI CŨ -> RESET
                updatedCredits = plan.credits;
                
                const nextEnd = new Date();
                nextEnd.setDate(nextEnd.getDate() + plan.days);
                newSubscriptionEnd = nextEnd.toISOString();
                
                console.log(`[Polar] RENEWAL detected for ${customer_email}. Reset applied.`);
            }
        } else {
            // Đây là Gói Nạp Thêm (Booster) -> Luôn cộng dồn
            updatedCredits = (user.credits || 0) + plan.credits;
        }

        const updateRes = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${user.id}`, {
            method: 'PATCH',
            headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                credits: updatedCredits,
                subscription_end: newSubscriptionEnd,
                active_plan_id: plan.id // Lưu ID gói hiện tại để so sánh lần sau
            })
        });

        if (!updateRes.ok) throw new Error(`Supabase Update Error: ${updateRes.status}`);

        const transactionCode = data.id || `POLAR-${Date.now()}`;
        const timestamp = new Date().toISOString();
        const transactionType = plan.id.includes('credit') ? 'credit' : 'subscription';

        const txPayload = {
            user_id: user.id,
            amount: amount / 100, 
            currency: 'USD',
            type: transactionType, 
            status: 'completed',
            credits_added: plan.credits,
            plan_name: plan.name,
            plan_id: plan.id, 
            transaction_code: transactionCode,
            payment_method: 'polar',
            customer_email: customer_email,
            customer_name: user.full_name || customer_email.split('@')[0], 
            created_at: timestamp, 
            updated_at: timestamp 
        };
        
        await fetch(`${sbUrl}/rest/v1/transactions`, {
            method: 'POST',
            headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(txPayload)
        });

        return new Response("Plan Updated Successfully", { status: 200 });
    } catch (e) {
        console.error("[Polar] Error:", e);
        return new Response(`Error: ${e.message}`, { status: 500 });
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
        const proxyHeaders = { 'user-agent': HEADERS['user-agent'] };
        const response = await fetch(url, { method: 'GET', headers: proxyHeaders });
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
        return new Response(response.body, { status: response.status, headers: newHeaders });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
}

async function handleRunningHubProxy(action, body) {
    let url = '';
    let payload = {};
    if (action === 'upscale_create' || action === 'runninghub_create') {
        url = 'https://www.runninghub.ai/task/openapi/ai-app/run';
        payload = body;
        payload.apiKey = getRandomRunningHubKey();
    } 
    else if (action === 'upscale_check' || action === 'runninghub_check') {
        url = 'https://www.runninghub.ai/task/openapi/outputs';
        payload = { apiKey: getRandomRunningHubKey(), taskId: body.taskId };
    } else {
        throw new Error("Invalid RunningHub action");
    }
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    return data;
}

async function handleGeoCheck(request) {
    const country = request.headers.get('cf-ipcountry');
    return { country: country || null };
}

async function handleSyncLadiPage(body, env) {
    if (!LADIFLOW_API_KEY) return { success: false, message: "API Key not configured" };
    const { is_new_user, email, full_name, country } = body;
    if (country && country !== 'VN') {
        return { success: true, message: `Skipped sync: Country is ${country} (Not VN)` };
    }
    if (is_new_user) {
        const result = await sendToLadiPage({ email: email, name: full_name, tags: ["696d3c8a4cb43700128d705a"] });
        return result; 
    }
    return { success: true, message: "Skipped sync (not new user)" };
}

export default {
    async fetch(request, env, ctx) {
        const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With' };
        if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
        const sendJson = (data, status = 200) => new Response(JSON.stringify(data), { status: status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        const url = new URL(request.url);
        const path = url.pathname;
        if (path.includes('/sepay-webhook')) return handleSePayWebhook(request, env);
        if (path.includes('/polar-webhook')) return handlePolarWebhook(request, env); 
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
                else if (path.includes('/upscale-create')) action = 'upscale_create'; 
                else if (path.includes('/upscale-check')) action = 'upscale_check';   
                else if (path.includes('/upscale')) action = 'upscale'; 
                else if (path.includes('/check-name')) action = 'check_name';
                else if (path.includes('/check-status')) action = 'check_status';
                else if (path.includes('/check-geo')) action = 'check_geo'; 
                else if (path.includes('/sync-ladipage')) action = 'sync_ladipage';
            }
            if (action === 'check_geo') { const result = await handleGeoCheck(request); return sendJson(result); }
            if (action === 'upscale_create' || action === 'upscale_check') { const result = await handleRunningHubProxy(action, body); return sendJson(result); }
            if (action === 'sync_ladipage') { const result = await handleSyncLadiPage(body, env); return sendJson(result); }
            if (action === 'gemini_proxy') { const { data, status } = await handleGeminiProxy(body, env, request); return sendJson(data, status); } 
            else if (action === 'auth') { return sendJson({ status: "connected", token: "managed-by-worker" }); } 
            else if (action === 'upload') { const accounts = await getAllAccounts(env); const mediaId = await uploadImage(env, accounts, body.image, body.imageAspectRatio); return sendJson({ mediaId }); } 
            else if (action === 'create') {
                const accounts = await getAllAccounts(env);
                if (body.referenceImages && Array.isArray(body.referenceImages)) { const result = await triggerGenerationWithRefs(env, accounts, body.prompt, body.videoAspectRatio, body.referenceImages); return sendJson(result); } 
                else { const result = await triggerGeneration(env, accounts, body.prompt, body.mediaId, body.videoAspectRatio, body.image, body.imageAspectRatio, body.endImage); return sendJson(result); }
            } else if (action === 'flow_create' || action === 'flow_media_create') {
                const accounts = await getAllAccounts(env);
                const count = body.numberOfImages || 1;
                const modelName = body.imageModelName || "GEM_PIX_2";
                const result = await triggerFlowMediaCreate(env, accounts, body.prompt, body.image, body.imageAspectRatio, count, modelName, body.images);
                return sendJson(result);
            } else if (action === 'flow_upscale') {
                const allAccounts = await getAllAccounts(env, true);
                let specificAccounts = [];
                if (body.projectId) { specificAccounts = allAccounts.filter(acc => acc.project_id === body.projectId); }
                const accountsToUse = specificAccounts.length > 0 ? specificAccounts : allAccounts;
                const result = await triggerFlowMediaUpscale(env, accountsToUse, body.mediaId, body.projectId, body.targetResolution);
                return sendJson(result);
            } else if (action === 'flow_check') { const accounts = await getAllAccounts(env); const result = await checkFlowStatus(env, accounts, body.taskId); return sendJson(result); } 
            else if (action === 'upscale') { const accounts = await getAllAccounts(env); const result = await triggerUpscale(env, accounts, body.mediaId); return sendJson(result); } 
            else if (action === 'check_name') {
                const { task_id } = body;
                if (env.VIDEO_KV) {
                    try { const cachedName = await env.VIDEO_KV.get(`proxy_map:${task_id}`); if (cachedName) return sendJson({ status: 'success', name: cachedName }); } 
                    catch (e) {}
                }
                const proxyUrl = `${ONEWISE_PROXY_URL_CHECK}?taskId=${task_id}`;
                const proxyRes = await fetch(proxyUrl, { method: 'GET', headers: { 'Authorization': ONEWISE_PROXY_AUTH, 'Content-Type': 'application/json' } });
                if (proxyRes.ok) {
                    const proxyData = await proxyRes.json();
                    if (proxyData.success && proxyData.result?.operations?.length > 0) {
                        const opData = proxyData.result.operations[0];
                        const resolvedName = opData.operation?.name || opData.name;
                        if (resolvedName) {
                            if (env.VIDEO_KV) await env.VIDEO_KV.put(`proxy_map:${task_id}`, resolvedName, { expirationTtl: 600 });
                            return sendJson({ status: 'success', name: resolvedName });
                        }
                    }
                }
                return sendJson({ status: 'pending', message: "Resolving name..." });
            } else if (action === 'check_status') {
                const { name, account_id } = body;
                if (!name) return sendJson({ status: 'failed', message: "Missing operation name" });
                const accounts = await getAllAccounts(env, true);
                const result = await checkStatus(env, accounts, name, account_id);
                return sendJson(result);
            } else { return sendJson({ status: "ok", message: "Cloudflare Worker is running", request_path: path }); }
        } catch (error) { return sendJson({ error: true, message: error.message || String(error) }, 500); }
    }
};
