
import { AspectRatio, FileData, ImageResolution } from "../types";

// --- API CONFIGURATION ---
// Get API URL from env var if available (Set VITE_API_URL in Cloudflare Pages Settings)
// @ts-ignore
const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || ""; 

// Helper to construct API URL
const getProxyUrl = () => {
    if (BACKEND_URL) {
        return `${BACKEND_URL.replace(/\/$/, "")}`; 
    }
    return `/api`; // Default to relative path for Cloudflare Pages/Vercel
};

// --- ERROR HANDLING HELPER ---
const handleGeminiError = (error: any) => {
    let message = error.message || "Lỗi kết nối";
    const lowerMsg = message.toLowerCase();
    
    if (message.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('resource_exhausted')) {
        return new Error("Hệ thống đang quá tải (Quota Exceeded). Đang thử lại...");
    }
    if (message.includes('503') || lowerMsg.includes('overloaded') || lowerMsg.includes('unavailable')) {
        return new Error("Server AI đang bận (503). Đang thử lại...");
    }
    if (message.includes('SAFETY')) {
        return new Error("Nội dung bị chặn bởi bộ lọc an toàn của Google. Vui lòng điều chỉnh lại mô tả.");
    }
    if (message.includes('User location is not supported') || lowerMsg.includes('location') || lowerMsg.includes('region')) {
        // Trigger global event for region blocking
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
        }
        return new Error("Khu vực của bạn bị chặn IP. Vui lòng bật VPN.");
    }
    return new Error(message);
};

// --- PROXY CALLER ---
// Sends request to our own backend (/api) which then forwards to Google.
// API Key is injected on the backend, never exposed to client.
async function callGeminiProxy(model: string, payload: any, retryCount = 0): Promise<any> {
    const maxRetries = 3;
    const url = getProxyUrl();

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'gemini_proxy',
                model: model,
                payload: payload
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // Handle error response from Proxy (or Google via Proxy)
            const errorMsg = data.error?.message || data.message || `Error ${response.status}`;
            throw new Error(errorMsg);
        }

        // Check for Google API specific errors embedded in 200 OK response (rare but possible)
        if (data.error) {
            throw new Error(data.error.message || JSON.stringify(data.error));
        }

        return data;

    } catch (error: any) {
        console.error(`[Gemini Proxy] Error calling ${model} (Attempt ${retryCount + 1}):`, error);

        // Retry logic for 503/429 errors
        const shouldRetry = error.message.includes('503') || error.message.includes('429') || error.message.includes('overloaded');
        
        if (shouldRetry && retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000; // Exponential backoff
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return callGeminiProxy(model, payload, retryCount + 1);
        }

        throw handleGeminiError(error);
    }
}

// --- GENERATION FUNCTIONS ---

export const generateStandardImage = async (
    prompt: string, 
    aspectRatio: AspectRatio, 
    numberOfImages: number, 
    sourceImage?: FileData,
    jobId?: string
): Promise<string[]> => {
    const model = 'gemini-2.5-flash-image'; // Standard model
    
    // Construct Prompt
    const parts: any[] = [{ text: prompt }];
    if (sourceImage) {
        parts.push({
            inlineData: {
                mimeType: sourceImage.mimeType,
                data: sourceImage.base64
            }
        });
    }

    const payload = {
        contents: [{ parts }],
        generationConfig: {
            // Explicitly set candidateCount to 1. 
            // We handle multiple images by calling the API multiple times in parallel.
            candidateCount: 1,
        }
    };

    // Parallel requests for multiple images if API doesn't support batching natively effectively
    const promises = Array.from({ length: numberOfImages }).map(() => 
        callGeminiProxy(model, payload)
            .then(data => extractImagesFromResponse(data))
    );

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
    const model = 'gemini-3-pro-image-preview'; // High quality model
    
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

    const payload = {
        contents: [{ parts }],
        generationConfig: {
            // Explicitly set candidateCount to 1 to avoid "Multiple candidates is not enabled" error
            candidateCount: 1,
            imageConfig: {
                aspectRatio: aspectRatio,
                imageSize: resolution === 'Standard' ? '1K' : resolution // Map 'Standard' to '1K' or similar
            }
        }
    };

    const data = await callGeminiProxy(model, payload);
    return extractImagesFromResponse(data);
};

export const editImage = async (
    prompt: string, 
    image: FileData, 
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    // Using standard generation with input image is effectively editing/variation
    const urls = await generateStandardImage(prompt, '4:3', numberOfImages, image);
    return urls.map(url => ({ imageUrl: url }));
};

export const editImageWithMask = async (
    prompt: string, 
    image: FileData, 
    mask: FileData, 
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    
    const model = 'gemini-2.5-flash-image';
    
    const parts = [
        { text: `Edit the first image based on the second mask image (white area is the edit zone). Instruction: ${prompt}` },
        { inlineData: { mimeType: image.mimeType, data: image.base64 } },
        { inlineData: { mimeType: mask.mimeType, data: mask.base64 } }
    ];

    const payload = { 
        contents: [{ parts }],
        generationConfig: {
            candidateCount: 1
        }
    };
    
    const promises = Array.from({ length: numberOfImages }).map(() => 
        callGeminiProxy(model, payload).then(data => extractImagesFromResponse(data))
    );

    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
};

export const editImageWithReference = async (
    prompt: string, 
    sourceImage: FileData | null, 
    referenceImage: FileData | null, 
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    const model = 'gemini-2.5-flash-image';
    
    const parts: any[] = [{ text: prompt }];
    if (sourceImage) parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });
    if (referenceImage) parts.push({ inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } });

    const payload = { 
        contents: [{ parts }],
        generationConfig: {
            candidateCount: 1
        }
    };

    const promises = Array.from({ length: numberOfImages }).map(() => 
        callGeminiProxy(model, payload).then(data => extractImagesFromResponse(data))
    );

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
    const model = 'gemini-2.5-flash-image';
    
    const parts: any[] = [
        { text: prompt },
        { inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } },
        { inlineData: { mimeType: maskImage.mimeType, data: maskImage.base64 } },
        { inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } }
    ];

    const payload = { 
        contents: [{ parts }],
        generationConfig: {
            candidateCount: 1
        }
    };

    const promises = Array.from({ length: numberOfImages }).map(() => 
        callGeminiProxy(model, payload).then(data => extractImagesFromResponse(data))
    );

    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
};

export const editImageWithMultipleReferences = async (
    prompt: string,
    sourceImage: FileData,
    referenceImages: FileData[],
    numberOfImages: number = 1
): Promise<{ imageUrl: string }[]> => {
    const model = 'gemini-2.5-flash-image';
    const parts: any[] = [{ text: prompt }];
    parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });
    
    referenceImages.forEach(ref => {
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
    });

    const payload = { 
        contents: [{ parts }],
        generationConfig: {
            candidateCount: 1
        }
    };
    const promises = Array.from({ length: numberOfImages }).map(() => 
        callGeminiProxy(model, payload).then(data => extractImagesFromResponse(data))
    );
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
    const model = 'gemini-2.5-flash-image';
    const parts: any[] = [{ text: prompt }];
    parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });
    parts.push({ inlineData: { mimeType: maskImage.mimeType, data: maskImage.base64 } });
    
    referenceImages.forEach(ref => {
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
    });

    const payload = { 
        contents: [{ parts }],
        generationConfig: {
            candidateCount: 1
        }
    };
    const promises = Array.from({ length: numberOfImages }).map(() => 
        callGeminiProxy(model, payload).then(data => extractImagesFromResponse(data))
    );
    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
}

// --- TEXT GENERATION FUNCTIONS ---

export const generateText = async (prompt: string): Promise<string> => {
    const model = 'gemini-2.5-flash';
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        // Text models DO support multiple candidates, but we only need 1 here.
        generationConfig: {
            candidateCount: 1
        }
    };
    
    const data = await callGeminiProxy(model, payload);
    return extractTextFromResponse(data);
};

export const generatePromptSuggestions = async (
    image: FileData, 
    subject: string, 
    count: number,
    customInstruction: string = ''
): Promise<Record<string, string[]> | null> => {
    const model = 'gemini-2.5-flash';
    
    const prompt = `Analyze this image and generate ${count} creative prompts for an AI image generator to create a similar architectural/interior style or view. 
    Focus on: ${subject === 'all' ? 'various aspects' : subject}. 
    ${customInstruction ? `Additional instruction: ${customInstruction}` : ''}
    
    Return the output strictly as a JSON object where keys are categories (e.g., "Lighting", "Composition", "Style") and values are arrays of prompt strings. Do not use Markdown code blocks.`;

    const payload = {
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType: image.mimeType, data: image.base64 } }
            ]
        }],
        generationConfig: { 
            responseMimeType: "application/json",
            candidateCount: 1
        }
    };

    const data = await callGeminiProxy(model, payload);
    const text = extractTextFromResponse(data);
    
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Failed to parse suggestion JSON", e);
        return null;
    }
};

export const enhancePrompt = async (userInput: string, image?: FileData): Promise<string> => {
    const model = 'gemini-2.5-flash';
    
    const parts: any[] = [{ text: `Act as an expert architectural prompt engineer. Enhance the following user input into a detailed, professional prompt suitable for high-quality AI rendering (like Midjourney or Gemini). Focus on lighting, materials, atmosphere, and camera specifications. \n\nUser Input: "${userInput}"` }];
    
    if (image) {
        parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
        parts[0].text += " \n\nAlso use the visual style of the attached image as a reference.";
    }

    const payload = { 
        contents: [{ parts }],
        generationConfig: {
            candidateCount: 1
        }
    };
    const data = await callGeminiProxy(model, payload);
    return extractTextFromResponse(data);
};

// --- VIDEO GENERATION (GOOGLE SOURCE) ---
export const generateVideo = async (prompt: string, startImage?: FileData, jobId?: string): Promise<string> => {
    const model = 'veo-3.1-fast-generate-preview'; 
    throw new Error("Please use the specialized Video Generation service (Veo 3) for this task.");
};

export const generateStagingImage = async (prompt: string, sceneImage: FileData, objectImages: FileData[], numberOfImages: number = 1): Promise<{ imageUrl: string }[]> => {
    const model = 'gemini-2.5-flash-image';
    const parts: any[] = [{ text: prompt }];
    parts.push({ inlineData: { mimeType: sceneImage.mimeType, data: sceneImage.base64 } });
    
    objectImages.forEach(obj => {
        parts.push({ inlineData: { mimeType: obj.mimeType, data: obj.base64 } });
    });

    const payload = { 
        contents: [{ parts }],
        generationConfig: {
            candidateCount: 1
        }
    };
    const promises = Array.from({ length: numberOfImages }).map(() => 
        callGeminiProxy(model, payload).then(data => extractImagesFromResponse(data))
    );
    const results = await Promise.all(promises);
    return results.flat().map(url => ({ imageUrl: url }));
};


// --- UTILS ---

const extractImagesFromResponse = (data: any): string[] => {
    const images: string[] = [];
    if (data?.candidates) {
        const candidate = data.candidates[0];
        
        // --- IMPROVED ERROR HANDLING FOR SAFETY/RECITATION ---
        if (candidate?.finishReason) {
            const reason = candidate.finishReason;
            if (reason === 'SAFETY') {
                throw new Error("Nội dung bị chặn bởi bộ lọc an toàn của Google (Safety Filter). Vui lòng tránh các từ khóa nhạy cảm hoặc hình ảnh không phù hợp.");
            }
            if (reason === 'RECITATION') {
                throw new Error("Nội dung bị chặn do vi phạm bản quyền hoặc giống dữ liệu được bảo vệ (Recitation check).");
            }
            if (reason === 'OTHER') {
                throw new Error("Mô hình từ chối xử lý yêu cầu này (Unknown/Other Reason). Vui lòng thử lại.");
            }
        }

        for (const candidate of data.candidates) {
            if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData) {
                        // Gemini returns raw base64, usually no prefix
                        // We assume PNG or JPEG based on header or default
                        images.push(`data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`);
                    }
                }
            }
        }
    }
    
    if (images.length === 0) {
        // Fallback: Check if it generated text instead (error message or refusal)
        const text = extractTextFromResponse(data);
        if (text) {
             // Often text contains "I cannot generate..."
             throw new Error(`AI từ chối tạo ảnh: ${text.substring(0, 150)}...`);
        }
        throw new Error("Không có ảnh nào được tạo ra. Vui lòng thử lại với mô tả khác.");
    }
    return images;
};

const extractTextFromResponse = (data: any): string => {
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
};
