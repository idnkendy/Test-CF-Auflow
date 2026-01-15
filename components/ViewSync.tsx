
import React, { useState, useRef, useEffect } from 'react';
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

const perspectiveAngles = [
    { id: 'default', label: 'Mặc định', promptClause: "the same general perspective as the source image" },
    { id: 'front', label: 'Chính diện', promptClause: "Straight-on front elevation view, symmetrical composition. Flat facade focusing on geometric shapes and materials." },
    { id: 'left-side', label: '3/4 Trái', promptClause: "a 3/4 perspective view from the front-left, showing depth and dimension of the building massing." },
    { id: 'right-side', label: '3/4 Phải', promptClause: "a 3/4 perspective view from the front-right, showing both the front and right facades" },
    { id: 'wide-frame', label: 'Góc rộng', promptClause: "Wide-angle shot capturing the building within its surrounding context and landscape. Spacious atmosphere, expanded field of view." },
    { id: 'panoramic', label: 'Panorama', promptClause: "Panoramic view, ultra-wide horizontal composition. Capturing the entire landscape and building context in a single frame. Cinematic wide shot." },
    { id: 'top-down', label: 'Trên cao', promptClause: "Aerial bird's-eye view looking down from above. Drone photography showing the roof plan, site layout, and surrounding environment. Masterplan visualization." },
    { id: 'low-angle', label: 'Ngước lên', promptClause: "Low angle worm's-eye view looking up at the building. Imposing and majestic stature against the sky. Dramatic perspective emphasizing height." },
    { id: 'close-up', label: 'Cận cảnh', promptClause: "Macro close-up shot of architectural details. Focus on textures, materials, and intricate facade elements. Shallow depth of field, blurred background." },
];

const atmosphericAngles = [
    { id: 'default', label: 'Mặc định', promptClause: "with standard daylight lighting" },
    { id: 'early-morning', label: 'Sáng sớm', promptClause: "in the early morning, with soft, gentle sunrise light and long shadows" },
    { id: 'midday-sun', label: 'Trưa nắng', promptClause: "at midday under bright, direct sunlight with strong, short shadows" },
    { id: 'late-afternoon', label: 'Chiều tà', promptClause: "during the late afternoon (golden hour), with warm, orange-hued light and long, dramatic shadows" },
    { id: 'night', label: 'Ban đêm', promptClause: "at night, with interior and exterior lights turned on" },
    { id: 'rainy', label: 'Trời mưa', promptClause: "during a gentle rain, with wet surfaces and a slightly overcast sky" },
    { id: 'misty', label: 'Sương mù', promptClause: "on a misty or foggy morning, creating a soft and mysterious atmosphere" },
    { id: 'after-rain', label: 'Sau mưa', promptClause: "just after a rain shower, with wet ground reflecting the sky and surroundings, and a sense of freshness in the air" },
];

const framingAngles = [
    { id: 'none', label: 'Không có hiệu ứng', promptClause: "" },
    { id: 'through-trees', label: 'Xuyên qua hàng cây', promptClause: "The building is seen through a foreground of trees or foliage, creating a natural framing effect." },
    { id: 'through-window', label: 'Nhìn qua cửa kính Cafe', promptClause: "The building is seen from inside a cozy cafe across the street, looking out through the cafe's large glass window, which creates a framing effect." },
    { id: 'through-flowers', label: 'Xuyên qua hàng hoa', promptClause: "The building is viewed through a foreground of colorful flowers lining the roadside, creating a beautiful and soft framing effect." },
    { id: 'through-car-window', label: 'Qua cửa kính xe hơi', promptClause: "The building is seen from the perspective of looking out from a car parked on the side of the road, with the car's window frame and side mirror creating a dynamic frame." },
];

const interiorViewAngles = [
    { id: 'default', label: 'Mặc định', prompt: "Maintain the same camera perspective as the source image." },
    { id: 'wide-angle', label: 'Góc rộng', prompt: "Generate a wide-angle view of the interior space, capturing as much of the room as possible. Maintain the same design style, furniture, and materials as the uploaded image." },
    { id: 'from-corner', label: 'Từ góc phòng', prompt: "Generate a view from a corner of the room, looking towards the center. Maintain the same design style, furniture, and materials as the uploaded image." },
    { id: 'detail-shot', label: 'Cận cảnh', prompt: "Generate a close-up detail shot of a key furniture piece or decorative element. Maintain the same design style, furniture, and materials as the uploaded image." },
    { id: 'towards-window', label: 'Nhìn ra cửa sổ', prompt: "Generate a view from inside the room looking towards the main window, showing the natural light. Maintain the same design style, furniture, and materials as the uploaded image." },
    { id: 'night-view', label: 'Ban đêm', prompt: "Generate a view of the interior space at night, with artificial lighting turned on (lamps, ceiling lights). Maintain the same design style, furniture, and materials as the uploaded image." },
    { id: 'top-down-interior', label: 'Từ trên xuống', prompt: "Generate a top-down view of the room's layout, similar to a 3D floor plan. Maintain the same design style, furniture, and materials as the uploaded image." },
];

// --- CREATIVE VIEW CONSTANTS ---
const creativeOptions = [
    { 
        id: 'interior', 
        label: 'View Nội thất', 
        icon: 'chair', 
        desc: 'Tạo các góc phòng',
        longDesc: 'Tự động tạo các góc nhìn nội thất khác nhau (Phòng khách, Bếp, Phòng ngủ...) từ cùng một phong cách thiết kế.'
    },
    { 
        id: 'architecture', 
        label: 'View Kiến trúc', 
        icon: 'apartment', 
        desc: 'Diễn họa ngoại thất',
        longDesc: 'Tạo các phối cảnh ngoại thất đa dạng (Góc chim bay, Mặt tiền, Cận cảnh...) giữ nguyên ngôn ngữ kiến trúc.'
    },
    { 
        id: 'interior-from-arch', 
        label: 'Nội thất từ Kiến trúc', 
        icon: 'foundation', 
        desc: 'Tưởng tượng bên trong',
        longDesc: 'AI sẽ phân tích kiến trúc ngoại thất để dự đoán và thiết kế không gian nội thất phù hợp bên trong.'
    }
];

const interiorSlots = [
    { name: 'Phòng khách', icon: 'chair', action: 'đang ngồi thư giãn trên sofa' },
    { name: 'Phòng ngủ', icon: 'bed', action: 'đang nằm nghỉ ngơi trên giường' },
    { name: 'Phòng bếp', icon: 'kitchen', action: 'đang chuẩn bị đồ ăn tại bàn bếp' },
    { name: 'Phòng ăn', icon: 'dining', action: 'đang ngồi tại bàn ăn' },
    { name: 'Phòng đọc', icon: 'menu_book', action: 'đang ngồi làm việc tại bàn' },
    { name: 'Phòng tắm', icon: 'bathtub', action: 'đang đứng trước gương' },
    { name: 'Hành lang', icon: 'door_sliding', action: 'đang đi bộ trong hành lang' },
    { name: 'Góc cận cảnh', icon: 'center_focus_strong', action: 'đang chạm tay vào bề mặt vật liệu' },
    { name: 'Ban công / Sân vườn', icon: 'deck', action: 'đang đứng ngắm cảnh' }
];

const architectureSlots = [
    { name: 'Toàn cảnh 1', sub: 'Bình minh', icon: 'wb_twilight', promptDescription: "Góc cao toàn cảnh bao quát công trình, ánh sáng bình minh trong trẻo với sương nhẹ" },
    { name: 'Toàn cảnh 2', sub: 'Hoàng hôn', icon: 'wb_sunny', promptDescription: "Góc nghiêng 45 độ toàn cảnh từ xa, bối cảnh bầu trời hoàng hôn vàng rực rỡ" },
    { name: 'Toàn cảnh 3', sub: 'Góc chim bay', icon: 'flight', promptDescription: "Góc chụp flycam từ trên cao nhìn xuống (bird-eye view), thấy toàn bộ khuôn viên và cảnh quan" },
    { name: 'Cận cảnh 1', sub: 'Vật liệu bề mặt', icon: 'texture', promptDescription: "Cận cảnh đặc tả bề mặt vật liệu hiện có trên công trình: vân đá, gỗ hoặc kim loại" },
    { name: 'Cận cảnh 2', sub: 'Chi tiết cấu tạo', icon: 'construction', promptDescription: "Cận cảnh chi tiết cấu trúc hiện có: các khớp nối, lan can hoặc điểm giao cắt hình khối" },
    { name: 'Cận cảnh 3', sub: 'Lối vào & Sảnh', icon: 'door_front', promptDescription: "Cận cảnh tập trung vào lối vào chính và sảnh đón của công trình gốc" },
    { name: 'Cận cảnh 4', sub: 'Góc kiến trúc', icon: 'camera_alt', promptDescription: "Cận cảnh một góc chi tiết kiến trúc hoặc cảnh quan ngay sát chân công trình" },
    { name: 'Nghệ thuật 1', sub: 'Xóa phông tiền cảnh', icon: 'blur_on', promptDescription: "Góc máy nghệ thuật với tiền cảnh mờ ảo, lấy nét sâu vào một chi tiết hiện hữu của công trình" },
    { name: 'Nghệ thuật 2', sub: 'Phối cảnh đêm', icon: 'nights_stay', promptDescription: "Góc máy đêm kịch tính, nhấn mạnh ánh sáng hắt ra từ các ô cửa hiện có của công trình" }
];

interface ViewSyncProps {
    state: ViewSyncState;
    onStateChange: (newState: Partial<ViewSyncState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

const ViewSync: React.FC<ViewSyncProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
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
                 onStateChange({ error: jobService.mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") });
             }
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên một ảnh gốc để bắt đầu.' });
            return;
        }
        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage('Đang phân tích góc nhìn...');
        setUpscaleWarning(null);

        let logId: string | null = null;
        let jobId: string | null = null;

        // Use Flow for all resolutions (Standard, 1K, 2K, 4K).
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
                // Use aspect ratio string directly (e.g. '3:4') instead of mapping to enum
                const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
                const collectedUrls: string[] = [];
                const inputImages: FileData[] = [sourceImage];
                if (directionImage) inputImages.push(directionImage);

                const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                    try {
                        setStatusMessage('Đang xử lý. Vui lòng đợi...');
                        const result = await externalVideoService.generateFlowImage(
                            finalPrompt,
                            inputImages,
                            aspectRatio, // Pass raw string
                            1,
                            modelName,
                            (msg) => setStatusMessage('Đang xử lý. Vui lòng đợi...')
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
                        }
                    } catch (e: any) {
                        console.error(`Image ${index+1} failed`, e);
                    }
                });

                await Promise.all(promises);
                if (collectedUrls.length === 0) {
                    throw new Error("Không thể tạo ảnh nào. Vui lòng thử lại sau.");
                }
                imageUrls = collectedUrls;

            } else {
                // Fallback (Code removed for brevity as Flow covers all)
            }

            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);
            
        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                friendlyMsg = "Ảnh bị từ chối do vi phạm chính sách an toàn.";
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                await refundCredits(user.id, totalCost, `Hoàn tiền: Lỗi đồng bộ view (${rawMsg})`, logId);
                if (friendlyMsg !== "Ảnh bị từ chối do vi phạm chính sách an toàn.") friendlyMsg += " (Credits đã được hoàn trả)";
            }
            
            onStateChange({ error: friendlyMsg });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    // --- CREATIVE BATCH GENERATION ---
    const handleGenerateBatch = async () => {
        if (onDeductCredits && userCredits < creativeTotalCost) {
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: jobService.mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") });
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

            // Execute in parallel
            const promises = slots.map(async (slot) => {
                const uniqueKey = getResultKey(creativeOption, slot.name);
                try {
                    let fullPrompt = "";

                    if (creativeOption === 'architecture') {
                        // New Architecture Logic
                        // @ts-ignore - architecture slots have promptDescription
                        const viewDescription = slot.promptDescription || slot.name;
                        const charPrompt = characterImage 
                            ? `THÊM NHÂN VẬT: Hãy đưa nhân vật trong ảnh thứ hai vào bối cảnh kiến trúc một cách tự nhiên (ví dụ: đang đi bộ trước sảnh, đứng ở ban công, hoặc đi dạo trong sân vườn). Đảm bảo trang phục and ngoại hình thống nhất with ảnh nhân vật.` 
                            : "";

                        fullPrompt = `Bạn là một Kiến trúc sư chuyên nghiệp. Bạn được cung cấp một hình ảnh mẫu kiến trúc đại diện cho 100% hình khối và chi tiết thực tế. Nhiệm vụ của bạn là vẽ lại một view kiến trúc cụ thể (cận cảnh hoặc nghệ thuật) từ công trình này.
YÊU CẦU BẮT BUỘC:
- GIỮ NGUYÊN 100% mọi chi tiết kiến trúc, hình khối, vật liệu và cấu trúc từ ảnh mẫu.
- TUYỆT ĐỐI KHÔNG vẽ thêm, không sáng tạo chi tiết mới, không thay đổi cấu kiện nếu không có trong ảnh gốc. Chỉ được phép lấy đúng những gì đang có trên công trình gốc để thể hiện.
- Đối với các view CẬN CẢNH và NGHỆ THUẬT: Bạn chỉ được phép tập trung vào những thành phần hiện hữu của công trình, không được phép nội suy hay sử dụng chi tiết lạ.
- Bạn chỉ được phép thay đổi góc máy, tiêu cự ống kính, và điều kiện ánh sáng để tạo ra bức ảnh nhiếp ảnh kiến trúc chuyên nghiệp.
- VIEW CẦN TẠO: "${viewDescription}".
${charPrompt}
Kết quả phải là một ảnh chụp thực tế, 8k, sắc nét tuyệt đối.`;

                    } else if (creativeOption === 'interior-from-arch') {
                        // Logic cho Nội thất từ Kiến trúc
                        const viewName = slot.name;
                        const charPrompt = characterImage ? "Có thêm nhân vật đang sinh hoạt trong không gian." : "";

                        fullPrompt = `Bạn là một Kiến trúc sư and Nhà thiết kế nội thất tài ba. Bạn được cung cấp một hình ảnh NGOẠI THẤT của một công trình kiến trúc. Nhiệm vụ của bạn là thiết kế and vẽ ra không gian NỘI THẤT bên trong công trình đó.
YÊU CẦU BẮT BUỘC:
- PHONG CÁCH: Nội thất phải hoàn toàn đồng nhất with phong cách kiến trúc ngoại thất (ví dụ: nếu kiến trúc hiện đại tối giản thì nội thất cũng phải hiện đại tối giản).
- HỆ CỬA SỔ: Nếu không gian có cửa sổ, kiểu dáng khung cửa, vật liệu and tỷ lệ của cửa sổ PHẢI giống hệt with hệ cửa sổ thấy được ở mặt tiền kiến trúc trong ảnh gốc.
- VẬT LIỆU: Sử dụng bảng vật liệu and màu sắc tương đồng with ngoại thất để tạo sự xuyên suốt.
- KHÔNG GIAN CẦN TẠO: "${viewName}".
${charPrompt}
Kết quả là một bức ảnh chụp nhiếp ảnh nội thất chuyên nghiệp, 8k, ánh sáng ban ngày tự nhiên cực kỳ chân thực.`;

                    } else {
                        // Existing Interior Logic (Creative Interior)
                        // @ts-ignore - interior slots have action
                        const action = slot.action || "đang hoạt động trong không gian";
                        let charPrompt = "";
                        if (characterImage) {
                            charPrompt = `THÊM NHÂN VẬT: Hãy đưa nhân vật trong ảnh thứ hai vào không gian một cách tự nhiên. Nhân vật nên ${action}. Đảm bảo trang phục and ngoại hình của nhân vật thống nhất with ảnh nhân vật được cung cấp.`;
                        }
                        fullPrompt = `Bạn là một Kiến trúc sư nội thất chuyên nghiệp. Bạn được cung cấp một hình ảnh mẫu đại diện cho style, màu sắc và vật liệu. Nhiệm vụ của bạn là tưởng tượng và vẽ ra một không gian khác trong cùng ngôi nhà đó.
YÊU CẦU BẮT BUỘC:
- GIỮ NGUYÊN Style thiết kế (ví dụ: Japandi, Industrial, Tân cổ điển...).
- GIỮ NGUYÊN Bảng màu chủ đạo (ví dụ: Gỗ óc chó + Da bò + Xám bê tông).
- GIỮ NGUYÊN Tính chất vật liệu (độ bóng, độ nhám, vân gỗ).
- KHÔNG GIAN CẦN TẠO: "${slot.name}".
${charPrompt}
Hãy vẽ một bức ảnh chụp nhiếp ảnh kiến trúc chuyên nghiệp, thực tế, 8k, ánh sáng ban ngày tự nhiên dịu nhẹ.`;
                    }

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
            if (jobId) await jobService.updateJobStatus(jobId, 'completed');

        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                friendlyMsg = "Ảnh bị từ chối do vi phạm chính sách an toàn.";
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                await refundCredits(user.id, creativeTotalCost, `Hoàn tiền: Lỗi sáng tạo view (${rawMsg})`, logId);
                if (friendlyMsg !== "Ảnh bị từ chối do vi phạm chính sách an toàn.") friendlyMsg += " (Credits đã được hoàn trả)";
            }
            onStateChange({ error: friendlyMsg });
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
                        Đồng Bộ View
                    </button>
                    <button 
                        onClick={() => onStateChange({ activeTab: 'creative' })}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                            activeTab === 'creative' 
                                ? 'bg-white dark:bg-[#7f13ec] text-black dark:text-white shadow-sm' 
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                    >
                        Sáng Tạo View
                    </button>
                </div>
            </div>

            {/* --- STANDARD SYNC VIEW --- */}
            {(activeTab === 'sync' || !activeTab) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                    <div className="space-y-4">
                        <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                            <label className="block text-sm font-medium mb-2">1. Tải Lên Ảnh Gốc</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                        <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700 space-y-4">
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">2. Tùy chỉnh góc nhìn</label>
                            
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
                                    Ngoại thất
                                </button>
                                <button 
                                    onClick={() => onStateChange({ sceneType: 'interior' })}
                                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                        sceneType === 'interior' 
                                            ? 'bg-white dark:bg-gray-600 shadow text-text-primary dark:text-white' 
                                            : 'text-text-secondary dark:text-gray-400 hover:text-text-primary'
                                    }`}
                                >
                                    Nội thất
                                </button>
                            </div>

                            {/* Dynamic Angle Selector based on Scene Type */}
                            {(sceneType === 'exterior' || !sceneType) ? (
                                <OptionSelector 
                                    id="perspective" 
                                    label="Chọn Góc Máy Ngoại Thất" 
                                    options={perspectiveAngles.map(a => ({ value: a.id, label: a.label }))} 
                                    value={selectedPerspective} 
                                    onChange={(val) => onStateChange({ selectedPerspective: val })} 
                                    variant="grid" 
                                    disabled={!!directionImage || isLoading} 
                                />
                            ) : (
                                <OptionSelector 
                                    id="interior-angle" 
                                    label="Chọn Góc Máy Nội Thất" 
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
                                    label="Hiệu ứng khung hình" 
                                    options={framingAngles.map(a => ({ value: a.id, label: a.label }))} 
                                    value={selectedFraming} 
                                    onChange={(val) => onStateChange({ selectedFraming: val })} 
                                    variant="select" 
                                    disabled={isLoading} 
                                />
                                <OptionSelector 
                                    id="atmosphere" 
                                    label="Thời gian / Không khí" 
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
                                placeholder="Mô tả thêm (ví dụ: trời nắng đẹp, nhiều cây xanh)..." 
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
                                    <span>Chi phí: <span className="font-bold text-text-primary dark:text-white">{unitCost * numberOfImages} Credits</span></span>
                                </div>
                                <div className="text-xs">
                                    {userCredits < unitCost * numberOfImages ? (
                                        <span className="text-red-500 font-semibold">Không đủ (Có: {userCredits})</span>
                                    ) : (
                                        <span className="text-green-600 dark:text-green-400">Khả dụng: {userCredits}</span>
                                    )}
                                </div>
                            </div>

                            <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2 shadow-lg">
                                {isLoading ? <><Spinner /> {statusMessage || 'Đang xử lý...'}</> : 'Tạo hàng loạt'}
                            </button>
                            {upscaleWarning && <p className="mt-2 text-xs text-yellow-500 text-center">{upscaleWarning}</p>}
                        </div>
                    </div>
                    <div className="aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                        {isLoading ? (
                            <div className="flex flex-col items-center">
                                <Spinner />
                                <p className="mt-2 text-text-secondary dark:text-gray-400">{statusMessage || 'Đang xử lý...'}</p>
                            </div>
                        ) : resultImages.length > 0 ? <ResultGrid images={resultImages} toolName="view-sync" /> : <p className="text-gray-400">Kết quả sẽ hiển thị ở đây</p>}
                    </div>
                </div>
            )}

            {/* --- CREATIVE VIEW (NEW FLOW) --- */}
            {activeTab === 'creative' && !isCreativeModeSelected && (
                // SELECTION SCREEN
                <div className="flex flex-col gap-8 animate-fade-in py-4">
                    <div className="text-center max-w-2xl mx-auto">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Chọn Chế Độ Sáng Tạo</h2>
                        <p className="text-gray-500 dark:text-gray-400">Khám phá các góc nhìn mới từ thiết kế của bạn với các công cụ chuyên sâu.</p>
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
                                    Bắt đầu ngay <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
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
                                Quay lại chọn chế độ
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
                                    <span>Ảnh Gốc (Style)</span>
                                    {sourceImage && <span className="text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">Đã tải lên</span>}
                                </label>
                                <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-black/20 overflow-hidden">
                                    <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                                </div>
                            </div>
                            
                            <div>
                                <label className="flex justify-between items-center text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                                    <span>Ảnh Nhân vật (Tùy chọn)</span>
                                    {characterImage && <span className="text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">Đã tải lên</span>}
                                </label>
                                <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-black/20 overflow-hidden">
                                    <ImageUpload onFileSelect={handleCharacterSelect} previewUrl={characterImage?.objectURL} id="char-upload" />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1.5 px-1">
                                    Nhân vật sẽ được AI lồng ghép tự nhiên vào bối cảnh.
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
                                    <span>Chi phí: <span className="font-bold text-text-primary dark:text-white">{creativeTotalCost} Credits</span></span>
                                </div>
                                <div className="text-xs">
                                    {userCredits < creativeTotalCost ? (
                                        <span className="text-red-500 font-semibold">Không đủ</span>
                                    ) : (
                                        <span className="text-green-600 dark:text-green-400">Khả dụng</span>
                                    )}
                                </div>
                            </div>

                            <button 
                                onClick={handleGenerateBatch} 
                                disabled={generatingViews.size > 0 || !sourceImage} 
                                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2 shadow-lg"
                            >
                                {generatingViews.size > 0 ? <><Spinner /> Đang xử lý {generatingViews.size} ảnh...</> : `Tạo trọn bộ (${slots.length} ảnh)`}
                            </button>
                        </div>
                    </div>

                    {/* RIGHT GRID: WORKSPACE */}
                    <div className="lg:col-span-8">
                        {/* Header for Results */}
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Kết quả sáng tạo</h3>
                            
                            {/* BULK DOWNLOAD BUTTON */}
                            {hasCreativeResults && (
                                <button 
                                    onClick={handleDownloadAllCreative}
                                    disabled={isDownloading}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200 rounded-lg text-sm font-bold transition-all shadow-md disabled:opacity-50"
                                >
                                    {isDownloading ? <Spinner /> : <span className="material-symbols-outlined text-lg">download_for_offline</span>}
                                    <span>Tải tất cả ({Object.values(creativeResults).filter(Boolean).length})</span>
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
                                                    <span className="text-xs font-bold text-gray-400 mt-3 animate-pulse uppercase tracking-wider">Đang vẽ...</span>
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
