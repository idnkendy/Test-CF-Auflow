
import { GoogleGenAI } from "@google/genai";
import { FileData } from "../types";

const getGeminiApiKey = (): string => {
    // The API key must be obtained exclusively from the environment variable process.env.API_KEY
    return process.env.API_KEY || "";
};

export const getDynamicAIClient = async (): Promise<GoogleGenAI> => {
    const key = getGeminiApiKey();
    if (!key) throw new Error("API Key configuration missing");
    return new GoogleGenAI({ apiKey: key });
};

export const handleGeminiError = (error: any) => {
    console.error("Gemini Error:", error);
    if (error.toString().includes("SAFETY")) throw new Error("SAFETY_POLICY_VIOLATION");
    throw error;
};

export const retryOperation = async <T>(operation: () => Promise<T>, retries = 2): Promise<T> => {
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (e: any) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
    throw new Error("Retry failed");
};

export const getFileDataFromUrl = async (url: string): Promise<FileData> => {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const res = reader.result as string;
            resolve({
                base64: res.split(',')[1],
                mimeType: blob.type,
                objectURL: url
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export const processContentResponseAsync = async (response: any): Promise<string> => {
    if (!response.candidates || !response.candidates[0]) return "";
    
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            const base64 = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || "image/png";
            return `data:${mimeType};base64,${base64}`;
        }
    }
    return "";
};

// --- IMAGE GENERATION FUNCTIONS ---

export const generateStandardImage = async (prompt: string, aspectRatio: string, image?: FileData): Promise<string[]> => {
    const ai = await getDynamicAIClient();
    const model = 'gemini-2.5-flash-image';
    
    return retryOperation(async () => {
        try {
            const parts: any[] = [{ text: prompt }];
            if (image) {
                parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
            }
            
            const response = await ai.models.generateContent({
                model,
                contents: { parts },
                config: {
                    imageConfig: { aspectRatio: aspectRatio as any }
                }
            });
            const url = await processContentResponseAsync(response);
            return url ? [url] : [];
        } catch (e) {
            handleGeminiError(e);
            return [];
        }
    });
};

export const generateHighQualityImage = async (
    prompt: string, 
    aspectRatio: string, 
    resolution: string, 
    image?: FileData, 
    jobId?: string,
    additionalImages?: FileData[]
): Promise<string[]> => {
    const ai = await getDynamicAIClient();
    const model = 'gemini-3-pro-image-preview'; 
    
    let imageSize: "1K" | "2K" | "4K" = "1K";
    if (resolution === '2K') imageSize = "2K";
    if (resolution === '4K') imageSize = "4K";

    return retryOperation(async () => {
        try {
            const parts: any[] = [{ text: prompt }];
            if (image) {
                parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
            }
            if (additionalImages) {
                additionalImages.forEach(img => {
                    parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
                });
            }

            const response = await ai.models.generateContent({
                model,
                contents: { parts },
                config: {
                    imageConfig: { 
                        aspectRatio: aspectRatio as any,
                        imageSize: imageSize
                    }
                }
            });
            
            const url = await processContentResponseAsync(response);
            return url ? [url] : [];
        } catch (e) {
            handleGeminiError(e);
            return [];
        }
    });
};

export const editImage = async (prompt: string, image: FileData, count: number = 1): Promise<{ imageUrl: string }[]> => {
    const urls = await generateStandardImage(prompt, "1:1", image);
    return urls.map(u => ({ imageUrl: u }));
};

// --- TEXT GENERATION FUNCTIONS ---

export const generateText = async (prompt: string): Promise<string> => {
    const ai = await getDynamicAIClient();
    const model = 'gemini-3-flash-preview';
    
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

export const generateArchitecturalPrompt = async (image: FileData, lang: 'vi' | 'en' = 'vi'): Promise<string> => {
    const ai = await getDynamicAIClient();
    const model = 'gemini-2.0-flash-exp';
    
    let prompt = "";
    if (lang === 'vi') {
        prompt = `Phân tích hình ảnh kiến trúc này và tạo một mô tả ngắn gọn bằng tiếng Việt theo đúng cấu trúc sau: 'Biến thành ảnh chụp thực tế công trình [Loại công trình] + [Điểm nhấn: Vật liệu, màu sắc, chi tiết] + [Cảnh quan xung quanh] + [Thời gian/Thời tiết] + yêu cầu giữ nguyên góc nhìn ảnh ban đầu'.
        Ví dụ: 'Biến thành ảnh chụp thực tế công trình nhà phố hiện đại, tone màu trắng xám, ốp gỗ và kính, có cổng rào sắt, dây leo trên sân thượng, cảnh quan đường phố Việt Nam, thời gian ban ngày nắng đẹp, yêu cầu giữ nguyên góc nhìn ảnh ban đầu'.
        Chỉ trả về nội dung text, không thêm giải thích.`;
    } else {
        prompt = `Analyze this architectural image and create a concise description in English following this structure: 'Transform into a realistic photo of [Building Type] + [Highlights: Materials, colors, details] + [Surrounding landscape] + [Time/Weather] + maintain the original perspective'.
        Example: 'Transform into a realistic photo of a modern townhouse, white and gray tone, wood cladding and glass, iron gate, vines on the terrace, Vietnamese street landscape, sunny daytime, maintain the original perspective'.
        Return only the text content, no explanations.`;
    }

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
            return response.text?.trim() || "";
        } catch (e: any) {
            console.error("Failed to generate architectural prompt", e);
            throw e;
        }
    });
};

export const generateFloorPlanPrompt = async (
    image: FileData, 
    planType: 'exterior' | 'interior' = 'exterior',
    renderMode: 'top-down' | 'perspective' = 'top-down',
    lang: 'vi' | 'en' = 'vi'
): Promise<string> => {
    const ai = await getDynamicAIClient();
    const model = 'gemini-2.0-flash-exp';
    
    let prompt = "";
    const isVi = lang === 'vi';
    
    if (planType === 'interior') {
        if (renderMode === 'perspective') {
            if (isVi) {
                prompt = `Phân tích hình ảnh bản vẽ mặt bằng này và xác định luồng giao thông hoặc góc nhìn tiềm năng. Tạo một mô tả ngắn gọn bằng tiếng Việt theo cấu trúc sau: 'Góc nhìn 3D cận cảnh [Loại phòng] với góc nhìn từ [Vị trí bắt đầu/Chủ thể gần] nhìn sang [Vị trí kết thúc/Chủ thể xa]'.`;
            } else {
                prompt = `Analyze this floor plan image and identify traffic flow or potential angles. Create a concise description in English following this structure: '3D close-up view of [Room Type] from [Start Position/Near Subject] looking towards [End Position/Far Subject]'.`;
            }
        } else {
            if (isVi) {
                prompt = `Phân tích hình ảnh mặt bằng nội thất này và tạo một mô tả ngắn gọn bằng tiếng Việt theo đúng cấu trúc sau:
                'Biến thành ảnh chụp thực tế nội thất [Thể loại công trình] + [Điểm nhấn mặt bằng: phong cách thiết kế, mô tả các khu vực quan trọng, vật liệu, đồ nội thất] + yêu cầu bám sát chi tiết và góc nhìn của ảnh ban đầu'.`;
            } else {
                prompt = `Analyze this interior floor plan image and create a concise description in English following this structure:
                'Transform into realistic interior photo of [Building Type] + [Plan Highlights: design style, description of key areas, materials, furniture] + maintain exact details and perspective of original image'.`;
            }
        }
    } else {
        if (isVi) {
            prompt = `Phân tích hình ảnh mặt bằng/quy hoạch này và tạo một mô tả ngắn gọn bằng tiếng Việt theo đúng cấu trúc sau: 
            'Biến thành ảnh chụp thực tế dự án [Thể loại dự án] + [Các khu vực quan trọng: nhà ở, thương mại, vui chơi, cổng, hồ nước...] + [Cảnh quan xung quanh (phong cách Việt Nam)] + [Thời gian/Thời tiết] + yêu cầu bám sát chi tiết và góc nhìn của ảnh ban đầu'.`;
        } else {
             prompt = `Analyze this master plan/site plan image and create a concise description in English following this structure:
            'Transform into realistic project photo of [Project Type] + [Key Areas: residential, commercial, playground, entrance, water features...] + [Surrounding landscape] + [Time/Weather] + maintain exact details and perspective of original image'.`;
        }
    }
    
    prompt += isVi ? `\nChỉ trả về nội dung text, không thêm giải thích.` : `\nReturn only the text content, no explanations.`;

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
            return response.text?.trim() || "";
        } catch (e: any) {
            console.error("Failed to generate floor plan prompt", e);
            throw e;
        }
    });
};

export const generateInteriorPrompt = async (image: FileData, lang: 'vi' | 'en' = 'vi'): Promise<string> => {
    const ai = await getDynamicAIClient();
    const model = 'gemini-2.0-flash-exp';
    
    let prompt = "";
    if (lang === 'vi') {
        prompt = `Phân tích hình ảnh nội thất này và tạo một mô tả ngắn gọn bằng tiếng Việt theo đúng cấu trúc sau: 'Biến thành ảnh chụp thực tế [Loại công trình] với [Góc nhìn] + [Loại phòng] + [Phong cách thiết kế] + [Điểm nhấn nội thất: tone màu, vật liệu, trang trí...] + [Ánh sáng] + [Thời gian/Thời tiết]'.
        Ví dụ: 'Biến thành ảnh chụp thực tế nội thất nhà ở phòng khách hiện đại, sàn lát gạch màu tối, tủ gỗ óc chó, tone màu ấm, thời gian ban ngày nắng đẹp, có ánh sáng chiếu vào phòng'.
        Chỉ trả về nội dung text, không thêm giải thích.`;
    } else {
        prompt = `Analyze this interior image and create a concise description in English following this structure: 'Transform into a realistic photo of [Building Type] with [View Angle] + [Room Type] + [Design Style] + [Interior Highlights: color tone, materials, decoration...] + [Lighting] + [Time/Weather]'.
        Example: 'Transform into a realistic photo of a modern residential living room, dark tiled floor, walnut cabinets, warm tone, sunny daytime, light streaming into the room'.
        Return only the text content, no explanations.`;
    }

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
            return response.text?.trim() || "";
        } catch (e: any) {
            console.error("Failed to generate interior prompt", e);
            throw e;
        }
    });
};

export const generatePromptSuggestions = async (
    image: FileData, 
    subject: string, 
    count: number,
    customInstruction: string = '',
    lang: 'vi' | 'en' = 'vi'
): Promise<Record<string, string[]> | null> => {
    const ai = await getDynamicAIClient();
    const model = 'gemini-2.0-flash-exp';
    
    const isVi = lang === 'vi';
    
    const allCategoriesVi = [
        "Góc toàn cảnh", 
        "Góc trung cảnh", 
        "Góc lấy nét", 
        "Chi tiết kiến trúc"
    ];
    
    const allCategoriesEn = [
        "Wide Angle",
        "Medium Shot",
        "Focused Angle",
        "Architectural Details"
    ];

    const allCategories = isVi ? allCategoriesVi : allCategoriesEn;
    const langName = isVi ? "Vietnamese" : "English";

    let systemPrompt = "";

    if (subject === 'all') {
        systemPrompt = `Analyze the provided image and generate prompt suggestions for EACH of the following 4 categories: ${allCategories.join(', ')}. 
        For each category, provide exactly ${count} distinct prompts in ${langName}.`;
    } else {
        systemPrompt = `Analyze the provided image and generate exactly ${count} distinct prompt suggestions focusing specifically on the category: "${subject}". Provide prompts in ${langName}.`;
    }

    const fullPrompt = `${systemPrompt}
    ${customInstruction ? `Additional user requirement: ${customInstruction}` : ''}
    
    IMPORTANT FORMATTING RULES:
    1. Language: ${langName}.
    2. **Conciseness**: Each prompt must be short and impactful (approx 2-4 lines of text).
    3. **Structure**: Combine all details (lighting, angle, materials, mood) into **ONE single, coherent sentence** or a short paragraph. Do NOT use bullet points or lists within a suggestion.
    4. **Goal**: Create a prompt suitable for "View Sync" (consistent style transfer).

    RETURN FORMAT: Strictly a raw JSON object (no markdown, no code blocks).
    Keys must be the category names (exactly as listed above if 'all', or the specific subject name).
    Values must be arrays of strings (the prompts).
    `;

    return retryOperation(async () => {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: {
                    parts: [
                        { text: fullPrompt },
                        { inlineData: { mimeType: image.mimeType, data: image.base64 } }
                    ]
                },
                config: { 
                    responseMimeType: "application/json"
                }
            });

            const text = response.text || "{}";
            return JSON.parse(text);
        } catch (e: any) {
            console.error("Failed to generate/parse suggestions", e);
            return null; 
        }
    });
};

export const enhancePrompt = async (userInput: string, image?: FileData): Promise<string> => {
    const ai = await getDynamicAIClient();
    const model = 'gemini-2.0-flash-exp';
    
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

export const generateVideoPromptFromImage = async (image: FileData): Promise<string> => {
    const ai = await getDynamicAIClient();
    const model = 'gemini-2.0-flash-exp';
    
    const prompt = `Phân tích hình ảnh kiến trúc hoặc nội thất này. Hãy viết một prompt (lời nhắc) bằng Tiếng Việt thật chi tiết, đậm chất điện ảnh để tạo video ngắn từ hình ảnh này bằng AI. 
    Tập trung mô tả chuyển động camera, thay đổi ánh sáng, và các yếu tố khí quyển. Giữ prompt dưới 60 từ.
    QUAN TRỌNG: CHỈ TRẢ VỀ NỘI DUNG PROMPT BẰNG TIẾNG VIỆT.`;

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
            return response.text?.trim() || "Video kiến trúc điện ảnh with chuyển động camera chậm.";
        } catch (e: any) {
            console.error("Failed to generate video prompt from image", e);
            return "Video kiến trúc điện ảnh with chuyển động camera chậm.";
        }
    });
};
