import { FileData } from "../types";

// @ts-ignore
const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || "https://twilight-fire-b7d4.truongvohaiaune.workers.dev"; 

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const POLL_INTERVAL = 10000;
const TIMEOUT_DURATION = 300000; 
const MAX_POLL_ATTEMPTS = Math.ceil(TIMEOUT_DURATION / POLL_INTERVAL);

/**
 * Chuyển đổi Base64 sang Blob URL một cách an toàn với bộ nhớ, đặc biệt cho ảnh 4K.
 */
const base64ToBlobUrl = async (base64Data: string, contentType: string = 'image/jpeg'): Promise<string> => {
    if (!base64Data) return "";
    
    // Loại bỏ prefix nếu có và làm sạch chuỗi
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data.trim().replace(/\s/g, '');

    try {
        // Sử dụng phương pháp Slicing thủ công để tránh lỗi "Maximum call stack size exceeded" với chuỗi cực lớn
        const byteCharacters = atob(cleanBase64);
        const byteArrays = [];
        const sliceSize = 1024 * 5; // 5KB slices

        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }

        const blob = new Blob(byteArrays, { type: contentType });
        return URL.createObjectURL(blob);
    } catch (e) {
        console.warn("Manual blob conversion failed, falling back to Data URI:", e);
        return `data:${contentType};base64,${cleanBase64}`;
    }
};

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const getImageDimensions = (fileData: FileData): Promise<{width: number, height: number}> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = fileData.objectURL || `data:${fileData.mimeType};base64,${fileData.base64}`;
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 2048, height: 1152 });
    });
};

export const resizeAndCropImage = async (
    fileData: FileData, 
    aspectRatio: '16:9' | '9:16' | '1:1' | 'default' = '16:9',
    tier: 'standard' | 'pro' = 'pro',
    fitMode: 'cover' | 'contain' = 'cover'
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = fileData.objectURL || `data:${fileData.mimeType};base64,${fileData.base64}`;
        
        img.onload = () => {
            let targetWidth, targetHeight;
            let effectiveRatio = aspectRatio;

            if (effectiveRatio === 'default') {
                effectiveRatio = img.width >= img.height ? '16:9' : '9:16';
            }

            const isStandard = tier === 'standard';

            if (effectiveRatio === '16:9') {
                targetWidth = isStandard ? 1280 : 2048;
                targetHeight = isStandard ? 720 : 1152;
            } else if (effectiveRatio === '9:16') { 
                targetWidth = isStandard ? 720 : 1152;
                targetHeight = isStandard ? 1280 : 2048;
            } else if (effectiveRatio === '1:1') {
                targetWidth = 1024;
                targetHeight = 1024;
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

            let scale = fitMode === 'contain' 
                ? Math.min(targetWidth / img.width, targetHeight / img.height)
                : Math.max(targetWidth / img.width, targetHeight / img.height);
            
            const renderWidth = img.width * scale;
            const renderHeight = img.height * scale;
            const offsetX = (targetWidth - renderWidth) / 2;
            const offsetY = (targetHeight - renderHeight) / 2;

            ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);
            resolve(canvas.toDataURL('image/jpeg', 1.0));
        };

        img.onerror = () => resolve(`data:${fileData.mimeType};base64,${fileData.base64}`);
    });
};

const formatErrorMessage = (msg: string): string => {
    if (!msg) return "Lỗi không xác định.";
    if (msg.includes("SAFETY")) return "Nội dung vi phạm chính sách an toàn của AI.";
    if (msg.includes("reCAPTCHA") || msg.includes("401")) return "Lỗi xác thực hệ thống. Vui lòng thử lại sau.";
    if (msg.includes("503") || msg.includes("overloaded")) return "Máy chủ AI đang quá tải. Thử lại sau 1 phút.";
    return msg;
};

const fetchJson = async (endpoint: string, options?: RequestInit) => {
    let url = endpoint;
    if (BACKEND_URL) {
        const baseUrl = BACKEND_URL.replace(/\/$/, ""); 
        const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        url = `${baseUrl}${path}`;
    }

    const res = await fetch(url, options);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error(`Phản hồi không hợp lệ.`); }
    
    if (!res.ok) throw new Error(formatErrorMessage(data.error?.message || data.message || `Lỗi (${res.status})`));
    
    // Updated Logic: Handle "queue" or "waiting" messages as processing state, not error.
    if (data.status === 'failed' || data.code === 'failed' || data.success === false) {
         const msg = (data.message || "").toLowerCase();
         // If explicit processing code OR message indicates queuing
         if (data.code === 'processing' || data.code === 'queue' || msg.includes('queue') || msg.includes('waiting')) {
             return { ...data, code: 'processing', message: data.message || "Đang xếp hàng chờ máy chủ..." };
         }
         throw new Error(formatErrorMessage(data.message || "Unknown error"));
    }
    return data;
};

export const proxyDownload = async (targetUrl: string): Promise<Blob> => {
    const baseUrl = BACKEND_URL.replace(/\/$/, "");
    const url = `${baseUrl}/proxy-download?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Proxy download failed");
    return await res.blob();
}

export const forceDownload = async (url: string, filename: string) => {
    try {
        let downloadUrl = url;
        let shouldRevoke = false;

        // Nếu là URL blob, dùng trực tiếp, KHÔNG fetch lại (gây tốn bộ nhớ và lỗi tiềm ẩn)
        if (url.startsWith('blob:')) {
            downloadUrl = url;
        } 
        // Nếu là Data URI, có thể dùng trực tiếp hoặc chuyển sang Blob nếu cần (ở đây dùng trực tiếp cho nhanh)
        else if (url.startsWith('data:')) {
            downloadUrl = url;
        }
        // Nếu là URL remote (http/https), dùng proxy để tải về blob
        else {
            const blob = await proxyDownload(url);
            downloadUrl = URL.createObjectURL(blob);
            shouldRevoke = true;
        }
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        if (shouldRevoke) {
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        }
    } catch (e) {
        console.error("Force download failed, falling back to new tab", e);
        window.open(url, '_blank');
    }
};

export const generateFlowImage = async (
    prompt: string,
    inputImages: FileData[] | FileData = [], 
    aspectRatio: string = "IMAGE_ASPECT_RATIO_LANDSCAPE",
    numberOfImages: number = 1,
    imageModelName: string = "GEM_PIX_2",
    onProgress?: (message: string) => void 
): Promise<{ imageUrls: string[], mediaIds: string[], projectId?: string }> => {
    const imagesToProcess = Array.isArray(inputImages) ? inputImages : [inputImages].filter(Boolean);
    const processedImages: string[] = [];
    if (onProgress) onProgress("Đang chuẩn bị dữ liệu ảnh...");

    let ratioType: '16:9' | '9:16' | '1:1' = '16:9';
    if (aspectRatio.includes("PORTRAIT")) ratioType = "9:16";
    else if (aspectRatio.includes("SQUARE")) ratioType = "1:1";

    const tier = (imageModelName === 'GEM_PIX') ? 'standard' : 'pro';

    for (const img of imagesToProcess) {
        const imageData = await resizeAndCropImage(img, ratioType, tier, 'cover');
        processedImages.push(imageData);
    }

    const createRes = await fetchJson('/flow-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'flow_media_create',
            prompt,
            images: processedImages,
            image: processedImages[0] || null, 
            imageAspectRatio: aspectRatio,
            numberOfImages,
            imageModelName
        })
    });

    if (!createRes.taskId) throw new Error("Không nhận được Task ID.");
    const taskId = createRes.taskId;
    const projectId = createRes.projectId;
    
    const POLLING_DELAY = 5000;
    const MAX_RETRIES = 120; // Increased to 10 minutes for long queues
    
    // --- GRACE PERIOD CONFIGURATION ---
    const startTime = Date.now();
    const GRACE_PERIOD = 120000; // 2 minutes (120,000 ms)

    for (let i = 0; i < MAX_RETRIES; i++) {
        await wait(POLLING_DELAY);
        
        try {
            const statusRes = await fetchJson('/flow-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'flow_check', taskId })
            });
            
            if (statusRes.code === 'processing') {
                if (onProgress) {
                    onProgress("Đang xử lý. Vui lòng đợi...");
                }
                continue;
            }

            const urls: string[] = [];
            const mediaIds: string[] = [];

            // Kiểm tra MediaId từ mảng media (cần cho Upscale)
            if (statusRes.result?.media && Array.isArray(statusRes.result.media)) {
                for (const item of statusRes.result.media) {
                    const mId = item.mediaGenerationId || item.id || item.image?.generatedImage?.mediaGenerationId;
                    if (mId) mediaIds.push(mId);

                    const base64 = item.encodedImage || item.image?.generatedImage?.encodedImage;
                    if (base64) {
                        urls.push(await base64ToBlobUrl(base64, 'image/jpeg'));
                    } else if (item.fifeUrl || item.image?.generatedImage?.fifeUrl) {
                        urls.push(item.fifeUrl || item.image?.generatedImage?.fifeUrl);
                    }
                }
            }

            // Kiểm tra encodedImage ở root (dành cho các mẫu mới nhất)
            if (statusRes.result?.encodedImage && urls.length === 0) {
                urls.push(await base64ToBlobUrl(statusRes.result.encodedImage, 'image/jpeg'));
                // Nếu root có mediaGenerationId thì thêm vào mảng mediaIds
                if (statusRes.result.mediaGenerationId) mediaIds.push(statusRes.result.mediaGenerationId);
            }

            if (urls.length > 0) return { imageUrls: [...new Set(urls)], mediaIds, projectId };
            if (statusRes.status === 'FAILED') throw new Error("AI từ chối tạo ảnh.");

        } catch (error: any) {
            // --- GRACE PERIOD CHECK ---
            // Nếu lỗi xảy ra trong vòng 2 phút đầu tiên, bỏ qua lỗi và tiếp tục vòng lặp
            if (Date.now() - startTime < GRACE_PERIOD) {
                console.warn(`[Grace Period] Lỗi tạm thời: ${error.message}. Đang thử lại...`);
                if (onProgress) onProgress("Đang kết nối lại...");
                continue; 
            }
            // Nếu quá 2 phút, ném lỗi ra ngoài
            throw error;
        }
    }
    throw new Error("Hết thời gian chờ xử lý (Timeout).");
};

export const upscaleFlowImage = async (mediaId: string, projectId: string | undefined, targetResolution: string = 'UPSAMPLE_IMAGE_RESOLUTION_2K'): Promise<{ imageUrl: string }> => {
    const createRes = await fetchJson('/flow-upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'flow_upscale', mediaId, projectId, targetResolution })
    });
    
    const taskId = createRes.taskId;
    const MAX_RETRIES = 60;
    
    // --- GRACE PERIOD CONFIGURATION FOR UPSCALE ---
    const startTime = Date.now();
    const GRACE_PERIOD = 120000; // 2 minutes

    for (let i = 0; i < MAX_RETRIES; i++) {
        await wait(6000);
        
        try {
            const statusRes = await fetchJson('/flow-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'flow_check', taskId })
            });
            if (statusRes.code === 'processing') continue;
            if (statusRes.result?.encodedImage) {
                return { imageUrl: await base64ToBlobUrl(statusRes.result.encodedImage, 'image/jpeg') };
            }
        } catch (error: any) {
             // --- GRACE PERIOD CHECK ---
             if (Date.now() - startTime < GRACE_PERIOD) {
                 console.warn(`[Upscale Grace Period] Lỗi tạm thời: ${error.message}. Đang thử lại...`);
                 continue;
             }
             throw error;
        }
    }
    throw new Error("Upscale thất bại.");
};

async function _executeVideoGeneration(
    prompt: string, 
    startImage?: FileData, 
    aspectRatio: '16:9' | '9:16' | 'default' = '16:9',
    endImage?: FileData
): Promise<{ videoUrl: string, mediaId?: string }> {
    let effectiveRatio: '16:9' | '9:16' = '16:9'; 
    let startImageBase64 = null;
    let endImageBase64 = null;

    if (startImage) {
        if (aspectRatio === 'default') {
            const dims = await getImageDimensions(startImage);
            effectiveRatio = dims.width >= dims.height ? '16:9' : '9:16';
        } else effectiveRatio = aspectRatio;
        
        const compressed = await resizeAndCropImage(startImage, effectiveRatio, 'pro', 'contain');
        startImageBase64 = compressed.split(',')[1];
    } else {
        effectiveRatio = aspectRatio === 'default' ? '16:9' : aspectRatio as '16:9' | '9:16';
    }

    if (endImage) {
        const compressedEnd = await resizeAndCropImage(endImage, effectiveRatio, 'pro', 'contain');
        endImageBase64 = compressedEnd.split(',')[1];
    }

    const imageAspectEnum = effectiveRatio === '9:16' ? "IMAGE_ASPECT_RATIO_PORTRAIT" : "IMAGE_ASPECT_RATIO_LANDSCAPE"; 
    const videoAspectEnum = effectiveRatio === '9:16' ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE"; 

    const authData = await fetchJson('/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'auth' }) });
    const token = authData.token;
    
    const triggerBody: any = { 
        action: 'create', 
        token, prompt, 
        videoAspectRatio: videoAspectEnum 
    };

    if (startImageBase64) {
        triggerBody.image = startImageBase64;
        triggerBody.imageAspectRatio = imageAspectEnum;
    }
    if (endImageBase64) triggerBody.endImage = endImageBase64;

    const triggerData = await fetchJson('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(triggerBody)
    });
    const { task_id, scene_id, account_id } = triggerData;

    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await wait(POLL_INTERVAL);
        const checkData = await fetchJson('/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check', task_id, scene_id, account_id }) 
        });
        
        if (checkData.code === 'processing' || (checkData.status === 'processing' && checkData.message?.includes('queue'))) {
             continue; // Just wait
        }

        if (checkData.status === 'completed' && checkData.video_url) return { videoUrl: checkData.video_url, mediaId: checkData.mediaId };
        if (checkData.status === 'failed') throw new Error(`GENERATION_FAILED: ${checkData.message}`);
    }
    throw new Error("TIMEOUT_ERROR");
}

export const generateVideoExternal = (p: string, b: string, s?: FileData, a: any = '16:9', e?: FileData) => _executeVideoGeneration(p, s, a, e);

export const generateVideoWithReferences = async (prompt: string, sceneImage: FileData, characterImage: FileData, aspectRatio: any = '16:9') => {
    let effectiveRatio = aspectRatio === 'default' ? '16:9' : aspectRatio;
    const imageAspectEnum = effectiveRatio === '9:16' ? "IMAGE_ASPECT_RATIO_PORTRAIT" : "IMAGE_ASPECT_RATIO_LANDSCAPE"; 
    const videoAspectEnum = effectiveRatio === '9:16' ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE"; 

    const sceneBase64 = await resizeAndCropImage(sceneImage, effectiveRatio, 'pro', 'contain');
    const charBase64 = await resizeAndCropImage(characterImage, effectiveRatio, 'pro', 'contain');

    const triggerData = await fetchJson('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            action: 'create', 
            prompt,
            videoAspectRatio: videoAspectEnum,
            referenceImages: [
                { data: sceneBase64.split(',')[1], aspectRatio: imageAspectEnum },
                { data: charBase64.split(',')[1], aspectRatio: imageAspectEnum }
            ]
        })
    });
    
    const { task_id, scene_id, account_id } = triggerData;
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await wait(POLL_INTERVAL);
        const checkData = await fetchJson('/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check', task_id, scene_id, account_id }) 
        });
        
        if (checkData.code === 'processing' || (checkData.status === 'processing' && checkData.message?.includes('queue'))) {
             continue; // Just wait
        }

        if (checkData.status === 'completed' && checkData.video_url) return { videoUrl: checkData.video_url, mediaId: checkData.mediaId };
        if (checkData.status === 'failed') throw new Error(`GENERATION_FAILED: ${checkData.message}`);
    }
    throw new Error("TIMEOUT_ERROR");
}
