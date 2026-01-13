
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
                // 1. Sử dụng naturalWidth/Height để lấy độ phân giải thực tế của ảnh gốc (Ví dụ 4K: 3840x2160)
                const naturalWidth = img.naturalWidth;
                const naturalHeight = img.naturalHeight;

                if (naturalWidth === 0 || naturalHeight === 0) {
                    if (isLocalBlob) URL.revokeObjectURL(sourceUrl);
                    resolve(imageUrl);
                    return;
                }

                let cropWidth = naturalWidth;
                let cropHeight = naturalHeight;

                // 2. Tính toán vùng cắt (giữ nguyên chiều lớn nhất có thể)
                if (targetRatio === '4:3') {
                    // Cắt 4:3 từ ảnh gốc (thường là 1:1 hoặc 16:9)
                    // Logic: Lấy chiều rộng tối đa, tính chiều cao tương ứng.
                    // Nếu cropHeight vượt quá ảnh gốc, thì tính lại theo chiều cao.
                    // Với ảnh gốc 1:1 (vuông), 4:3 là hình chữ nhật ngang -> Chiều rộng = 100%, Chiều cao = Rộng / 1.33
                    cropWidth = naturalWidth;
                    cropHeight = Math.round(cropWidth * (3/4));

                    if (cropHeight > naturalHeight) {
                        cropHeight = naturalHeight;
                        cropWidth = Math.round(cropHeight * (4/3));
                    }
                } else if (targetRatio === '3:4') {
                    // Cắt 3:4 từ ảnh gốc (thường là 1:1 hoặc 9:16)
                    // Với ảnh gốc 1:1 (vuông), 3:4 là hình chữ nhật đứng -> Chiều cao = 100%, Chiều rộng = Cao * 0.75
                    cropHeight = naturalHeight;
                    cropWidth = Math.round(cropHeight * 0.75);

                    if (cropWidth > naturalWidth) {
                        cropWidth = naturalWidth;
                        cropHeight = Math.round(cropWidth / 0.75);
                    }
                }

                // 3. Đặt kích thước Canvas đúng bằng kích thước vùng cắt (Không scale lại)
                canvas.width = cropWidth;
                canvas.height = cropHeight;

                // 4. Tính tọa độ để lấy phần trung tâm ảnh (Center Crop)
                // Dùng floor để tránh sub-pixel rendering gây mờ
                const sx = Math.floor((naturalWidth - cropWidth) / 2);
                const sy = Math.floor((naturalHeight - cropHeight) / 2);

                // 5. Cấu hình vẽ chất lượng cao
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // 6. Vẽ: Lấy vùng [sx, sy, cropWidth, cropHeight] từ ảnh gốc, vẽ vào toàn bộ canvas [0, 0, cropWidth, cropHeight]
                ctx.drawImage(img, sx, sy, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                
                // 7. Xuất ra PNG để tránh nén ảnh lần 2 (Generation Loss)
                canvas.toBlob((blob) => {
                    if (isLocalBlob) URL.revokeObjectURL(sourceUrl); // Dọn dẹp bộ nhớ
                    
                    if (blob) {
                        resolve(URL.createObjectURL(blob));
                    } else {
                        resolve(imageUrl); // Fallback nếu lỗi
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

            // Cập nhật logic: 16:9 và 9:16 dùng kích thước chuẩn
            if (effectiveRatio === '16:9') {
                targetWidth = isStandard ? 1280 : 2048;
                targetHeight = isStandard ? 720 : 1152;
            } else if (effectiveRatio === '9:16') { 
                targetWidth = isStandard ? 720 : 1152;
                targetHeight = isStandard ? 1280 : 2048;
            } 
            // Các tỷ lệ 1:1, 4:3, 3:4 sẽ dùng container Vuông (Square)
            // Điều này giúp tận dụng tối đa độ phân giải của model Square (đặc biệt là Pro 2048x2048)
            else {
                // 1:1, 4:3, 3:4
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
            // Tô màu đen cho viền (nếu dùng contain)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, targetWidth, targetHeight);

            // Scale logic
            let scale;
            if (fitMode === 'contain') {
                // Contain: Giữ nguyên toàn bộ ảnh trong khung
                scale = Math.min(targetWidth / img.width, targetHeight / img.height);
            } else {
                // Cover: Lấp đầy khung
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
         // Special handling for 503 inside result.error which isn't 'failed' status but success=true
         // This block handles cases where status is explicitly failed.
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
    const url = `${baseUrl}/proxy-download?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    return await res.blob();
}

const downloadViaCanvas = (url: string, filename: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous"; // Try anonymous first
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
                reject(e); // Tainted canvas
            }
        };
        img.onerror = (e) => reject(e);
        img.src = url;
    });
};

export const forceDownload = async (url: string, filename: string) => {
    if (!url) return;

    try {
        // --- STRATEGY 1: Local Blobs (Fastest) ---
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

        // --- STRATEGY 2: Proxy Download (Most Reliable for Remote) ---
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

        // --- STRATEGY 3: Canvas Download (Fallback for Images) ---
        if (filename.match(/\.(png|jpg|jpeg|webp)$/i) || !filename.includes('.')) {
             try {
                 await downloadViaCanvas(url, filename);
                 return;
             } catch (canvasError) {
                 console.warn("Canvas download failed...", canvasError);
             }
        }

        // --- STRATEGY 4: Direct Fetch (Last attempt before new tab) ---
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

        // --- STRATEGY 5: Open in New Tab (Last Resort) ---
        console.warn("All download methods failed, opening in new tab.");
        window.open(url, '_blank');

    } catch (e) {
        console.error("Critical download error:", e);
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

    // Determine backend enum based on requested ratio
    let ratioEnum = "IMAGE_ASPECT_RATIO_LANDSCAPE";
    let ratioType: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' = '16:9';

    if (aspectRatio === "9:16" || aspectRatio === "IMAGE_ASPECT_RATIO_PORTRAIT") {
        ratioType = "9:16";
        ratioEnum = "IMAGE_ASPECT_RATIO_PORTRAIT";
    } else if (aspectRatio === "16:9" || aspectRatio === "IMAGE_ASPECT_RATIO_LANDSCAPE") {
        ratioType = "16:9";
        ratioEnum = "IMAGE_ASPECT_RATIO_LANDSCAPE";
    } else {
        // 1:1, 4:3, 3:4 -> Map tất cả vào Square để tối ưu độ phân giải
        ratioType = (aspectRatio === "4:3") ? "4:3" : (aspectRatio === "3:4" ? "3:4" : "1:1");
        ratioEnum = "IMAGE_ASPECT_RATIO_SQUARE";
    }

    const tier = (imageModelName === 'GEM_PIX') ? 'standard' : 'pro';

    for (const img of imagesToProcess) {
        // Changed to 'contain' to ensure full image visibility with padding if needed (e.g., 4:3 input in 16:9)
        const imageData = await resizeAndCropImage(img, ratioType, tier, 'contain');
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
            imageAspectRatio: ratioEnum, // Send standard enum to API
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
            
            // --- HANDLE 503 SERVICE UNAVAILABLE IN RESULT ---
            if (statusRes.result?.error) {
                const err = statusRes.result.error;
                if (err.code === 503 || err.status === 'UNAVAILABLE') {
                    console.warn(`[FlowGen] Service Unavailable (503). Retrying polling...`);
                    await wait(2000); // Wait a bit more before retrying
                    continue; // Treat as transient, continue polling
                }
                // Only throw if it's not a 503/Unavailable
                throw new Error(`Lỗi xử lý từ máy chủ AI: ${err.message || "Unknown error"}`);
            }
            // ------------------------------------------------

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

            // POST-PROCESS: Crop result if requested ratio was 4:3 or 3:4
            if (urls.length > 0 && (ratioType === '4:3' || ratioType === '3:4')) {
                if (onProgress) onProgress("Đang xử lý kích thước ảnh...");
                const croppedUrls: string[] = [];
                for (const url of urls) {
                    const cropped = await cropImageToRatio(url, ratioType);
                    croppedUrls.push(cropped);
                }
                if (croppedUrls.length > 0) return { imageUrls: [...new Set(croppedUrls)], mediaIds, projectId };
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

export const upscaleFlowImage = async (
    mediaId: string, 
    projectId: string | undefined, 
    targetResolution: string = 'UPSAMPLE_IMAGE_RESOLUTION_2K',
    aspectRatio?: string // Add aspect ratio parameter
): Promise<{ imageUrl: string }> => {
    const MAX_RETRIES = 3; // Try up to 3 times (1 initial + 2 retries)
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`[Upscale] Attempt ${attempt}/${MAX_RETRIES} starting...`);
                await wait(2000); // Wait 2s before retry
            }

            const createRes = await fetchJson('/flow-upscale', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'flow_upscale', mediaId, projectId, targetResolution })
            });
            
            // --- HANDLE 503 SERVICE UNAVAILABLE IN CREATE RESULT ---
            if (createRes.result?.error) {
                const err = createRes.result.error;
                if (err.code === 503 || err.status === 'UNAVAILABLE') {
                    throw new Error("Service Unavailable (503)"); // Throw to trigger outer loop retry
                }
                throw new Error(`Upscale creation failed: ${err.message}`);
            }
            // -------------------------------------------------------

            const taskId = createRes.taskId;
            if (!taskId) throw new Error("No Task ID returned for Upscale.");

            const MAX_POLLING_RETRIES = 60;
            
            // --- GRACE PERIOD CONFIGURATION FOR UPSCALE ---
            const startTime = Date.now();
            const GRACE_PERIOD = 120000; // 2 minutes

            for (let i = 0; i < MAX_POLLING_RETRIES; i++) {
                await wait(6000);
                
                try {
                    const statusRes = await fetchJson('/flow-check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'flow_check', taskId })
                    });

                    // --- HANDLE 503 SERVICE UNAVAILABLE IN POLLING RESULT ---
                    if (statusRes.result?.error) {
                        const err = statusRes.result.error;
                        if (err.code === 503 || err.status === 'UNAVAILABLE') {
                            console.warn(`[Upscale Check] 503 Service Unavailable. Retrying polling...`);
                            await wait(2000);
                            continue; // Continue polling
                        }
                        throw new Error(`Upscale processing error: ${err.message}`);
                    }
                    // --------------------------------------------------------

                    if (statusRes.code === 'processing') continue;
                    
                    if (statusRes.status === 'FAILED') {
                        throw new Error("Upscale Task Failed from Server");
                    }

                    if (statusRes.result?.encodedImage) {
                        let finalUrl = await base64ToBlobUrl(statusRes.result.encodedImage, 'image/jpeg');
                        
                        // Apply crop if needed for upscaled image (since upscale returns 16:9/9:16)
                        if (aspectRatio === '4:3' || aspectRatio === '3:4') {
                            console.log(`[Upscale] Final High-Res Crop to ${aspectRatio}`);
                            // Force wait for crop
                            const croppedUrl = await cropImageToRatio(finalUrl, aspectRatio);
                            if(croppedUrl) finalUrl = croppedUrl;
                        }
                        
                        return { imageUrl: finalUrl };
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
            throw new Error("Upscale Polling Timeout.");

        } catch (e: any) {
            console.warn(`[Upscale] Attempt ${attempt} failed:`, e.message);
            lastError = e;
            // Loop continues if attempt < MAX_RETRIES
        }
    }

    // If all attempts fail
    throw lastError || new Error("Upscale thất bại sau nhiều lần thử.");
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
