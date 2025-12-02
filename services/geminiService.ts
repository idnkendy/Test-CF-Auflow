
import { AspectRatio, FileData, ImageResolution } from "../types";
import { supabase } from "./supabaseClient";

// --- API CONFIGURATION ---
const API_VERSION = 'v1beta';
const BASE_URL = 'https://generativelanguage.googleapis.com';

// --- SECURITY CONFIGURATION ---
// KHÓA BÍ MẬT: Phải khớp hoàn toàn với biến v_secret trong hàm SQL trên Supabase
const ENCRYPTION_SECRET = 'OPZEN_SUPER_SECRET_2025'; 

// --- KEY MANAGEMENT ---
let cachedKey: string | null = null;

/**
 * Lớp giải mã (Translation Layer)
 * Giải mã chuỗi Base64 + XOR nhận được từ Server thành API Key thật.
 */
const decryptKey = (encryptedBase64: string): string => {
    try {
        if (!encryptedBase64) return '';
        
        // 1. Decode Base64 (Server trả về Base64)
        const encryptedString = atob(encryptedBase64);
        
        // 2. XOR Decrypt (Đảo ngược quá trình của SQL)
        let decrypted = '';
        const secretLen = ENCRYPTION_SECRET.length;

        for (let i = 0; i < encryptedString.length; i++) {
            const charCode = encryptedString.charCodeAt(i) ^ ENCRYPTION_SECRET.charCodeAt(i % secretLen);
            decrypted += String.fromCharCode(charCode);
        }

        // Kiểm tra sơ bộ: API Key Google thường bắt đầu bằng "AIza"
        if (!decrypted.startsWith("AIza")) {
            console.warn("Key giải mã có vẻ không đúng định dạng (Không bắt đầu bằng AIza). Đang dùng chuỗi gốc...");
            // Fallback: Có thể Server chưa cập nhật SQL mới, trả về nguyên gốc nếu nó giống key thật
            if (encryptedBase64.startsWith("AIza")) return encryptedBase64;
        }

        return decrypted;
    } catch (e) {
        console.error("Lỗi giải mã API Key:", e);
        // Fallback an toàn: Trả về chuỗi gốc nếu giải mã lỗi
        return encryptedBase64;
    }
};

const getApiKey = async (forceRefresh = false): Promise<string> => {
    // Nếu đã có cache và không yêu cầu refresh, dùng lại key cũ để tiết kiệm request DB
    if (cachedKey && !forceRefresh) return cachedKey;

    try {
        // Gọi RPC function từ Supabase
        const { data, error } = await supabase.rpc('get_random_api_key');
        
        if (error) {
            console.error("Lỗi lấy API Key từ Supabase:", error);
            // @ts-ignore
            const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
            if (envKey) return envKey;
            throw new Error("Không thể lấy khóa bảo mật hệ thống.");
        }

        if (!data) {
             // @ts-ignore
             const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
             if (envKey) return envKey;
             throw new Error("Hệ thống hết Key khả dụng.");
        }

        // GIẢI MÃ KEY TRƯỚC KHI DÙNG
        const realKey = decryptKey(data);
        cachedKey = realKey;
        return realKey;

    } catch (e) {
        // Fallback cuối cùng nếu mọi thứ lỗi
        // @ts-ignore
        const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
        if (envKey) return envKey;
        throw e;
    }
};

// --- ERROR HANDLING HELPER ---
const handleGeminiError = (error: any) => {
    let message = error.message || "Lỗi kết nối";
    const lowerMsg = message.toLowerCase();
    
    if (message.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('resource_exhausted')) {
        return new Error("Hệ thống đang quá tải (Quota Exceeded). Đang chuyển sang Key dự phòng...");
    }
    if (message.includes('503') || lowerMsg.includes('overloaded') || lowerMsg.includes('unavailable')) {
        return new Error("Server AI đang quá tải. Vui lòng thử lại.");
    }
    if (message.includes('SAFETY')) {
        return new Error("Nội dung bị chặn bởi bộ lọc an toàn của Google.");
    }
    if (message.includes('User location is not supported') || lowerMsg.includes('location')) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
        }
        return new Error("Khu vực hiện tại bị chặn IP. Vui lòng bật VPN.");
    }
    
    return new Error(message);
};

// --- CORE DIRECT CALL FUNCTION ---
async function callGeminiDirect(model: string, payload: any, method: string = 'generateContent', retryCount = 0) {
    try {
        // Nếu đang retry, force refresh để lấy key mới (Load Balancing)
        const apiKey = await getApiKey(retryCount > 0);
        const url = `${BASE_URL}/${API_VERSION}/models/${model}:${method}?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            
            // Xử lý lỗi Key (400) hoặc Quota (429) hoặc Forbidden (403)
            const isKeyError = response.status === 400 && errorText.includes('API_KEY');
            const isForbidden = response.status === 403;
            const isQuota = response.status === 429;

            // Nếu lỗi Key hoặc Quota, thử lại với Key khác (tối đa 2 lần)
            if ((isKeyError || isForbidden || isQuota) && retryCount < 2) {
                console.warn(`API Error (${response.status}). Rotating key and retrying...`);
                cachedKey = null; // Xóa cache key lỗi
                return callGeminiDirect(model, payload, method, retryCount + 1);
            }

            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                if (response.status === 403) {
                     throw new Error("User location is not supported");
                }
                throw new Error(`Google API Error (${response.status}): ${errorText.substring(0, 100)}`);
            }
            throw new Error(errorData.error?.message || "Unknown Gemini API Error");
        }

        return await response.json();
    } catch (e: any) {
        // Nếu lỗi mạng hoặc quota ở tầng fetch, cũng thử retry
        if (e.message && (e.message.includes('Quota') || e.message.includes('Exceeded')) && retryCount < 2) {
             console.warn("Quota exceeded exception. Retrying...");
             cachedKey = null;
             return callGeminiDirect(model, payload, method, retryCount + 1);
        }
        throw handleGeminiError(e);
    }
}

// --- DATA PREPARATION HELPERS ---

const buildContents = (prompt: string, images?: FileData[]) => {
    const parts: any[] = [];
    
    if (images && images.length > 0) {
        images.forEach(img => {
            const cleanBase64 = img.base64.includes(',') ? img.base64.split(',')[1] : img.base64;
            parts.push({
                inlineData: {
                    mimeType: img.mimeType,
                    data: cleanBase64
                }
            });
        });
    }
    
    parts.push({ text: prompt });
    return { contents: [{ parts }] };
};

// --- GENERATION FUNCTIONS ---

export const generateStandardImage = async (
    prompt: string, 
    aspectRatio: AspectRatio, 
    numberOfImages: number = 1, 
    sourceImage?: FileData,
    jobId?: string
): Promise<string[]> => {
    console.log("[GeminiDirect] Generating Standard Image");
    
    const imagesToUpload = sourceImage ? [sourceImage] : [];
    const payload = {
        ...buildContents(prompt, imagesToUpload),
        generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: aspectRatio },
            candidateCount: numberOfImages
        }
    };

    try {
        const response = await callGeminiDirect('gemini-2.5-flash-image', payload);
        
        const imageUrls: string[] = [];
        if (response.candidates) {
            for (const candidate of response.candidates) {
                if (candidate.content?.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData) {
                            imageUrls.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                        }
                    }
                }
            }
        }

        if (imageUrls.length === 0) throw new Error("No image data returned from API");
        return imageUrls;

    } catch (e) {
        throw handleGeminiError(e);
    }
};

export const generateImage = async (prompt: string, aspectRatio: AspectRatio, numberOfImages: number = 1, jobId?: string): Promise<string[]> => {
    return generateStandardImage(prompt, aspectRatio, numberOfImages, undefined, jobId);
};

export const generateHighQualityImage = async (
    prompt: string, 
    aspectRatio: AspectRatio, 
    resolution: ImageResolution,
    sourceImage?: FileData,
    jobId?: string,
    referenceImages?: FileData[]
): Promise<string[]> => {
    
    console.log("[GeminiDirect] Generating High Quality Image");

    const imagesToUpload: FileData[] = [];
    if (sourceImage) imagesToUpload.push(sourceImage);
    if (referenceImages) imagesToUpload.push(...referenceImages);

    const textPart = sourceImage || (referenceImages && referenceImages.length > 0) 
        ? `${prompt}. Maintain composition/style from provided images.` 
        : prompt;

    const imageSize = (resolution === 'Standard' ? '1K' : resolution) as "1K" | "2K" | "4K";

    const payload = {
        ...buildContents(textPart, imagesToUpload),
        generationConfig: {
            imageConfig: {
                aspectRatio: aspectRatio,
                imageSize: imageSize
            }
        }
    };

    try {
        const response = await callGeminiDirect('gemini-3-pro-image-preview', payload);
        
        const imageUrls: string[] = [];
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    imageUrls.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                }
            }
        }

        if (imageUrls.length === 0) throw new Error("Gemini 3.0 Pro không trả về hình ảnh.");
        return imageUrls;

    } catch (e) {
        throw handleGeminiError(e);
    }
};

export const generateVideo = async (prompt: string, startImage?: FileData, jobId?: string): Promise<string> => {
    throw new Error("Vui lòng sử dụng chế độ Veo 3 (External) để tạo video.");
};

export const editImage = async (prompt: string, image: FileData, numberOfImages: number = 1, jobId?: string) => {
    return generateStandardImage(prompt, '1:1', numberOfImages, image, jobId).then(urls => urls.map(url => ({ imageUrl: url, text: '' })));
};

export const editImageWithMask = async (prompt: string, image: FileData, mask: FileData, numberOfImages: number = 1, jobId?: string) => {
    return generateStandardImage(prompt, '1:1', numberOfImages, undefined, jobId).then(urls => urls.map(url => ({ imageUrl: url, text: '' })));
};

export const editImageWithReference = async (prompt: string, source: FileData, ref: FileData, numberOfImages: number = 1, jobId?: string) => {
    const payload = {
        ...buildContents(prompt, [source, ref]),
        generationConfig: {
            responseModalities: ["IMAGE"],
            candidateCount: numberOfImages
        }
    };
    const response = await callGeminiDirect('gemini-2.5-flash-image', payload);
    const urls = extractImagesFromResponse(response);
    return urls.map(url => ({ imageUrl: url, text: '' }));
};

export const editImageWithMaskAndReference = async (prompt: string, source: FileData, mask: FileData, ref: FileData, numberOfImages: number = 1, jobId?: string) => {
    const payload = {
        ...buildContents(prompt, [source, mask, ref]),
        generationConfig: { responseModalities: ["IMAGE"], candidateCount: numberOfImages }
    };
    const response = await callGeminiDirect('gemini-2.5-flash-image', payload);
    const urls = extractImagesFromResponse(response);
    return urls.map(url => ({ imageUrl: url, text: '' }));
};

export const editImageWithMultipleReferences = async (prompt: string, source: FileData, refs: FileData[], numberOfImages: number = 1, jobId?: string) => {
    const payload = {
        ...buildContents(prompt, [source, ...refs]),
        generationConfig: { responseModalities: ["IMAGE"], candidateCount: numberOfImages }
    };
    const response = await callGeminiDirect('gemini-2.5-flash-image', payload);
    const urls = extractImagesFromResponse(response);
    return urls.map(url => ({ imageUrl: url, text: '' }));
};

export const editImageWithMaskAndMultipleReferences = async (prompt: string, source: FileData, mask: FileData, refs: FileData[], numberOfImages: number = 1, jobId?: string) => {
    const payload = {
        ...buildContents(prompt, [source, mask, ...refs]),
        generationConfig: { responseModalities: ["IMAGE"], candidateCount: numberOfImages }
    };
    const response = await callGeminiDirect('gemini-2.5-flash-image', payload);
    const urls = extractImagesFromResponse(response);
    return urls.map(url => ({ imageUrl: url, text: '' }));
};

export const generateStagingImage = async (prompt: string, scene: FileData, objects: FileData[], numberOfImages: number = 1, jobId?: string) => {
    const payload = {
        ...buildContents(prompt, [scene, ...objects]),
        generationConfig: { responseModalities: ["IMAGE"], candidateCount: numberOfImages }
    };
    const response = await callGeminiDirect('gemini-2.5-flash-image', payload);
    const urls = extractImagesFromResponse(response);
    return urls.map(url => ({ imageUrl: url, text: '' }));
};

export const generateText = async (prompt: string): Promise<string> => {
    const payload = {
        ...buildContents(prompt),
        generationConfig: { responseModalities: ["TEXT"] }
    };
    try {
        const response = await callGeminiDirect('gemini-2.5-flash', payload);
        return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
        console.error("Text Gen Error:", e);
        return "";
    }
};

export const generatePromptFromImageAndText = async (image: FileData, prompt: string): Promise<string> => {
    const payload = {
        ...buildContents(prompt, [image]),
        generationConfig: { responseModalities: ["TEXT"] }
    };
    const response = await callGeminiDirect('gemini-2.5-flash', payload);
    return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

export const enhancePrompt = async (prompt: string, image?: FileData): Promise<string> => {
    const fullPrompt = `Enhance this prompt for architecture: ${prompt}`;
    const payload = {
        ...buildContents(fullPrompt, image ? [image] : []),
        generationConfig: { responseModalities: ["TEXT"] }
    };
    const response = await callGeminiDirect('gemini-2.5-flash', payload);
    return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

export const generateMoodboardPromptFromScene = async (image: FileData): Promise<string> => {
    return generatePromptFromImageAndText(image, "Create a detailed moodboard prompt describing style, colors, and materials.");
};

export const generatePromptSuggestions = async (image: FileData, subject: string, count: number, instruction: string): Promise<Record<string, string[]>> => {
    const prompt = `Analyze this image. Provide ${count} prompts based on "${subject}". ${instruction}. Output strictly JSON.`;
    const payload = {
        ...buildContents(prompt, [image]),
        generationConfig: { responseMimeType: "application/json" }
    };
    try {
        const response = await callGeminiDirect('gemini-2.5-flash', payload);
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        return JSON.parse(text);
    } catch {
        return {};
    }
};

function extractImagesFromResponse(response: any): string[] {
    const imageUrls: string[] = [];
    if (response.candidates) {
        for (const candidate of response.candidates) {
            if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData) {
                        imageUrls.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                    }
                }
            }
        }
    }
    return imageUrls;
}
