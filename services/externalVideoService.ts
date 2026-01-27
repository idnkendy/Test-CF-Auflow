
import { FileData } from "../types";
import { BACKEND_URL } from "./config";

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

const getImageDimensions = (fileData: FileData): Promise<{width: number, height: number}> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = fileData.objectURL || `data:${fileData.mimeType};base64,${fileData.base64}`;
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 2048, height: 1152 });
    });
};

// --- QUAN TRỌNG: Hàm cắt ảnh PIXEL-PERFECT (Fix lỗi mờ ảnh & Xử lý 4K) ---
const cropImageToRatio = async (imageUrl: string, targetRatio: '4:3' | '3:4' | string): Promise<string> => {
    // Chỉ xử lý 4:3 và 3:4 theo yêu cầu
    if (targetRatio !== '4:3' && targetRatio !== '3:4') return imageUrl;

    return new Promise(async (resolve, reject) => {
        let sourceUrl = imageUrl;
        let isLocalBlob = false;
        let isRemote = false;

        if (imageUrl.startsWith('http')) {
            try {
                const blob = await proxyDownload(imageUrl);
                sourceUrl = URL.createObjectURL(blob);
                isLocalBlob = true;
                isRemote = true; // Was downloaded via proxy, so strictly local blob now, but originated remote
            } catch (e) {
                console.warn("Proxy download for crop failed, trying direct...", e);
                // Fallback: Thử dùng trực tiếp
                isRemote = true; // Direct remote
            }
        }

        const img = new Image();
        // Chỉ thêm crossOrigin nếu là ảnh remote, blob local không cần và có thể gây lỗi
        if (isRemote && !isLocalBlob) img.crossOrigin = "Anonymous"; 
        
        img.src = sourceUrl;

        img.onload = () => {
            // Đợi thêm 1 tick để đảm bảo dimensions sẵn sàng trên mọi trình duyệt
            requestAnimationFrame(() => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    if (isLocalBlob) URL.revokeObjectURL(sourceUrl);
                    resolve(imageUrl); 
                    return;
                }

                // --- THUẬT TOÁN CROP CHẤT LƯỢNG CAO ---
                const naturalWidth = img.naturalWidth;
                const naturalHeight = img.naturalHeight;

                if (naturalWidth === 0 || naturalHeight === 0) {
                    if (isLocalBlob) URL.revokeObjectURL(sourceUrl);
                    resolve(imageUrl);
                    return;
                }

                let cropWidth = naturalWidth;
                let cropHeight = naturalHeight;

                if (targetRatio === '4:3') {
                    cropWidth = naturalWidth;
                    cropHeight = Math.round(cropWidth * (3/4));

                    if (cropHeight > naturalHeight) {
                        cropHeight = naturalHeight;
                        cropWidth = Math.round(cropHeight * (4/3));
                    }
                } else if (targetRatio === '3:4') {
                    cropHeight = naturalHeight;
                    cropWidth = Math.round(cropHeight * 0.75);

                    if (cropWidth > naturalWidth) {
                        cropWidth = naturalWidth;
                        cropHeight = Math.round(cropWidth / 0.75);
                    }
                }

                canvas.width = cropWidth;
                canvas.height = cropHeight;

                const sx = Math.floor((naturalWidth - cropWidth) / 2);
                const sy = Math.floor((naturalHeight - cropHeight) / 2);

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                ctx.drawImage(img, sx, sy, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                
                canvas.toBlob((blob) => {
                    if (isLocalBlob) URL.revokeObjectURL(sourceUrl); 
                    
                    if (blob) {
                        resolve(URL.createObjectURL(blob));
                    } else {
                        resolve(imageUrl); 
                    }
                }, 'image/png'); 
            });
        };

        img.onerror = (err) => {
            console.error("Crop image load failed:", err);
            if (isLocalBlob) URL.revokeObjectURL(sourceUrl);
            resolve(imageUrl);
        };
    });
};

export const resizeAndCropImage = async (
    fileData: FileData, 
    aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | 'default' = '16:9',
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
            } else {
                targetWidth = isStandard ? 1024 : 2048;
                targetHeight = isStandard ? 1024 : 2048;
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

            let scale;
            if (fitMode === 'contain') {
                scale = Math.min(targetWidth / img.width, targetHeight / img.height);
            } else {
                scale = Math.max(targetWidth / img.width, targetHeight / img.height);
            }
            
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
    if (msg.includes("Upload Failed")) return msg; 
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
    
    if (data.status === 'failed' || data.code === 'failed' || data.success === false) {
         const msg = (data.message || "").toLowerCase();
         if (data.code === 'processing' || data.code === 'queue' || msg.includes('queue') || msg.includes('waiting')) {
             return { ...data, code: 'processing', message: data.message || "Đang xếp hàng chờ máy chủ..." };
         }
         throw new Error(formatErrorMessage(data.message || "Unknown error"));
    }
    return data;
};

export const proxyDownload = async (targetUrl: string): Promise<Blob> => {
    const baseUrl = BACKEND_URL.replace(/\/$/, "");
    const url = `${baseUrl}/proxy-download?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    return await res.blob();
}

const downloadViaCanvas = (url: string, filename: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Canvas context error')); return; }
            try {
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const blobUrl = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                        resolve();
                    } else {
                        reject(new Error('Canvas blob error'));
                    }
                });
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = (e) => reject(e);
        img.src = url;
    });
};

export const forceDownload = async (url: string, filename: string) => {
    if (!url) return;

    try {
        if (url.startsWith('blob:') || url.startsWith('data:')) {
             const res = await fetch(url);
             const blob = await res.blob();
             const blobUrl = URL.createObjectURL(blob);
             const link = document.createElement('a');
             link.href = blobUrl;
             link.download = filename;
             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);
             setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
             return;
        }

        try {
            const blob = await proxyDownload(url);
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            return;
        } catch (proxyError) {
            console.warn("Proxy download failed, trying Canvas fallback...", proxyError);
        }

        if (filename.match(/\.(png|jpg|jpeg|webp)$/i) || !filename.includes('.')) {
             try {
                 await downloadViaCanvas(url, filename);
                 return;
             } catch (canvasError) {
                 console.warn("Canvas download failed...", canvasError);
             }
        }

        try {
             const res = await fetch(url, { mode: 'cors' });
             if (!res.ok) throw new Error("Direct fetch failed");
             const blob = await res.blob();
             const blobUrl = URL.createObjectURL(blob);
             const link = document.createElement('a');
             link.href = blobUrl;
             link.download = filename;
             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);
             setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
             return;
        } catch(e) {}

        console.warn("All download methods failed, opening in new tab.");
        window.open(url, '_blank');

    } catch (e) {
        console.error("Critical download error:", e);
        window.open(url, '_blank');
    }
};

// --- UPDATED: GENERATE VIDEO EXTERNAL (2-STEP POLLING) ---
export const generateVideoExternal = async (
    prompt: string,
    startImage?: FileData,
    aspectRatio: '16:9' | '9:16' | 'default' = '16:9',
    endImage?: FileData
): Promise<{ videoUrl: string; mediaId: string; accountId: string }> => {
    // 1. Prepare Images
    let processedStartImage = "";
    let processedEndImage = "";

    if (startImage) {
        processedStartImage = await resizeAndCropImage(startImage, aspectRatio, 'pro', 'contain');
    }
    if (endImage) {
        processedEndImage = await resizeAndCropImage(endImage, aspectRatio, 'pro', 'contain');
    }

    const videoAspectRatio = (aspectRatio === 'default' || aspectRatio === '16:9') 
        ? "VIDEO_ASPECT_RATIO_LANDSCAPE" 
        : "VIDEO_ASPECT_RATIO_PORTRAIT";

    // 2. Call Create Endpoint
    const createRes = await fetchJson('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create',
            prompt,
            image: processedStartImage || null,
            endImage: processedEndImage || null,
            videoAspectRatio: videoAspectRatio,
            mediaId: null
        })
    });

    if (!createRes.task_id) throw new Error("Không nhận được Task ID từ máy chủ.");
    
    const taskId = createRes.task_id;
    const accountId = createRes.account_id;

    // 3. PHASE 1: POLL FOR NAME (check_name)
    // Wait until the proxy returns a valid Google Operation Name
    let googleOperationName = '';
    const MAX_NAME_RETRIES = 60; // 5 minutes waiting for queue
    let nameAttempts = 0;

    while (!googleOperationName && nameAttempts < MAX_NAME_RETRIES) {
        await wait(5000); // 5s interval
        nameAttempts++;

        try {
            const nameRes = await fetchJson('/check-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'check_name', task_id: taskId })
            });

            if (nameRes.status === 'success' && nameRes.name) {
                googleOperationName = nameRes.name;
            } else if (nameRes.status === 'failed') {
                throw new Error(nameRes.message || "Lỗi xếp hàng (Queue Failed).");
            }
            // if 'pending', continue loop
        } catch (e: any) {
            console.warn(`[CheckName] Attempt ${nameAttempts} error:`, e.message);
            // Ignore temporary network errors, verify max attempts
        }
    }

    if (!googleOperationName) {
        throw new Error("Hết thời gian chờ xếp hàng (Queue Timeout).");
    }

    // 4. PHASE 2: POLL FOR STATUS (check_status)
    // Now poll Google directly using the name
    const MAX_STATUS_RETRIES = 120; // 10 minutes max for generation
    let statusAttempts = 0;

    while (statusAttempts < MAX_STATUS_RETRIES) {
        await wait(5000);
        statusAttempts++;

        try {
            const statusRes = await fetchJson('/check-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'check_status', 
                    name: googleOperationName, 
                    account_id: accountId 
                })
            });

            if (statusRes.status === 'completed') {
                return {
                    videoUrl: statusRes.video_url,
                    mediaId: statusRes.mediaId,
                    accountId: accountId
                };
            } else if (statusRes.status === 'failed') {
                throw new Error(statusRes.message || "AI từ chối tạo video.");
            }
            // if 'processing', continue loop
        } catch (e: any) {
            console.warn(`[CheckStatus] Attempt ${statusAttempts} error:`, e.message);
            if (statusAttempts > 5 && e.message.includes('Permission')) {
                 throw new Error("Lỗi quyền truy cập tài khoản Google.");
            }
        }
    }

    throw new Error("Hết thời gian xử lý video (Generation Timeout).");
};

export const generateVideoWithReferences = async (prompt: string, sceneImage: FileData, characterImage: FileData, aspectRatio: any = '16:9') => {
    // 1. Prepare Images
    const processedScene = await resizeAndCropImage(sceneImage, aspectRatio, 'pro', 'contain');
    const processedChar = await resizeAndCropImage(characterImage, aspectRatio, 'pro', 'contain'); // Crop to match aspect or default?

    const videoAspectRatio = (aspectRatio === 'default' || aspectRatio === '16:9') 
        ? "VIDEO_ASPECT_RATIO_LANDSCAPE" 
        : "VIDEO_ASPECT_RATIO_PORTRAIT";

    // 2. Call Create Endpoint
    const createRes = await fetchJson('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create',
            prompt,
            videoAspectRatio: videoAspectRatio,
            referenceImages: [
                { data: processedScene, aspectRatio: videoAspectRatio === "VIDEO_ASPECT_RATIO_LANDSCAPE" ? "IMAGE_ASPECT_RATIO_LANDSCAPE" : "IMAGE_ASPECT_RATIO_PORTRAIT" },
                { data: processedChar, aspectRatio: "IMAGE_ASPECT_RATIO_SQUARE" } // Character usually square or portrait, but passing square safe
            ]
        })
    });

    if (!createRes.task_id) throw new Error("Không nhận được Task ID từ máy chủ.");
    
    const taskId = createRes.task_id;
    const accountId = createRes.account_id;

    // 3. PHASE 1: CHECK NAME
    let googleOperationName = '';
    const MAX_NAME_RETRIES = 60;
    let nameAttempts = 0;

    while (!googleOperationName && nameAttempts < MAX_NAME_RETRIES) {
        await wait(5000);
        nameAttempts++;
        try {
            const nameRes = await fetchJson('/check-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'check_name', task_id: taskId })
            });

            if (nameRes.status === 'success' && nameRes.name) {
                googleOperationName = nameRes.name;
            } else if (nameRes.status === 'failed') {
                throw new Error(nameRes.message || "Lỗi xếp hàng (Queue Failed).");
            }
        } catch (e: any) {
            console.warn(`[CheckName] Attempt ${nameAttempts} error:`, e.message);
        }
    }

    if (!googleOperationName) throw new Error("Hết thời gian chờ xếp hàng.");

    // 4. PHASE 2: CHECK STATUS
    const MAX_STATUS_RETRIES = 120;
    let statusAttempts = 0;

    while (statusAttempts < MAX_STATUS_RETRIES) {
        await wait(5000);
        statusAttempts++;
        try {
            const statusRes = await fetchJson('/check-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'check_status', 
                    name: googleOperationName, 
                    account_id: accountId 
                })
            });

            if (statusRes.status === 'completed') {
                return {
                    videoUrl: statusRes.video_url,
                    mediaId: statusRes.mediaId,
                    accountId: accountId
                };
            } else if (statusRes.status === 'failed') {
                throw new Error(statusRes.message || "AI từ chối tạo video.");
            }
        } catch (e: any) {
            console.warn(`[CheckStatus] Attempt ${statusAttempts} error:`, e.message);
        }
    }

    throw new Error("Hết thời gian xử lý video.");
};

export const generateFlowImage = async (
    prompt: string,
    inputImages: FileData[] | FileData = [], 
    aspectRatio: string = "IMAGE_ASPECT_RATIO_LANDSCAPE",
    numberOfImages: number = 1,
    imageModelName: string = "GEM_PIX_2",
    onProgress?: (message: string) => void 
): Promise<{ imageUrls: string[], mediaIds: string[], projectId?: string, accountId?: string }> => {
    const imagesToProcess = Array.isArray(inputImages) ? inputImages : [inputImages].filter(Boolean);
    const processedImages: string[] = [];
    if (onProgress) onProgress("Đang chuẩn bị dữ liệu ảnh...");

    let ratioEnum = "IMAGE_ASPECT_RATIO_LANDSCAPE";
    let ratioType: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' = '16:9';

    if (aspectRatio === "9:16" || aspectRatio === "IMAGE_ASPECT_RATIO_PORTRAIT") {
        ratioType = "9:16";
        ratioEnum = "IMAGE_ASPECT_RATIO_PORTRAIT";
    } else if (aspectRatio === "16:9" || aspectRatio === "IMAGE_ASPECT_RATIO_LANDSCAPE") {
        ratioType = "16:9";
        ratioEnum = "IMAGE_ASPECT_RATIO_LANDSCAPE";
    } else if (aspectRatio === "4:3") {
        ratioType = "4:3";
        ratioEnum = "IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE";
    } else if (aspectRatio === "3:4") {
        ratioType = "3:4";
        ratioEnum = "IMAGE_ASPECT_RATIO_PORTRAIT_THREE_FOUR";
    } else {
        ratioType = "1:1"; 
        ratioEnum = "IMAGE_ASPECT_RATIO_SQUARE";
    }

    const tier = (imageModelName === 'GEM_PIX') ? 'standard' : 'pro';

    for (const img of imagesToProcess) {
        const imageData = await resizeAndCropImage(img, ratioType, tier, 'contain');
        processedImages.push(imageData);
    }

    const MAX_OPERATION_RETRIES = 3; 
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_OPERATION_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.warn(`[FlowGen] Operation Attempt ${attempt}/${MAX_OPERATION_RETRIES} starting...`);
                if (onProgress) onProgress(`Đang thử lại (Lần ${attempt})...`);
                await wait(2000); 
            }

            const createRes = await fetchJson('/flow-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'flow_media_create',
                    prompt,
                    images: processedImages,
                    image: processedImages[0] || null, 
                    imageAspectRatio: ratioEnum, 
                    numberOfImages,
                    imageModelName
                })
            });

            if (!createRes.taskId) throw new Error("Không nhận được Task ID.");
            const taskId = createRes.taskId;
            const projectId = createRes.projectId;
            const accountId = createRes.accountId;
            
            const POLLING_DELAY = 5000;
            const MAX_RETRIES = 120; // 10 minutes polling limit
            const startTime = Date.now();
            const GRACE_PERIOD = 120000; // 2 minutes

            for (let i = 0; i < MAX_RETRIES; i++) {
                await wait(POLLING_DELAY);
                
                try {
                    const statusRes = await fetchJson('/flow-check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'flow_check', taskId })
                    });
                    
                    if (statusRes.result && statusRes.result.error) {
                        const err = statusRes.result.error;
                        const code = err.code;
                        const status = err.status;

                        if (code === 503 || status === 'UNAVAILABLE') {
                            console.warn(`[FlowGen] Service Unavailable (503). Retrying polling...`);
                            await wait(2000); 
                            continue;
                        }

                        // CRITICAL CHANGE: Safety/Invalid Argument (400) should FAIL IMMEDIATELY
                        if (code === 400 || status === 'INVALID_ARGUMENT') {
                             // Throwing generic Error with a specific prefix so upstream can detect it
                             throw new Error(`UPLOAD FAILED: ${err.message || "Safety Policy Violation or Bad Request"}`); 
                        }

                        if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
                            console.warn(`[FlowGen] Quota Exceeded. Retrying Operation...`);
                            throw new Error("RETRY_OPERATION_TRIGGER");
                        }

                        throw new Error(`Lỗi xử lý từ máy chủ AI: ${err.message || "Unknown error"} (Code: ${code})`);
                    }

                    if (statusRes.code === 'processing') {
                        if (onProgress) onProgress("Đang xử lý. Vui lòng đợi...");
                        continue;
                    }

                    const urls: string[] = [];
                    const mediaIds: string[] = [];

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

                    if (statusRes.result?.encodedImage && urls.length === 0) {
                        urls.push(await base64ToBlobUrl(statusRes.result.encodedImage, 'image/jpeg'));
                        if (statusRes.result.mediaGenerationId) mediaIds.push(statusRes.result.mediaGenerationId);
                    }

                    if (urls.length > 0 && (ratioType === '4:3' || ratioType === '3:4')) {
                        if (onProgress) onProgress("Đang xử lý kích thước ảnh...");
                        const croppedUrls: string[] = [];
                        for (const url of urls) {
                            const cropped = await cropImageToRatio(url, ratioType);
                            croppedUrls.push(cropped);
                        }
                        if (croppedUrls.length > 0) return { imageUrls: [...new Set(croppedUrls)], mediaIds, projectId, accountId };
                    }

                    if (urls.length > 0) return { imageUrls: [...new Set(urls)], mediaIds, projectId, accountId };
                    if (statusRes.status === 'FAILED') throw new Error("AI từ chối tạo ảnh.");

                } catch (error: any) {
                    if (error.message === "RETRY_OPERATION_TRIGGER") throw error;
                    // Pass specific failures up immediately
                    if (error.message && error.message.includes('UPLOAD FAILED')) throw error;
                    if (error.message && error.message.includes('Lỗi xử lý từ máy chủ AI')) throw error;

                    if (Date.now() - startTime < GRACE_PERIOD) {
                        console.warn(`[Grace Period] Lỗi tạm thời: ${error.message}. Đang thử lại...`);
                        if (onProgress) onProgress("Đang kết nối lại...");
                        continue; 
                    }
                    throw error;
                }
            }
            throw new Error("Hết thời gian chờ xử lý (Timeout).");

        } catch (opError: any) {
            if (opError.message === "RETRY_OPERATION_TRIGGER") {
                if (attempt < MAX_OPERATION_RETRIES) {
                    continue; 
                } else {
                    lastError = new Error("Hệ thống quá tải, vui lòng thử lại sau vài phút.");
                }
            } else {
                lastError = opError;
                const msg = (opError.message || "").toLowerCase();
                
                // CRITICAL CHANGE: Do NOT retry on Upload/Safety failure
                if (msg.includes("upload failed")) {
                    throw opError; 
                }

                if (msg.includes("429") || msg.includes("exhausted")) {
                     if (attempt < MAX_OPERATION_RETRIES) continue;
                }
            }
        }
    }

    throw lastError || new Error("Không thể tạo ảnh sau nhiều lần thử.");
};

export const upscaleFlowImage = async (
    mediaId: string, 
    projectId: string | undefined, 
    targetResolution: string = 'UPSAMPLE_IMAGE_RESOLUTION_2K',
    aspectRatio?: string 
): Promise<{ imageUrl: string }> => {
    const MAX_OPERATION_RETRIES = 3; 
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_OPERATION_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`[Upscale] Attempt ${attempt}/${MAX_OPERATION_RETRIES} starting...`);
                await wait(2000); 
            }

            const createRes = await fetchJson('/flow-upscale', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'flow_upscale', mediaId, projectId, targetResolution })
            });
            
            if (createRes.result?.error) {
                const err = createRes.result.error;
                if (err.code === 503 || err.status === 'UNAVAILABLE') {
                    throw new Error("Service Unavailable (503)"); 
                }
                if (err.code === 400 || err.code === 429) {
                     throw new Error("RETRY_OPERATION_TRIGGER");
                }
                throw new Error(`Upscale creation failed: ${err.message}`);
            }

            const taskId = createRes.taskId;
            if (!taskId) throw new Error("No Task ID returned for Upscale.");

            const MAX_POLLING_RETRIES = 60;
            const startTime = Date.now();
            const GRACE_PERIOD = 120000; 

            for (let i = 0; i < MAX_POLLING_RETRIES; i++) {
                await wait(6000);
                
                try {
                    const statusRes = await fetchJson('/flow-check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'flow_check', taskId })
                    });

                    if (statusRes.result && statusRes.result.error) {
                        const err = statusRes.result.error;
                        const code = err.code;
                        const status = err.status;

                        if (code === 503 || status === 'UNAVAILABLE') {
                            console.warn(`[Upscale Check] 503 Service Unavailable. Retrying polling...`);
                            await wait(2000);
                            continue; 
                        }

                        if ((code === 400 || code === 429 || status === 'RESOURCE_EXHAUSTED' || status === 'INVALID_ARGUMENT')) {
                            console.warn(`[Upscale Check] Error ${code} in JSON. Restarting Operation...`);
                            throw new Error("RETRY_OPERATION_TRIGGER");
                        }

                        throw new Error(`Upscale processing error: ${err.message}`);
                    }

                    if (statusRes.code === 'processing') continue;
                    
                    if (statusRes.status === 'FAILED') {
                        throw new Error("Upscale Task Failed from Server");
                    }

                    if (statusRes.result?.encodedImage) {
                        let finalUrl = await base64ToBlobUrl(statusRes.result.encodedImage, 'image/jpeg');
                        
                        if (aspectRatio === '4:3' || aspectRatio === '3:4') {
                            console.log(`[Upscale] Final High-Res Crop to ${aspectRatio}`);
                            const croppedUrl = await cropImageToRatio(finalUrl, aspectRatio);
                            if(croppedUrl) finalUrl = croppedUrl;
                        }
                        
                        return { imageUrl: finalUrl };
                    }
                } catch (error: any) {
                     if (error.message === "RETRY_OPERATION_TRIGGER") throw error;
                     if (error.message && error.message.includes('Upscale processing error')) throw error;

                     if (Date.now() - startTime < GRACE_PERIOD) {
                         console.warn(`[Upscale Grace Period] Lỗi tạm thời: ${error.message}. Đang thử lại...`);
                         continue;
                     }
                     throw error;
                }
            }
            throw new Error("Upscale Polling Timeout.");

        } catch (e: any) {
            const msg = (e.message || "").toLowerCase();
            if (msg === "retry_operation_trigger" || msg.includes("429") || msg.includes("400") || msg.includes("service unavailable")) {
                 if (attempt < MAX_OPERATION_RETRIES) {
                     continue;
                 }
            }
            console.warn(`[Upscale] Attempt ${attempt} failed:`, e.message);
            lastError = e;
        }
    }

    throw lastError || new Error("Upscale thất bại sau nhiều lần thử.");
};
