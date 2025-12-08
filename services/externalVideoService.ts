
import { FileData } from "../types";

// Change this if your Cloudflare Worker is hosted elsewhere
// Leave empty if serving from same domain path /api
// Get API URL from env var if available (Set VITE_API_URL in Cloudflare Pages Settings)
// @ts-ignore
const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || "https://twilight-fire-b7d4.truongvohaiaune.workers.dev"; 

// Helper wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Constants for Timeout logic
const POLL_INTERVAL = 8000; // 8 seconds
const TIMEOUT_DURATION = 180000; // 3 minutes in ms
const MAX_POLL_ATTEMPTS = Math.ceil(TIMEOUT_DURATION / POLL_INTERVAL); // ~23 attempts

// Crop and Resize Image (Center Crop to Aspect Ratio, Max 1024px)
export const resizeAndCropImage = async (
    fileData: FileData, 
    aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Allow re-cropping from an existing base64/DataURL if that's what we have
        img.src = fileData.objectURL || `data:${fileData.mimeType};base64,${fileData.base64}`;
        
        img.onload = () => {
            // Determine target dimensions based on max 1024px and aspect ratio
            let targetWidth, targetHeight;
            
            if (aspectRatio === '16:9') {
                targetWidth = 1024;
                targetHeight = 576;
            } else { // 9:16
                targetWidth = 576;
                targetHeight = 1024;
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                // Fallback to original if context fails
                resolve(`data:${fileData.mimeType};base64,${fileData.base64}`);
                return;
            }

            // High quality scaling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Draw white background (handles transparency)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetWidth, targetHeight);

            // Calculate "Cover" fit (Center Crop)
            const imgRatio = img.width / img.height;
            const targetRatio = targetWidth / targetHeight;
            
            let renderWidth, renderHeight, offsetX, offsetY;

            if (imgRatio > targetRatio) {
                // Image is wider than target: Scale by height, crop width
                renderHeight = targetHeight;
                renderWidth = img.width * (targetHeight / img.height);
                offsetX = (targetWidth - renderWidth) / 2; // Center horizontally
                offsetY = 0;
            } else {
                // Image is taller than target: Scale by width, crop height
                renderWidth = targetWidth;
                renderHeight = img.height * (targetWidth / img.width);
                offsetX = 0;
                offsetY = (targetHeight - renderHeight) / 2; // Center vertically
            }

            // Draw image
            ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);

            // Export as JPEG
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
            resolve(compressedDataUrl);
        };

        img.onerror = (e) => {
            console.error("Image load failed for resize", e);
            // Fallback to original
            resolve(`data:${fileData.mimeType};base64,${fileData.base64}`);
        };
    });
};

// Safe JSON fetch helper with Timeout support
const fetchJson = async (endpoint: string, options?: RequestInit) => {
    // 45s Default Timeout for fetch if not specified (Workers can be slow)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    
    // Construct Full URL logic:
    let url = endpoint;
    
    if (BACKEND_URL) {
        // If BACKEND_URL is set (e.g. https://my-worker.workers.dev)
        const baseUrl = BACKEND_URL.replace(/\/$/, ""); // Remove trailing slash
        const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        url = `${baseUrl}${path}`;
    } else {
        // Fallback to relative /api path if no env var is set
        const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        // If the endpoint already starts with /api, don't double it
        if (path.startsWith('/api')) {
            url = path;
        } else {
            url = `/api${path}`;
        }
    }

    try {
        const res = await fetch(url, {
            ...options,
            signal: options?.signal || controller.signal
        });
        clearTimeout(timeoutId);

        const text = await res.text();
        
        // Handle HTML responses (Cloudflare/Vercel errors) gracefully
        if (text.trim().startsWith("<") || text.includes("<!DOCTYPE") || text.includes("<html")) {
             if (res.status === 404) {
                 throw new Error(`SYSTEM_ERROR: Không tìm thấy dịch vụ API.`);
             }
             if (res.status === 500 || res.status === 502) {
                 throw new Error(`SYSTEM_ERROR: Máy chủ đang bảo trì.`);
             }
             throw new Error(`NETWORK_ERROR: Lỗi kết nối máy chủ (${res.status})`);
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`SYSTEM_ERROR: Phản hồi không hợp lệ từ máy chủ.`);
        }
        
        if (!res.ok) {
            // Prefer detailed message
            let msg = data.error?.message || data.message || `Lỗi (${res.status})`;
            
            // Standardize Error Codes for UI Mapping
            if (JSON.stringify(data).includes("SAFETY") || msg.includes("SAFETY")) {
                throw new Error("SAFETY_ERROR");
            }
            if (res.status === 429 || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
                throw new Error("QUOTA_ERROR");
            }
            if (res.status === 401 || res.status === 403 || msg.includes("UNAUTHENTICATED")) {
                throw new Error("AUTH_ERROR");
            }
            
            // Pass through original message if not categorized
            throw new Error(msg);
        }
        
        // Check for specific error flags in 200 OK responses (common in proxy wrappers)
        if (data.status === 'failed') {
             const failMsg = data.message || "Unknown error";
             if (failMsg.includes("SAFETY")) throw new Error("SAFETY_ERROR");
             throw new Error(failMsg);
        }

        return data;
    } catch (err: any) {
        clearTimeout(timeoutId);
        // Normalize error message
        let msg = err.message || "Lỗi kết nối";
        if (msg.includes("aborted") || msg.includes("signal") || msg.includes("timeout")) msg = "TIMEOUT_ERROR";
        if (msg.includes("Failed to fetch")) msg = "NETWORK_ERROR";
        
        throw new Error(msg);
    }
};

// Internal function performing the actual generation logic
async function _executeVideoGeneration(
    prompt: string, 
    startImage?: FileData, 
    aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<{ videoUrl: string, mediaId?: string }> {
    console.log("==========================================================");
    console.log(`[Video Service] EXECUTING VIDEO GENERATION - Ratio: ${aspectRatio}`);
    
    // Step 0: Compress & Crop Image
    let imageBase64 = null;
    if (startImage) {
        console.log(`[Client] Step 0: Processing Image...`);
        try {
            const compressed = await resizeAndCropImage(startImage, aspectRatio);
            imageBase64 = compressed.split(',')[1];
        } catch (e) {
            console.warn("[Client] Processing failed, using original.");
            imageBase64 = startImage.base64;
        }
    }

    // Step 1: Auth
    const authData = await fetchJson('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth' })
    });
    const token = authData.token;
    if (!token) throw new Error("AUTH_ERROR");

    // Step 2: Upload
    let mediaId = null;
    if (imageBase64) {
        console.log(`[Client] Step 2: Uploading Image...`);
        const uploadData = await fetchJson('/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'upload', token, image: imageBase64 })
        });
        mediaId = uploadData.mediaId;
    }

    // Step 3: Trigger
    console.log(`[Client] Step 3: Triggering Generation...`);
    const triggerData = await fetchJson('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', token, prompt, mediaId, aspectRatio })
    });
    const { task_id, scene_id } = triggerData;

    // Step 4: Polling
    console.log(`[Client] Step 4: Polling Status...`);
    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS) {
        attempts++;
        await wait(POLL_INTERVAL);

        try {
            const checkData = await fetchJson('/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'check', task_id, scene_id, token }) 
            });

            if (checkData.status === 'completed' && checkData.video_url) {
                console.log(`[Client] SUCCESS! Video URL: ${checkData.video_url}`);
                return { videoUrl: checkData.video_url, mediaId: checkData.mediaId };
            }
            
            if (checkData.status === 'failed') {
                const failReason = checkData.message || "Unknown error";
                if (failReason.includes("SAFETY")) throw new Error("SAFETY_ERROR");
                throw new Error(`GENERATION_FAILED: ${failReason}`);
            }
        } catch (e: any) {
            // Immediately throw critical errors to stop retrying the same task
            if (e.message.includes("SAFETY_ERROR") || e.message.includes("AUTH_ERROR")) throw e;
            // For other transient errors (Network, 500), continue loop until timeout
            console.warn(`[Client] Poll Error (Will retry):`, e.message);
        }
    }

    throw new Error("TIMEOUT_ERROR");
}

export const generateVideoExternal = async (
    prompt: string, 
    backendUrl: string, 
    startImage?: FileData, 
    aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<{ videoUrl: string, mediaId?: string }> => {
    try {
        return await _executeVideoGeneration(prompt, startImage, aspectRatio);
    } catch (error: any) {
        // Retry logic for Timeout
        if (error.message === 'TIMEOUT_ERROR') {
            console.warn("[Video Service] Timeout encountered (3 min). Retrying generation once...");
            try {
                return await _executeVideoGeneration(prompt, startImage, aspectRatio);
            } catch (retryError: any) {
                console.error("[Video Service] Retry attempt also failed.");
                throw retryError; // Throw final error (likely TIMEOUT_ERROR again)
            }
        }
        throw error;
    }
};

export const upscaleVideoExternal = async (mediaId: string): Promise<string> => {
    console.log("==========================================================");
    console.log(`[Video Service] STARTING VIDEO UPSCALE (1080p)`);
    console.log("==========================================================");

    try {
        const authData = await fetchJson('/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'auth' })
        });
        const token = authData.token;

        const triggerData = await fetchJson('/upscale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'upscale', token, mediaId })
        });
        const { task_id, scene_id } = triggerData;
        console.log(`[Client] Upscale Task Created! Task ID: ${task_id}`);

        const maxRetries = 120;
        let attempts = 0;

        while (attempts < maxRetries) {
            attempts++;
            await wait(8000);

            const checkData = await fetchJson('/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'check', task_id, scene_id, token })
            });

            if (checkData.status === 'completed' && checkData.video_url) {
                return checkData.video_url;
            }

            if (checkData.status === 'failed') {
                throw new Error("GENERATION_FAILED");
            }
        }
        
        throw new Error("TIMEOUT_ERROR");

    } catch (err: any) {
        console.error("[Upscale Error]", err);
        throw err;
    }
};
