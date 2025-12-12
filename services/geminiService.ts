import { GoogleGenAI } from "@google/genai";
import { supabase } from "./supabaseClient";
import { AspectRatio, FileData, ImageResolution } from "../types";

// --- SECURITY & UTILS ---

// KHÓA BÍ MẬT (Phải khớp với v_secret trong SQL function)
const XOR_SECRET = 'OPZEN_SUPER_SECRET_2025';

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

/**
 * Converts a Base64 string to a Blob URL ASYNCHRONOUSLY to prevent UI freeze.
 * Using fetch with data protocol allows the browser to handle the decoding 
 * efficiently off the main thread.
 */
const base64ToBlobUrlAsync = async (base64: string, mimeType: string = 'image/png'): Promise<string> => {
    try {
        const res = await fetch(`data:${mimeType};base64,${base64}`);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
    } catch (e) {
        console.error("Failed to convert Base64 to Blob Async", e);
        // Fallback to data URI if fetch fails (rare)
        return `data:${mimeType};base64,${base64}`; 
    }
};

/**
 * Extracts raw Base64 and MimeType from a URL (Blob or Data URI) for API transmission.
 * Used for Upscaling or Editing where the API needs raw data.
 */
export const getFileDataFromUrl = async (url: string): Promise<FileData> => {
    // 1. Handle Data URI
    if (url.startsWith('data:')) {
        const arr = url.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        return {
            base64: arr[1],
            mimeType: mime,
            objectURL: url
        };
    }

    // 2. Handle Blob URL or Remote URL
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result as string;
                // FileReader returns "data:image/png;base64,....."
                const arr = base64data.split(',');
                resolve({
                    base64: arr[1], // Only the base64 part
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

// --- HELPER: Process Response ---

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
                    // Await the async conversion here to prevent locking UI
                    const blobUrl = await base64ToBlobUrlAsync(part.inlineData.data, mime);
                    images.push(blobUrl);
                }
            }
        }
    }

    if (images.length === 0) {
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
             throw new Error(`AI phản hồi nhưng không có ảnh: ${text.substring(0, 200)}...`);
        }
        throw new Error("Không có ảnh nào được tạo ra. Vui lòng thử lại với mô tả khác.");
    }

    return images;
};

// Helper for error handling
const handleGeminiError = (e: any) => {
    let msg = e.message || e.toString();
    
    // Attempt to parse JSON error message if present
    if (msg.startsWith('{') && msg.includes('"error"')) {
        try {
            const parsed = JSON.parse(msg);
            if (parsed.error) {
                if (parsed.error.message) msg = parsed.error.message;
                if (parsed.error.code === 503 || parsed.error.status === 'UNAVAILABLE') {
                    throw new Error("Hệ thống AI đang quá tải (Model Overloaded). Đã thử lại 3 lần nhưng chưa thành công. Vui lòng đợi 1-2 phút.");
                }
            }
        } catch (err) {
            // Ignore parse error
        }
    }

    // Specific Error Mapping
    if (msg.includes('503') || msg.includes('overloaded') || msg.includes('UNAVAILABLE')) {
        throw new Error("Hệ thống AI đang quá tải (Model Overloaded). Vui lòng thử lại sau 1-2 phút.");
    }
    
    // Region/IP Block
    if (msg.includes('403') || msg.includes('location') || msg.includes('User location is not supported')) {
        throw new Error("Lỗi: IP không được hỗ trợ. Vui lòng bật VPN hoặc đổi vùng.");
    }
    
    // Quota Limit
    if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted') || msg.includes('Resource has been exhausted')) {
        throw new Error("Hệ thống đang bận (Quota Exceeded). Vui lòng thử lại sau giây lát.");
    }

    // Payload Size Limit
    if (msg.includes('413') || msg.includes('Too Large') || msg.includes('too large') || msg.includes('limit')) {
        throw new Error("Dữ liệu ảnh quá lớn so với giới hạn xử lý của AI. Vui lòng giảm kích thước ảnh hoặc nén ảnh trước khi tải lên.");
    }
    
    if (msg.includes('500') || msg.includes('Internal error')) {
        throw new Error("Máy chủ Google gặp lỗi nội bộ. Vui lòng thử lại sau vài giây.");
    }
    
    if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
        throw new Error("Dữ liệu ảnh không hợp lệ hoặc bị hỏng. Vui lòng thử lại với một ảnh khác.");
    }
    
    throw new Error(msg);
};

// --- RETRY LOGIC WRAPPER ---
// Tự động thử lại khi gặp lỗi server hoặc quá tải (503, 500, 429)
const retryOperation = async <T>(operation: () => Promise<T>, retries = 2, delay = 2000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        const msg = error.message || JSON.stringify(error);
        
        const shouldRetry = 
            msg.includes('503') || 
            msg.includes('overloaded') || 
            msg.includes('UNAVAILABLE') || 
            msg.includes('500') || 
            msg.includes('Internal error') ||
            msg.includes('429') || 
            msg.includes('exhausted');

        if (retries > 0 && shouldRetry) {
            console.warn(`[AI Service] Gặp lỗi: "${msg}". Đang thử lại... (Còn ${retries} lần)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryOperation(operation, retries - 1, delay * 2); // Exponential backoff (2s -> 4s -> 8s)
        }
        
        throw error;
    }
};

// --- GENERATION FUNCTIONS ---

export const generateStandardImage = async (
    prompt: string, 
    aspectRatio: AspectRatio, 
    numberOfImages: number, 
    sourceImage?: FileData,
    jobId?: string
): Promise<string[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';

    const parts: any[] = [{ text: prompt }];
    if (sourceImage) {
        parts.push({
            inlineData: {
                mimeType: sourceImage.mimeType,
                data: sourceImage.base64
            }
        });
    }

    // Apply retry logic for each image generation
    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            try {
                const response = await ai.models.generateContent({
                    model: model,
                    contents: { parts },
                    config: {}
                });
                return await processContentResponseAsync(response);
            } catch (e: any) {
                throw e; // Let retryOperation catch it
            }
        });
    });

    try {
        const results = await Promise.all(promises);
        return results.flat();
    } catch (e: any) {
        handleGeminiError(e);
        return [];
    }
};

export const generateHighQualityImage = async (
    prompt: string, 
    aspectRatio: AspectRatio, 
    resolution: ImageResolution, 
    sourceImage?: FileData,
    jobId?: string,
    referenceImages?: FileData[],
    maskImage?: FileData
): Promise<string[]> => {
    const ai = await getAIClient();
    const model = 'gemini-3-pro-image-preview';

    let finalPrompt = prompt;
    const parts: any[] = [];
    
    // 1. Source Image
    if (sourceImage) {
        parts.push({
            inlineData: {
                mimeType: sourceImage.mimeType,
                data: sourceImage.base64
            }
        });
    }

    // 2. Mask Image (If provided) - CRITICAL FOR IN-PAINTING WITH PRO MODEL
    if (maskImage) {
        parts.push({
            inlineData: {
                mimeType: maskImage.mimeType,
                data: maskImage.base64
            }
        });
        finalPrompt = `I have provided two images. The first is the SOURCE image. The second is the MASK image where the edit zone is marked in white/color. Please perform the following edit ONLY within the masked area of the source image, keeping the rest of the image exactly the same: ${prompt}`;
    } else {
        parts.push({ text: finalPrompt });
    }

    // 3. Prompt (If mask included, prompt is already in parts or modified above)
    if (maskImage) {
        parts.push({ text: finalPrompt });
    }

    // 4. Reference Images
    if (referenceImages && referenceImages.length > 0) {
        referenceImages.forEach(ref => {
            parts.push({
                inlineData: {
                    mimeType: ref.mimeType,
                    data: ref.base64
                }
            });
        });
    }

    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts },
                config: {
                    imageConfig: {
                        aspectRatio: aspectRatio,
                        imageSize: resolution === 'Standard' ? '1K' : resolution
                    }
                }
            });
            return await processContentResponseAsync(response);
        } catch (e: any) {
            handleGeminiError(e);
            throw e;
        }
    });
};

export const editImage = async (
    prompt: string, 
    image: FileData, 
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    // Re-use standard image generation logic which handles retries
    const urls = await generateStandardImage(prompt, '4:3', numberOfImages, image);
    return urls.map(url => ({ imageUrl: url }));
};

export const editImageWithMask = async (
    prompt: string, 
    image: FileData, 
    mask: FileData, 
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    
    const parts = [
        { text: `Edit the first image based on the second mask image (white area is the edit zone). Instruction: ${prompt}` },
        { inlineData: { mimeType: image.mimeType, data: image.base64 } },
        { inlineData: { mimeType: mask.mimeType, data: mask.base64 } }
    ];

    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            try {
                const response = await ai.models.generateContent({
                    model: model,
                    contents: { parts }
                });
                return await processContentResponseAsync(response);
            } catch (e: any) {
                throw e;
            }
        });
    });

    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) {
        handleGeminiError(e);
        return [];
    }
};

export const editImageWithReference = async (
    prompt: string, 
    sourceImage: FileData | null, 
    referenceImage: FileData | null, 
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    
    const parts: any[] = [{ text: prompt }];
    if (sourceImage) parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });
    if (referenceImage) parts.push({ inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } });

    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            try {
                const response = await ai.models.generateContent({
                    model: model,
                    contents: { parts }
                });
                return await processContentResponseAsync(response);
            } catch (e: any) {
                throw e;
            }
        });
    });

    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) {
        handleGeminiError(e);
        return [];
    }
};

export const editImageWithMaskAndReference = async (
    prompt: string, 
    sourceImage: FileData, 
    maskImage: FileData, 
    referenceImage: FileData, 
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    
    const parts: any[] = [
        { text: prompt },
        { inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } },
        { inlineData: { mimeType: maskImage.mimeType, data: maskImage.base64 } },
        { inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } }
    ];

    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            try {
                const response = await ai.models.generateContent({
                    model: model,
                    contents: { parts }
                });
                return await processContentResponseAsync(response);
            } catch (e: any) {
                throw e;
            }
        });
    });

    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) {
        handleGeminiError(e);
        return [];
    }
};

export const editImageWithMultipleReferences = async (
    prompt: string,
    sourceImage: FileData,
    referenceImages: FileData[],
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    
    const parts: any[] = [{ text: prompt }];
    parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });
    
    referenceImages.forEach(ref => {
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
    });

    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            try {
                const response = await ai.models.generateContent({
                    model: model,
                    contents: { parts }
                });
                return await processContentResponseAsync(response);
            } catch (e: any) {
                throw e;
            }
        });
    });

    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) {
        handleGeminiError(e);
        return [];
    }
}

export const editImageWithMaskAndMultipleReferences = async (
    prompt: string,
    sourceImage: FileData,
    maskImage: FileData,
    referenceImages: FileData[],
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    
    const parts: any[] = [{ text: prompt }];
    parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });
    parts.push({ inlineData: { mimeType: maskImage.mimeType, data: maskImage.base64 } });
    
    referenceImages.forEach(ref => {
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
    });

    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            try {
                const response = await ai.models.generateContent({
                    model: model,
                    contents: { parts }
                });
                return await processContentResponseAsync(response);
            } catch (e: any) {
                throw e;
            }
        });
    });

    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) {
        handleGeminiError(e);
        return [];
    }
}

// --- TEXT GENERATION FUNCTIONS ---

export const generateText = async (prompt: string): Promise<string> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash';
    
    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: [{ parts: [{ text: prompt }] }]
            });
            return response.text || "";
        } catch (e: any) {
            handleGeminiError(e);
            throw e;
        }
    });
};

export const generatePromptSuggestions = async (
    image: FileData, 
    subject: string, 
    count: number,
    customInstruction: string = ''
): Promise<Record<string, string[]> | null> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash';
    
    const prompt = `Analyze this image and generate ${count} creative prompts for an AI image generator to create a similar architectural/interior style or view. 
    Focus on: ${subject === 'all' ? 'various aspects' : subject}. 
    ${customInstruction ? `Additional instruction: ${customInstruction}` : ''}
    
    Return the output strictly as a JSON object where keys are categories (e.g., "Lighting", "Composition", "Style") and values are arrays of prompt strings. Do not use Markdown code blocks.`;

    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: image.mimeType, data: image.base64 } }
                    ]
                },
                config: { 
                    responseMimeType: "application/json"
                }
            });

            const text = response.text || "";
            return JSON.parse(text);
        } catch (e: any) {
            console.error("Failed to generate/parse suggestions", e);
            return null; // Don't throw for suggestions, just return null
        }
    });
};

export const enhancePrompt = async (userInput: string, image?: FileData): Promise<string> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash';
    
    const parts: any[] = [{ text: `Act as an expert architectural prompt engineer. Enhance the following user input into a detailed, professional prompt suitable for high-quality AI rendering (like Midjourney or Gemini). Focus on lighting, materials, atmosphere, and camera specifications. \n\nUser Input: "${userInput}"` }];
    
    if (image) {
        parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
        parts[0].text += " \n\nAlso use the visual style of the attached image as a reference.";
    }

    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts }
            });
            return response.text || "";
        } catch (e: any) {
            handleGeminiError(e);
            throw e;
        }
    });
};

// --- VIDEO PROMPT GENERATION ---
export const generateVideoPromptFromImage = async (image: FileData): Promise<string> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash';
    
    const prompt = `Phân tích hình ảnh kiến trúc hoặc nội thất này. Hãy viết một prompt (lời nhắc) bằng Tiếng Việt thật chi tiết, đậm chất điện ảnh để tạo video ngắn từ hình ảnh này bằng AI (như Google Veo). 
    Tập trung mô tả chuyển động camera (ví dụ: quay chậm, flycam, dolly zoom), thay đổi ánh sáng (ví dụ: ngày sang đêm), và các yếu tố khí quyển (ví dụ: gió nhẹ lay động cây, phản chiếu).
    Giữ prompt dưới 60 từ, súc tích và tập trung vào chuyển động hình ảnh. 
    QUAN TRỌNG: TUYỆT ĐỐI CHỈ TRẢ VỀ NỘI DUNG PROMPT BẰNG TIẾNG VIỆT. KHÔNG TRẢ LỜI BẰNG TIẾNG ANH. KHÔNG THÊM CÁC CÂU DẪN NHƯ "Dưới đây là prompt...". CHỈ TRẢ VỀ NỘI DUNG PROMPT.`;

    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: image.mimeType, data: image.base64 } }
                    ]
                }
            });
            return response.text?.trim() || "Video kiến trúc điện ảnh với chuyển động camera chậm.";
        } catch (e: any) {
            console.error("Failed to generate video prompt from image", e);
            return "Video kiến trúc điện ảnh với chuyển động camera chậm.";
        }
    });
};

// --- VIDEO GENERATION ---
export const generateVideo = async (prompt: string, startImage?: FileData, jobId?: string): Promise<string> => {
    throw new Error("Please use the specialized Video Generation service (Veo 3) which is currently handled via external service for stability.");
};

export const generateStagingImage = async (prompt: string, sceneImage: FileData, objectImages: FileData[], numberOfImages: number = 1): Promise<{ imageUrl: string }[]> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash-image';
    
    const parts: any[] = [{ text: prompt }];
    parts.push({ inlineData: { mimeType: sceneImage.mimeType, data: sceneImage.base64 } });
    
    objectImages.forEach(obj => {
        parts.push({ inlineData: { mimeType: obj.mimeType, data: obj.base64 } });
    });

    const promises = Array.from({ length: numberOfImages }).map(async () => {
        return retryOperation(async () => {
            try {
                const response = await ai.models.generateContent({
                    model: model,
                    contents: { parts }
                });
                return await processContentResponseAsync(response);
            } catch (e: any) {
                throw e;
            }
        });
    });

    try {
        const results = await Promise.all(promises);
        return results.flat().map(url => ({ imageUrl: url }));
    } catch (e: any) {
        handleGeminiError(e);
        return [];
    }
};
