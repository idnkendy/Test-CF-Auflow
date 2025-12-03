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
        
        // 1. Giải mã Base64 thành chuỗi nhị phân (binary string)
        // SQL: encode(v_encrypted, 'base64') -> JS: atob()
        const binaryString = atob(encryptedBase64);
        
        let decrypted = '';
        
        // 2. Giải mã XOR
        // SQL Loop: 1..len -> (i-1)%secret_len
        // JS Loop: 0..len-1 -> i%secret_len
        for (let i = 0; i < binaryString.length; i++) {
            const secretChar = XOR_SECRET.charCodeAt(i % XOR_SECRET.length);
            const encryptedChar = binaryString.charCodeAt(i);
            
            // XOR operation (A ^ B = C => C ^ B = A)
            decrypted += String.fromCharCode(encryptedChar ^ secretChar);
        }
        
        return decrypted;
    } catch (e) {
        console.error("Lỗi giải mã API Key:", e);
        // Fallback: trả về nguyên bản nếu không phải format mong đợi
        return encryptedBase64;
    }
};

// Hàm chuẩn hóa key (Xóa khoảng trắng, xuống dòng thừa)
const normalizeCode = (code: string): string => {
    if (!code) return "";
    return code.trim().replace(/[\n\r\s]/g, '');
};

// --- API KEY MANAGEMENT ---

const getGeminiApiKey = async (): Promise<string> => {
    try {
        // Gọi RPC (Stored Procedure) từ Supabase để lấy key
        // Logic SQL của bạn xử lý: Random, Rate Limit, Encryption
        const { data: encryptedKey, error } = await supabase.rpc('get_api_key');

        if (error) {
            console.error("Supabase RPC Error:", error);
            
            // FALLBACK: Nếu chưa tạo function RPC, thử lấy trực tiếp (chỉ dùng khi dev/test)
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

        if (!encryptedKey) {
             throw new Error("Hệ thống đang bận hoặc hết lượt sử dụng Key.");
        }

        // Giải mã và chuẩn hóa
        const apiKey = normalizeCode(decryptCode(encryptedKey));

        if (!apiKey || apiKey.length < 10) {
             throw new Error("API Key giải mã không hợp lệ.");
        }

        return apiKey;
    } catch (err: any) {
        throw new Error(`Lỗi lấy API Key: ${err.message}`);
    }
};

const getAIClient = async () => {
    const apiKey = await getGeminiApiKey();
    return new GoogleGenAI({ apiKey });
};

// --- HELPER: Process Response ---

const processContentResponse = (response: any): string[] => {
    const images: string[] = [];
    
    if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        
        // Safety Checks
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
             // Handle specific safety/block reasons
             if (['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(candidate.finishReason)) {
                 throw new Error(`AI từ chối xử lý do vi phạm an toàn: ${candidate.finishReason}`);
             }
        }

        if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
                if (part.inlineData) {
                    images.push(`data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`);
                }
            }
        }
    }

    if (images.length === 0) {
        // Check if there is text (error message or refusal)
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
             throw new Error(`AI phản hồi nhưng không có ảnh: ${text.substring(0, 200)}...`);
        }
        throw new Error("Không có ảnh nào được tạo ra. Vui lòng thử lại với mô tả khác.");
    }

    return images;
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

    // Parallel requests for multiple images (SDK limitation: usually 1 candidate per req for images)
    const promises = Array.from({ length: numberOfImages }).map(async () => {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts },
                config: {
                    // candidateCount: 1 // Default
                }
            });
            return processContentResponse(response);
        } catch (e: any) {
            // Check for region block
            if (e.message?.includes('403') || e.message?.includes('location') || e.message?.includes('User location is not supported')) {
                window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
                throw new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
            }
            throw e;
        }
    });

    const results = await Promise.all(promises);
    return results.flat();
};

export const generateHighQualityImage = async (
    prompt: string, 
    aspectRatio: AspectRatio, 
    resolution: ImageResolution, 
    sourceImage?: FileData,
    jobId?: string,
    referenceImages?: FileData[]
): Promise<string[]> => {
    const ai = await getAIClient();
    const model = 'gemini-3-pro-image-preview';

    const parts: any[] = [{ text: prompt }];
    
    if (sourceImage) {
        parts.push({
            inlineData: {
                mimeType: sourceImage.mimeType,
                data: sourceImage.base64
            }
        });
    }

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
        return processContentResponse(response);
    } catch (e: any) {
        if (e.message?.includes('403') || e.message?.includes('location') || e.message?.includes('User location is not supported')) {
            window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
            throw new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
        }
        throw e;
    }
};

export const editImage = async (
    prompt: string, 
    image: FileData, 
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    // Editing uses standard generation with input image prompt
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
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts }
            });
            return processContentResponse(response);
        } catch (e: any) {
            if (e.message?.includes('403') || e.message?.includes('location')) {
                window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
                throw new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
            }
            throw e;
        }
    });

    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
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
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts }
            });
            return processContentResponse(response);
        } catch (e: any) {
            if (e.message?.includes('403') || e.message?.includes('location')) {
                window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
                throw new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
            }
            throw e;
        }
    });

    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
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
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts }
            });
            return processContentResponse(response);
        } catch (e: any) {
            if (e.message?.includes('403') || e.message?.includes('location')) {
                window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
                throw new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
            }
            throw e;
        }
    });

    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
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
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts }
            });
            return processContentResponse(response);
        } catch (e: any) {
            if (e.message?.includes('403') || e.message?.includes('location')) {
                window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
                throw new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
            }
            throw e;
        }
    });

    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
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
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts }
            });
            return processContentResponse(response);
        } catch (e: any) {
            if (e.message?.includes('403') || e.message?.includes('location')) {
                window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
                throw new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
            }
            throw e;
        }
    });

    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
}

// --- TEXT GENERATION FUNCTIONS ---

export const generateText = async (prompt: string): Promise<string> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash';
    
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ parts: [{ text: prompt }] }]
        });
        return response.text || "";
    } catch (e: any) {
        if (e.message?.includes('403') || e.message?.includes('location') || e.message?.includes('User location is not supported')) {
            window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
            throw new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
        }
        throw e;
    }
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
        if (e.message?.includes('403') || e.message?.includes('location')) {
            window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
        }
        return null;
    }
};

export const enhancePrompt = async (userInput: string, image?: FileData): Promise<string> => {
    const ai = await getAIClient();
    const model = 'gemini-2.5-flash';
    
    const parts: any[] = [{ text: `Act as an expert architectural prompt engineer. Enhance the following user input into a detailed, professional prompt suitable for high-quality AI rendering (like Midjourney or Gemini). Focus on lighting, materials, atmosphere, and camera specifications. \n\nUser Input: "${userInput}"` }];
    
    if (image) {
        parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
        parts[0].text += " \n\nAlso use the visual style of the attached image as a reference.";
    }

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts }
        });
        return response.text || "";
    } catch (e: any) {
        if (e.message?.includes('403') || e.message?.includes('location')) {
            window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
            throw new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
        }
        throw e;
    }
};

// --- VIDEO GENERATION ---
export const generateVideo = async (prompt: string, startImage?: FileData, jobId?: string): Promise<string> => {
    // Veo generation usually requires specific OAuth or Allowlisted projects.
    // We are maintaining the external service for video to ensure stability with OAuth tokens.
    // If you want to move this to client-side, you'll need the user to provide an OAuth token with Veo access.
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
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts }
            });
            return processContentResponse(response);
        } catch (e: any) {
            if (e.message?.includes('403') || e.message?.includes('location')) {
                window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
                throw new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
            }
            throw e;
        }
    });

    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
};