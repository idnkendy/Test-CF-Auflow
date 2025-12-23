
// ... existing imports ...
import { FileData } from "../types";

// ... existing config ...
// @ts-ignore
const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || "https://twilight-fire-b7d4.truongvohaiaune.workers.dev"; 

// TOKEN SERVICE CONFIG
const ONEWISE_API_URL = "https://new-rest.onewise.app/api/fix/get-token";
const ONEWISE_AUTH_TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ODcsInJvbGUiOjMsImlhdCI6MTc2NjI4NTg2Mn0.zLqDOTRuYAnavQyNWFoZL6NdEVXBUqbdfujnLwY199E";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const POLL_INTERVAL = 10000;
const TIMEOUT_DURATION = 300000; 
const MAX_POLL_ATTEMPTS = Math.ceil(TIMEOUT_DURATION / POLL_INTERVAL);

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

const getImageDimensions = (fileData: FileData): Promise<{width: number, height: number}> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = fileData.objectURL || `data:${fileData.mimeType};base64,${fileData.base64}`;
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 2048, height: 1152 });
    });
};

/**
 * Resizes and crops image based on aspect ratio AND tier.
 * tier: 'standard' (Flash/1K limit) | 'pro' (Pro/2K limit)
 */
export const resizeAndCropImage = async (
    fileData: FileData, 
    aspectRatio: '16:9' | '9:16' | '1:1' | 'default' = '16:9',
    tier: 'standard' | 'pro' = 'pro'
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

            // Define dimensions based on Tier
            // Standard (GEM_PIX) often fails with > 1MP images
            const isStandard = tier === 'standard';

            if (effectiveRatio === '16:9') {
                targetWidth = isStandard ? 1280 : 2048;
                targetHeight = isStandard ? 720 : 1152;
            } else if (effectiveRatio === '9:16') { 
                targetWidth = isStandard ? 720 : 1152;
                targetHeight = isStandard ? 1280 : 2048;
            } else if (effectiveRatio === '1:1') {
                targetWidth = isStandard ? 1024 : 1024; // 1:1 is safe at 1024 for both
                targetHeight = isStandard ? 1024 : 1024;
            } else {
                targetWidth = isStandard ? 1280 : 2048;
                targetHeight = isStandard ? 720 : 1152;
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

            // Center crop logic (COVER)
            const scaleCover = Math.max(targetWidth / img.width, targetHeight / img.height);
            
            const renderWidth = img.width * scaleCover;
            const renderHeight = img.height * scaleCover;
            const offsetX = (targetWidth - renderWidth) / 2;
            const offsetY = (targetHeight - renderHeight) / 2;

            ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);
            
            // Adjust compression quality based on tier
            const quality = isStandard ? 0.85 : 0.9;
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
        };

        img.onerror = (e) => {
            console.error("Image load failed for resize", e);
            resolve(`data:${fileData.mimeType};base64,${fileData.base64}`);
        };
    });
};

const formatErrorMessage = (msg: string): string => {
    if (!msg) return "Lỗi không xác định. Vui lòng thử lại sau.";
    
    // Safety / Policy Errors
    if (msg.includes("SAFETY") || msg.includes("safety") || msg.includes("blocked")) 
        return "Nội dung vi phạm chính sách an toàn của AI (Safety Filter). Vui lòng điều chỉnh prompt nhẹ nhàng hơn.";
    
    // Captcha / Auth - UPDATED
    if (msg.includes("reCAPTCHA") || msg.includes("captcha") || msg.includes("401") || msg.includes("UNAUTHENTICATED") || msg.includes("auth")) 
        return "Google hiện đang xảy ra lỗi (Captcha). Vui lòng thử lại sau";

    // Timeout / System
    if (msg.includes("timeout") || msg.includes("deadline")) 
        return "Hết thời gian chờ phản hồi từ máy chủ. Vui lòng thử lại.";
    
    if (msg.includes("503") || msg.includes("overloaded")) 
        return "Máy chủ AI đang quá tải. Vui lòng thử lại sau 1 phút.";

    if (msg.includes("quota") || msg.includes("exhausted"))
        return "Hệ thống đang bận (Quota limit). Vui lòng chờ giây lát.";

    if (msg.includes("INVALID_ARGUMENT"))
        return "Lỗi dữ liệu đầu vào (Invalid Argument). Ảnh quá lớn hoặc tỷ lệ không phù hợp với Standard Mode.";

    // Ensure "Vui lòng thử lại sau" suffix exists if simple error
    if (!msg.toLowerCase().includes("vui lòng") && !msg.includes("try again") && msg.length < 50) {
        return `${msg}. Vui lòng thử lại sau.`;
    }
    return msg;
};

const fetchJson = async (endpoint: string, options?: RequestInit) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // Increased timeout to 60s
    
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
            throw new Error(formatErrorMessage(msg));
        }
        
        if (data.status === 'failed' || data.code === 'failed' || data.success === false) {
             const failMsg = data.message || "Unknown error";
             if (failMsg.includes("reCAPTCHA")) {
                 throw new Error(formatErrorMessage(failMsg));
             }
             if (failMsg.includes("SAFETY")) throw new Error("SAFETY_ERROR");
             
             // Check if it's processing state disguised as failure (should happen in flow check, but handled here just in case)
             if (data.code === 'processing') return data;

             throw new Error(formatErrorMessage(failMsg));
        }

        return data;
    } catch (err: any) {
        clearTimeout(timeoutId);
        let msg = err.message || "Lỗi kết nối";
        if (msg.includes("aborted") || msg.includes("signal") || msg.includes("timeout")) msg = "TIMEOUT_ERROR";
        if (msg.includes("Failed to fetch")) msg = "NETWORK_ERROR";
        
        // Final normalization for reCAPTCHA if missed
        if (msg.includes("reCAPTCHA")) msg = "Google hiện đang xảy ra lỗi (Captcha). Vui lòng thử lại sau";
        
        throw new Error(msg);
    }
};

/**
 * NEW: Generate High Fidelity Image via Flow Media (GEM_PIX_2)
 * Accepts multiple images in inputImages array.
 */
export const generateFlowImage = async (
    prompt: string,
    inputImages: FileData[] | FileData = [], 
    aspectRatio: string = "IMAGE_ASPECT_RATIO_LANDSCAPE",
    numberOfImages: number = 1,
    imageModelName: string = "GEM_PIX_2",
    onProgress?: (message: string) => void // New Callback
): Promise<{ imageUrls: string[], mediaIds: string[], projectId?: string }> => {
    
    // Normalize inputImages to array
    const imagesToProcess = Array.isArray(inputImages) ? inputImages : (inputImages ? [inputImages] : []);
    const processedImages: string[] = [];

    if (onProgress) onProgress("Đang tối ưu hóa ảnh đầu vào...");

    // Determine correct crop ratio based on requested Aspect Enum
    let ratioType: '16:9' | '9:16' | '1:1' = '16:9';
    if (aspectRatio.includes("PORTRAIT")) {
        ratioType = "9:16";
    } else if (aspectRatio.includes("SQUARE")) {
        ratioType = "1:1"; // Important: Support Square cropping
    } else {
        ratioType = "16:9";
    }

    // Determine Tier based on model name
    // GEM_PIX (Flash) = standard (1280px limit)
    // GEM_PIX_2 (Pro) = pro (2048px limit)
    const tier = (imageModelName === 'GEM_PIX') ? 'standard' : 'pro';

    // Resize and crop all images
    for (const img of imagesToProcess) {
        try {
            // Pass Tier to resize logic
            const imageData = await resizeAndCropImage(img, ratioType, tier);
            processedImages.push(imageData);
        } catch (e) {
            processedImages.push(`data:${img.mimeType};base64,${img.base64}`);
        }
    }

    if (onProgress) onProgress("Đang kết nối hệ thống AI...");
    const dynamicToken = await getOneWiseToken();

    console.log("[Checkpoint 1] Creating Flow Task...");

    // 1. CREATE TASK - Send 'images' array to backend
    const createRes = await fetchJson('/flow-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'flow_media_create',
            prompt: prompt || "enhance the resolution and quality of this image",
            images: processedImages, // Send array of images
            // Fallback image for backward compatibility if backend checks 'image' prop
            image: processedImages.length > 0 ? processedImages[0] : null, 
            imageAspectRatio: aspectRatio,
            dynamicToken: dynamicToken,
            numberOfImages: numberOfImages,
            imageModelName: imageModelName 
        })
    });

    if (!createRes.taskId) {
        throw new Error("Không nhận được Task ID từ hệ thống.");
    }

    const taskId = createRes.taskId;
    const projectId = createRes.projectId;
    
    console.log(`[Checkpoint 2] Task Created: ${taskId}. Start Polling...`);
    if (onProgress) onProgress("Đã gửi yêu cầu. Đang chờ xử lý...");

    // 2. POLL STATUS
    const POLLING_DELAY = 5000; // Faster polling initially
    const MAX_RETRIES = 60; // Up to 5 minutes

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

            // HANDLE PROCESSING STATUS CORRECTLY
            if (statusRes.code === 'processing') {
                const step = statusRes.step || '...';
                const msg = statusRes.message || 'Đang xử lý';
                if (onProgress) onProgress(`[Bước ${step}] ${msg}`);
                continue;
            }

            if (statusRes.result?.error) {
                const nestedErr = statusRes.result.error;
                if (nestedErr.code === 401 || nestedErr.status === 'UNAUTHENTICATED') {
                    throw new Error("Google hiện đang xảy ra lỗi (Captcha). Vui lòng thử lại sau");
                }
                const errMsg = nestedErr.message || "Lỗi xử lý từ hệ thống AI";
                throw new Error(formatErrorMessage(errMsg));
            }

            if (statusRes.code === 'failed' || statusRes.success === false) {
                 const msg = statusRes.message || "Lỗi xử lý không xác định";
                 throw new Error(formatErrorMessage(msg));
            }

            if (statusRes.result?.media && statusRes.result.media.length > 0) {
                const urls: string[] = [];
                const mediaIds: string[] = [];

                console.log("[Checkpoint 4-FULL] Result Structure:", JSON.stringify(statusRes.result));

                statusRes.result.media.forEach((mediaItem: any) => {
                     let mId = mediaItem.mediaGenerationId || mediaItem.image?.id || mediaItem.id;
                     if (!mId && mediaItem.image?.generatedImage) {
                         mId = mediaItem.image.generatedImage.mediaGenerationId || mediaItem.image.generatedImage.id;
                     }
                     if(mId) mediaIds.push(mId);

                     let generatedImage = mediaItem.image?.generatedImage?.encodedImage;
                     if (!generatedImage) generatedImage = mediaItem.encodedImage;
                     if (!generatedImage && mediaItem.image?.encodedImage) generatedImage = mediaItem.image.encodedImage;

                     if (generatedImage) {
                         const finalUrl = generatedImage.startsWith('data:') 
                             ? generatedImage 
                             : `data:image/jpeg;base64,${generatedImage}`;
                         urls.push(finalUrl);
                         return;
                     }

                     let fifeUrl = mediaItem.fifeUrl;
                     if (!fifeUrl && mediaItem.image?.generatedImage?.fifeUrl) fifeUrl = mediaItem.image.generatedImage.fifeUrl;
                     
                     if (fifeUrl) {
                         urls.push(fifeUrl);
                         return;
                     }
                });
                
                if (urls.length > 0) {
                    if (onProgress) onProgress("Hoàn tất! Đang tải ảnh...");
                    return { imageUrls: urls, mediaIds, projectId };
                }
            }
            
            if (statusRes.status === 'FAILED') {
                 throw new Error("Quá trình xử lý ảnh thất bại. Vui lòng thử lại sau.");
            }

        } catch (pollErr: any) {
            // Rethrow critical errors that shouldn't be retried
            const msg = pollErr.message || "";
            if (msg.includes("SYSTEM_ERROR") || msg.includes("Vui lòng thử lại sau") || msg.includes("Captcha") || msg.includes("SAFETY")) {
                 throw pollErr;
            }
            console.warn("Polling retry:", pollErr);
            if (onProgress) onProgress("Kết nối chậm, đang thử lại...");
        }
    }
    
    throw new Error("Hết thời gian chờ xử lý (Timeout). Vui lòng thử lại sau.");
};

export const upscaleFlowImage = async (
    mediaId: string,
    projectId: string | undefined,
): Promise<{ imageUrl: string }> => {
    
    const dynamicToken = await getOneWiseToken();
    console.log(`[Checkpoint 6] Starting Upscale for ID: ${mediaId}`);

    const createRes = await fetchJson('/flow-upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'flow_upscale',
            mediaId: mediaId,
            projectId: projectId, 
            dynamicToken: dynamicToken
        })
    });

    if (!createRes.taskId) {
        throw new Error("Không nhận được Task ID Upscale từ hệ thống.");
    }

    const taskId = createRes.taskId;
    console.log(`[Checkpoint 7] Upscale Task Created: ${taskId}`);

    const POLLING_DELAY = 10000;
    const MAX_RETRIES = 20;

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

            // HANDLE PROCESSING STATUS CORRECTLY
            if (statusRes.code === 'processing') {
                if (i % 2 === 0) console.log(`[Upscale] Processing step ${statusRes.step}: ${statusRes.message}`);
                continue;
            }

            if (statusRes.result?.error) {
                const nestedErr = statusRes.result.error;
                if (nestedErr.code === 401 || nestedErr.status === 'UNAUTHENTICATED') {
                    throw new Error("Google hiện đang xảy ra lỗi (Captcha). Vui lòng thử lại sau");
                }
                const errMsg = nestedErr.message || "Lỗi xử lý từ hệ thống AI";
                throw new Error(formatErrorMessage(errMsg));
            }

            if (statusRes.code === 'failed' || statusRes.success === false) {
                 const msg = statusRes.message || "Lỗi xử lý upscale";
                 throw new Error(formatErrorMessage(msg));
            }

            if (statusRes.result) {
                let encodedImage = statusRes.result.encodedImage;
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
                 throw new Error("Quá trình upscale thất bại. Vui lòng thử lại sau.");
            }

        } catch (pollErr: any) {
            const msg = pollErr.message || "";
            if (msg.includes("SYSTEM_ERROR") || msg.includes("Vui lòng thử lại sau") || msg.includes("Captcha")) {
                 throw pollErr;
            }
            console.warn("Polling upscale retry:", pollErr);
        }
    }

    throw new Error("Hết thời gian chờ upscale. Vui lòng thử lại sau.");
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
            // Video generation is always Pro tier (Video Model), so we use default 'pro' or explicit 'pro'
            const compressed = await resizeAndCropImage(startImage, aspectRatio, 'pro');
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
            await wait(10000); 

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
