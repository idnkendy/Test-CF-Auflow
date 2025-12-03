
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
    let message = error.message || "Lỗi kết nối không xác định";
    const lowerMsg = message.toLowerCase();
    
    // Create a custom error object to attach properties
    let customError: any = new Error(message);
    customError.isRetryable = false;

    // 1. Lỗi Quá Tải / Hết Quota (429)
    if (message.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('resource_exhausted')) {
        customError.message = "Hệ thống đang nhận quá nhiều yêu cầu. Vui lòng đợi 30 giây rồi thử lại.";
        customError.isRetryable = true;
        return customError;
    }
    
    // 2. Lỗi Server Google (500, 503)
    if (message.includes('503') || message.includes('500') || lowerMsg.includes('overloaded') || lowerMsg.includes('unavailable') || lowerMsg.includes('internal')) {
        customError.message = "Máy chủ AI đang quá tải. Vui lòng thử lại sau ít phút.";
        customError.isRetryable = true;
        return customError;
    }

    // 3. Lỗi Dữ Liệu Đầu Vào (400)
    if (message.includes('400') || lowerMsg.includes('invalid_argument') || lowerMsg.includes('bad request')) {
        customError.message = "Dữ liệu hình ảnh không hợp lệ hoặc mô tả quá dài. Vui lòng kiểm tra lại.";
        return customError;
    }

    // 4. Lỗi An Toàn (Safety)
    if (message.includes('SAFETY') || message.includes('blocked')) {
        customError.message = "Hệ thống an toàn của AI đã chặn yêu cầu này. Vui lòng tránh các từ khóa nhạy cảm hoặc hình ảnh không phù hợp.";
        return customError;
    }

    // 5. Lỗi Khu Vực (Geo-blocking)
    if (message.includes('User location is not supported') || lowerMsg.includes('location') || lowerMsg.includes('region') || message.includes('403')) {
        // Trigger global event for region blocking UI
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('gemini-region-blocked'));
        }
        customError.message = "Khu vực của bạn bị chặn IP. Vui lòng bật VPN.";
        return customError;
    }

    // 6. Lỗi API Key (401)
    if (message.includes('401') || lowerMsg.includes('api key')) {
        customError.message = "Lỗi xác thực API Key. Vui lòng liên hệ quản trị viên.";
        return customError;
    }

    // 7. Fallback: Làm sạch thông báo lỗi kĩ thuật
    try {
        if (message.startsWith('{') || message.includes('error')) {
             customError.message = "Đã xảy ra lỗi kỹ thuật khi xử lý ảnh. Vui lòng thử lại.";
        }
    } catch (e) {}

    return customError;
};

// --- PROXY CALLER ---
// Sends request to our own backend (/api) which then forwards to Google.
// API Key is injected on the backend, never exposed to client.
async function callGeminiProxy(model: string, payload: any): Promise<any> {
    // Smart Retry Strategy:
    // Try up to 60 times with 5s delay (Total ~5 minutes) for retryable errors (429/503).
    // For other errors, fail immediately.
    const MAX_ATTEMPTS = 60; 
    const DELAY_MS = 5000;
    const url = getProxyUrl();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
            const processedError = handleGeminiError(error);
            
            // Retry Logic
            if (processedError.isRetryable && attempt < MAX_ATTEMPTS) {
                console.warn(`[Gemini Proxy] Attempt ${attempt}/${MAX_ATTEMPTS} failed (System Busy). Retrying in ${DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                continue; 
            }

            // If not retryable or max attempts reached, throw the final error
            if (attempt === MAX_ATTEMPTS) {
                console.error(`[Gemini Proxy] Max retries reached (${MAX_ATTEMPTS}). Giving up.`);
                // Keep the last specific overload message
            }
            
            throw processedError;
        }
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

    // Parallel requests for multiple images
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
            switch (reason) {
                case 'SAFETY':
                    throw new Error("Hệ thống an toàn của AI đã chặn yêu cầu này. Vui lòng tránh các từ khóa nhạy cảm hoặc hình ảnh không phù hợp.");
                case 'RECITATION':
                    throw new Error("Nội dung bị chặn do vi phạm bản quyền hoặc giống dữ liệu được bảo vệ.");
                case 'BLOCKLIST':
                    throw new Error("Mô tả chứa các từ khóa bị cấm (Blocklist).");
                case 'PROHIBITED_CONTENT':
                    throw new Error("Nội dung bị cấm theo chính sách AI.");
                case 'SPII':
                    throw new Error("Nội dung chứa thông tin cá nhân nhạy cảm (SPII).");
                case 'OTHER':
                    break; 
            }
        }

        for (const candidate of data.candidates) {
            if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData) {
                        // Gemini returns raw base64, usually no prefix
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
             throw new Error(`AI từ chối tạo ảnh: ${text.substring(0, 150)}...`);
        }
        
        // Check top-level error (sometimes not in candidate)
        if (data?.error) {
             throw new Error(`Lỗi từ Google: ${data.error.message || 'Không xác định'}`);
        }

        throw new Error("Không có ảnh nào được tạo ra (No Output). Vui lòng thử lại với mô tả khác.");
    }
    return images;
};

const extractTextFromResponse = (data: any): string => {
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
};
