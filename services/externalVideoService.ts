
import { FileData } from "../types";

// Change this if your Cloudflare Worker is hosted elsewhere
// Leave empty if serving from same domain path /api
// Get API URL from env var if available (Set VITE_API_URL in Cloudflare Pages Settings)
// @ts-ignore
const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || "https://twilight-fire-b7d4.truongvohaiaune.workers.dev"; 

// TOKEN SERVICE CONFIG
const ONEWISE_API_URL = "https://new-rest.onewise.app/api/fix/get-token";
// Updated Token from user request
const ONEWISE_AUTH_TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ODcsInJvbGUiOjMsImlhdCI6MTc2NjI4NTg2Mn0.zLqDOTRuYAnavQyNWFoZL6NdEVXBUqbdfujnLwY199E";

// Helper wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Constants for Timeout logic
const POLL_INTERVAL = 10000; // 10 seconds
const TIMEOUT_DURATION = 300000; // 5 minutes in ms
const MAX_POLL_ATTEMPTS = Math.ceil(TIMEOUT_DURATION / POLL_INTERVAL); // 30 attempts

// Helper to fetch dynamic token
const getOneWiseToken = async (): Promise<string | null> => {
    try {
        const response = await fetch(ONEWISE_API_URL, {
            method: 'GET',
            headers: {
                'Authorization': ONEWISE_AUTH_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.token) {
                return data.token;
            }
        }
        console.warn("OneWise Token Fetch failed");
        return null;
    } catch (e) {
        console.warn("Network error fetching OneWise token:", e);
        return null;
    }
};

// Helper to get image dimensions
const getImageDimensions = (fileData: FileData): Promise<{width: number, height: number}> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = fileData.objectURL || `data:${fileData.mimeType};base64,${fileData.base64}`;
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 2048, height: 1152 }); // Fallback safe default
    });
};

// Crop and Resize Image with Letterbox/Pillarbox support
export const resizeAndCropImage = async (
    fileData: FileData, 
    aspectRatio: '16:9' | '9:16' | 'default' = '16:9'
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = fileData.objectURL || `data:${fileData.mimeType};base64,${fileData.base64}`;
        
        img.onload = () => {
            let targetWidth, targetHeight;
            let effectiveRatio = aspectRatio;

            if (effectiveRatio === 'default') {
                effectiveRatio = img.width >= img.height ? '16:9' : '9:16';
            }

            if (effectiveRatio === '16:9') {
                targetWidth = 2048;
                targetHeight = 1152;
            } else { // 9:16
                targetWidth = 1152;
                targetHeight = 2048;
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                resolve(`data:${fileData.mimeType};base64,${fileData.base64}`);
                return;
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, targetWidth, targetHeight);

            const scale = Math.min(targetWidth / img.width, targetHeight / img.height);
            const renderWidth = img.width * scale;
            const renderHeight = img.height * scale;
            const offsetX = (targetWidth - renderWidth) / 2;
            const offsetY = (targetHeight - renderHeight) / 2;

            ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
            resolve(compressedDataUrl);
        };

        img.onerror = (e) => {
            console.error("Image load failed for resize", e);
            resolve(`data:${fileData.mimeType};base64,${fileData.base64}`);
        };
    });
};

// Safe JSON fetch helper with Timeout support
const fetchJson = async (endpoint: string, options?: RequestInit) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    
    let url = endpoint;
    if (BACKEND_URL) {
        const baseUrl = BACKEND_URL.replace(/\/$/, ""); 
        const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        url = `${baseUrl}${path}`;
    } else {
        const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        url = path.startsWith('/api') ? path : `/api${path}`;
    }

    try {
        const res = await fetch(url, {
            ...options,
            signal: options?.signal || controller.signal
        });
        clearTimeout(timeoutId);

        const text = await res.text();
        if (text.trim().startsWith("<") || text.includes("<!DOCTYPE") || text.includes("<html")) {
             if (res.status === 404) throw new Error(`SYSTEM_ERROR: Không tìm thấy dịch vụ API.`);
             if (res.status === 500 || res.status === 502) throw new Error(`SYSTEM_ERROR: Máy chủ đang bảo trì.`);
             throw new Error(`NETWORK_ERROR: Lỗi kết nối máy chủ (${res.status})`);
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`SYSTEM_ERROR: Phản hồi không hợp lệ từ máy chủ.`);
        }
        
        if (!res.ok) {
            let msg = data.error?.message || data.message || `Lỗi (${res.status})`;
            if (JSON.stringify(data).includes("SAFETY") || msg.includes("SAFETY")) throw new Error("SAFETY_ERROR");
            if (res.status === 429 || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) throw new Error("QUOTA_ERROR");
            if (res.status === 401 || res.status === 403 || msg.includes("UNAUTHENTICATED")) throw new Error("AUTH_ERROR");
            throw new Error(msg);
        }
        
        // Handle explicit "failed" status or code in JSON body
        if (data.status === 'failed' || data.code === 'failed') {
             const failMsg = data.message || "Unknown error";
             
             // Critical check for ReCaptcha/System failure to trigger refund
             if (failMsg.includes("reCAPTCHA") || failMsg.includes("failed")) {
                 throw new Error(`SYSTEM_ERROR: ${failMsg}`);
             }
             
             if (failMsg.includes("SAFETY")) throw new Error("SAFETY_ERROR");
             throw new Error(failMsg);
        }

        return data;
    } catch (err: any) {
        clearTimeout(timeoutId);
        let msg = err.message || "Lỗi kết nối";
        if (msg.includes("aborted") || msg.includes("signal") || msg.includes("timeout")) msg = "TIMEOUT_ERROR";
        if (msg.includes("Failed to fetch")) msg = "NETWORK_ERROR";
        throw new Error(msg);
    }
};

/**
 * NEW: Generate High Fidelity Image via Flow Media (GEM_PIX_2)
 * Updated Flow: Create Task -> Return TaskID -> UI Polls (Handled here) -> Return Result
 * Returns object with imageUrls, mediaIds, and projectId for subsequent upscale if needed
 */
export const generateFlowImage = async (
    prompt: string,
    sourceImage?: FileData,
    aspectRatio: string = "IMAGE_ASPECT_RATIO_LANDSCAPE",
    numberOfImages: number = 1
): Promise<{ imageUrls: string[], mediaIds: string[], projectId?: string }> => {
    let imageData = null;
    if (sourceImage) {
        // Prepare image
        try {
            const ratioType = aspectRatio.includes("PORTRAIT") ? "9:16" : "16:9";
            imageData = await resizeAndCropImage(sourceImage, ratioType);
        } catch (e) {
            imageData = `data:${sourceImage.mimeType};base64,${sourceImage.base64}`;
        }
    }

    // Fetch dynamic token for the request (Recaptcha Token)
    const dynamicToken = await getOneWiseToken();

    console.log("[Checkpoint 1] Creating Flow Task...");

    // 1. CREATE TASK
    const createRes = await fetchJson('/flow-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'flow_media_create',
            prompt: prompt || "enhance the resolution and quality of this image",
            image: imageData,
            imageAspectRatio: aspectRatio,
            dynamicToken: dynamicToken, // Pass the recaptcha token to backend
            numberOfImages: numberOfImages // Pass requested count
        })
    });

    if (!createRes.taskId) {
        throw new Error("Không nhận được Task ID từ hệ thống.");
    }

    const taskId = createRes.taskId;
    const projectId = createRes.projectId; // Captured from worker response
    
    console.log(`[Checkpoint 2] Task Created: ${taskId}. Start Polling...`);

    // 2. POLL STATUS
    const POLLING_DELAY = 10000; // 10 seconds
    const MAX_RETRIES = 60; // 10 minutes max (60 * 10s)

    for (let i = 0; i < MAX_RETRIES; i++) {
        await wait(POLLING_DELAY);
        
        try {
            const statusRes = await fetchJson('/flow-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'flow_check',
                    taskId: taskId 
                })
            });

            // Log raw response for debugging
            if (i % 2 === 0) console.log(`[Checkpoint 3] Poll ${i + 1}/${MAX_RETRIES}:`, statusRes);

            // 2.0 Critical Check for Nested Google API Error (UNAUTHENTICATED inside 200 OK)
            if (statusRes.result?.error) {
                const nestedErr = statusRes.result.error;
                if (nestedErr.code === 401 || nestedErr.status === 'UNAUTHENTICATED') {
                    throw new Error("SYSTEM_ERROR: Lỗi xác thực hệ thống (401).");
                }
                throw new Error(nestedErr.message || "Lỗi xử lý từ hệ thống AI.");
            }

            // 2.1 Critical Check
            if (statusRes.code === 'failed' || statusRes.success === false) {
                 const msg = statusRes.message || "Lỗi xử lý không xác định.";
                 if (msg.includes("reCAPTCHA")) {
                     throw new Error(`SYSTEM_ERROR: Lỗi xác thực hệ thống (Captcha).`);
                 }
                 throw new Error(msg);
            }

            // 2.2 Check for success result structure (ROBUST PARSING)
            if (statusRes.result?.media && statusRes.result.media.length > 0) {
                const urls: string[] = [];
                const mediaIds: string[] = [];

                statusRes.result.media.forEach((mediaItem: any) => {
                     // DEBUG: Log media item structure
                     console.log("[Checkpoint 4] Parsing Media Item:", mediaItem);

                     // Get Media ID (Robust check)
                     let mId = mediaItem.image?.id || mediaItem.mediaGenerationId;
                     if (!mId && mediaItem.image?.generatedImage) {
                         mId = mediaItem.image.generatedImage.mediaGenerationId;
                     }
                     if(mId) mediaIds.push(mId);
                     else console.warn("[Warning] Could not find mediaID in item", mediaItem);

                     // Get URL
                     // PRIORITY: Base64 (Reliable)
                     let generatedImage = mediaItem.image?.generatedImage?.encodedImage;
                     if (!generatedImage) generatedImage = mediaItem.encodedImage;

                     if (generatedImage) {
                         const finalUrl = generatedImage.startsWith('data:') 
                             ? generatedImage 
                             : `data:image/jpeg;base64,${generatedImage}`;
                         urls.push(finalUrl);
                         return; // Done
                     }

                     // FALLBACK: Fife URL
                     if (mediaItem.fifeUrl) {
                         urls.push(mediaItem.fifeUrl);
                         return;
                     }
                });
                
                if (urls.length > 0) {
                    console.log(`[Checkpoint 5] Success! Found ${urls.length} images and ${mediaIds.length} IDs.`);
                    return { imageUrls: urls, mediaIds, projectId };
                }
            }
            
            // If explicit status field says failed
            if (statusRes.status === 'FAILED') {
                 throw new Error("Quá trình xử lý ảnh thất bại.");
            }

            // Continue polling...
        } catch (pollErr: any) {
            // If it's a SYSTEM_ERROR (like Captcha or 401), rethrow immediately to break loop and refund
            if (pollErr.message && pollErr.message.includes("SYSTEM_ERROR")) {
                 throw pollErr;
            }
            console.warn("Polling retry:", pollErr);
        }
    }
    
    throw new Error("Hết thời gian chờ xử lý (Timeout). Vui lòng thử lại.");
};

/**
 * NEW: Upscale Flow Media Image to 2K
 */
export const upscaleFlowImage = async (
    mediaId: string,
    projectId: string | undefined,
): Promise<{ imageUrl: string }> => {
    
    // Fetch dynamic token for the request
    const dynamicToken = await getOneWiseToken();

    console.log(`[Checkpoint 6] Starting Upscale for ID: ${mediaId}`);

    // 1. TRIGGER UPSCALE TASK
    const createRes = await fetchJson('/flow-upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'flow_upscale',
            mediaId: mediaId,
            projectId: projectId, // Pass original project ID if available
            dynamicToken: dynamicToken
        })
    });

    if (!createRes.taskId) {
        throw new Error("Không nhận được Task ID Upscale từ hệ thống.");
    }

    const taskId = createRes.taskId;
    console.log(`[Checkpoint 7] Upscale Task Created: ${taskId}`);

    // 2. POLL STATUS
    const POLLING_DELAY = 10000;
    const MAX_RETRIES = 60;

    for (let i = 0; i < MAX_RETRIES; i++) {
        await wait(POLLING_DELAY);
        
        try {
            const statusRes = await fetchJson('/flow-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'flow_check',
                    taskId: taskId 
                })
            });

            // 2.0 Critical Check for Nested Google API Error
            if (statusRes.result?.error) {
                const nestedErr = statusRes.result.error;
                if (nestedErr.code === 401 || nestedErr.status === 'UNAUTHENTICATED') {
                    throw new Error("SYSTEM_ERROR: Lỗi xác thực hệ thống (401).");
                }
                throw new Error(nestedErr.message || "Lỗi xử lý từ hệ thống AI.");
            }

            if (statusRes.code === 'failed' || statusRes.success === false) {
                 throw new Error(statusRes.message || "Lỗi xử lý upscale.");
            }

            // Success check for Upscale response
            if (statusRes.result) {
                let encodedImage = statusRes.result.encodedImage;
                
                // Sometimes it might be nested
                if (!encodedImage && statusRes.result.media && statusRes.result.media.length > 0) {
                     encodedImage = statusRes.result.media[0].image?.generatedImage?.encodedImage;
                }

                if (encodedImage) {
                    console.log(`[Checkpoint 8] Upscale Success.`);
                    const finalUrl = encodedImage.startsWith('data:') 
                        ? encodedImage 
                        : `data:image/jpeg;base64,${encodedImage}`;
                    return { imageUrl: finalUrl };
                }
            }
            
            if (statusRes.status === 'FAILED') {
                 throw new Error("Quá trình upscale thất bại.");
            }

        } catch (pollErr: any) {
            // If it's a SYSTEM_ERROR, rethrow immediately
            if (pollErr.message && pollErr.message.includes("SYSTEM_ERROR")) {
                 throw pollErr;
            }
            console.warn("Polling upscale retry:", pollErr);
        }
    }

    throw new Error("Hết thời gian chờ upscale.");
};

async function _executeVideoGeneration(
    prompt: string, 
    startImage?: FileData, 
    aspectRatio: '16:9' | '9:16' | 'default' = '16:9'
): Promise<{ videoUrl: string, mediaId?: string }> {
    let effectiveRatio: '16:9' | '9:16' = '16:9'; 
    let imageBase64 = null;

    if (startImage) {
        if (aspectRatio === 'default') {
            const dims = await getImageDimensions(startImage);
            effectiveRatio = dims.width >= dims.height ? '16:9' : '9:16';
        } else {
            effectiveRatio = aspectRatio;
        }

        try {
            const compressed = await resizeAndCropImage(startImage, aspectRatio);
            imageBase64 = compressed.split(',')[1];
        } catch (e) {
            imageBase64 = startImage.base64;
        }
    } else {
        effectiveRatio = aspectRatio === 'default' ? '16:9' : aspectRatio as '16:9' | '9:16';
    }

    let imageAspectEnum = "IMAGE_ASPECT_RATIO_LANDSCAPE"; 
    let videoAspectEnum = "VIDEO_ASPECT_RATIO_LANDSCAPE"; 

    if (effectiveRatio === '9:16') {
        imageAspectEnum = "IMAGE_ASPECT_RATIO_PORTRAIT";
        videoAspectEnum = "VIDEO_ASPECT_RATIO_PORTRAIT"; 
    }

    const authData = await fetchJson('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth' })
    });
    const token = authData.token;
    if (!token) throw new Error("AUTH_ERROR");

    const triggerBody: any = { 
        action: 'create', 
        token, 
        prompt, 
        videoAspectRatio: videoAspectEnum 
    };

    if (imageBase64) {
        triggerBody.image = imageBase64;
        triggerBody.imageAspectRatio = imageAspectEnum;
    }

    const triggerData = await fetchJson('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(triggerBody)
    });
    const { task_id, scene_id } = triggerData;

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
                return { videoUrl: checkData.video_url, mediaId: checkData.mediaId };
            }
            
            if (checkData.status === 'failed') {
                const failReason = checkData.message || "Unknown error";
                if (failReason.includes("SAFETY")) throw new Error("SAFETY_ERROR");
                throw new Error(`GENERATION_FAILED: ${failReason}`);
            }
        } catch (e: any) {
            if (e.message.includes("SAFETY_ERROR") || e.message.includes("AUTH_ERROR")) throw e;
        }
    }
    throw new Error("TIMEOUT_ERROR");
}

export const generateVideoExternal = async (
    prompt: string, 
    backendUrl: string, 
    startImage?: FileData, 
    aspectRatio: '16:9' | '9:16' | 'default' = '16:9'
): Promise<{ videoUrl: string, mediaId?: string }> => {
    try {
        return await _executeVideoGeneration(prompt, startImage, aspectRatio);
    } catch (error: any) {
        if (error.message === 'TIMEOUT_ERROR') {
            try {
                return await _executeVideoGeneration(prompt, startImage, aspectRatio);
            } catch (retryError: any) {
                throw retryError; 
            }
        }
        throw error;
    }
};

export const upscaleVideoExternal = async (mediaId: string): Promise<string> => {
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

        const maxRetries = 120;
        let attempts = 0;

        while (attempts < maxRetries) {
            attempts++;
            await wait(10000); // Also updated to 10s for consistency

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
        throw err;
    }
};
