
import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService'; // Flow Import
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { ViewSyncState } from '../state/toolState';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import AspectRatioSelector from './common/AspectRatioSelector';
import OptionSelector from './common/OptionSelector';
import ResolutionSelector from './common/ResolutionSelector';
import SafetyWarningModal from './common/SafetyWarningModal';
import ImagePreviewModal from './common/ImagePreviewModal';
import { useLanguage } from '../hooks/useLanguage';

interface ViewSyncProps {
    state: ViewSyncState;
    onStateChange: (newState: Partial<ViewSyncState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

const ViewSync: React.FC<ViewSyncProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const {
        sourceImage, directionImage, characterImage, isLoading, error, resultImages, numberOfImages, sceneType,
        aspectRatio, customPrompt, selectedPerspective, selectedAtmosphere,
        selectedFraming, selectedInteriorAngle, resolution,
        activeTab = 'sync', creativeOption = 'interior', creativeResults = {}
    } = state;

    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [upscaleWarning, setUpscaleWarning] = useState<string | null>(null);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    
    // NEW: State to track if we are in the selection screen or workspace
    const [isCreativeModeSelected, setIsCreativeModeSelected] = useState(false);
    
    // NEW: Track multiple generating views for Batch Mode
    const [generatingViews, setGeneratingViews] = useState<Set<string>>(new Set());

    // Sync latest results for async updates
    const latestResultsRef = useRef(creativeResults);
    useEffect(() => { latestResultsRef.current = creativeResults; }, [creativeResults]);

    // --- Translated Options ---
    const perspectiveAngles = useMemo(() => [
        { id: 'default', label: 'Default', promptClause: "the same general perspective as the source image" },
        { id: 'front', label: 'Front (Chính diện)', promptClause: "Straight-on front elevation view, symmetrical composition. Flat facade focusing on geometric shapes and materials." },
        { id: 'left-side', label: '3/4 Left (Trái)', promptClause: "a 3/4 perspective view from the front-left, showing depth and dimension of the building massing." },
        { id: 'right-side', label: '3/4 Right (Phải)', promptClause: "a 3/4 perspective view from the front-right, showing both the front and right facades" },
        { id: 'wide-frame', label: 'Wide Angle (Góc rộng)', promptClause: "Wide-angle shot capturing the building within its surrounding context and landscape. Spacious atmosphere, expanded field of view." },
        { id: 'panoramic', label: 'Panorama', promptClause: "Panoramic view, ultra-wide horizontal composition. Capturing the entire landscape and building context in a single frame. Cinematic wide shot." },
        { id: 'top-down', label: 'Top Down (Trên cao)', promptClause: "Aerial bird's-eye view looking down from above. Drone photography showing the roof plan, site layout, and surrounding environment. Masterplan visualization." },
        { id: 'low-angle', label: 'Low Angle (Ngước lên)', promptClause: "Low angle worm's-eye view looking up at the building. Imposing and majestic stature against the sky. Dramatic perspective emphasizing height." },
        { id: 'close-up', label: 'Close Up (Cận cảnh)', promptClause: "Macro close-up shot of architectural details. Focus on textures, materials, and intricate facade elements. Shallow depth of field, blurred background." },
    ], []);

    const atmosphericAngles = useMemo(() => [
        { id: 'default', label: 'Default', promptClause: "with standard daylight lighting" },
        { id: 'early-morning', label: 'Early Morning (Sáng sớm)', promptClause: "in the early morning, with soft, gentle sunrise light and long shadows" },
        { id: 'midday-sun', label: 'Midday Sun (Trưa nắng)', promptClause: "at midday under bright, direct sunlight with strong, short shadows" },
        { id: 'late-afternoon', label: 'Golden Hour (Chiều tà)', promptClause: "during the late afternoon (golden hour), with warm, orange-hued light and long, dramatic shadows" },
        { id: 'night', label: 'Night (Ban đêm)', promptClause: "at night, with interior and exterior lights turned on" },
        { id: 'rainy', label: 'Rainy (Mưa)', promptClause: "during a gentle rain, with wet surfaces and a slightly overcast sky" },
        { id: 'misty', label: 'Misty (Sương mù)', promptClause: "on a misty or foggy morning, creating a soft and mysterious atmosphere" },
        { id: 'after-rain', label: 'After Rain (Sau mưa)', promptClause: "just after a rain shower, with wet ground reflecting the sky and surroundings, and a sense of freshness in the air" },
    ], []);

    const framingAngles = useMemo(() => [
        { id: 'none', label: 'None', promptClause: "" },
        { id: 'through-trees', label: 'Through Trees', promptClause: "The building is seen through a foreground of trees or foliage, creating a natural framing effect." },
        { id: 'through-window', label: 'Through Window', promptClause: "The building is seen from inside a cozy cafe across the street, looking out through the cafe's large glass window, which creates a framing effect." },
        { id: 'through-flowers', label: 'Through Flowers', promptClause: "The building is viewed through a foreground of colorful flowers lining the roadside, creating a beautiful and soft framing effect." },
        { id: 'through-car-window', label: 'Through Car Window', promptClause: "The building is seen from the perspective of looking out from a car parked on the side of the road, with the car's window frame and side mirror creating a dynamic frame." },
    ], []);

    const interiorViewAngles = useMemo(() => [
        { id: 'default', label: 'Default', prompt: "Maintain the same camera perspective as the source image." },
        { id: 'wide-angle', label: 'Wide Angle (Góc rộng)', prompt: "Generate a wide-angle view of the interior space, capturing as much of the room as possible. Maintain the same design style, furniture, and materials as the uploaded image." },
        { id: 'from-corner', label: 'From Corner (Từ góc)', prompt: "Generate a view from a corner of the room, looking towards the center. Maintain the same design style, furniture, and materials as the uploaded image." },
        { id: 'detail-shot', label: 'Detail (Cận cảnh)', prompt: "Generate a close-up detail shot of a key furniture piece or decorative element. Maintain the same design style, furniture, and materials as the uploaded image." },
        { id: 'towards-window', label: 'Towards Window', prompt: "Generate a view from inside the room looking towards the main window, showing the natural light. Maintain the same design style, furniture, and materials as the uploaded image." },
        { id: 'night-view', label: 'Night View', prompt: "Generate a view of the interior space at night, with artificial lighting turned on (lamps, ceiling lights). Maintain the same design style, furniture, and materials as the uploaded image." },
        { id: 'top-down-interior', label: 'Top Down', prompt: "Generate a top-down view of the room's layout, similar to a 3D floor plan. Maintain the same design style, furniture, and materials as the uploaded image." },
    ], []);

    // --- Dynamic Creative Options ---
    const creativeOptions = useMemo(() => [
        { 
            id: 'interior', 
            label: t('sync.creative.opt.interior'), 
            icon: 'chair', 
            desc: t('sync.creative.opt.interior_desc'),
            longDesc: t('sync.creative.opt.interior_long')
        },
        { 
            id: 'architecture', 
            label: t('sync.creative.opt.arch'), 
            icon: 'apartment', 
            desc: t('sync.creative.opt.arch_desc'),
            longDesc: t('sync.creative.opt.arch_long')
        },
        { 
            id: 'interior-from-arch', 
            label: t('sync.creative.opt.int_from_arch'), 
            icon: 'foundation', 
            desc: t('sync.creative.opt.int_from_arch_desc'),
            longDesc: t('sync.creative.opt.int_from_arch_long')
        }
    ], [t]);

    // --- Dynamic Slots ---
    const interiorSlots = useMemo(() => [
        { name: t('sync.creative.slot.living_room'), icon: 'chair', action: 'sitting on sofa' },
        { name: t('sync.creative.slot.bedroom'), icon: 'bed', action: 'resting on bed' },
        { name: t('sync.creative.slot.kitchen'), icon: 'kitchen', action: 'preparing food' },
        { name: t('sync.creative.slot.dining'), icon: 'dining', action: 'sitting at dining table' },
        { name: t('sync.creative.slot.reading'), icon: 'menu_book', action: 'working at desk' },
        { name: t('sync.creative.slot.bathroom'), icon: 'bathtub', action: 'standing by mirror' },
        { name: t('sync.creative.slot.corridor'), icon: 'door_sliding', action: 'walking in corridor' },
        { name: t('sync.creative.slot.closeup'), icon: 'center_focus_strong', action: 'touching material' },
        { name: t('sync.creative.slot.balcony'), icon: 'deck', action: 'standing looking at view' }
    ], [t]);

    const architectureSlots = useMemo(() => [
        { name: t('sync.creative.slot.pano1'), sub: t('sync.creative.sub.sunrise'), icon: 'wb_twilight', promptDescription: "High-angle panoramic view, clear sunrise light with light mist." },
        { name: t('sync.creative.slot.pano2'), sub: t('sync.creative.sub.sunset'), icon: 'wb_sunny', promptDescription: "45-degree angle distant view, vibrant golden sunset sky background." },
        { name: t('sync.creative.slot.pano3'), sub: t('sync.creative.sub.birdseye'), icon: 'flight', promptDescription: "Bird's eye view from above, showing the entire site and landscape." },
        { name: t('sync.creative.slot.close1'), sub: t('sync.creative.sub.material'), icon: 'texture', promptDescription: "Close-up detailing surface materials: stone, wood, or metal textures." },
        { name: t('sync.creative.slot.close2'), sub: t('sync.creative.sub.structure'), icon: 'construction', promptDescription: "Close-up of structural details: joints, railings, or massing intersections." },
        { name: t('sync.creative.slot.close3'), sub: t('sync.creative.sub.entrance'), icon: 'door_front', promptDescription: "Close-up focused on the main entrance and lobby area." },
        { name: t('sync.creative.slot.close4'), sub: t('sync.creative.sub.corner'), icon: 'camera_alt', promptDescription: "Close-up of an architectural corner or landscape detail near the base." },
        { name: t('sync.creative.slot.art1'), sub: t('sync.creative.sub.bokeh'), icon: 'blur_on', promptDescription: "Artistic shot with blurred foreground (bokeh), deep focus on a specific detail." },
        { name: t('sync.creative.slot.art2'), sub: t('sync.creative.sub.night'), icon: 'nights_stay', promptDescription: "Dramatic night perspective, emphasizing light spilling from windows." }
    ], [t]);

    const getCostPerImage = () => {
        switch (resolution) {
            case 'Standard': return 5;
            case '1K': return 10;
            case '2K': return 20;
            case '4K': return 30;
            default: return 5;
        }
    };
    const unitCost = getCostPerImage(); 
    
    const slots = creativeOption === 'architecture' ? architectureSlots : interiorSlots;
    // Batch cost: 1 image per slot * unitCost
    const creativeTotalCost = slots.length * unitCost;

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
        // Nếu chuyển về Standard, xóa ảnh hướng dẫn (dù không còn UI vẽ nhưng vẫn clear state cho sạch)
        if (val === 'Standard') {
            onStateChange({ directionImage: null });
        }
    };

    const handleSelectCreativeOption = (optionId: string) => {
        onStateChange({ creativeOption: optionId as any });
        setIsCreativeModeSelected(true);
    };

    const handleBackToSelection = () => {
        setIsCreativeModeSelected(false);
    };

    const getResultKey = (option: string, slotName: string) => `${option}-${slotName}`;

    // --- STANDARD SYNC GENERATE ---
    const handleGenerate = async () => {
        const totalCost = numberOfImages * unitCost;
        if (onDeductCredits && userCredits < totalCost) {
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: `${t('common.insufficient')}. Cần ${totalCost} credits.` });
             }
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên một ảnh gốc để bắt đầu.' });
            return;
        }
        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));
        setUpscaleWarning(null);

        let logId: string | null = null;
        let jobId: string | null = null;

        // Use Flow for all resolutions
        const useFlow = true;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(totalCost, `Đồng bộ view (${numberOfImages} ảnh) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.ViewSync,
                    prompt: customPrompt || 'Synced view rendering',
                    cost: totalCost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const promptParts = [];
            const atmosphere = atmosphericAngles.find(a => a.id === selectedAtmosphere);
            const framing = framingAngles.find(f => f.id === selectedFraming);
            
            // Build Prompt based on Scene Type
            if (sceneType === 'interior') {
                const interiorAngle = interiorViewAngles.find(a => a.id === selectedInteriorAngle);
                if (interiorAngle && interiorAngle.id !== 'default') {
                    promptParts.push(interiorAngle.prompt);
                }
            } else {
                const perspective = perspectiveAngles.find(p => p.id === selectedPerspective);
                if (perspective && perspective.id !== 'default') {
                    promptParts.push(`${perspective.promptClause}`);
                }
            }

            if (framing && framing.id !== 'none') {
                promptParts.push(framing.promptClause);
            }

            if (atmosphere && atmosphere.id !== 'default') {
                promptParts.push(`Render it ${atmosphere.promptClause}`);
            }

            if (customPrompt) promptParts.push(customPrompt);
            
            // Base prompt construction
            let finalPrompt = "";
            if (promptParts.length > 0) {
                finalPrompt = `Based on the building design in the reference image, ${promptParts.join(', ')}.`;
            } else {
                finalPrompt = "Enhance the quality and clarity of this view. Maintain the exact same architectural style and content.";
            }
            
            finalPrompt += ` The image is based on the provided reference design, preserving all original architectural details and materials. Photorealistic architectural photography.`;

            let imageUrls: string[] = [];

            if (useFlow) {
                // --- FLOW LOGIC ---
                const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
                const collectedUrls: string[] = [];
                const inputImages: FileData[] = [sourceImage];
                if (directionImage) inputImages.push(directionImage);

                let lastError: any = null;

                const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                    try {
                        setStatusMessage(t('common.processing'));
                        const result = await externalVideoService.generateFlowImage(
                            finalPrompt,
                            inputImages,
                            aspectRatio, // Pass raw string
                            1,
                            modelName,
                            (msg) => setStatusMessage(t('common.processing'))
                        );

                        if (result.imageUrls && result.imageUrls.length > 0) {
                            let finalUrl = result.imageUrls[0];

                            // Upscale Check
                            const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                            if (shouldUpscale) {
                                setStatusMessage(resolution === '4K' ? 'Đang xử lý (Upscale 4K)...' : 'Đang xử lý (Upscale 2K)...');
                                try {
                                    const mediaId = result.mediaIds[0];
                                    if (mediaId) {
                                        const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                                        const upscaleRes = await externalVideoService.upscaleFlowImage(mediaId, result.projectId, targetRes, aspectRatio);
                                        if (upscaleRes?.imageUrl) finalUrl = upscaleRes.imageUrl;
                                    }
                                } catch (e: any) {
                                    throw new Error(`Lỗi Upscale: ${e.message}`);
                                }
                            }
                            
                            collectedUrls.push(finalUrl);
                            onStateChange({ resultImages: [...collectedUrls] });
                            
                            historyService.addToHistory({ 
                                tool: Tool.ViewSync, 
                                prompt: `Flow (${modelName}): ${finalPrompt}`, 
                                sourceImageURL: sourceImage.objectURL, 
                                resultImageURL: finalUrl 
                            });
                            
                            return finalUrl;
                        }
                        return null;
                    } catch (e: any) {
                        console.error(`Image ${index+1} failed`, e);
                        lastError = e;
                        return null;
                    }
                });

                const results = await Promise.all(promises);
                imageUrls = results.filter((url): url is string => url !== null);
                
                const failedCount = numberOfImages - imageUrls.length;

                if (imageUrls.length > 0) {
                    // Success (at least partial)
                    if (failedCount > 0 && logId && user) {
                        const refundAmount = failedCount * unitCost;
                        await refundCredits(user.id, refundAmount, `Hoàn tiền: ${failedCount} ảnh lỗi`, logId);
                        const errorMsg = t('msg.refund_success')
                            .replace('{success}', imageUrls.length.toString())
                            .replace('{total}', numberOfImages.toString())
                            .replace('{amount}', refundAmount.toString())
                            .replace('{failed}', failedCount.toString());
                        onStateChange({ error: errorMsg });
                    }
                } else {
                    // Total failure
                    if (lastError) throw lastError;
                    throw new Error("Không thể tạo ảnh nào. Vui lòng thử lại sau.");
                }

            } else {
                // Fallback logic if any
            }

            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);
            
        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                onStateChange({ error: t('msg.safety_violation') });
            } else {
                onStateChange({ error: friendlyMsg });
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                // Refund full amount on total failure caught here
                await refundCredits(user.id, totalCost, `Hoàn tiền: Lỗi đồng bộ view (${rawMsg})`, logId);
            }
            
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    // --- HELPER: Construct Prompt for Single/Batch Creative ---
    const getPromptForSlot = (slot: any) => {
        let fullPrompt = "";
        
        if (creativeOption === 'architecture') {
            const viewDescription = slot.promptDescription || slot.name;
            const charPrompt = characterImage 
                ? (language === 'vi' 
                    ? `THÊM NHÂN VẬT: Hãy đưa nhân vật trong ảnh thứ hai vào bối cảnh kiến trúc một cách tự nhiên (ví dụ: đang đi bộ trước sảnh, đứng ở ban công, hoặc đi dạo trong sân vườn). Đảm bảo trang phục và ngoại hình thống nhất với ảnh nhân vật.` 
                    : `ADD CHARACTER: Naturally integrate the character from the second image into the architectural context (e.g., walking in front of the lobby, standing on the balcony, or walking in the garden). Ensure consistent clothing and appearance with the character image.`)
                : "";

            if (language === 'vi') {
                fullPrompt = `Bạn là một Kiến trúc sư chuyên nghiệp. Bạn được cung cấp một hình ảnh mẫu kiến trúc đại diện cho 100% hình khối và chi tiết thực tế. Nhiệm vụ của bạn là vẽ lại một view kiến trúc cụ thể (cận cảnh hoặc nghệ thuật) từ công trình này.
YÊU CẦU BẮT BUỘC:
- GIỮ NGUYÊN 100% mọi chi tiết kiến trúc, hình khối, vật liệu và cấu trúc từ ảnh mẫu.
- TUYỆT ĐỐI KHÔNG vẽ thêm, không sáng tạo chi tiết mới, không thay đổi cấu kiện nếu không có trong ảnh gốc. Chỉ được phép lấy đúng những gì đang có trên công trình gốc để thể hiện.
- Đối với các view CẬN CẢNH và NGHỆ THUẬT: Bạn chỉ được phép tập trung vào những thành phần hiện hữu của công trình, không được phép nội suy hay sử dụng chi tiết lạ.
- Bạn chỉ được phép thay đổi góc máy, tiêu cự ống kính, và điều kiện ánh sáng để tạo ra bức ảnh nhiếp ảnh kiến trúc chuyên nghiệp.
- VIEW CẦN TẠO: "${viewDescription}".
${charPrompt}
Kết quả phải là một ảnh chụp thực tế, 8k, sắc nét tuyệt đối.`;
            } else {
                 fullPrompt = `You are a professional Architect. You are provided with an architectural sample image representing 100% of the actual massing and details. Your task is to redraw a specific architectural view (close-up or artistic) from this building.
MANDATORY REQUIREMENTS:
- KEEP 100% of all architectural details, massing, materials, and structure from the sample image.
- ABSOLUTELY DO NOT add, invent new details, or change components if they are not in the original image. You are only allowed to depict what is currently on the original building.
- For CLOSE-UP and ARTISTIC views: You are only allowed to focus on existing components of the building, no interpolation or use of strange details.
- You are only allowed to change camera angle, lens focal length, and lighting conditions to create a professional architectural photograph.
- VIEW TO GENERATE: "${viewDescription}".
${charPrompt}
The result must be a photorealistic, 8k, absolutely sharp image.`;
            }

        } else if (creativeOption === 'interior-from-arch') {
            const viewName = slot.name;
            const charPrompt = characterImage 
                ? (language === 'vi' ? "Có thêm nhân vật đang sinh hoạt trong không gian." : "Include a character active in the space.")
                : "";

            if (language === 'vi') {
                fullPrompt = `Bạn là một Kiến trúc sư và Nhà thiết kế nội thất tài ba. Bạn được cung cấp một hình ảnh NGOẠI THẤT của một công trình kiến trúc. Nhiệm vụ của bạn là thiết kế và vẽ ra không gian NỘI THẤT bên trong công trình đó.
YÊU CẦU BẮT BUỘC:
- PHONG CÁCH: Nội thất phải hoàn toàn đồng nhất với phong cách kiến trúc ngoại thất (ví dụ: nếu kiến trúc hiện đại tối giản thì nội thất cũng phải hiện đại tối giản).
- HỆ CỬA SỔ: Nếu không gian có cửa sổ, kiểu dáng khung cửa, vật liệu và tỷ lệ của cửa sổ PHẢI giống hệt với hệ cửa sổ thấy được ở mặt tiền kiến trúc trong ảnh gốc.
- VẬT LIỆU: Sử dụng bảng vật liệu và màu sắc tương đồng với ngoại thất để tạo sự xuyên suốt.
- KHÔNG GIAN CẦN TẠO: "${viewName}".
${charPrompt}
Kết quả là một bức ảnh chụp nhiếp ảnh nội thất chuyên nghiệp, 8k, ánh sáng ban ngày tự nhiên cực kỳ chân thực.`;
            } else {
                 fullPrompt = `You are a talented Architect and Interior Designer. You are provided with an EXTERIOR image of an architectural building. Your task is to design and draw the INTERIOR space inside that building.
MANDATORY REQUIREMENTS:
- STYLE: The interior must be completely consistent with the exterior architectural style (e.g., if the architecture is modern minimalist, the interior must also be modern minimalist).
- WINDOW SYSTEM: If the space has windows, the style of the window frames, materials, and proportions MUST be identical to the window system visible on the architectural facade in the original image.
- MATERIALS: Use a material and color palette similar to the exterior to create continuity.
- SPACE TO GENERATE: "${viewName}".
${charPrompt}
The result is a professional interior photograph, 8k, extremely realistic natural daylight.`;
            }

        } else {
            // Existing Interior Logic
            const action = slot.action || "active in the space";
            let charPrompt = "";
            if (characterImage) {
                if (language === 'vi') {
                     charPrompt = `THÊM NHÂN VẬT: Hãy đưa nhân vật trong ảnh thứ hai vào không gian một cách tự nhiên. Nhân vật nên ${action}. Đảm bảo trang phục và ngoại hình của nhân vật thống nhất với ảnh nhân vật được cung cấp.`;
                } else {
                     charPrompt = `ADD CHARACTER: Naturally integrate the character from the second image into the space. The character should be ${action}. Ensure consistent clothing and appearance with the provided character image.`;
                }
            }
            
            if (language === 'vi') {
                fullPrompt = `Bạn là một Kiến trúc sư nội thất chuyên nghiệp. Bạn được cung cấp một hình ảnh mẫu đại diện cho style, màu sắc và vật liệu. Nhiệm vụ của bạn là tưởng tượng và vẽ ra một không gian khác trong cùng ngôi nhà đó.
YÊU CẦU BẮT BUỘC:
- GIỮ NGUYÊN Style thiết kế (ví dụ: Japandi, Industrial, Tân cổ điển...).
- GIỮ NGUYÊN Bảng màu chủ đạo (ví dụ: Gỗ óc chó + Da bò + Xám bê tông).
- GIỮ NGUYÊN Tính chất vật liệu (độ bóng, độ nhám, vân gỗ).
- KHÔNG GIAN CẦN TẠO: "${slot.name}".
${charPrompt}
Hãy vẽ một bức ảnh chụp nhiếp ảnh kiến trúc chuyên nghiệp, thực tế, 8k, ánh sáng ban ngày tự nhiên dịu nhẹ.`;
            } else {
                fullPrompt = `You are a professional Interior Architect. You are provided with a sample image representing style, color, and materials. Your task is to imagine and draw another space in the same house.
MANDATORY REQUIREMENTS:
- KEEP the design style (e.g., Japandi, Industrial, Neoclassical...).
- KEEP the dominant color palette (e.g., Walnut wood + Cowhide + Concrete gray).
- KEEP material properties (gloss, roughness, wood grain).
- SPACE TO GENERATE: "${slot.name}".
${charPrompt}
Draw a professional architectural photograph, realistic, 8k, soft natural daylight.`;
            }
        }
        
        return fullPrompt;
    };

    // --- NEW: HANDLE SINGLE VIEW GENERATION ---
    const handleGenerateSingleView = async (slot: any) => {
        if (onDeductCredits && userCredits < unitCost) {
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: `${t('common.insufficient')}. Cần ${unitCost} credits.` });
             }
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên ảnh gốc.' });
            return;
        }

        const uniqueKey = getResultKey(creativeOption, slot.name);
        setGeneratingViews(prev => new Set(prev).add(uniqueKey));
        onStateChange({ error: null });

        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(unitCost, `Creative View: ${slot.name} (${resolution})`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.ViewSync,
                    prompt: `Creative View: ${slot.name}`,
                    cost: unitCost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const inputImages = [sourceImage];
            if (characterImage) inputImages.push(characterImage);

            const fullPrompt = getPromptForSlot(slot);

            const result = await externalVideoService.generateFlowImage(
                fullPrompt,
                inputImages,
                aspectRatio,
                1,
                modelName
            );

            if (result.imageUrls && result.imageUrls.length > 0) {
                let finalUrl = result.imageUrls[0];
                
                // Upscale Check
                const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                if (shouldUpscale) {
                     try {
                        const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                        const upscaleRes = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                        if (upscaleRes?.imageUrl) finalUrl = upscaleRes.imageUrl;
                    } catch (e) { console.error("Upscale failed", e); }
                }

                // Update results
                const currentResults = latestResultsRef.current || {};
                const newResults = { ...currentResults, [uniqueKey]: finalUrl };
                onStateChange({ creativeResults: newResults });
                
                if (jobId) await jobService.updateJobStatus(jobId, 'completed', finalUrl);

                historyService.addToHistory({ 
                    tool: Tool.ViewSync, 
                    prompt: `Creative: ${slot.name}`, 
                    sourceImageURL: sourceImage.objectURL, 
                    resultImageURL: finalUrl 
                });
            } else {
                throw new Error("Không thể tạo ảnh.");
            }

        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                onStateChange({ error: t('msg.safety_violation') });
            } else {
                onStateChange({ error: friendlyMsg });
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                await refundCredits(user.id, unitCost, `Hoàn tiền: Lỗi view ${slot.name} (${rawMsg})`, logId);
            }
            
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        } finally {
            setGeneratingViews(prev => {
                const next = new Set(prev);
                next.delete(uniqueKey);
                return next;
            });
        }
    };

    // --- CREATIVE BATCH GENERATION ---
    const handleGenerateBatch = async () => {
        if (onDeductCredits && userCredits < creativeTotalCost) {
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: `${t('common.insufficient')}. Cần ${creativeTotalCost} credits.` });
             }
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên ảnh gốc.' });
            return;
        }

        // Initialize loading state for all slots using unique keys
        const allViewKeys = new Set(slots.map(s => getResultKey(creativeOption, s.name)));
        setGeneratingViews(allViewKeys);
        onStateChange({ error: null });

        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(creativeTotalCost, `Creative Batch: ${slots.length} views (${resolution})`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.ViewSync,
                    prompt: `Batch Generation: ${slots.length} views`,
                    cost: creativeTotalCost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const inputImages = [sourceImage];
            if (characterImage) inputImages.push(characterImage);

            let lastError: any = null;

            // Execute in parallel
            const promises = slots.map(async (slot) => {
                const uniqueKey = getResultKey(creativeOption, slot.name);
                try {
                    const fullPrompt = getPromptForSlot(slot);

                    const result = await externalVideoService.generateFlowImage(
                        fullPrompt,
                        inputImages,
                        aspectRatio,
                        1, // 1 image per slot
                        modelName
                    );

                    if (result.imageUrls && result.imageUrls.length > 0) {
                        let finalUrl = result.imageUrls[0];
                        // Upscale Check
                        const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                        if (shouldUpscale) {
                             try {
                                const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                                const upscaleRes = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                                if (upscaleRes?.imageUrl) finalUrl = upscaleRes.imageUrl;
                            } catch (e) { console.error("Upscale failed", e); }
                        }

                        // Use Ref to access latest results state without closure staleness
                        const currentResults = latestResultsRef.current || {};
                        const newResults = { ...currentResults, [uniqueKey]: finalUrl };
                        onStateChange({ creativeResults: newResults });
                        
                        historyService.addToHistory({ 
                            tool: Tool.ViewSync, 
                            prompt: `Creative: ${slot.name}`, 
                            sourceImageURL: sourceImage.objectURL, 
                            resultImageURL: finalUrl 
                        });
                        return true; // Success
                    }
                    return false; // Failed
                } catch (err) {
                    console.error(`Error generating view ${slot.name}:`, err);
                    lastError = err;
                    return false; // Failed
                } finally {
                    setGeneratingViews(prev => {
                        const next = new Set(prev);
                        next.delete(uniqueKey);
                        return next;
                    });
                }
            });

            const results = await Promise.all(promises);
            const successfulCount = results.filter(r => r).length;
            const failedCount = slots.length - successfulCount;

            if (successfulCount > 0) {
                if (jobId) await jobService.updateJobStatus(jobId, 'completed');
                
                // Partial refund for Creative Batch
                if (failedCount > 0 && logId && user) {
                    const refundAmount = failedCount * unitCost;
                    await refundCredits(user.id, refundAmount, `Hoàn tiền: ${failedCount} view lỗi (Creative Batch)`, logId);
                    const errorMsg = t('msg.refund_success')
                        .replace('{success}', successfulCount.toString())
                        .replace('{total}', slots.length.toString())
                        .replace('{amount}', refundAmount.toString())
                        .replace('{failed}', failedCount.toString());
                    onStateChange({ error: errorMsg });
                }
            } else {
                 if (lastError) throw lastError;
                 throw new Error("Không thể tạo ảnh nào sau nhiều lần thử.");
            }

        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                onStateChange({ error: t('msg.safety_violation') });
            } else {
                onStateChange({ error: friendlyMsg });
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                await refundCredits(user.id, creativeTotalCost, `Hoàn tiền: Lỗi sáng tạo view (${rawMsg})`, logId);
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
            setGeneratingViews(new Set()); // Clear all loading
        }
    };
    
    const handleFileSelect = (fileData: FileData | null) => onStateChange({ sourceImage: fileData, resultImages: [], directionImage: null });
    const handleCharacterSelect = (fileData: FileData | null) => onStateChange({ characterImage: fileData });

    const handleDownload = async (url: string, name: string) => {
        setIsDownloading(true);
        await externalVideoService.forceDownload(url, `creative-view-${name}-${Date.now()}.png`);
        setIsDownloading(false);
    };

    // --- NEW: HANDLE DOWNLOAD ALL FOR CREATIVE VIEW ---
    const handleDownloadAllCreative = async () => {
        // Filter results specific to current mode to avoid downloading irrelevant cached images
        const currentModeKeys = slots.map(s => getResultKey(creativeOption, s.name));
        const urls = currentModeKeys.map(k => creativeResults[k]).filter(Boolean);
        
        if (urls.length === 0) return;
        
        setIsDownloading(true);
        for (const slot of slots) {
            const key = getResultKey(creativeOption, slot.name);
            const url = creativeResults[key];
            if (url) {
                await externalVideoService.forceDownload(url, `creative-${slot.name}-${Date.now()}.png`);
                // Add slight delay to prevent browser throttling downloads
                await new Promise(r => setTimeout(r, 800)); 
            }
        }
        setIsDownloading(false);
    };

    // --- NEW: HANDLE PREVIEW ZOOM WITH SCROLL TO TOP ---
    const handlePreview = (url: string) => {
        setPreviewImage(url);
        // Scroll main viewport to top for better modal experience if needed, 
        // though the new Portal Modal fixes the overlay issue regardless.
        // But requested by user:
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const main = document.querySelector('main');
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const selectedOptionData = creativeOptions.find(o => o.id === creativeOption);
    const hasCreativeResults = slots.some(s => !!creativeResults[getResultKey(creativeOption, s.name)]);

    return (
        <div>
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            {/* Tab Navigation */}
            <div className="flex justify-center mb-8">
                <div className="bg-gray-100 dark:bg-black/30 p-1 rounded-full inline-flex border border-gray-200 dark:border-white/10">
                    <button 
                        onClick={() => onStateChange({ activeTab: 'sync' })}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                            activeTab === 'sync' || !activeTab 
                                ? 'bg-white dark:bg-[#7f13ec] text-black dark:text-white shadow-sm' 
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                    >
                        {t('sync.tab.sync')}
                    </button>
                    <button 
                        onClick={() => onStateChange({ activeTab: 'creative' })}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                            activeTab === 'creative' 
                                ? 'bg-white dark:bg-[#7f13ec] text-black dark:text-white shadow-sm' 
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                    >
                        {t('sync.tab.creative')}
                    </button>
                </div>
            </div>

            {/* --- STANDARD SYNC VIEW --- */}
            {(activeTab === 'sync' || !activeTab) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                    <div className="space-y-4">
                        <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                            <label className="block text-sm font-medium mb-2">{t('sync.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                        <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700 space-y-4">
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('sync.step2')}</label>
                            
                            {/* Scene Type Switcher */}
                            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl mb-4">
                                <button 
                                    onClick={() => onStateChange({ sceneType: 'exterior' })}
                                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                        sceneType === 'exterior' || !sceneType 
                                            ? 'bg-white dark:bg-gray-600 shadow text-text-primary dark:text-white' 
                                            : 'text-text-secondary dark:text-gray-400 hover:text-text-primary'
                                    }`}
                                >
                                    {t('sync.scene.ext')}
                                </button>
                                <button 
                                    onClick={() => onStateChange({ sceneType: 'interior' })}
                                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                        sceneType === 'interior' 
                                            ? 'bg-white dark:bg-gray-600 shadow text-text-primary dark:text-white' 
                                            : 'text-text-secondary dark:text-gray-400 hover:text-text-primary'
                                    }`}
                                >
                                    {t('sync.scene.int')}
                                </button>
                            </div>

                            {/* Dynamic Angle Selector based on Scene Type */}
                            {(sceneType === 'exterior' || !sceneType) ? (
                                <OptionSelector 
                                    id="perspective" 
                                    label={t('sync.angle.ext')}
                                    options={perspectiveAngles.map(a => ({ value: a.id, label: a.label }))} 
                                    value={selectedPerspective} 
                                    onChange={(val) => onStateChange({ selectedPerspective: val })} 
                                    variant="grid" 
                                    disabled={!!directionImage || isLoading} 
                                />
                            ) : (
                                <OptionSelector 
                                    id="interior-angle" 
                                    label={t('sync.angle.int')} 
                                    options={interiorViewAngles.map(a => ({ value: a.id, label: a.label }))} 
                                    value={selectedInteriorAngle} 
                                    onChange={(val) => onStateChange({ selectedInteriorAngle: val })} 
                                    variant="grid" 
                                    disabled={!!directionImage || isLoading} 
                                />
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <OptionSelector 
                                    id="framing" 
                                    label={t('sync.framing')} 
                                    options={framingAngles.map(a => ({ value: a.id, label: a.label }))} 
                                    value={selectedFraming} 
                                    onChange={(val) => onStateChange({ selectedFraming: val })} 
                                    variant="select" 
                                    disabled={isLoading} 
                                />
                                <OptionSelector 
                                    id="atmosphere" 
                                    label={t('sync.atmosphere')} 
                                    options={atmosphericAngles.map(a => ({ value: a.id, label: a.label }))} 
                                    value={selectedAtmosphere} 
                                    onChange={(val) => onStateChange({ selectedAtmosphere: val })} 
                                    variant="select" 
                                    disabled={isLoading} 
                                />
                            </div>

                            <textarea 
                                rows={3} 
                                className="w-full bg-surface dark:bg-gray-700/50 border rounded-lg p-3 text-sm focus:ring-2 focus:ring-accent outline-none transition-all" 
                                placeholder={t('sync.prompt_placeholder')}
                                value={customPrompt} 
                                onChange={(e) => onStateChange({ customPrompt: e.target.value })} 
                            />
                            
                            <div className="grid grid-cols-2 gap-4">
                                <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                                <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} />
                            </div>
                            <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                            
                            <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mb-1 border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                                    <span className="material-symbols-outlined text-yellow-500 text-sm">monetization_on</span>
                                    <span>{t('common.cost')}: <span className="font-bold text-text-primary dark:text-white">{unitCost * numberOfImages} Credits</span></span>
                                </div>
                                <div className="text-xs">
                                    {userCredits < unitCost * numberOfImages ? (
                                        <span className="text-red-500 font-semibold">{t('common.insufficient')}</span>
                                    ) : (
                                        <span className="text-green-600 dark:text-green-400">{t('common.available')}: {userCredits}</span>
                                    )}
                                </div>
                            </div>

                            <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2 shadow-lg">
                                {isLoading ? <><Spinner /> {statusMessage || t('common.processing')}</> : t('sync.btn_generate')}
                            </button>
                            {upscaleWarning && <p className="mt-2 text-xs text-yellow-500 text-center">{upscaleWarning}</p>}
                        </div>
                    </div>
                    <div className="aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                        {isLoading ? (
                            <div className="flex flex-col items-center">
                                <Spinner />
                                <p className="mt-2 text-text-secondary dark:text-gray-400">{statusMessage || t('common.processing')}</p>
                            </div>
                        ) : resultImages.length > 0 ? <ResultGrid images={resultImages} toolName="view-sync" /> : <p className="text-gray-400">{t('msg.no_result_render')}</p>}
                    </div>
                </div>
            )}

            {/* --- CREATIVE VIEW (NEW FLOW) --- */}
            {activeTab === 'creative' && !isCreativeModeSelected && (
                // SELECTION SCREEN
                <div className="flex flex-col gap-8 animate-fade-in py-4">
                    <div className="text-center max-w-2xl mx-auto">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('sync.creative.title')}</h2>
                        <p className="text-gray-500 dark:text-gray-400">{t('sync.creative.desc')}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {creativeOptions.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => handleSelectCreativeOption(opt.id)}
                                className="group relative bg-white dark:bg-[#1E1E1E] rounded-2xl p-6 border border-gray-200 dark:border-[#302839] hover:border-[#7f13ec] dark:hover:border-[#7f13ec] transition-all duration-300 shadow-sm hover:shadow-xl text-left flex flex-col gap-4 h-full"
                            >
                                <div className="w-14 h-14 rounded-xl bg-gray-50 dark:bg-[#252525] group-hover:bg-[#7f13ec]/10 flex items-center justify-center transition-colors">
                                    <span className="material-symbols-outlined text-3xl text-gray-600 dark:text-gray-400 group-hover:text-[#7f13ec]">{opt.icon}</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 group-hover:text-[#7f13ec] transition-colors">{opt.label}</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{opt.longDesc || opt.desc}</p>
                                </div>
                                <div className="mt-auto pt-4 flex items-center text-sm font-semibold text-[#7f13ec] opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                                    {t('sync.creative.btn_start')} <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'creative' && isCreativeModeSelected && (
                // WORKSPACE SCREEN
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
                    {/* LEFT SIDEBAR: CONTROLS */}
                    <div className="lg:col-span-4 flex flex-col gap-6">
                        
                        {/* 1. Back Button & Mode Info */}
                        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-[#302839]">
                            <button 
                                onClick={handleBackToSelection}
                                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-4 transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">arrow_back</span>
                                {t('sync.workspace.back')}
                            </button>
                            
                            <div className="flex items-center gap-3 p-3 bg-[#7f13ec]/5 dark:bg-[#7f13ec]/10 rounded-xl border border-[#7f13ec]/20">
                                <div className="p-2 rounded-lg bg-[#7f13ec] text-white">
                                    <span className="material-symbols-outlined text-xl">
                                        {selectedOptionData?.icon || 'auto_awesome'}
                                    </span>
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-[#7f13ec] dark:text-[#a855f7]">
                                        {selectedOptionData?.label}
                                    </div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                        {selectedOptionData?.desc}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Upload & Settings */}
                        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-[#302839] space-y-6">
                            <div>
                                <label className="flex justify-between items-center text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                                    <span>{t('sync.workspace.source')}</span>
                                    {sourceImage && <span className="text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">OK</span>}
                                </label>
                                <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-black/20 overflow-hidden">
                                    <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                                </div>
                            </div>
                            
                            <div>
                                <label className="flex justify-between items-center text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                                    <span>{t('sync.workspace.char')}</span>
                                    {characterImage && <span className="text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">OK</span>}
                                </label>
                                <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-black/20 overflow-hidden">
                                    <ImageUpload onFileSelect={handleCharacterSelect} previewUrl={characterImage?.objectURL} id="char-upload" />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1.5 px-1">
                                    {t('sync.workspace.char_hint')}
                                </p>
                            </div>

                            <div className="pt-4 border-t border-gray-100 dark:border-[#302839]">
                                {/* No NumberOfImagesSelector for Creative Batch (Implicitly all slots) */}
                                <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} disabled={generatingViews.size > 0} />
                            </div>
                            
                            <div>
                                <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={generatingViews.size > 0} />
                            </div>

                            <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mb-1 border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                                    <span className="material-symbols-outlined text-yellow-500 text-sm">monetization_on</span>
                                    <span>{t('common.cost')}: <span className="font-bold text-text-primary dark:text-white">{creativeTotalCost} Credits</span></span>
                                </div>
                                <div className="text-xs">
                                    {userCredits < creativeTotalCost ? (
                                        <span className="text-red-500 font-semibold">{t('common.insufficient')}</span>
                                    ) : (
                                        <span className="text-green-600 dark:text-green-400">{t('common.available')}</span>
                                    )}
                                </div>
                            </div>

                            <button 
                                onClick={handleGenerateBatch} 
                                disabled={generatingViews.size > 0 || !sourceImage} 
                                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2 shadow-lg"
                            >
                                {generatingViews.size > 0 ? <><Spinner /> {generatingViews.size}...</> : t('sync.workspace.btn_generate_batch').replace('{count}', slots.length.toString())}
                            </button>
                        </div>
                    </div>

                    {/* RIGHT GRID: WORKSPACE */}
                    <div className="lg:col-span-8">
                        {/* Header for Results */}
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('sync.workspace.result_title')}</h3>
                            
                            {/* BULK DOWNLOAD BUTTON */}
                            {hasCreativeResults && (
                                <button 
                                    onClick={handleDownloadAllCreative}
                                    disabled={isDownloading}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200 rounded-lg text-sm font-bold transition-all shadow-md disabled:opacity-50"
                                >
                                    {isDownloading ? <Spinner /> : <span className="material-symbols-outlined text-lg">download_for_offline</span>}
                                    <span>{t('sync.workspace.download_all')} ({Object.values(creativeResults).filter(Boolean).length})</span>
                                </button>
                            )}
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400 rounded-xl text-sm flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">error</span>
                                {error}
                            </div>
                        )}
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {slots.map((slot, index) => {
                                const key = getResultKey(creativeOption, slot.name);
                                const resultUrl = creativeResults[key];
                                const isGenerating = generatingViews.has(key);

                                return (
                                    <div 
                                        key={index} 
                                        className="group relative bg-[#1E1E1E] rounded-2xl overflow-hidden border border-[#302839] hover:border-gray-500 transition-all duration-300 shadow-lg h-full flex flex-col"
                                    >
                                        {/* Image Area */}
                                        <div className="aspect-square relative w-full bg-black/40 overflow-hidden">
                                            {resultUrl ? (
                                                <>
                                                    <img 
                                                        src={resultUrl} 
                                                        alt={slot.name} 
                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer" 
                                                        onClick={() => handlePreview(resultUrl)}
                                                    />
                                                    {/* Hover Overlay */}
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-sm pointer-events-none">
                                                        <div className="flex gap-2 pointer-events-auto">
                                                            <button 
                                                                onClick={() => handlePreview(resultUrl)}
                                                                className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-transform hover:scale-110"
                                                                title="Xem chi tiết (Zoom)"
                                                            >
                                                                <span className="material-symbols-outlined">zoom_in</span>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDownload(resultUrl, slot.name)}
                                                                className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-transform hover:scale-110"
                                                                title="Tải xuống"
                                                            >
                                                                <span className="material-symbols-outlined">download</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : isGenerating ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#151515]">
                                                    {/* Shimmer Effect */}
                                                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
                                                    <Spinner />
                                                    <span className="text-xs font-bold text-gray-400 mt-3 animate-pulse uppercase tracking-wider">{t('sync.workspace.generating')}</span>
                                                </div>
                                            ) : (
                                                // Empty State
                                                <div className="w-full h-full flex flex-col items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed opacity-50">
                                                    <div className="w-16 h-16 rounded-full bg-[#252525] flex items-center justify-center mb-2 shadow-inner border border-[#333]">
                                                        <span className="material-symbols-outlined text-3xl text-gray-600">{slot.icon}</span>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {/* Slot Label (Always Visible) */}
                                            <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="text-sm font-bold text-white text-shadow-sm">{slot.name}</h4>
                                                        {/* @ts-ignore */}
                                                        {slot.sub && <p className="text-[10px] text-gray-300 font-medium">{slot.sub}</p>}
                                                    </div>
                                                    {resultUrl && (
                                                        <span className="material-symbols-outlined text-green-400 text-sm bg-green-900/50 rounded-full p-0.5">check</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Added Footer Section: Cost & Single Action */}
                                        <div className="p-3 border-t border-[#302839] bg-[#252525] flex flex-col gap-2">
                                            <div className="flex justify-between items-center text-[10px] font-medium text-gray-400">
                                                <span>{t('sync.workspace.cost')}</span>
                                                <div className="flex items-center gap-1 text-yellow-500">
                                                    <span className="material-symbols-outlined text-xs">monetization_on</span>
                                                    {unitCost} Credits
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleGenerateSingleView(slot)}
                                                disabled={isGenerating || !sourceImage}
                                                className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 ${
                                                    isGenerating || !sourceImage
                                                        ? 'bg-[#333] text-gray-500 cursor-not-allowed'
                                                        : resultUrl 
                                                            ? 'bg-[#333] hover:bg-[#404040] text-gray-300 border border-[#404040]' 
                                                            : 'bg-[#7f13ec] hover:bg-[#690fca] text-white hover:shadow-purple-500/20'
                                                }`}
                                            >
                                                {isGenerating ? <Spinner /> : <span className="material-symbols-outlined text-sm">{resultUrl ? 'refresh' : 'auto_fix_high'}</span>}
                                                <span>{isGenerating ? t('sync.workspace.generating') : (resultUrl ? t('sync.workspace.regenerate') : t('sync.workspace.generate'))}</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ViewSync;
