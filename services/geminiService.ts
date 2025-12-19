
import { GoogleGenAI } from "@google/genai";
import { supabase } from "./supabaseClient";
import { AspectRatio, FileData, ImageResolution } from "../types";

// --- SECURITY & UTILS ---

// KHÓA BÍ MẬT (Phải khớp với v_secret trong SQL function)
const XOR_SECRET = 'OPZEN_SUPER_SECRET_2025';

// Hàm xóa API Key khỏi chuỗi văn bản để bảo mật tuyệt đối
const scrubErrorText = (text: string): string => {
    if (!text) return "";
    return text
        // Xóa mã AIza... (định dạng của Google API Key)
        .replace(/AIza[A-Za-z0-9_-]{35}/g, '***')
        // Xóa chuỗi api_key:ABC...
        .replace(/api_key:[A-Za-z0-9_-]+/gi, 'api_key:***')
        // Xóa thông tin Consumer nếy bị lộ
        .replace(/Consumer 'api_key:[^']+'/gi, "API Key")
        // Xóa các tham số key trong URL nếu có
        .replace(/key=[A-Za-z0-9_-]+/g, 'key=***');
};

// Hàm giải mã XOR từ chuỗi Base64
const decryptCode = (encryptedBase64: string): string => {
    try {
        if (!encryptedBase64) return "";
        const binaryString = atob(encryptedBase64);
        let decrypted = '';
        for (let i = 0; i < binaryString.length; i++) {
            const secretChar = XOR_SECRET.charCodeAt(i % XOR_SECRET.length);
            const encryptedChar = binaryString.charCodeAt(i);
            decrypted += String.fromCharCode(encryptedChar ^ secretChar);
        }
        return decrypted;
    } catch (e) {
        console.error("Lỗi giải mã API Key:", e);
        return encryptedBase64;
    }
};

const normalizeCode = (code: string): string => {
    if (!code) return "";
    return code.trim().replace(/[\n\r\s]/g, '');
};

// --- API KEY MANAGEMENT ---

const getGeminiApiKey = async (): Promise<string> => {
    try {
        const { data: encryptedKey, error } = await supabase.rpc('get_random_api_key');

        if (error) {
            console.error("Supabase RPC Error:", error);
            if (error.message?.includes('function') && error.message?.includes('not found')) {
                 console.warn("Falling back to direct table select...");
                 const { data: keys } = await supabase
                    .from('api_keys')
                    .select('key_value')
                    .eq('is_active', true)
                    .limit(1);
                 if (keys && keys.length > 0) return keys[0].key_value;
            }
            throw new Error("Không thể lấy API Key từ hệ thống.");
        }

        if (!encryptedKey) throw new Error("Hệ thống đang bận hoặc hết lượt sử dụng Key.");
        const apiKey = normalizeCode(decryptCode(encryptedKey));
        if (!apiKey || apiKey.length < 10) throw new Error("API Key giải mã không hợp lệ.");

        return apiKey;
    } catch (err: any) {
        throw new Error(`Lỗi lấy API Key: ${err.message}`);
    }
};

const getAIClient = async () => {
    const apiKey = await getGeminiApiKey();
    return new GoogleGenAI({ apiKey });
};

// --- HELPER: Memory Optimization (Base64 -> Blob URL) ---

const base64ToBlobUrlAsync = async (base64: string, mimeType: string = 'image/png'): Promise<string> => {
    try {
        const res = await fetch(`data:${mimeType};base64,${base64}`);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
    } catch (e) {
        console.error("Failed to convert Base64 to Blob Async", e);
        return `data:${mimeType};base64,${base64}`; 
    }
};

export const getFileDataFromUrl = async (url: string): Promise<FileData> => {
    if (url.startsWith('data:')) {
        const arr = url.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        return {
            base64: arr[1],
            mimeType: mime,
            objectURL: url
        };
    }

    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result as string;
                const arr = base64data.split(',');
                resolve({
                    base64: arr[1],
                    mimeType: blob.type,
                    objectURL: url
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("getFileDataFromUrl failed:", e);
        throw new Error("Không thể xử lý ảnh này. Vui lòng thử lại.");
    }
};

const createCompositeImage = async (source: FileData, mask: FileData): Promise<string> => {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Cannot create canvas context"));
            return;
        }

        const imgSource = new Image();
        const imgMask = new Image();

        imgSource.crossOrigin = "Anonymous";
        imgMask.crossOrigin = "Anonymous";

        imgSource.onload = () => {
            canvas.width = imgSource.width;
            canvas.height = imgSource.height;
            ctx.drawImage(imgSource, 0, 0);

            imgMask.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                
                if (tempCtx) {
                    tempCtx.drawImage(imgMask, 0, 0, canvas.width, canvas.height);
                    tempCtx.globalCompositeOperation = 'source-in';
                    tempCtx.fillStyle = '#FF0000';
                    tempCtx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(tempCanvas, 0, 0);
                }
                resolve(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
            };
            imgMask.onerror = () => reject(new Error("Failed to load mask"));
            imgMask.src = mask.objectURL || `data:${mask.mimeType};base64,${mask.base64}`;
        };
        imgSource.onerror = () => reject(new Error("Failed to load source"));
        imgSource.src = source.objectURL || `data:${source.mimeType};base64,${source.base64}`;
    });
};

const processContentResponseAsync = async (response: any): Promise<string[]> => {
    const images: string[] = [];
    if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
             if (['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(candidate.finishReason)) {
                 throw new Error(`AI từ chối xử lý do vi phạm an toàn: ${candidate.finishReason}`);
             }
        }
        if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
                if (part.inlineData) {
                    const mime = part.inlineData.mimeType || 'image/png';
                    const blobUrl = await base64ToBlobUrlAsync(part.inlineData.data, mime);
                    images.push(blobUrl);
                }
            }
        }
    }
    if (images.length === 0) {
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) throw new Error(`AI phản hồi nhưng không có ảnh: ${text.substring(0, 200)}...`);
        throw new Error("Không có ảnh nào được tạo ra.");
    }
    return images;
};

const handleGeminiError = (e: any) => {
    let msg = e.message || e.toString();
    
    // Bảo mật: Lọc bỏ API Key ngay lập tức khỏi mọi log hoặc thông báo
    msg = scrubErrorText(msg);

    if (msg.startsWith('{') && msg.includes('"error"')) {
        try {
            const parsed = JSON.parse(msg);
            if (parsed.error?.message) msg = scrubErrorText(parsed.error.message);
        } catch (err) {}
    }

    // Xử lý các mã lỗi cụ thể và trả về thông báo tiếng Việt an toàn
    if (msg.includes('suspended') || msg.includes('API_KEY_INVALID') || msg.includes('400') && msg.includes('API key') || msg.includes('PERMISSION_DENIED')) {
        throw new Error("Lỗi: API Key hiện tại gặp sự cố hoặc bị tạm ngưng. Hệ thống đang tự động điều chuyển, vui lòng thử lại sau giây lát.");
    }

    if (msg.includes('503') || msg.includes('overloaded') || msg.includes('UNAVAILABLE')) {
        throw new Error("Hệ thống AI đang quá tải (Model Overloaded). Vui lòng thử lại sau 1-2 phút.");
    }
    
    if (msg.includes('403') || msg.includes('location') || msg.includes('User location is not supported')) {
        throw new Error("Lỗi: IP không được hỗ trợ. Vui lòng bật VPN hoặc đổi vùng.");
    }

    if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted') || msg.includes('Resource has been exhausted')) {
        throw new Error("Hệ thống đang bận (Quota Exceeded). Vui lòng thử lại sau giây lát.");
    }

    if (msg.includes('413') || msg.includes('Too Large') || msg.includes('too large')) {
        throw new Error("Dữ liệu ảnh quá lớn. Vui lòng giảm kích thước ảnh.");
    }
    
    if (msg.includes('500') || msg.includes('Internal error')) {
        throw new Error("Máy chủ Google gặp lỗi nội bộ. Vui lòng thử lại.");
    }
    
    throw new Error(msg);
};

const retryOperation = async <T>(operation: () => Promise<T>, retries = 2, delay = 2000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        const msg = error.message || "";
        const shouldRetry = msg.includes('503') || msg.includes('overloaded') || msg.includes('UNAVAILABLE') || msg.includes('500') || msg.includes('suspended');
        if (retries > 0 && shouldRetry) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryOperation(operation, retries - 1, delay * 2);
        }
        throw error;
    }
};

export const generateStandardImage = async (prompt: string, aspectRatio: AspectRatio, numberOfImages: number, sourceImage?: FileData, jobId?: string): Promise<string[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    const parts: any[] = [{ text: prompt }];
    if (sourceImage) parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });
    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            try {
                const response = await ai.models.generateContent({ model, contents: { parts } });
                return await processContentResponseAsync(response);
            } catch (e: any) { throw e; }
        });
    });
    try {
        const results = await Promise.all(promises);
        return results.flat();
    } catch (e: any) { handleGeminiError(e); return []; }
};

export const generateHighQualityImage = async (prompt: string, aspectRatio: AspectRatio, resolution: ImageResolution, sourceImage?: FileData, jobId?: string, referenceImages?: FileData[], maskImage?: FileData): Promise<string[]> => {
    const ai = await getAIClient();
    const model = 'gemini-3-pro-image-preview';
    let finalPrompt = prompt;
    const parts: any[] = [];
    if (maskImage && sourceImage) {
        try {
            const compositeBase64 = await createCompositeImage(sourceImage, maskImage);
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: compositeBase64 } });
            finalPrompt = `I have provided an image where an area is RED. EDIT the image by modifying ONLY the RED area: "${prompt}". Remove the red overlay in final result.`;
        } catch (e) { throw new Error("Lỗi xử lý vùng chọn."); }
    } else if (sourceImage) {
        parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });
    }
    parts.push({ text: finalPrompt });
    if (referenceImages) referenceImages.forEach(ref => parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } }));

    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({
                model,
                contents: { parts },
                config: { imageConfig: { aspectRatio, imageSize: resolution === 'Standard' ? '1K' : resolution } }
            });
            return await processContentResponseAsync(response);
        } catch (e: any) { handleGeminiError(e); throw e; }
    });
};

export const editImage = async (prompt: string, image: FileData, numberOfImages: number = 1): Promise<{ imageUrl: string }[]> => {
    const urls = await generateStandardImage(prompt, '4:3', numberOfImages, image);
    return urls.map(url => ({ imageUrl: url }));
};

export const editImageWithMask = async (prompt: string, image: FileData, mask: FileData, numberOfImages: number = 1): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    const parts = [
        { text: `Edit based on mask (white = edit zone): ${prompt}` },
        { inlineData: { mimeType: image.mimeType, data: image.base64 } },
        { inlineData: { mimeType: mask.mimeType, data: mask.base64 } }
    ];
    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            const response = await ai.models.generateContent({ model, contents: { parts } });
            return await processContentResponseAsync(response);
        });
    });
    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) { handleGeminiError(e); return []; }
};

export const editImageWithReference = async (prompt: string, sourceImage: FileData | null, referenceImage: FileData | null, numberOfImages: number = 1): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    const parts: any[] = [{ text: prompt }];
    if (sourceImage) parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });
    if (referenceImage) parts.push({ inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } });
    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            const response = await ai.models.generateContent({ model, contents: { parts } });
            return await processContentResponseAsync(response);
        });
    });
    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) { handleGeminiError(e); return []; }
};

export const editImageWithMaskAndReference = async (prompt: string, sourceImage: FileData, maskImage: FileData, referenceImage: FileData, numberOfImages: number = 1): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    const parts = [
        { text: prompt },
        { inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } },
        { inlineData: { mimeType: maskImage.mimeType, data: maskImage.base64 } },
        { inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } }
    ];
    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            const response = await ai.models.generateContent({ model, contents: { parts } });
            return await processContentResponseAsync(response);
        });
    });
    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) { handleGeminiError(e); return []; }
};

export const editImageWithMultipleReferences = async (prompt: string, sourceImage: FileData, referenceImages: FileData[], numberOfImages: number = 1): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    const parts: any[] = [{ text: prompt }, { inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } }];
    referenceImages.forEach(ref => parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } }));
    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            const response = await ai.models.generateContent({ model, contents: { parts } });
            return await processContentResponseAsync(response);
        });
    });
    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) { handleGeminiError(e); return []; }
};

export const editImageWithMaskAndMultipleReferences = async (prompt: string, sourceImage: FileData, maskImage: FileData, referenceImages: FileData[], numberOfImages: number = 1): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    const parts: any[] = [{ text: prompt }, { inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } }, { inlineData: { mimeType: maskImage.mimeType, data: maskImage.base64 } }];
    referenceImages.forEach(ref => parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } }));
    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            const response = await ai.models.generateContent({ model, contents: { parts } });
            return await processContentResponseAsync(response);
        });
    });
    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) { handleGeminiError(e); return []; }
};

export const generateText = async (prompt: string): Promise<string> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash';
    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({ model, contents: [{ parts: [{ text: prompt }] }] });
            return response.text || "";
        } catch (e: any) { handleGeminiError(e); throw e; }
    });
};

export const generatePromptSuggestions = async (image: FileData, subject: string, count: number, customInstruction: string = ''): Promise<Record<string, string[]> | null> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash';
    const allCategories = ["Góc toàn cảnh", "Góc trung cảnh", "Góc lấy nét", "Chi tiết kiến trúc"];
    let systemPrompt = subject === 'all' 
        ? `Analyze image and generate suggestions for: ${allCategories.join(', ')}. Each category gets ${count} prompts in Vietnamese.`
        : `Analyze image and generate exactly ${count} prompts for category: "${subject}" in Vietnamese.`;

    const fullPrompt = `${systemPrompt}\n${customInstruction}\nStrictly return JSON object. Values are arrays of strings.`;

    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({
                model,
                contents: { parts: [{ text: fullPrompt }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }] },
                config: { responseMimeType: "application/json" }
            });
            return JSON.parse(response.text || "{}");
        } catch (e: any) { return null; }
    });
};

export const enhancePrompt = async (userInput: string, image?: FileData): Promise<string> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash';
    const parts: any[] = [{ text: `Expert architectural prompt engineer. Enhance: "${userInput}"` }];
    if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({ model, contents: { parts } });
            return response.text || "";
        } catch (e: any) { handleGeminiError(e); throw e; }
    });
};

export const generateVideoPromptFromImage = async (image: FileData): Promise<string> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash';
    const prompt = `Phân tích hình ảnh này và viết prompt video cinematic bằng Tiếng Việt dưới 60 từ. Chỉ trả về nội dung prompt.`;
    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({ model, contents: { parts: [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }] } });
            return response.text?.trim() || "Video kiến trúc điện ảnh.";
        } catch (e: any) { return "Video kiến trúc điện ảnh."; }
    });
};

export const generateVideo = async (prompt: string, startImage?: FileData, jobId?: string): Promise<string> => {
    throw new Error("Sử dụng dịch vụ Video chuyên dụng.");
};

export const generateStagingImage = async (prompt: string, sceneImage: FileData, objectImages: FileData[], numberOfImages: number = 1): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    const parts: any[] = [{ text: prompt }, { inlineData: { mimeType: sceneImage.mimeType, data: sceneImage.base64 } }];
    objectImages.forEach(obj => parts.push({ inlineData: { mimeType: obj.mimeType, data: obj.base64 } }));
    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            const response = await ai.models.generateContent({ model, contents: { parts } });
            return await processContentResponseAsync(response);
        });
    });
    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) { handleGeminiError(e); return []; }
};
