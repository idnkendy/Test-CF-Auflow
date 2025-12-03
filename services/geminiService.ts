
import { GoogleGenAI } from "@google/genai";
import { supabase } from "./supabaseClient";
import { AspectRatio, FileData, ImageResolution } from "../types";

// --- API KEY MANAGEMENT ---

const getGeminiApiKey = async (): Promise<string> => {
    try {
        // Fetch all active keys
        const { data: keys, error } = await supabase
            .from('api_keys')
            .select('key_value')
            .eq('is_active', true);

        if (error || !keys || keys.length === 0) {
            console.error("Supabase API Key Error:", error);
            throw new Error("Không tìm thấy API Key khả dụng trong hệ thống.");
        }

        // Randomly select one key to distribute load
        const randomIndex = Math.floor(Math.random() * keys.length);
        const apiKey = keys[randomIndex].key_value;

        // NOTE: If you have encryption logic, apply decryption here on `apiKey`
        // const decryptedKey = decrypt(apiKey); 
        // return decryptedKey;

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
            if (e.message?.includes('403') || e.message?.includes('location')) {
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
        if (e.message?.includes('403') || e.message?.includes('location')) {
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
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts }
        });
        return processContentResponse(response);
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
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts }
        });
        return processContentResponse(response);
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
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts }
        });
        return processContentResponse(response);
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
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts }
        });
        return processContentResponse(response);
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
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts }
        });
        return processContentResponse(response);
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
        if (e.message?.includes('403') || e.message?.includes('location')) {
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
    } catch (e) {
        console.error("Failed to generate/parse suggestions", e);
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

    const response = await ai.models.generateContent({
        model: model,
        contents: { parts }
    });
    
    return response.text || "";
};

// --- VIDEO GENERATION ---
export const generateVideo = async (prompt: string, startImage?: FileData, jobId?: string): Promise<string> => {
    // Veo support via direct SDK is limited for 'video' output in browser currently without a proxy for OAuth tokens in some cases.
    // However, if we are strictly using this file to replace the proxy for IMAGES, we might need to keep Video routed or throw error.
    // Based on user request, they want to bypass worker.
    // Veo via SDK requires `generateVideos` which is supported.
    
    // NOTE: Veo generation usually requires specific OAuth or Allowlisted projects.
    // If you are using API Key, 'veo-3.1-fast-generate-preview' might work if enabled for the key.
    // If not, we might need to stick to the external service for Video or implement full Veo SDK logic.
    
    // For now, let's try the standard Veo SDK call.
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
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts }
        });
        return processContentResponse(response);
    });

    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
};
