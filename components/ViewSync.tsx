
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
        activeTab = 'sync', creativeOption = 'interior', creativeResults = {}, creativePrompts = {}
    } = state;

    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    const [isCreativeModeSelected, setIsCreativeModeSelected] = useState(false);
    const [generatingViews, setGeneratingViews] = useState<Set<string>>(new Set());

    const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
    const modeDropdownRef = useRef<HTMLDivElement>(null);

    const latestResultsRef = useRef(creativeResults);
    useEffect(() => { latestResultsRef.current = creativeResults; }, [creativeResults]);

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
                setIsModeDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const creativeOptions = useMemo(() => [
        { 
            id: 'interior', 
            label: t('sync.creative.opt.interior'), 
            icon: 'chair', 
            desc: t('sync.creative.opt.interior_desc'), 
            longDesc: t('sync.creative.opt.interior_long'),
            bg: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=800&auto=format&fit=crop'
        },
        { 
            id: 'architecture', 
            label: t('sync.creative.opt.arch'), 
            icon: 'apartment', 
            desc: t('sync.creative.opt.arch_desc'), 
            longDesc: t('sync.creative.opt.arch_long'),
            bg: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/view-sync-exterior.jpeg'
        },
        { 
            id: 'interior-from-arch', 
            label: t('sync.creative.opt.int_from_arch'), 
            icon: 'foundation', 
            desc: t('sync.creative.opt.int_from_arch_desc'), 
            longDesc: t('sync.creative.opt.int_from_arch_long'),
            bg: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/arch-to-in.jpeg'
        },
        {
            id: 'marketing-showcase',
            label: t('sync.creative.opt.marketing'),
            icon: 'stars',
            desc: t('sync.creative.opt.marketing_desc'),
            longDesc: t('sync.creative.opt.marketing_long'),
            bg: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?q=80&w=800&auto=format&fit=crop'
        }
    ], [t]);

    const interiorSlots = useMemo(() => [
        { id: 'living_room', name: t('sync.creative.slot.living_room'), icon: 'chair', action: t('sync.creative.action.living_room') },
        { id: 'bedroom', name: t('sync.creative.slot.bedroom'), icon: 'bed', action: t('sync.creative.action.bedroom') },
        { id: 'kitchen', name: t('sync.creative.slot.kitchen'), icon: 'kitchen', action: t('sync.creative.action.kitchen') },
        { id: 'dining', name: t('sync.creative.slot.dining'), icon: 'dining', action: t('sync.creative.action.dining') },
        { id: 'reading', name: t('sync.creative.slot.reading'), icon: 'menu_book', action: t('sync.creative.action.reading') },
        { id: 'bathroom', name: t('sync.creative.slot.bathroom'), icon: 'bathtub', action: t('sync.creative.action.bathroom') },
        { id: 'corridor', name: t('sync.creative.slot.corridor'), icon: 'door_sliding', action: t('sync.creative.action.corridor') },
        { id: 'closeup', name: t('sync.creative.slot.closeup'), icon: 'center_focus_strong', action: t('sync.creative.action.closeup') },
        { id: 'balcony', name: t('sync.creative.slot.balcony'), icon: 'deck', action: t('sync.creative.action.balcony') }
    ], [t]);

    const architectureSlots = useMemo(() => [
        { id: 'pano1', name: t('sync.creative.slot.pano1'), sub: t('sync.creative.sub.sunrise'), icon: 'wb_twilight', promptDescription: t('sync.creative.desc.pano1') },
        { id: 'pano2', name: t('sync.creative.slot.pano2'), sub: t('sync.creative.sub.sunset'), icon: 'wb_sunny', promptDescription: t('sync.creative.desc.pano2') },
        { id: 'pano3', name: t('sync.creative.slot.pano3'), sub: t('sync.creative.sub.birdseye'), icon: 'flight', promptDescription: t('sync.creative.desc.pano3') },
        { id: 'close1', name: t('sync.creative.slot.close1'), sub: t('sync.creative.sub.material'), icon: 'texture', promptDescription: t('sync.creative.desc.close1') },
        { id: 'close2', name: t('sync.creative.slot.close2'), sub: t('sync.creative.sub.structure'), icon: 'construction', promptDescription: t('sync.creative.desc.close2') },
        { id: 'close3', name: t('sync.creative.slot.close3'), sub: t('sync.creative.sub.entrance'), icon: 'door_front', promptDescription: t('sync.creative.desc.close3') },
        { id: 'close4', name: t('sync.creative.slot.close4'), sub: t('sync.creative.sub.corner'), icon: 'camera_alt', promptDescription: t('sync.creative.desc.close4') },
        { id: 'art1', name: t('sync.creative.slot.art1'), sub: t('sync.creative.sub.bokeh'), icon: 'blur_on', promptDescription: t('sync.creative.desc.art1') },
        { id: 'art2', name: t('sync.creative.slot.art2'), sub: t('sync.creative.sub.night'), icon: 'nights_stay', promptDescription: t('sync.creative.desc.art2') }
    ], [t]);

    const marketingSlots = useMemo(() => [
        { id: 'mkt_wide1', name: t('sync.creative.mkt.wide1'), sub: t('sync.creative.mkt.type_wide'), icon: 'center_focus_strong', promptDescription: t('sync.creative.desc.mkt_wide1') },
        { id: 'mkt_wide2', name: t('sync.creative.mkt.wide2'), sub: t('sync.creative.mkt.type_wide'), icon: 'photo_camera', promptDescription: t('sync.creative.desc.mkt_wide2') },
        { id: 'mkt_wide3', name: t('sync.creative.mkt.wide3'), sub: t('sync.creative.mkt.type_wide'), icon: 'architecture', promptDescription: t('sync.creative.desc.mkt_wide3') },
        { id: 'mkt_close1', name: t('sync.creative.mkt.close1'), sub: t('sync.creative.mkt.type_close'), icon: 'texture', promptDescription: t('sync.creative.desc.mkt_close1') },
        { id: 'mkt_close2', name: t('sync.creative.mkt.close2'), sub: t('sync.creative.mkt.type_close'), icon: 'chair', promptDescription: t('sync.creative.desc.mkt_close2') },
        { id: 'mkt_close3', name: t('sync.creative.mkt.close3'), sub: t('sync.creative.mkt.type_close'), icon: 'vertical_split', promptDescription: t('sync.creative.desc.mkt_close3') },
        { id: 'mkt_cine1', name: t('sync.creative.mkt.cine1'), sub: t('sync.creative.mkt.type_cine'), icon: 'flight', promptDescription: t('sync.creative.desc.mkt_cine1') },
        { id: 'mkt_cine2', name: t('sync.creative.mkt.cine2'), sub: t('sync.creative.mkt.type_cine'), icon: 'expand', promptDescription: t('sync.creative.desc.mkt_cine2') },
        { id: 'mkt_cine3', name: t('sync.creative.mkt.cine3'), sub: t('sync.creative.mkt.type_cine'), icon: 'nights_stay', promptDescription: t('sync.creative.desc.mkt_cine3') }
    ], [t]);

    const currentSlots = useMemo(() => {
        if (creativeOption === 'architecture') return architectureSlots;
        if (creativeOption === 'marketing-showcase') return marketingSlots;
        return interiorSlots;
    }, [creativeOption, architectureSlots, interiorSlots, marketingSlots]);

    const getPromptForSlot = (slot: any) => {
        let fullPrompt = "";
        const isVi = language === 'vi';
        
        if (creativeOption === 'marketing-showcase') {
             const viewDescription = slot.promptDescription || slot.name;
             const charPrompt = characterImage 
                ? (isVi ? `\n\n• NHÂN VẬT:\nCó thêm nhân vật đang sinh hoạt trong không gian một cách tự nhiên.` : `\n\n• CHARACTER:\nInclude a character active in the space naturally.`)
                : "";
             
             if (isVi) {
                 fullPrompt = `VAI TRÒ:\nBạn là một Nhiếp ảnh gia kiến trúc chuyên nghiệp. Bạn được cung cấp một ảnh gốc của một căn phòng hoặc tòa nhà.\n\nYÊU CẦU BẮT BUỘC:\n- GIỮ NGUYÊN 100% phong cách thiết kế, vật liệu, đồ nội thất và màu sắc từ ảnh gốc.\n- CHỈ THAY ĐỔI góc máy và điều kiện ánh sáng.\n\nGÓC NHÌN CẦN TẠO:\n- "${viewDescription}".\n\nPHONG CÁCH:\n- Điện ảnh, sang trọng, dùng cho Marketing BĐS cao cấp.${charPrompt}\n\nĐỊNH DẠNG:\nẢnh chụp thực tế, sắc nét, chất lượng 8k.`;
             } else {
                 fullPrompt = `ROLE:\nYou are a professional Architectural Photographer. You are provided with a source image of a room or building.\n\nMANDATORY REQUIREMENTS:\n- KEEP 100% of the design style, materials, furniture, and colors from the original image.\n- ONLY CHANGE the camera angle and lighting conditions.\n\nVIEW TO GENERATE:\n- "${viewDescription}".\n\nSTYLE:\n- Cinematic, luxurious, suitable for High-end Real Estate Marketing.${charPrompt}\n\nFORMAT:\nPhotorealistic, extremely sharp, 8k resolution.`;
             }
        } else if (creativeOption === 'architecture') {
            const viewDescription = slot.promptDescription || slot.name;
            const charPrompt = characterImage 
                ? (isVi 
                    ? `\n\n• THÊM NHÂN VẬT:\nHãy đưa nhân vật trong ảnh thứ hai vào bối cảnh kiến trúc một cách tự nhiên (ví dụ: đang đi bộ trước sảnh, đứng ở ban công, hoặc đi dạo trong sân vườn). Đảm bảo trang phục và ngoại hình thống nhất với ảnh nhân vật.` 
                    : `\n\n• ADD CHARACTER:\nNaturally integrate the character from the second image into the architectural context (e.g., walking in front of the lobby, standing on the balcony, or walking in the garden). Ensure consistent clothing and appearance with the character image.`)
                : "";

            if (isVi) {
                fullPrompt = `VAI TRÒ:\nBạn là một Kiến trúc sư chuyên nghiệp. Bạn được cung cấp một hình ảnh mẫu kiến trúc đại diện cho 100% hình khối và chi tiết thực tế.\n\nYÊU CẦU BẮT BUỘC:\n- GIỮ NGUYÊN 100% mọi chi tiết kiến trúc, hình khối, vật liệu và cấu trúc từ ảnh mẫu.\n- TUYỆT ĐỐI KHÔNG vẽ thêm, không sáng tạo chi tiết mới, không thay đổi cấu kiện nếu không có trong ảnh gốc.\n- Tập trung vào thành phần hiện hữu của công trình, không được phép nội suy chi tiết lạ.\n\nGÓC NHÌN CẦN TẠO:\n- "${viewDescription}".${charPrompt}\n\nKỸ THUẬT:\nẢnh chụp nhiếp ảnh kiến trúc thực tế, 8k, sắc nét tuyệt đối.`;
            } else {
                 fullPrompt = `ROLE:\nYou are a professional Architect. You are provided with an architectural sample image representing 100% of the actual massing and details.\n\nMANDATORY REQUIREMENTS:\n- KEEP 100% of all architectural details, massing, materials, and structure from the sample image.\n- ABSOLUTELY DO NOT add, invent new details, or change components if they are not in the original image.\n- Focus only on existing components.\n\nVIEW TO GENERATE:\n- "${viewDescription}".${charPrompt}\n\nFORMAT:\nPhotorealistic, 8k resolution, absolutely sharp.`;
            }
        } else if (creativeOption === 'interior-from-arch') {
            const viewName = slot.name;
            const charPrompt = characterImage 
                ? (isVi ? `\n\n• NHÂN VẬT:\nCó thêm nhân vật đang sinh hoạt trong không gian.` : `\n\n• CHARACTER:\nInclude a character active in the space.`)
                : "";
            if (isVi) {
                fullPrompt = `VAI TRÒ:\nBạn là một Kiến trúc sư và Nhà thiết kế nội thất tài ba. Bạn được cung cấp một hình ảnh NGOẠI THẤT. Nhiệm vụ của bạn là thiết kế không gian NỘI THẤT bên trong công trình đó.\n\nYÊU CẦU BẮT BUỘC:\n- PHONG CÁCH: Nội thất hoàn toàn đồng nhất với phong cách kiến trúc ngoại thất.\n- HỆ CỬA SỔ: Kiểu dáng khung cửa, vật liệu và tỷ lệ PHẢI giống hệt với hệ cửa sổ thấy được ở mặt tiền.\n- VẬT LIỆU: Sử dụng bảng vật liệu và màu sắc tương đồng với ngoại thất.\n\nKHÔNG GIAN CẦN TẠO:\n- "${viewName}".${charPrompt}\n\nĐỊNH DẠNG:\nẢnh chụp nhiếp ảnh nội thất chuyên nghiệp, 8k.`;
            } else {
                 fullPrompt = `ROLE:\nYou are a talented Architect and Interior Designer. Design the INTERIOR space inside the building from the provided EXTERIOR image.\n\nMANDATORY REQUIREMENTS:\n- STYLE: Completely consistent with exterior architectural style.\n- WINDOWS: Identical frame style, materials, and proportions as the facade.\n- MATERIALS: Use color palette and materials similar to the exterior.\n\nSPACE TO GENERATE:\n- "${viewName}".${charPrompt}\n\nFORMAT:\nProfessional interior photograph, 8k.`;
            }
        } else {
            const action = slot.action || (isVi ? "đang sinh hoạt trong không gian" : "active in the space");
            const charPrompt = characterImage 
                ? (isVi 
                    ? `\n\n• THÊM NHÂN VẬT:\nHãy đưa nhân vật trong ảnh thứ hai vào không gian một cách tự nhiên. Nhân vật nên ${action}. Đảm bảo trang phục và ngoại hình thống nhất.` 
                    : `\n\n• ADD CHARACTER:\nNaturally integrate the character from the second image. The character should be ${action}. Consistent appearance with the reference.`)
                : "";
            if (isVi) {
                fullPrompt = `VAI TRÒ:\nBạn là một Kiến trúc sư nội thất chuyên nghiệp. Bạn được cung cấp một hình ảnh mẫu đại diện cho style, màu sắc và vật liệu.\n\nYÊU CẦU BẮT BUỘC:\n- GIỮ NGUYÊN Style thiết kế, Bảng màu chủ đạo và Tính chất vật liệu từ ảnh mẫu.\n\nKHÔNG GIAN CẦN TẠO:\n- "${slot.name}".${charPrompt}\n\nKỸ THUẬT:\nẢnh chụp nhiếp ảnh kiến trúc chuyên nghiệp, thực tế, 8k.`;
            } else {
                fullPrompt = `ROLE:\nYou are a professional Interior Architect. Imagine and draw another space in the same house as the provided sample image.\n\nMANDATORY REQUIREMENTS:\n- KEEP design style, dominant color palette, and material properties from the sample.\n\nSPACE TO GENERATE:\n- "${slot.name}".${charPrompt}\n\nFORMAT:\nProfessional architectural photograph, realistic, 8k.`;
            }
        }
        return fullPrompt;
    };

    useEffect(() => {
        if (activeTab === 'creative') {
            const newPrompts: Record<string, string> = {};
            currentSlots.forEach(slot => { newPrompts[slot.id] = getPromptForSlot(slot); });
            onStateChange({ creativePrompts: newPrompts });
        }
    }, [creativeOption, characterImage, language, activeTab]);

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
    const creativeTotalCost = currentSlots.length * unitCost;

    const handleFileSelect = (fileData: FileData | null) => { onStateChange({ sourceImage: fileData, resultImages: [], creativeResults: {} }); };
    const handleResolutionChange = (val: ImageResolution) => { onStateChange({ resolution: val }); };
    const handleSelectCreativeOption = (optionId: string) => { onStateChange({ creativeOption: optionId as any, creativeResults: {} }); setIsCreativeModeSelected(true); };
    const handleBackToSelection = () => { setIsCreativeModeSelected(false); };
    const getResultKey = (option: string, slotId: string) => `${option}-${slotId}`;

    const handleGenerate = async () => {
        const totalCost = numberOfImages * unitCost;
        if (onDeductCredits && userCredits < totalCost) { if (onInsufficientCredits) onInsufficientCredits(); return; }
        if (!sourceImage) { onStateChange({ error: t('err.input.image') }); return; }
        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));
        let logId: string | null = null;
        let jobId: string | null = null;
        try {
            if (onDeductCredits) logId = await onDeductCredits(totalCost, `Đồng bộ view (${numberOfImages} ảnh) - ${resolution}`);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) { jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.ViewSync, prompt: customPrompt || 'Synced view rendering', cost: totalCost, usage_log_id: logId }); }
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
            if (successfulUrls.length > 0) { if (jobId) await jobService.updateJobStatus(jobId, 'completed', successfulUrls[0]); } else { if (lastError) throw lastError; throw new Error("Lỗi tạo ảnh."); }
        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") setShowSafetyModal(true); else onStateChange({ error: t(friendlyKey) });
            if (logId && onDeductCredits) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    try {
                        await refundCredits(user.id, totalCost, `Hoàn tiền: Lỗi đồng bộ view (${rawMsg})`, logId);
                    } catch (refundErr) { console.error("Refund failed:", refundErr); }
                }
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        } finally { onStateChange({ isLoading: false }); setStatusMessage(null); }
    };

    const handleGenerateSingleView = async (slot: any) => {
        if (onDeductCredits && userCredits < unitCost) { if (onInsufficientCredits) onInsufficientCredits(); return; }
        if (!sourceImage) { onStateChange({ error: t('err.input.image') }); return; }
        const uniqueKey = getResultKey(creativeOption, slot.id);
        setGeneratingViews(prev => new Set(prev).add(uniqueKey));
        onStateChange({ error: null });
        let logId: string | null = null;
        try {
            if (onDeductCredits) logId = await onDeductCredits(unitCost, `Creative View: ${slot.name} (${resolution})`);
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const inputImages = [sourceImage];
            if (characterImage) inputImages.push(characterImage);
            const fullPrompt = creativePrompts[slot.id] || getPromptForSlot(slot);
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
            if (rawMsg.includes("SAFETY_POLICY_VIOLATION")) setShowSafetyModal(true); else onStateChange({ error: t(jobService.mapFriendlyErrorMessage(rawMsg)) });
            if (logId && onDeductCredits) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    try {
                        await refundCredits(user.id, unitCost, `Hoàn tiền: Lỗi sáng tạo view (${rawMsg})`, logId);
                    } catch (refundErr) { console.error("Refund failed:", refundErr); }
                }
            }
        } finally { setGeneratingViews(prev => { const next = new Set(prev); next.delete(uniqueKey); return next; }); }
    };

    const handleGenerateBatch = async () => {
        if (onDeductCredits && userCredits < creativeTotalCost) { if (onInsufficientCredits) onInsufficientCredits(); return; }
        if (!sourceImage) { onStateChange({ error: t('err.input.image') }); return; }
        const allViewKeys = new Set(currentSlots.map(s => getResultKey(creativeOption, s.id)));
        setGeneratingViews(allViewKeys);
        onStateChange({ error: null });
        let logId: string | null = null;
        try {
            if (onDeductCredits) logId = await onDeductCredits(creativeTotalCost, `Creative Batch: ${currentSlots.length} views (${resolution})`);
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const inputImages = [sourceImage];
            if (characterImage) inputImages.push(characterImage);
            const promises = currentSlots.map(async (slot) => {
                const uniqueKey = getResultKey(creativeOption, slot.id);
                try {
                    const fullPrompt = creativePrompts[slot.id] || getPromptForSlot(slot);
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
                    } else {
                        throw new Error("No image returned");
                    }
                } catch (err) { console.error(`Error generating view ${slot.name}:`, err); throw err; } 
                finally { setGeneratingViews(prev => { const next = new Set(prev); next.delete(uniqueKey); return next; }); }
            });
            await Promise.all(promises);
        } catch (err: any) {
            const rawMsg = err.message || "";
            if (rawMsg.includes("SAFETY_POLICY_VIOLATION")) setShowSafetyModal(true); else onStateChange({ error: t(jobService.mapFriendlyErrorMessage(rawMsg)) });
            setGeneratingViews(new Set());
            if (logId && onDeductCredits) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    try {
                        await refundCredits(user.id, creativeTotalCost, `Hoàn tiền: Lỗi sáng tạo bộ ảnh (${rawMsg})`, logId);
                    } catch (refundErr) { console.error("Refund failed:", refundErr); }
                }
            }
        }
    };

    const handleDownload = async (url?: any, name?: any) => {
        const actualUrl = typeof url === 'string' ? url : resultImages[selectedIndex];
        const actualName = typeof name === 'string' ? name : 'synced-view';
        if (actualUrl) { setIsDownloading(true); await externalVideoService.forceDownload(actualUrl, `view-sync-${actualName}-${Date.now()}.png`); setIsDownloading(false); }
    };

    const handleDownloadAllCreative = async () => {
        const currentModeKeys = currentSlots.map(s => getResultKey(creativeOption, s.id));
        const urls = currentModeKeys.map(k => creativeResults[k]).filter(Boolean);
        if (urls.length === 0) return;
        setIsDownloading(true);
        for (const slot of currentSlots) {
            const key = getResultKey(creativeOption, slot.id);
            const url = creativeResults[key];
            if (url) { await externalVideoService.forceDownload(url, `creative-${slot.name}-${Date.now()}.png`); await new Promise(r => setTimeout(r, 800)); }
        }
        setIsDownloading(false);
    };

    const handlePreview = (url: string) => { setPreviewImage(url); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const handleLocalPromptChange = (slotId: string, val: string) => { onStateChange({ creativePrompts: { ...creativePrompts, [slotId]: val } }); };

    const selectedOptionData = creativeOptions.find(o => o.id === creativeOption);
    const hasCreativeResults = currentSlots.some(s => !!creativeResults[getResultKey(creativeOption, s.id)]);

    return (
        <div className="flex flex-col gap-0 w-full lg:-mt-6">
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
            
            <div className="flex justify-center mb-2 sm:mb-4 px-2">
                <div className="bg-gray-100 dark:bg-black/30 p-0.5 rounded-full inline-flex border border-gray-200 dark:border-white/10 w-full sm:w-auto overflow-hidden">
                    <button onClick={() => onStateChange({ activeTab: 'sync' })} className={`flex-1 sm:flex-none px-4 sm:px-8 py-2 rounded-full text-xs sm:text-sm font-bold transition-all ${activeTab === 'sync' || !activeTab ? 'bg-white dark:bg-[#7f13ec] text-black dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{t('sync.tab.sync')}</button>
                    <button onClick={() => onStateChange({ activeTab: 'creative' })} className={`flex-1 sm:flex-none px-4 sm:px-8 py-2 rounded-full text-xs sm:text-sm font-bold transition-all ${activeTab === 'creative' ? 'bg-white dark:bg-[#7f13ec] text-black dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{t('sync.tab.creative')}</button>
                </div>
            </div>

            {(activeTab === 'sync' || !activeTab) && (
                <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 md:gap-8 w-full max-w-full items-stretch px-2 sm:px-4">
                    <aside className="w-full lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden lg:h-[calc(100vh-130px)] lg:sticky lg:top-[120px]">
                        <div className="p-3 space-y-4 flex-1 lg:overflow-y-auto custom-sidebar-scroll">
                            <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-3 border border-gray-200 dark:border-white/5">
                                <div>
                                    <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('sync.step1')}</label>
                                    <ImageUpload onFileSelect={(f) => onStateChange({ sourceImage: f, resultImages: [], directionImage: null })} previewUrl={sourceImage?.objectURL} />
                                </div>
                            </div>
                            <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                                <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('sync.step2')}</label>
                                <div className="flex bg-white dark:bg-[#121212] p-1 rounded-xl border border-gray-200 dark:border-[#302839]">
                                    <button onClick={() => onStateChange({ sceneType: 'exterior' })} className={`flex-1 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-colors ${sceneType === 'exterior' || !sceneType ? 'bg-[#7f13ec] text-white shadow' : 'text-gray-400'}`}>{t('sync.scene.ext')}</button>
                                    <button onClick={() => onStateChange({ sceneType: 'interior' })} className={`flex-1 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-colors ${sceneType === 'interior' ? 'bg-[#7f13ec] text-white shadow' : 'text-gray-400'}`}>{t('sync.scene.int')}</button>
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
                                    <textarea rows={window.innerWidth < 768 ? 4 : 6} className="w-full bg-transparent outline-none text-xs sm:text-sm resize-none font-medium text-text-primary dark:text-white" placeholder={t('sync.prompt_placeholder')} value={customPrompt} onChange={(e) => onStateChange({ customPrompt: e.target.value })} />
                                </div>
                            </div>
                            <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                                <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} />
                                <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                                <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                            </div>
                        </div>
                        <div className="p-4 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] lg:sticky lg:bottom-0 z-10 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                            <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-3 sm:py-4 rounded-xl transition-all shadow-lg active:scale-95 text-sm sm:text-base">
                                {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('sync.btn_generate')} | {unitCost * numberOfImages}</span> <span className="material-symbols-outlined text-yellow-400 text-base sm:text-lg align-middle notranslate">monetization_on</span></>}
                            </button>
                        </div>
                    </aside>
                    <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden min-h-[400px] sm:min-h-[500px] lg:h-[calc(100vh-130px)] lg:sticky lg:top-[120px]">
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-[300px]">
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
                                            <button onClick={handleDownload} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20">
                                                <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.download')}</span>
                                                <span className="material-symbols-outlined text-base sm:text-lg notranslate">download</span>
                                            </button>
                                            <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20">
                                                <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.zoom')}</span>
                                                <span className="material-symbols-outlined text-base sm:text-lg notranslate">zoom_in</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center opacity-20 select-none bg-main-bg dark:bg-[#121212] p-8 text-center">
                                        <span className="material-symbols-outlined text-4xl sm:text-6xl mb-4">view_in_ar</span>
                                        <p className="text-sm sm:text-base font-medium">{t('msg.no_result_render')}</p>
                                    </div>
                                )}
                                {isLoading && (
                                    <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center">
                                        <Spinner />
                                        <p className="text-white mt-4 font-bold animate-pulse text-sm sm:text-base">{statusMessage}</p>
                                    </div>
                                )}
                            </div>
                            {resultImages.length > 0 && !isLoading && (
                                <div className="flex-shrink-0 w-full p-2 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839]">
                                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center items-center">
                                        {resultImages.map((url, idx) => (
                                            <button key={url} onClick={() => setSelectedIndex(idx)} className={`flex-shrink-0 w-12 sm:w-16 md:w-20 aspect-square rounded-lg border-2 transition-all overflow-hidden ${selectedIndex === idx ? 'border-[#7f13ec] ring-2 ring-purple-500/20 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}>
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

            {activeTab === 'creative' && !isCreativeModeSelected && (
                <div className="flex flex-col gap-6 animate-fade-in py-6 px-4">
                    <div className="text-center max-w-2xl mx-auto">
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('sync.creative.title')}</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('sync.creative.desc')}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-[1400px] mx-auto w-full">
                        {creativeOptions.map(opt => (
                            <button 
                                key={opt.id} 
                                onClick={() => handleSelectCreativeOption(opt.id)} 
                                className="group relative flex flex-col h-72 sm:h-80 md:h-96 rounded-2xl sm:rounded-3xl overflow-hidden border border-gray-200 dark:border-[#302839] hover:border-[#7f13ec] dark:hover:border-[#7f13ec] transition-all duration-500 shadow-sm hover:shadow-2xl text-left"
                            >
                                <div className="absolute inset-0 z-0">
                                    <img src={opt.bg} alt={opt.label} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/20 group-hover:via-black/50 transition-all duration-500"></div>
                                </div>
                                <div className="relative z-10 flex flex-col h-full p-6 sm:p-8 justify-end">
                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center mb-4 sm:mb-5 group-hover:bg-[#7f13ec] group-hover:border-[#7f13ec] transition-all duration-300 shadow-lg">
                                        <span className="material-symbols-outlined text-xl sm:text-2xl text-white notranslate">{opt.icon}</span>
                                    </div>
                                    <div className="space-y-1 sm:space-y-2">
                                        <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-white transition-colors">{opt.label}</h3>
                                        <p className="text-xs sm:text-sm text-gray-300 line-clamp-3 leading-relaxed opacity-90 group-hover:opacity-100 transition-opacity">
                                            {opt.longDesc || opt.desc}
                                        </p>
                                    </div>
                                    <div className="mt-6 sm:mt-8 flex items-center text-[10px] sm:text-xs font-bold text-white/50 group-hover:text-white transition-all transform translate-y-2 group-hover:translate-y-0 uppercase tracking-widest">
                                        {t('sync.creative.btn_start')} 
                                        <span className="material-symbols-outlined text-sm ml-2 group-hover:translate-x-1 transition-transform notranslate">arrow_forward</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'creative' && isCreativeModeSelected && (
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 sm:gap-6 md:gap-8 animate-fade-in p-2 sm:p-4 mt-2 items-start">
                    <div className="w-full lg:col-span-4 flex flex-col gap-4 sm:gap-6 lg:sticky lg:top-[120px] self-start h-fit">
                        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-[#302839] relative overflow-visible z-30">
                             <div className="px-1 pt-1">
                                <button onClick={handleBackToSelection} className="flex items-center gap-2 text-text-secondary dark:text-gray-400 hover:text-[#7f13ec] dark:hover:text-[#a855f7] transition-all font-bold text-xs sm:text-sm group mb-3" >
                                    <span className="material-symbols-outlined notranslate group-hover:-translate-x-1 transition-transform">arrow_back</span>
                                    <span>{t('common.back')}</span>
                                </button>
                            </div>

                            <div className="relative" ref={modeDropdownRef}>
                                <button 
                                    onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                                    className="w-full bg-[#7f13ec]/5 dark:bg-[#7f13ec]/10 p-3 sm:p-4 rounded-2xl border border-[#7f13ec]/20 flex items-center justify-between hover:bg-[#7f13ec]/10 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 sm:p-2 rounded-lg bg-[#7f13ec] text-white">
                                            <span className="material-symbols-outlined text-lg sm:text-xl notranslate">{selectedOptionData?.icon || 'auto_awesome'}</span>
                                        </div>
                                        <div className="text-left">
                                            <span className="block text-[8px] sm:text-[10px] font-bold text-[#7f13ec] uppercase tracking-wider">{language === 'vi' ? 'Chế độ (Nhấn để đổi)' : 'Mode (Click to switch)'}</span>
                                            <span className="block text-xs sm:text-sm font-black text-text-primary dark:text-white">{selectedOptionData?.label}</span>
                                        </div>
                                    </div>
                                    <span className={`material-symbols-outlined text-[#7f13ec] transition-transform duration-200 ${isModeDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                </button>

                                {isModeDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1E1E1E] rounded-xl shadow-2xl border border-border-color dark:border-[#302839] overflow-hidden animate-fade-in p-1.5 z-50">
                                        {creativeOptions.map((opt) => (
                                            <button
                                                key={opt.id}
                                                onClick={() => {
                                                    handleSelectCreativeOption(opt.id);
                                                    setIsModeDropdownOpen(false);
                                                }}
                                                className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${creativeOption === opt.id ? 'bg-[#7f13ec]/10 text-[#7f13ec]' : 'hover:bg-gray-100 dark:hover:bg-[#2A2A2A] text-text-primary dark:text-gray-200'}`}
                                            >
                                                <span className="material-symbols-outlined text-lg">{opt.icon}</span>
                                                <span className="text-xs sm:text-sm font-bold">{opt.label}</span>
                                                {creativeOption === opt.id && <span className="material-symbols-outlined text-sm ml-auto">check</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-[#302839] space-y-5 sm:space-y-6">
                            <div>
                                <label className="flex justify-between items-center text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 mb-2"><span>{t('sync.workspace.source')}</span>{sourceImage && <span className="text-[9px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full uppercase">OK</span>}</label>
                                <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-black/20 overflow-hidden"><ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} /></div>
                            </div>
                            <div>
                                <label className="flex justify-between items-center text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 mb-2"><span>{t('sync.workspace.char')}</span>{characterImage && <span className="text-[9px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full uppercase">OK</span>}</label>
                                <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-black/20 overflow-hidden"><ImageUpload onFileSelect={(f) => onStateChange({ characterImage: f })} previewUrl={characterImage?.objectURL} id="char-upload" /></div>
                                <p className="text-[9px] text-gray-400 mt-1.5 px-1">{t('sync.workspace.char_hint')}</p>
                            </div>
                            <div className="pt-4 border-t border-gray-100 dark:border-[#302839]">
                                <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} disabled={generatingViews.size > 0} />
                            </div>
                            <div><ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={generatingViews.size > 0} /></div>
                            <button onClick={handleGenerateBatch} disabled={generatingViews.size > 0 || !sourceImage} className="w-full py-3 sm:py-4 bg-[#7f13ec] hover:bg-[#690fca] disabled:bg-gray-400 dark:disabled:bg-gray-700 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 transform active:scale-95 text-sm">
                                {generatingViews.size > 0 ? <><Spinner /> {t('sync.workspace.generating_wait')}</> : <>{t('sync.workspace.btn_generate_batch').replace('{count}', currentSlots.length.toString())} | {creativeTotalCost} <span className="material-symbols-outlined text-xs text-yellow-500 ml-1">monetization_on</span></>}
                            </button>
                        </div>
                    </div>

                    <div className="w-full lg:col-span-8 flex flex-col">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('sync.workspace.result_title')}</h3>
                            {hasCreativeResults && (
                                <button onClick={handleDownloadAllCreative} disabled={isDownloading} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black hover:opacity-90 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md">
                                    {isDownloading ? <Spinner /> : <span className="material-symbols-outlined text-lg">download_for_offline</span>}
                                    <span>{t('sync.workspace.download_all')}</span>
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                            {currentSlots.map((slot) => {
                                const key = getResultKey(creativeOption, slot.id);
                                const resultUrl = creativeResults[key];
                                const isGenerating = generatingViews.has(key);
                                const currentPrompt = creativePrompts[slot.id] || "";
                                return (
                                    <div key={slot.id} className="group relative bg-white dark:bg-[#1E1E1E] rounded-2xl overflow-hidden border border-gray-200 dark:border-[#302839] hover:border-[#7f13ec]/50 transition-all duration-300 shadow-lg flex flex-col h-full">
                                        <div className="aspect-square relative w-full bg-black/40 overflow-hidden">
                                            {resultUrl ? (
                                                <>
                                                    <img src={resultUrl} alt={slot.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 cursor-pointer" onClick={() => handlePreview(resultUrl)} />
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm pointer-events-none">
                                                        <div className="flex gap-2 pointer-events-auto">
                                                            <button onClick={() => handlePreview(resultUrl)} className="group/btn relative p-2 sm:p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all hover:scale-110">
                                                                <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap uppercase tracking-wider">{t('common.zoom')}</span>
                                                                <span className="material-symbols-outlined text-base sm:text-lg notranslate">zoom_in</span>
                                                            </button>
                                                            <button onClick={() => handleDownload(resultUrl, slot.name)} className="group/btn relative p-2 sm:p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all hover:scale-110">
                                                                <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap uppercase tracking-wider">{t('common.download')}</span>
                                                                <span className="material-symbols-outlined text-base sm:text-lg notranslate">download</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : isGenerating ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 dark:bg-[#151515]">
                                                    <Spinner />
                                                    <span className="text-[10px] font-bold text-gray-500 mt-4 animate-pulse uppercase tracking-widest">{t('sync.workspace.generating')}</span>
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center opacity-30 p-4 text-center">
                                                    <span className="material-symbols-outlined text-4xl sm:text-5xl text-gray-400 dark:text-gray-600 mb-2">{slot.icon}</span>
                                                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase">{slot.name}</span>
                                                </div>
                                            )}
                                            <div className="absolute top-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                                                <h4 className="text-xs sm:text-sm font-bold text-white shadow-sm">{slot.name}</h4>
                                                {slot.sub && <p className="text-[8px] sm:text-[10px] text-gray-300 font-medium">{slot.sub}</p>}
                                            </div>
                                        </div>
                                        <div className="p-3 sm:p-4 border-t border-gray-100 dark:border-[#302839] bg-gray-50 dark:bg-[#222] flex flex-col gap-3 flex-grow">
                                            <div className="flex flex-col gap-1.5 flex-grow">
                                                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[12px]">description</span> LỜI NHẮC AI
                                                </label>
                                                <div className="bg-white dark:bg-black/30 rounded-lg border border-gray-200 dark:border-white/5 overflow-hidden flex-grow shadow-inner">
                                                    <textarea 
                                                        value={currentPrompt}
                                                        onChange={(e) => handleLocalPromptChange(slot.id, e.target.value)}
                                                        className="w-full text-xs font-medium text-text-primary dark:text-gray-200 leading-relaxed bg-transparent p-3 outline-none resize-none scrollbar-thin scrollbar-thumb-gray-800 dark:scrollbar-thumb-gray-600 min-h-[160px]"
                                                        rows={6}
                                                    />
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleGenerateSingleView(slot)} 
                                                disabled={isGenerating || !sourceImage} 
                                                className={`w-full py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-2 ${resultUrl ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-[#7f13ec] hover:bg-[#690fca] text-white shadow-lg'}`}
                                            >
                                                {isGenerating ? <Spinner /> : <span className="material-symbols-outlined text-sm">{resultUrl ? 'refresh' : 'auto_fix_high'}</span>}
                                                {isGenerating 
                                                    ? t('sync.workspace.generating') 
                                                    : <>{resultUrl ? t('sync.workspace.regenerate') : t('sync.workspace.generate')} | {unitCost} <span className="material-symbols-outlined text-xs text-yellow-500 ml-1">monetization_on</span></>}
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
