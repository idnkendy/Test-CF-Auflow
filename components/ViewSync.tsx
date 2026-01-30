
import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
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
import ImageComparator from './ImageComparator';
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
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    // Track if we are in the selection screen or workspace for Creative tab
    const [isCreativeModeSelected, setIsCreativeModeSelected] = useState(false);
    
    // Track multiple generating views for Batch Mode
    const [generatingViews, setGeneratingViews] = useState<Set<string>>(new Set());

    // Sync latest results for async updates
    const latestResultsRef = useRef(creativeResults);
    useEffect(() => { latestResultsRef.current = creativeResults; }, [creativeResults]);

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

    // --- Translated Options ---
    const perspectiveAngles = useMemo(() => [
        { id: 'default', label: t('sync.angle.default'), promptClause: "the same general perspective as the source image" },
        { id: 'front', label: t('sync.angle.front'), promptClause: "Straight-on front elevation view, symmetrical composition. Flat facade focusing on geometric shapes and materials." },
        { id: 'left-side', label: t('sync.angle.left'), promptClause: "a 3/4 perspective view from the front-left, showing depth and dimension of the building massing." },
        { id: 'right-side', label: t('sync.angle.right'), promptClause: "a 3/4 perspective view from the front-right, showing both the front and right facades" },
        { id: 'wide-frame', label: t('sync.angle.wide'), promptClause: "Wide-angle shot capturing the building within its surrounding context and landscape. Spacious atmosphere, expanded field of view." },
        { id: 'panoramic', label: t('sync.angle.pano'), promptClause: "Panoramic view, ultra-wide horizontal composition. Capturing the entire landscape and building context in a single frame. Cinematic wide shot." },
        { id: 'top-down', label: t('sync.angle.topdown'), promptClause: "Aerial bird's-eye view looking down from above. Drone photography showing the roof plan, site layout, and surrounding environment. Masterplan visualization." },
        { id: 'low-angle', label: t('sync.angle.low'), promptClause: "Low angle worm's-eye view looking up at the building. Imposing and majestic stature against the sky. Dramatic perspective emphasizing height." },
        { id: 'close-up', label: t('sync.angle.closeup'), promptClause: "Macro close-up shot of architectural details. Focus on textures, materials, and intricate facade elements. Shallow depth of field, blurred background." },
    ], [t]);

    const atmosphericAngles = useMemo(() => [
        { id: 'default', label: t('sync.atm.default'), promptClause: "with standard daylight lighting" },
        { id: 'early-morning', label: t('sync.atm.morning'), promptClause: "in the early morning, with soft, gentle sunrise light and long shadows" },
        { id: 'midday-sun', label: t('sync.atm.midday'), promptClause: "at midday under bright, direct sunlight with strong, short shadows" },
        { id: 'late-afternoon', label: t('sync.atm.sunset'), promptClause: "during the late afternoon (golden hour), with warm, orange-hued light and long, dramatic shadows" },
        { id: 'night', label: t('sync.atm.night'), promptClause: "at night, with interior and exterior lights turned on" },
        { id: 'rainy', label: t('sync.atm.rainy'), promptClause: "during a gentle rain, with wet surfaces and a slightly overcast sky" },
        { id: 'misty', label: t('sync.atm.misty'), promptClause: "on a misty or foggy morning, creating a soft and mysterious atmosphere" },
        { id: 'after-rain', label: t('sync.atm.after_rain'), promptClause: "just after a rain shower, with wet ground reflecting the sky and surroundings, and a sense of freshness in the air" },
    ], [t]);

    const framingAngles = useMemo(() => [
        { id: 'none', label: t('sync.frame.none'), promptClause: "" },
        { id: 'through-trees', label: t('sync.frame.trees'), promptClause: "The building is seen through a foreground of trees or foliage, creating a natural framing effect." },
        { id: 'through-window', label: t('sync.frame.window'), promptClause: "The building is seen from inside a cozy cafe across the street, looking out through the cafe's large glass window, which creates a framing effect." },
        { id: 'through-flowers', label: t('sync.frame.flowers'), promptClause: "The building is viewed through a foreground of colorful flowers lining the roadside, creating a beautiful and soft framing effect." },
        { id: 'through-car-window', label: t('sync.frame.car'), promptClause: "The building is seen from the perspective of looking out from a car parked on the side of the road, with the car's window frame and side mirror creating a dynamic frame." },
    ], [t]);

    const interiorViewAngles = useMemo(() => [
        { id: 'default', label: t('sync.int.default'), prompt: "Maintain the same camera perspective as the source image." },
        { id: 'wide-angle', label: t('sync.int.wide'), prompt: "Generate a wide-angle view of the interior space, capturing as much of the room as possible. Maintain the same design style, furniture, and materials as the uploaded image." },
        { id: 'from-corner', label: t('sync.int.corner'), prompt: "Generate a view from a corner of the room, looking towards the center. Maintain the same design style, furniture, and materials as the uploaded image." },
        { id: 'detail-shot', label: t('sync.int.detail'), prompt: "Generate a close-up detail shot of a key furniture piece or decorative element. Maintain the same design style, furniture, and materials as the uploaded image." },
        { id: 'towards-window', label: t('sync.int.window'), prompt: "Generate a view from inside the room looking towards the main window, showing the natural light. Maintain the same design style, furniture, and materials as the uploaded image." },
        { id: 'night-view', label: t('sync.int.night'), prompt: "Generate a view of the interior space at night, with artificial lighting turned on (lamps, ceiling lights). Maintain the same design style, furniture, and materials as the uploaded image." },
        { id: 'top-down-interior', label: t('sync.int.topdown'), prompt: "Generate a top-down view of the room's layout, similar to a 3D floor plan. Maintain the same design style, furniture, and materials as the uploaded image." },
    ], [t]);

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

    const interiorSlots = useMemo(() => [
        { id: 'living_room', name: t('sync.creative.slot.living_room'), icon: 'chair', action: 'sitting on sofa' },
        { id: 'bedroom', name: t('sync.creative.slot.bedroom'), icon: 'bed', action: 'resting on bed' },
        { id: 'kitchen', name: t('sync.creative.slot.kitchen'), icon: 'kitchen', action: 'preparing food' },
        { id: 'dining', name: t('sync.creative.slot.dining'), icon: 'dining', action: 'sitting at dining table' },
        { id: 'reading', name: t('sync.creative.slot.reading'), icon: 'menu_book', action: 'working at desk' },
        { id: 'bathroom', name: t('sync.creative.slot.bathroom'), icon: 'bathtub', action: 'standing by mirror' },
        { id: 'corridor', name: t('sync.creative.slot.corridor'), icon: 'door_sliding', action: 'walking in corridor' },
        { id: 'closeup', name: t('sync.creative.slot.closeup'), icon: 'center_focus_strong', action: 'touching material' },
        { id: 'balcony', name: t('sync.creative.slot.balcony'), icon: 'deck', action: 'standing looking at view' }
    ], [t]);

    const architectureSlots = useMemo(() => [
        { id: 'pano1', name: t('sync.creative.slot.pano1'), sub: t('sync.creative.sub.sunrise'), icon: 'wb_twilight', promptDescription: "High-angle panoramic view, clear sunrise light with light mist." },
        { id: 'pano2', name: t('sync.creative.slot.pano2'), sub: t('sync.creative.sub.sunset'), icon: 'wb_sunny', promptDescription: "45-degree angle distant view, vibrant golden sunset sky background." },
        { id: 'pano3', name: t('sync.creative.slot.pano3'), sub: t('sync.creative.sub.birdseye'), icon: 'flight', promptDescription: "Bird's eye view from above, showing the entire site and landscape." },
        { id: 'close1', name: t('sync.creative.slot.close1'), sub: t('sync.creative.sub.material'), icon: 'texture', promptDescription: "Close-up detailing surface materials: stone, wood, or metal textures." },
        { id: 'close2', name: t('sync.creative.slot.close2'), sub: t('sync.creative.sub.structure'), icon: 'construction', promptDescription: "Close-up of structural details: joints, railings, or massing intersections." },
        { id: 'close3', name: t('sync.creative.slot.close3'), sub: t('sync.creative.sub.entrance'), icon: 'door_front', promptDescription: "Close-up focused on the main entrance and lobby area." },
        { id: 'close4', name: t('sync.creative.slot.close4'), sub: t('sync.creative.sub.corner'), icon: 'camera_alt', promptDescription: "Close-up of an architectural corner or landscape detail near the base." },
        { id: 'art1', name: t('sync.creative.slot.art1'), sub: t('sync.creative.sub.bokeh'), icon: 'blur_on', promptDescription: "Artistic shot with blurred foreground (bokeh), deep focus on a specific detail." },
        { id: 'art2', name: t('sync.creative.slot.art2'), sub: t('sync.creative.sub.night'), icon: 'nights_stay', promptDescription: "Dramatic night perspective, emphasizing light spilling from windows." }
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
    const creativeTotalCost = slots.length * unitCost;

    // Fix: Defined handleFileSelect to resolve the missing name error in the Creative workspace tab.
    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, resultImages: [], creativeResults: {} });
    };

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
    };

    const handleSelectCreativeOption = (optionId: string) => {
        onStateChange({ creativeOption: optionId as any });
        setIsCreativeModeSelected(true);
    };

    const handleBackToSelection = () => {
        setIsCreativeModeSelected(false);
    };

    const getResultKey = (option: string, slotId: string) => `${option}-${slotId}`;

    // --- STANDARD SYNC GENERATE ---
    const handleGenerate = async () => {
        const totalCost = numberOfImages * unitCost;
        if (onDeductCredits && userCredits < totalCost) {
             if (onInsufficientCredits) onInsufficientCredits();
             return;
        }
        if (!sourceImage) {
            onStateChange({ error: t('err.input.image') });
            return;
        }
        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));

        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) logId = await onDeductCredits(totalCost, `Đồng bộ view (${numberOfImages} ảnh) - ${resolution}`);
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
            
            if (sceneType === 'interior') {
                const interiorAngle = interiorViewAngles.find(a => a.id === selectedInteriorAngle);
                if (interiorAngle && interiorAngle.id !== 'default') promptParts.push(interiorAngle.prompt);
            } else {
                const perspective = perspectiveAngles.find(p => p.id === selectedPerspective);
                if (perspective && perspective.id !== 'default') promptParts.push(`${perspective.promptClause}`);
            }

            if (framing && framing.id !== 'none') promptParts.push(framing.promptClause);
            if (atmosphere && atmosphere.id !== 'default') promptParts.push(`Render it ${atmosphere.promptClause}`);
            if (customPrompt) promptParts.push(customPrompt);
            
            let finalPrompt = promptParts.length > 0 ? `Based on the building design in the reference image, ${promptParts.join(', ')}.` : "Enhance the quality and clarity of this view. Maintain the exact same architectural style and content.";
            finalPrompt += ` Preserving all original architectural details and materials. Photorealistic architectural photography.`;

            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const collectedUrls: string[] = [];
            const inputImages: FileData[] = [sourceImage];
            if (directionImage) inputImages.push(directionImage);

            let lastError: any = null;
            const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                try {
                    const result = await externalVideoService.generateFlowImage(finalPrompt, inputImages, aspectRatio, 1, modelName, (msg) => setStatusMessage(t('common.processing')));
                    if (result.imageUrls && result.imageUrls.length > 0) {
                        let finalUrl = result.imageUrls[0];
                        if ((resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0) {
                            const mediaId = result.mediaIds[0];
                            if (mediaId) {
                                const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                                const upscaleRes = await externalVideoService.upscaleFlowImage(mediaId, result.projectId, targetRes, aspectRatio);
                                if (upscaleRes?.imageUrl) finalUrl = upscaleRes.imageUrl;
                            }
                        }
                        collectedUrls.push(finalUrl);
                        onStateChange({ resultImages: [...collectedUrls] });
                        historyService.addToHistory({ tool: Tool.ViewSync, prompt: `Flow: ${finalPrompt}`, sourceImageURL: sourceImage.objectURL, resultImageURL: finalUrl });
                        return finalUrl;
                    }
                    return null;
                } catch (e: any) { lastError = e; return null; }
            });

            const results = await Promise.all(promises);
            const successfulUrls = results.filter((url): url is string => url !== null);
            if (successfulUrls.length > 0) {
                if (jobId) await jobService.updateJobStatus(jobId, 'completed', successfulUrls[0]);
            } else { if (lastError) throw lastError; throw new Error("Lỗi tạo ảnh."); }
        } catch (err: any) {
            const friendlyKey = jobService.mapFriendlyErrorMessage(err.message || "");
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") setShowSafetyModal(true);
            else onStateChange({ error: t(friendlyKey) });
        } finally { onStateChange({ isLoading: false }); setStatusMessage(null); }
    };

    // --- CREATIVE VIEW HELPERS ---
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
                fullPrompt = `Bạn là một Kiến trúc sư chuyên nghiệp. Bạn được cung cấp một hình ảnh mẫu kiến trúc đại diện cho 100% hình khối và chi tiết thực tế. Nhiệm vụ của bạn là vẽ lại một view kiến trúc cụ thể (cận cảnh hoặc nghệ thuật) từ công trình này.\nYÊU CẦU BẮT BUỘC:\n- GIỮ NGUYÊN 100% mọi chi tiết kiến trúc, hình khối, vật liệu và cấu trúc từ ảnh mẫu.\n- TUYỆT ĐỐI KHÔNG vẽ thêm, không sáng tạo chi tiết mới, không thay đổi cấu kiện nếu không có trong ảnh gốc. Chỉ được phép lấy đúng những gì đang có trên công trình gốc để thể hiện.\n- Đối với các view CẬN CẢNH và NGHỆ THUẬT: Bạn chỉ được phép tập trung vào những thành phần hiện hữu của công trình, không được phép nội suy hay sử dụng chi tiết lạ.\n- Bạn chỉ được phép thay đổi góc máy, tiêu cự ống kính, và điều kiện ánh sáng để tạo ra bức ảnh nhiếp ảnh kiến trúc chuyên nghiệp.\n- VIEW CẬN CẢNH CẦN TẠO: "${viewDescription}".\n${charPrompt}\nKết quả phải là một ảnh chụp thực tế, 8k, sắc nét tuyệt đối.`;
            } else {
                 fullPrompt = `You are a professional Architect. You are provided with an architectural sample image representing 100% of the actual massing and details. Your task is to redraw a specific architectural view (close-up or artistic) from this building.\nMANDATORY REQUIREMENTS:\n- KEEP 100% of all architectural details, massing, materials, and structure from the sample image.\n- ABSOLUTELY DO NOT add, invent new details, or change components if they are not in the original image. You are only allowed to depict what is currently on the original building.\n- For CLOSE-UP and ARTISTIC views: You are only allowed to focus on existing components of the building, no interpolation or use of strange details.\n- You are only allowed to change camera angle, lens focal length, and lighting conditions to create a professional architectural photograph.\n- VIEW TO GENERATE: "${viewDescription}".\n${charPrompt}\nThe result must be a photorealistic, 8k, absolutely sharp image.`;
            }
        } else if (creativeOption === 'interior-from-arch') {
            const viewName = slot.name;
            const charPrompt = characterImage 
                ? (language === 'vi' ? "Có thêm nhân vật đang sinh hoạt trong không gian." : "Include a character active in the space.")
                : "";

            if (language === 'vi') {
                fullPrompt = `Bạn là một Kiến trúc sư và Nhà thiết kế nội thất tài ba. Bạn được cung cấp một hình ảnh NGOẠI THẤT của một công trình kiến trúc. Nhiệm vụ của bạn là thiết kế và vẽ ra không gian NỘI THẤT bên trong công trình đó.\nYÊU CẦU BẮT BUỘC:\n- PHONG CÁCH: Nội thất phải hoàn toàn đồng nhất với phong cách kiến trúc ngoại thất (ví dụ: nếu kiến trúc hiện đại tối giản thì nội thất cũng phải hiện đại tối giản).\n- HỆ CỬA SỔ: Nếu không gian có cửa sổ, kiểu dáng khung cửa, vật liệu và tỷ lệ của cửa sổ PHẢI giống hệt với hệ cửa sổ thấy được ở mặt tiền kiến trúc trong ảnh gốc.\n- VẬT LIỆU: Sử dụng bảng vật liệu và màu sắc tương đồng với ngoại thất để tạo sự xuyên suốt.\n- KHÔNG GIAN CẦN TẠO: "${viewName}".\n${charPrompt}\nKết quả là một bức ảnh chụp nhiếp ảnh nội thất chuyên nghiệp, 8k, ánh sáng ban ngày tự nhiên cực kỳ chân thực.`;
            } else {
                 fullPrompt = `You are a talented Architect and Interior Designer. You are provided with an EXTERIOR image of an architectural building. Your task is to design and draw the INTERIOR space inside that building.\nMANDATORY REQUIREMENTS:\n- STYLE: The interior must be completely consistent with the exterior architectural style.\n- WINDOW SYSTEM: If the space has windows, the style of the window frames, materials, and proportions MUST be identical to the window system visible on the architectural facade in the original image.\n- MATERIALS: Use a material and color palette similar to the exterior to create continuity.\n- SPACE TO GENERATE: "${viewName}".\n${charPrompt}\nThe result is a professional interior photograph, 8k, extremely realistic natural daylight.`;
            }
        } else {
            const action = slot.action || "active in the space";
            let charPrompt = characterImage 
                ? (language === 'vi' 
                    ? `THÊM NHÂN VẬT: Hãy đưa nhân vật trong ảnh thứ hai vào không gian một cách tự nhiên. Nhân vật nên ${action}. Đảm bảo trang phục và ngoại hình của nhân vật thống nhất với ảnh nhân vật được cung cấp.` 
                    : `ADD CHARACTER: Naturally integrate the character from the second image into the space. The character should be ${action}. Ensure consistent clothing and appearance with the provided character image.`)
                : "";
            
            if (language === 'vi') {
                fullPrompt = `Bạn là một Kiến trúc sư nội thất chuyên nghiệp. Bạn được cung cấp một hình ảnh mẫu đại diện cho style, màu sắc và vật liệu. Nhiệm vụ của bạn là tưởng tượng và vẽ ra một không gian khác trong cùng ngôi nhà đó.\nYÊU CẦU BẮT BUỘC:\n- GIỮ NGUYÊN Style thiết kế.\n- GIỮ NGUYÊN Bảng màu chủ đạo.\n- GIỮ NGUYÊN Tính chất vật liệu.\n- KHÔNG GIAN CẦN TẠO: "${slot.name}".\n${charPrompt}\nHãy vẽ một bức ảnh chụp nhiếp ảnh kiến trúc chuyên nghiệp, thực tế, 8k, ánh sáng ban ngày tự nhiên dịu nhẹ.`;
            } else {
                fullPrompt = `You are a professional Interior Architect. You are provided with a sample image representing style, color, and materials. Your task is to imagine and draw another space in the same house.\nMANDATORY REQUIREMENTS:\n- KEEP the design style.\n- KEEP the dominant color palette.\n- KEEP material properties.\n- SPACE TO GENERATE: "${slot.name}".\n${charPrompt}\nDraw a professional architectural photograph, realistic, 8k, soft natural daylight.`;
            }
        }
        return fullPrompt;
    };

    const handleGenerateSingleView = async (slot: any) => {
        if (onDeductCredits && userCredits < unitCost) {
             if (onInsufficientCredits) onInsufficientCredits();
             return;
        }
        if (!sourceImage) {
            onStateChange({ error: t('err.input.image') });
            return;
        }

        const uniqueKey = getResultKey(creativeOption, slot.id);
        setGeneratingViews(prev => new Set(prev).add(uniqueKey));
        onStateChange({ error: null });

        try {
            if (onDeductCredits) await onDeductCredits(unitCost, `Creative View: ${slot.name} (${resolution})`);
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const inputImages = [sourceImage];
            if (characterImage) inputImages.push(characterImage);

            const fullPrompt = getPromptForSlot(slot);
            const result = await externalVideoService.generateFlowImage(fullPrompt, inputImages, aspectRatio, 1, modelName);

            if (result.imageUrls && result.imageUrls.length > 0) {
                let finalUrl = result.imageUrls[0];
                if ((resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0) {
                     try {
                        const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                        const upscaleRes = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                        if (upscaleRes?.imageUrl) finalUrl = upscaleRes.imageUrl;
                    } catch (e) { console.error("Upscale failed", e); }
                }

                const currentResults = latestResultsRef.current || {};
                const newResults = { ...currentResults, [uniqueKey]: finalUrl };
                onStateChange({ creativeResults: newResults });
                historyService.addToHistory({ tool: Tool.ViewSync, prompt: `Creative: ${slot.name}`, sourceImageURL: sourceImage.objectURL, resultImageURL: finalUrl });
            }
        } catch (err: any) {
            const rawMsg = err.message || "";
            if (rawMsg.includes("SAFETY_POLICY_VIOLATION")) setShowSafetyModal(true);
            else onStateChange({ error: t(jobService.mapFriendlyErrorMessage(rawMsg)) });
        } finally {
            setGeneratingViews(prev => {
                const next = new Set(prev);
                next.delete(uniqueKey);
                return next;
            });
        }
    };

    const handleGenerateBatch = async () => {
        if (onDeductCredits && userCredits < creativeTotalCost) {
             if (onInsufficientCredits) onInsufficientCredits();
             return;
        }
        if (!sourceImage) {
            onStateChange({ error: t('err.input.image') });
            return;
        }

        const allViewKeys = new Set(slots.map(s => getResultKey(creativeOption, s.id)));
        setGeneratingViews(allViewKeys);
        onStateChange({ error: null });

        try {
            if (onDeductCredits) await onDeductCredits(creativeTotalCost, `Creative Batch: ${slots.length} views (${resolution})`);
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const inputImages = [sourceImage];
            if (characterImage) inputImages.push(characterImage);

            const promises = slots.map(async (slot) => {
                const uniqueKey = getResultKey(creativeOption, slot.id);
                try {
                    const fullPrompt = getPromptForSlot(slot);
                    const result = await externalVideoService.generateFlowImage(fullPrompt, inputImages, aspectRatio, 1, modelName);

                    if (result.imageUrls && result.imageUrls.length > 0) {
                        let finalUrl = result.imageUrls[0];
                        if ((resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0) {
                             try {
                                const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                                const upscaleRes = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                                if (upscaleRes?.imageUrl) finalUrl = upscaleRes.imageUrl;
                            } catch (e) { console.error("Upscale failed", e); }
                        }

                        const currentResults = latestResultsRef.current || {};
                        const newResults = { ...currentResults, [uniqueKey]: finalUrl };
                        onStateChange({ creativeResults: newResults });
                        historyService.addToHistory({ tool: Tool.ViewSync, prompt: `Creative: ${slot.name}`, sourceImageURL: sourceImage.objectURL, resultImageURL: finalUrl });
                    }
                } catch (err) {
                    console.error(`Error generating view ${slot.name}:`, err);
                } finally {
                    setGeneratingViews(prev => {
                        const next = new Set(prev);
                        next.delete(uniqueKey);
                        return next;
                    });
                }
            });
            await Promise.all(promises);
        } catch (err: any) {
            const rawMsg = err.message || "";
            if (rawMsg.includes("SAFETY_POLICY_VIOLATION")) setShowSafetyModal(true);
            else onStateChange({ error: t(jobService.mapFriendlyErrorMessage(rawMsg)) });
            setGeneratingViews(new Set());
        }
    };

    // Fix: Refactored handleDownload to accept optional parameters and handle standard/creative views correctly. 
    // This fixes the MouseEventHandler type mismatch error.
    const handleDownload = async (url?: any, name?: any) => {
        const actualUrl = typeof url === 'string' ? url : resultImages[selectedIndex];
        const actualName = typeof name === 'string' ? name : 'synced-view';

        if (actualUrl) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(actualUrl, `view-sync-${actualName}-${Date.now()}.png`);
            setIsDownloading(false);
        }
    };

    const handleDownloadAllCreative = async () => {
        const currentModeKeys = slots.map(s => getResultKey(creativeOption, s.id));
        const urls = currentModeKeys.map(k => creativeResults[k]).filter(Boolean);
        if (urls.length === 0) return;
        setIsDownloading(true);
        for (const slot of slots) {
            const key = getResultKey(creativeOption, slot.id);
            const url = creativeResults[key];
            if (url) {
                await externalVideoService.forceDownload(url, `creative-${slot.name}-${Date.now()}.png`);
                await new Promise(r => setTimeout(r, 800)); 
            }
        }
        setIsDownloading(false);
    };

    const handlePreview = (url: string) => {
        setPreviewImage(url);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const selectedOptionData = creativeOptions.find(o => o.id === creativeOption);
    const hasCreativeResults = slots.some(s => !!creativeResults[getResultKey(creativeOption, s.id)]);

    return (
        <div className="flex flex-col gap-0 w-full -mt-6">
            <style>{`
                .custom-sidebar-scroll::-webkit-scrollbar { width: 5px; }
                .custom-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #334155; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
            `}</style>

            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <div className="flex justify-center mb-1">
                <div className="bg-gray-100 dark:bg-black/30 p-0.5 rounded-full inline-flex border border-gray-200 dark:border-white/10">
                    <button onClick={() => onStateChange({ activeTab: 'sync' })} className={`px-5 py-1.5 rounded-full text-sm font-bold transition-all ${activeTab === 'sync' || !activeTab ? 'bg-white dark:bg-[#7f13ec] text-black dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{t('sync.tab.sync')}</button>
                    <button onClick={() => onStateChange({ activeTab: 'creative' })} className={`px-5 py-1.5 rounded-full text-sm font-bold transition-all ${activeTab === 'creative' ? 'bg-white dark:bg-[#7f13ec] text-black dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{t('sync.tab.creative')}</button>
                </div>
            </div>

            {/* --- STANDARD SYNC VIEW --- */}
            {(activeTab === 'sync' || !activeTab) && (
                <div className="flex flex-col lg:flex-row gap-6 md:gap-8 w-full max-w-full items-stretch px-2 sm:px-4 mt-2">
                    <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                        <div className="p-3 space-y-4 flex-1 overflow-y-auto custom-sidebar-scroll">
                            <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-3 border border-gray-200 dark:border-white/5">
                                <div>
                                    <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('sync.step1')}</label>
                                    <ImageUpload onFileSelect={(f) => onStateChange({ sourceImage: f, resultImages: [], directionImage: null })} previewUrl={sourceImage?.objectURL} />
                                </div>
                            </div>

                            <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                                <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('sync.step2')}</label>
                                <div className="flex bg-white dark:bg-[#121212] p-1 rounded-xl border border-gray-200 dark:border-[#302839]">
                                    <button onClick={() => onStateChange({ sceneType: 'exterior' })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${sceneType === 'exterior' || !sceneType ? 'bg-[#7f13ec] text-white shadow' : 'text-gray-400'}`}>{t('sync.scene.ext')}</button>
                                    <button onClick={() => onStateChange({ sceneType: 'interior' })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${sceneType === 'interior' ? 'bg-[#7f13ec] text-white shadow' : 'text-gray-400'}`}>{t('sync.scene.int')}</button>
                                </div>
                                <div className="space-y-3">
                                    {(sceneType === 'exterior' || !sceneType) ? (
                                        <OptionSelector id="perspective" label={t('sync.angle.ext')} options={perspectiveAngles.map(a => ({ value: a.id, label: a.label }))} value={selectedPerspective} onChange={(val) => onStateChange({ selectedPerspective: val })} variant="select" disabled={isLoading} />
                                    ) : (
                                        <OptionSelector id="interior-angle" label={t('sync.angle.int')} options={interiorViewAngles.map(a => ({ value: a.id, label: a.label }))} value={selectedInteriorAngle} onChange={(val) => onStateChange({ selectedInteriorAngle: val })} variant="select" disabled={isLoading} />
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="framing" label={t('sync.framing')} options={framingAngles.map(a => ({ value: a.id, label: a.label }))} value={selectedFraming} onChange={(val) => onStateChange({ selectedFraming: val })} variant="select" disabled={isLoading} />
                                        <OptionSelector id="atmosphere" label={t('sync.atmosphere')} options={atmosphericAngles.map(a => ({ value: a.id, label: a.label }))} value={selectedAtmosphere} onChange={(val) => onStateChange({ selectedAtmosphere: val })} variant="select" disabled={isLoading} />
                                    </div>
                                </div>
                                <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                                    <textarea rows={6} className="w-full bg-transparent outline-none text-sm resize-none font-medium text-text-primary dark:text-white" placeholder={t('sync.prompt_placeholder')} value={customPrompt} onChange={(e) => onStateChange({ customPrompt: e.target.value })} />
                                </div>
                            </div>

                            <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                                <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} />
                                <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                                <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                            </div>
                        </div>

                        <div className="sticky bottom-0 w-full bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] p-4 z-40 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                            <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base">
                                {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('sync.btn_generate')} | {unitCost * numberOfImages}</span> <span className="material-symbols-outlined text-yellow-400 text-lg align-middle notranslate">monetization_on</span></>}
                            </button>
                        </div>
                    </aside>

                    <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-0">
                                {resultImages.length > 0 ? (
                                    <div className="w-full h-full p-2 animate-fade-in flex flex-col items-center justify-center relative">
                                        <div className="w-full h-full flex items-center justify-center overflow-hidden">
                                            {sourceImage ? (
                                                <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[selectedIndex]} />
                                            ) : (
                                                <img src={resultImages[selectedIndex]} alt="Result" className="max-w-full max-h-full object-contain" />
                                            )}
                                        </div>
                                        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                            <button onClick={handleDownload} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">download</span></button>
                                            <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">zoom_in</span></button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center opacity-20 select-none bg-main-bg dark:bg-[#121212]">
                                        <span className="material-symbols-outlined text-6xl mb-4">view_in_ar</span>
                                        <p className="text-base font-medium">{t('msg.no_result_render')}</p>
                                    </div>
                                )}
                                {isLoading && (
                                    <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
                                        <Spinner />
                                        <p className="text-white mt-4 font-bold animate-pulse">{statusMessage}</p>
                                    </div>
                                )}
                            </div>

                            {resultImages.length > 0 && !isLoading && (
                                <div className="flex-shrink-0 w-full p-2 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839]">
                                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center">
                                        {resultImages.map((url, idx) => (
                                            <button key={url} onClick={() => setSelectedIndex(idx)} className={`flex-shrink-0 w-16 sm:w-20 aspect-square rounded-lg border-2 transition-all overflow-hidden ${selectedIndex === idx ? 'border-[#7f13ec] ring-2 ring-purple-500/20 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                                                <img src={url} className="w-full h-full object-cover" alt={`Result ${idx + 1}`} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            )}

            {/* --- CREATIVE VIEW (NEW FLOW) --- */}
            {activeTab === 'creative' && !isCreativeModeSelected && (
                <div className="flex flex-col gap-6 animate-fade-in py-6 px-4">
                    <div className="text-center max-w-2xl mx-auto">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('sync.creative.title')}</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('sync.creative.desc')}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto w-full">
                        {creativeOptions.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => handleSelectCreativeOption(opt.id)}
                                className="group relative bg-white dark:bg-[#1E1E1E] rounded-2xl p-5 border border-gray-200 dark:border-[#302839] hover:border-[#7f13ec] dark:hover:border-[#7f13ec] transition-all duration-300 shadow-sm hover:shadow-xl text-left flex flex-col gap-4 h-full"
                            >
                                <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-[#252525] group-hover:bg-[#7f13ec]/10 flex items-center justify-center transition-colors">
                                    <span className="material-symbols-outlined text-xl text-gray-600 dark:text-gray-400 group-hover:text-[#7f13ec]">{opt.icon}</span>
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1 group-hover:text-[#7f13ec] transition-colors">{opt.label}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{opt.longDesc || opt.desc}</p>
                                </div>
                                <div className="mt-auto pt-4 flex items-center text-xs font-bold text-[#7f13ec] opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                                    {t('sync.creative.btn_start')} <span className="material-symbols-outlined text-[14px] ml-1">arrow_forward</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'creative' && isCreativeModeSelected && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in p-4 mt-2">
                    <div className="lg:col-span-4 flex flex-col gap-6">
                        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-[#302839]">
                            <button onClick={handleBackToSelection} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-4 transition-colors font-bold"><span className="material-symbols-outlined text-lg">arrow_back</span> {t('sync.workspace.back')}</button>
                            <div className="flex items-center gap-3 p-3 bg-[#7f13ec]/5 dark:bg-[#7f13ec]/10 rounded-xl border border-[#7f13ec]/20">
                                <div className="p-2 rounded-lg bg-[#7f13ec] text-white"><span className="material-symbols-outlined text-xl">{selectedOptionData?.icon || 'auto_awesome'}</span></div>
                                <div>
                                    <div className="text-sm font-bold text-[#7f13ec] dark:text-[#a855f7]">{selectedOptionData?.label}</div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400">{selectedOptionData?.desc}</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-[#302839] space-y-6">
                            <div>
                                <label className="flex justify-between items-center text-sm font-bold text-gray-700 dark:text-gray-200 mb-2"><span>{t('sync.workspace.source')}</span>{sourceImage && <span className="text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">OK</span>}</label>
                                <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-black/20 overflow-hidden"><ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} /></div>
                            </div>
                            <div>
                                <label className="flex justify-between items-center text-sm font-bold text-gray-700 dark:text-gray-200 mb-2"><span>{t('sync.workspace.char')}</span>{characterImage && <span className="text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">OK</span>}</label>
                                <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-black/20 overflow-hidden"><ImageUpload onFileSelect={(f) => onStateChange({ characterImage: f })} previewUrl={characterImage?.objectURL} id="char-upload" /></div>
                                <p className="text-[10px] text-gray-400 mt-1.5 px-1">{t('sync.workspace.char_hint')}</p>
                            </div>
                            <div className="pt-4 border-t border-gray-100 dark:border-[#302839]">
                                <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} disabled={generatingViews.size > 0} />
                            </div>
                            <div><ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={generatingViews.size > 0} /></div>
                            <button onClick={handleGenerateBatch} disabled={generatingViews.size > 0 || !sourceImage} className="w-full py-4 bg-[#7f13ec] hover:bg-[#690fca] disabled:bg-gray-400 dark:disabled:bg-gray-700 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 transform active:scale-95">{generatingViews.size > 0 ? <><Spinner /> {t('sync.workspace.generating_wait')}</> : t('sync.workspace.btn_generate_batch').replace('{count}', slots.length.toString())}</button>
                        </div>
                    </div>

                    <div className="lg:col-span-8 flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{t('sync.workspace.result_title')}</h3>
                            {hasCreativeResults && (
                                <button onClick={handleDownloadAllCreative} disabled={isDownloading} className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black hover:opacity-90 rounded-xl text-sm font-bold transition-all shadow-md">
                                    {isDownloading ? <Spinner /> : <span className="material-symbols-outlined text-lg">download_for_offline</span>}
                                    <span>{t('sync.workspace.download_all')}</span>
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {slots.map((slot) => {
                                const key = getResultKey(creativeOption, slot.id);
                                const resultUrl = creativeResults[key];
                                const isGenerating = generatingViews.has(key);
                                return (
                                    <div key={slot.id} className="group relative bg-[#1E1E1E] rounded-2xl overflow-hidden border border-[#302839] hover:border-[#7f13ec]/50 transition-all duration-300 shadow-lg flex flex-col h-full">
                                        <div className="aspect-square relative w-full bg-black/40 overflow-hidden">
                                            {resultUrl ? (
                                                <>
                                                    <img src={resultUrl} alt={slot.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 cursor-pointer" onClick={() => handlePreview(resultUrl)} />
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm pointer-events-none">
                                                        <div className="flex gap-2 pointer-events-auto">
                                                            <button onClick={() => handlePreview(resultUrl)} className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all hover:scale-110"><span className="material-symbols-outlined">zoom_in</span></button>
                                                            <button onClick={() => handleDownload(resultUrl, slot.name)} className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all hover:scale-110"><span className="material-symbols-outlined">download</span></button>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : isGenerating ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#151515]">
                                                    <Spinner />
                                                    <span className="text-xs font-bold text-gray-500 mt-4 animate-pulse uppercase tracking-widest">{t('sync.workspace.generating')}</span>
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center opacity-30">
                                                    <span className="material-symbols-outlined text-5xl text-gray-600 mb-2">{slot.icon}</span>
                                                    <span className="text-xs font-bold text-gray-600 uppercase">{slot.name}</span>
                                                </div>
                                            )}
                                            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                                                <h4 className="text-sm font-bold text-white shadow-sm">{slot.name}</h4>
                                                {/* @ts-ignore */}
                                                {slot.sub && <p className="text-[10px] text-gray-300 font-medium">{slot.sub}</p>}
                                            </div>
                                        </div>
                                        <div className="p-4 border-t border-[#302839] bg-[#222] flex flex-col gap-3">
                                            <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                                <span>{t('sync.workspace.cost')}</span>
                                                <span className="text-yellow-500 flex items-center gap-1"><span className="material-symbols-outlined text-xs">monetization_on</span> {unitCost}</span>
                                            </div>
                                            <button onClick={() => handleGenerateSingleView(slot)} disabled={isGenerating || !sourceImage} className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${resultUrl ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-[#7f13ec] hover:bg-[#690fca] text-white shadow-lg'}`}>
                                                {isGenerating ? <Spinner /> : <span className="material-symbols-outlined text-sm">{resultUrl ? 'refresh' : 'auto_fix_high'}</span>}
                                                {isGenerating ? t('sync.workspace.generating') : (resultUrl ? t('sync.workspace.regenerate') : t('sync.workspace.generate'))}
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
