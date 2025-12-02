
import { AspectRatio, FileData, ImageResolution } from "../types";

// --- API CONFIGURATION ---
// @ts-ignore
const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || ""; 

const getProxyUrl = (endpoint: string = '/api/gemini-proxy') => {
    if (BACKEND_URL) {
        const baseUrl = BACKEND_URL.replace(/\/$/, ""); 
        return `${baseUrl}${endpoint}`;
    }
    return endpoint;
};

// --- ERROR HANDLING HELPER ---
const handleProxyError = (error: any) => {
    let message = error.message || "Lỗi kết nối";
    
    // Check for specific proxy errors returned by Worker
    if (message.includes('429') || message.toLowerCase().includes('quota')) {
        return new Error("Hệ thống đang quá tải (Quota Exceeded). Vui lòng thử lại sau ít phút.");
    }
    if (message.includes('503') || message.toLowerCase().includes('overloaded')) {
        return new Error("Server AI đang quá tải. Vui lòng thử lại.");
    }
    if (message.includes('SAFETY')) {
        return new Error("Nội dung bị chặn bởi bộ lọc an toàn của Google.");
    }
    if (message.includes('GEMINI_API_KEY not configured')) {
        return new Error("Hệ thống chưa được cấu hình API Key. Vui lòng kiểm tra file api/index.js hoặc biến môi trường.");
    }
    
    return new Error(message);
};

// --- CORE PROXY CALL FUNCTION ---
// Client sends model & payload to Worker. Worker fetches Key from Supabase.
async function callGeminiProxy(model: string, payload: any, method: string = 'generateContent') {
    try {
        const response = await fetch(getProxyUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'gemini_proxy',
                model: model,
                method: method,
                payload: payload
            })
        });

        // Robust handling for non-JSON responses (e.g. 405 Method Not Allowed, 404, 500 HTML pages)
        const contentType = response.headers.get("content-type");
        let data;
        
        if (contentType && contentType.includes("application/json")) {
            data = await response.json();
        } else {
            // Handle text/html error responses without crashing
            const text = await response.text();
            if (!response.ok) {
                 if (response.status === 405) {
                     throw new Error(`Lỗi cấu hình API (405 Method Not Allowed). Vui lòng kiểm tra Routing của Cloudflare Worker.`);
                 }
                 if (response.status === 404) {
                     throw new Error(`Không tìm thấy API (404 Not Found). Vui lòng kiểm tra đường dẫn API.`);
                 }
                 throw new Error(`Lỗi Server (${response.status}): ${text.substring(0, 100)}`);
            }
            // Should be JSON but isn't
            throw new Error("Phản hồi từ server không đúng định dạng JSON.");
        }

        if (!response.ok || data.error) {
            throw new Error(data.message || data.error || "Unknown Proxy Error");
        }

        return data;
    } catch (e) {
        throw handleProxyError(e);
    }
}

// --- DATA PREPARATION HELPERS ---

// Construct 'contents' for Standard/Flash models
const buildContents = (prompt: string, images?: FileData[]) => {
    const parts: any[] = [];
    
    if (images && images.length > 0) {
        images.forEach(img => {
            // Remove data:image/png;base64, prefix if present
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

// Standard "Nano Banana Flash" (gemini-2.5-flash-image)
export const generateStandardImage = async (
    prompt: string, 
    aspectRatio: AspectRatio, 
    numberOfImages: number = 1, 
    sourceImage?: FileData,
    jobId?: string
): Promise<string[]> => {
    console.log("[GeminiProxy] Generating Standard Image (Nano Banana Flash)");
    
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
        const response = await callGeminiProxy('gemini-2.5-flash-image', payload);
        
        const imageUrls: string[] = [];
        // Parse REST API Response
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
        throw handleProxyError(e);
    }
};

// Fallback using legacy Imagen
export const generateImage = async (prompt: string, aspectRatio: AspectRatio, numberOfImages: number = 1, jobId?: string): Promise<string[]> => {
    return generateStandardImage(prompt, aspectRatio, numberOfImages, undefined, jobId);
};

// --- Nano Banana Pro (Gemini 3.0 Pro) ---
// Supports 1K, 2K, 4K
export const generateHighQualityImage = async (
    prompt: string, 
    aspectRatio: AspectRatio, 
    resolution: ImageResolution,
    sourceImage?: FileData,
    jobId?: string,
    referenceImages?: FileData[]
): Promise<string[]> => {
    
    console.log("[GeminiProxy] Generating High Quality Image (Nano Banana Pro / Gemini 3.0)");

    const imagesToUpload: FileData[] = [];
    if (sourceImage) imagesToUpload.push(sourceImage);
    if (referenceImages) imagesToUpload.push(...referenceImages);

    // Prompt construction logic adjustment for 3.0
    const textPart = sourceImage || (referenceImages && referenceImages.length > 0) 
        ? `${prompt}. Maintain composition/style from provided images.` 
        : prompt;

    // Map resolution to API accepted string (1K, 2K, 4K)
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
        const response = await callGeminiProxy('gemini-3-pro-image-preview', payload);
        
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
        throw handleProxyError(e);
    }
};

// --- VIDEO GENERATION ---
export const generateVideo = async (prompt: string, startImage?: FileData, jobId?: string): Promise<string> => {
    // Note: Video generation via REST proxy requires long-polling which is complex to implement generically.
    // Recommend sticking to externalVideoService which already uses the Worker proxy specifically for Veo.
    throw new Error("Vui lòng sử dụng chế độ Veo 3 (External) để tạo video.");
};

// --- EDIT / TEXT FUNCTIONS ---

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
    const response = await callGeminiProxy('gemini-2.5-flash-image', payload);
    const urls = extractImagesFromResponse(response);
    return urls.map(url => ({ imageUrl: url, text: '' }));
};

export const editImageWithMaskAndReference = async (prompt: string, source: FileData, mask: FileData, ref: FileData, numberOfImages: number = 1, jobId?: string) => {
    const payload = {
        ...buildContents(prompt, [source, mask, ref]),
        generationConfig: { responseModalities: ["IMAGE"], candidateCount: numberOfImages }
    };
    const response = await callGeminiProxy('gemini-2.5-flash-image', payload);
    const urls = extractImagesFromResponse(response);
    return urls.map(url => ({ imageUrl: url, text: '' }));
};

export const editImageWithMultipleReferences = async (prompt: string, source: FileData, refs: FileData[], numberOfImages: number = 1, jobId?: string) => {
    const payload = {
        ...buildContents(prompt, [source, ...refs]),
        generationConfig: { responseModalities: ["IMAGE"], candidateCount: numberOfImages }
    };
    const response = await callGeminiProxy('gemini-2.5-flash-image', payload);
    const urls = extractImagesFromResponse(response);
    return urls.map(url => ({ imageUrl: url, text: '' }));
};

export const editImageWithMaskAndMultipleReferences = async (prompt: string, source: FileData, mask: FileData, refs: FileData[], numberOfImages: number = 1, jobId?: string) => {
    const payload = {
        ...buildContents(prompt, [source, mask, ...refs]),
        generationConfig: { responseModalities: ["IMAGE"], candidateCount: numberOfImages }
    };
    const response = await callGeminiProxy('gemini-2.5-flash-image', payload);
    const urls = extractImagesFromResponse(response);
    return urls.map(url => ({ imageUrl: url, text: '' }));
};

export const generateStagingImage = async (prompt: string, scene: FileData, objects: FileData[], numberOfImages: number = 1, jobId?: string) => {
    const payload = {
        ...buildContents(prompt, [scene, ...objects]),
        generationConfig: { responseModalities: ["IMAGE"], candidateCount: numberOfImages }
    };
    const response = await callGeminiProxy('gemini-2.5-flash-image', payload);
    const urls = extractImagesFromResponse(response);
    return urls.map(url => ({ imageUrl: url, text: '' }));
};

export const generateText = async (prompt: string): Promise<string> => {
    const payload = {
        ...buildContents(prompt),
        generationConfig: { responseModalities: ["TEXT"] }
    };
    try {
        const response = await callGeminiProxy('gemini-2.5-flash', payload);
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
    const response = await callGeminiProxy('gemini-2.5-flash', payload);
    return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

export const enhancePrompt = async (prompt: string, image?: FileData): Promise<string> => {
    const fullPrompt = `Enhance this prompt for architecture: ${prompt}`;
    const payload = {
        ...buildContents(fullPrompt, image ? [image] : []),
        generationConfig: { responseModalities: ["TEXT"] }
    };
    const response = await callGeminiProxy('gemini-2.5-flash', payload);
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
        const response = await callGeminiProxy('gemini-2.5-flash', payload);
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        return JSON.parse(text);
    } catch {
        return {};
    }
};

// Helper to extract image URLs from any standard response
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
