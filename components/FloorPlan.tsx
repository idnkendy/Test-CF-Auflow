import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { FloorPlanState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import ImagePreviewModal from './common/ImagePreviewModal';
import ResolutionSelector from './common/ResolutionSelector';
import AspectRatioSelector from './common/AspectRatioSelector';
import MultiImageUpload from './common/MultiImageUpload';
import OptionSelector from './common/OptionSelector';
import SafetyWarningModal from './common/SafetyWarningModal';
import { useLanguage } from '../hooks/useLanguage';

interface FloorPlanProps {
    state: FloorPlanState;
    onStateChange: (newState: Partial<FloorPlanState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

// Local Error Modal Component
const ErrorModal: React.FC<{ isOpen: boolean; onClose: () => void; message: string }> = ({ isOpen, onClose, message }) => {
    const { t } = useLanguage();
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
            <div className="bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#302839] rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center animate-scale-up">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-red-600 dark:text-red-500 text-4xl">error</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('common.error')}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6 leading-relaxed">{message}</p>
                <button 
                    onClick={onClose}
                    className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-black font-bold rounded-xl transition-all hover:opacity-90"
                >
                    {t('common.close')}
                </button>
            </div>
        </div>
    );
};

const FloorPlan: React.FC<FloorPlanProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { 
        prompt, layoutPrompt, sourceImage, referenceImages, isLoading, error, resultImages, 
        numberOfImages, renderMode, planType, resolution, aspectRatio,
        projectType, importantArea, time, weather, style
    } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [localErrorMessage, setLocalErrorMessage] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isAutoPromptLoading, setIsAutoPromptLoading] = useState(false);

    // Mode Selection State
    const [isModeSelected, setIsModeSelected] = useState(false);
    const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
    const modeDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
                setIsModeDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

    // --- MODE DATA ---
    const planModes = useMemo(() => [
        { 
            id: 'architecture', 
            label: language === 'vi' ? 'Kiến trúc' : 'Architecture', 
            desc: language === 'vi' ? 'Chuyển mặt bằng kỹ thuật thành phối cảnh ngoại thất 3D.' : 'Convert technical plans into 3D exterior perspectives.',
            icon: 'apartment',
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/render-2d-exterior.png'
        },
        { 
            id: 'interior', 
            label: language === 'vi' ? 'Nội thất' : 'Interior', 
            desc: language === 'vi' ? 'Lên màu và bố trí nội thất từ bản vẽ 2D.' : 'Colorize and furnish interiors from 2D drawings.',
            icon: 'chair',
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/render-2d-noi-that.png'
        },
        { 
            id: 'urban', 
            label: t('tool.urban'), 
            desc: language === 'vi' ? 'Quy hoạch tổng thể từ bản đồ phân lô.' : 'Master planning from subdivision maps.',
            icon: 'map',
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/render-2d-urban.png'
        },
        { 
            id: 'landscape', 
            label: t('tool.landscape'), 
            desc: language === 'vi' ? 'Thiết kế cảnh quan sân vườn từ mặt bằng.' : 'Landscape garden design from site plans.',
            icon: 'park',
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/render-2d-garden.png'
        }
    ], [t, language]);

    const handleSelectMode = (mode: string) => {
        onStateChange({ planType: mode as any });
        setIsModeSelected(true);
    };

    const handleBackToDashboard = () => setIsModeSelected(false);

    // --- OPTIONS ---
    const exteriorProjectTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.building.townhouse'), label: t('opt.building.townhouse') },
        { value: t('opt.building.villa'), label: t('opt.building.villa') },
        { value: t('opt.building.apartment'), label: t('opt.building.apartment') },
        { value: 'Resort', label: 'Resort' },
        { value: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}`, label: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}` },
        { value: t('opt.building.office'), label: t('opt.building.office') },
        { value: 'Park', label: language === 'vi' ? 'Công viên' : 'Park' },
    ], [t, language]);

    const importantAreaOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: language === 'vi' ? 'Khu nhà ở' : 'Residential area', label: language === 'vi' ? 'Khu nhà ở' : 'Residential area' },
        { value: language === 'vi' ? 'Khu thương mại' : 'Commercial area', label: language === 'vi' ? 'Khu thương mại' : 'Commercial area' },
        { value: language === 'vi' ? 'Khu vui chơi' : 'Playground', label: language === 'vi' ? 'Khu vui chơi' : 'Playground' },
        { value: language === 'vi' ? 'Cổng' : 'Entrance', label: language === 'vi' ? 'Cổng' : 'Entrance' },
        { value: language === 'vi' ? 'Bungalow mái rơm' : 'Thatch Bungalow', label: language === 'vi' ? 'Bungalow mái rơm' : 'Thatch Bungalow' },
        { value: language === 'vi' ? 'Nhà hàng & Cafe' : 'Restaurant & Cafe', label: language === 'vi' ? 'Nhà hàng & Cafe' : 'Restaurant & Cafe' },
        { value: language === 'vi' ? 'Bãi đỗ xe' : 'Parking', label: language === 'vi' ? 'Bãi đỗ xe' : 'Parking' },
    ], [language, t]);

    const timeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: language === 'vi' ? 'Ban ngày' : 'Daytime', label: language === 'vi' ? 'Ban ngày' : 'Daytime' },
        { value: language === 'vi' ? 'Hoàng hôn' : 'Sunset', label: language === 'vi' ? 'Hoàng hôn' : 'Sunset' },
        { value: language === 'vi' ? 'Ban đêm' : 'Night', label: language === 'vi' ? 'Ban đêm' : 'Night' },
    ], [language, t]);

    const weatherOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: language === 'vi' ? 'Nắng đẹp' : 'Sunny', label: language === 'vi' ? 'Nắng đẹp' : 'Sunny' },
        { value: language === 'vi' ? 'Nhiều mây' : 'Cloudy', label: language === 'vi' ? 'Nhiều mây' : 'Cloudy' },
        { value: language === 'vi' ? 'Mưa' : 'Rainy', label: language === 'vi' ? 'Mưa' : 'Rainy' },
    ], [language, t]);

    const interiorProjectTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: language === 'vi' ? 'Nhà ở' : 'House', label: language === 'vi' ? 'Nhà ở' : 'House' },
        { value: t('opt.building.apartment'), label: t('opt.building.apartment') },
        { value: t('opt.building.villa'), label: t('opt.building.villa') },
        { value: language === 'vi' ? 'Thương mại' : 'Commercial', label: language === 'vi' ? 'Thương mại' : 'Commercial' },
        { value: t('opt.building.office'), label: t('opt.building.office') },
        { value: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}`, label: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}` },
        { value: 'Hotel/Resort', label: language === 'vi' ? 'Khách sạn/Resort' : 'Hotel/Resort' },
        { value: 'Showroom', label: 'Showroom' },
    ], [t, language]);

    const interiorStyleOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.style.modern'), label: t('opt.style.modern') },
        { value: 'Classic', label: language === 'vi' ? 'Cổ điển' : 'Classic' },
        { value: t('opt.style.neoclassic'), label: t('opt.style.neoclassic') },
        { value: 'Indochine', label: 'Indochine' },
        { value: 'Vintage', label: 'Vintage' },
        { value: 'Mediterranean', label: language === 'vi' ? 'Địa Trung Hải' : 'Mediterranean' },
        { value: t('opt.style.minimalist'), label: t('opt.style.minimalist') },
    ], [t, language]);

    const topDownLabel = planType === 'architecture' ? t('ext.floorplan.mode.topdown_ext') : t('ext.floorplan.mode.topdown_int');
    const perspectiveLabel = planType === 'architecture' ? t('ext.floorplan.mode.perspective_ext') : t('ext.floorplan.mode.perspective_int');

    // Default Prompt Logic
    useEffect(() => {
        const isVi = language === 'vi';
        let targetTopDown = '';
        let targetPerspective = '';

        if (planType === 'architecture') {
            targetTopDown = t('floorplan.prompt.exterior_topdown');
            targetPerspective = t('floorplan.prompt.exterior_perspective');
        } else if (planType === 'interior') {
            targetTopDown = t('floorplan.prompt.interior_topdown');
            targetPerspective = t('floorplan.prompt.interior_perspective');
        } else if (planType === 'urban') {
            targetTopDown = t('floorplan.prompt.urban');
            targetPerspective = t('floorplan.prompt.urban');
        } else if (planType === 'landscape') {
            targetTopDown = t('floorplan.prompt.landscape');
            targetPerspective = t('floorplan.prompt.landscape');
        }

        // Apply default if current prompt matches one of the other standard prompts or is empty
        const allStandard = [
            t('floorplan.prompt.exterior_topdown'), t('floorplan.prompt.interior_topdown'),
            t('floorplan.prompt.exterior_perspective'), t('floorplan.prompt.interior_perspective'),
            t('floorplan.prompt.urban'), t('floorplan.prompt.landscape'),
            "Biến thành ảnh chụp thực tế dự án", "Transform into realistic project photo",
            "Phối cảnh 3D ngoại thất từ mặt bằng", "3D exterior perspective from floor plan",
            "Biến thành ảnh chụp thực tế nội thất", "Transform into realistic interior photo",
            "Phối cảnh 3D nội thất từ mặt bằng", "3D interior perspective from floor plan",
            "Render mặt bằng quy hoạch đô thị thành phối cảnh 3D thực tế, chi tiết đường phố, cây xanh và khối nhà.",
            "Convert this urban planning floor plan into a realistic 3D rendering with streets, greenery and building masses.",
            "Render mặt bằng sân vườn thành phối cảnh 3D thực tế, chi tiết cây cối, lối đi và tiểu cảnh.",
            "Convert this landscape site plan into a realistic 3D garden rendering with detailed plants, paths and features."
        ];

        const isStandardPrompt = !prompt || allStandard.includes(prompt);
        const isStandardLayoutPrompt = !layoutPrompt || allStandard.includes(layoutPrompt);

        if (isStandardPrompt || isStandardLayoutPrompt) {
            onStateChange({ 
                prompt: targetTopDown,
                layoutPrompt: targetPerspective
            });
        }
    }, [planType, language, t]);

    const syncPrompt = (overrides: Partial<FloorPlanState>) => {
        const s = { ...state, ...overrides };
        const isVi = language === 'vi';
        const isTopDown = s.renderMode === 'top-down';
        const isArch = s.planType === 'architecture';

        let base = "";

        // Helper to get label
        const getLabel = (opts: any[], val: string) => {
            if (val === 'none') return "";
            return opts.find(o => o.value === val)?.label || "";
        }

        if (s.planType === 'architecture' || s.planType === 'interior') {
            if (isTopDown) {
                if (isArch) {
                    base = t('floorplan.prompt.exterior_topdown');
                    const pType = getLabel(exteriorProjectTypeOptions, s.projectType);
                    if (pType) base += ` ${pType.toLowerCase()}`;

                    const area = getLabel(importantAreaOptions, s.importantArea);
                    if (area) base += `, ${isVi ? 'khu vực' : 'area'} ${area.toLowerCase()}`;
                    
                    const tVal = getLabel(timeOptions, s.time);
                    if (tVal) base += `, ${tVal.toLowerCase()}`;
                    
                    const wVal = getLabel(weatherOptions, s.weather);
                    if (wVal) base += `, ${wVal.toLowerCase()}`;

                } else {
                    base = t('floorplan.prompt.interior_topdown');
                    const pType = getLabel(interiorProjectTypeOptions, s.projectType);
                    if (pType) base += ` ${pType.toLowerCase()}`;
                    
                    const sType = getLabel(interiorStyleOptions, s.style);
                    if (sType) base += `, ${isVi ? 'phong cách' : 'style'} ${sType.toLowerCase()}`;
                }
            } else {
                base = isArch ? t('floorplan.prompt.exterior_perspective') : t('floorplan.prompt.interior_perspective');
            }
            onStateChange({ ...overrides, [isTopDown ? 'prompt' : 'layoutPrompt']: base });
        }
    };

    const showError = (msg: string) => { setLocalErrorMessage(msg); setIsErrorModalOpen(true); };

    const handleAutoPrompt = async () => {
        if (!sourceImage) return;
        setIsAutoPromptLoading(true);
        onStateChange({ error: null });
        try {
            // Mapping planType to what service expects
            const servicePlanType = planType === 'interior' ? 'interior' : 'exterior'; 
            
            const newPrompt = await geminiService.generateFloorPlanPrompt(sourceImage, servicePlanType, renderMode, language);
            if (renderMode === 'top-down') onStateChange({ prompt: newPrompt });
            else onStateChange({ layoutPrompt: newPrompt });
        } catch (err: any) { showError(err.message || t('common.error')); } finally { setIsAutoPromptLoading(false); }
    };

    const cost = numberOfImages * (resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5);

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits(); else showError(t('common.insufficient'));
             return;
        }
        
        let activePrompt = prompt;
        // Logic specific to Architecture/Interior modes
        if (planType === 'architecture' || planType === 'interior') {
            activePrompt = renderMode === 'top-down' ? prompt : layoutPrompt;
        }

        if (!activePrompt || !activePrompt.trim()) { showError('Vui lòng nhập mô tả hoặc sử dụng gợi ý.'); return; }
        if (!sourceImage) { showError('Vui lòng tải lên ảnh mặt bằng.'); return; }

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));
        let logId: string | null = null;

        let finalPrompt = "";
        if (planType === 'urban') {
            finalPrompt = `Convert this urban planning 2D map into a realistic 3D aerial rendering. ${activePrompt}. Photorealistic, high detail.`;
        } else if (planType === 'landscape') {
            finalPrompt = `Convert this landscape/garden 2D plan into a realistic 3D rendering. ${activePrompt}. Photorealistic, high detail vegetation.`;
        } else {
            // Arch / Interior logic
            finalPrompt = renderMode === 'top-down' 
            ? `Convert this 2D floor plan into a photorealistic top-down 3D rendering. ${activePrompt}.` 
            : `Convert this 2D floor plan into a photorealistic 3D perspective view. ${activePrompt}.`;
        }

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Render mặt bằng (${planType})`);
            }
            
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const inputImages = [sourceImage, ...referenceImages].filter(Boolean) as FileData[];

            // Parallel Generation Loop
            const promises = Array.from({ length: numberOfImages }).map(async (_, idx) => {
                const result = await externalVideoService.generateFlowImage(
                    finalPrompt, 
                    inputImages, 
                    aspectRatio, 
                    1, // Force 1 image per request
                    modelName,
                    (msg) => setStatusMessage(`${t('common.processing')} (${idx + 1}/${numberOfImages})`)
                );

                if (result.imageUrls && result.imageUrls.length > 0) {
                    let finalUrl = result.imageUrls[0];
                    if ((resolution === '2K' || resolution === '4K') && result.mediaIds?.[0]) {
                        const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                        const upResult = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                        if (upResult?.imageUrl) finalUrl = upResult.imageUrl;
                    }
                    return finalUrl;
                }
                return null;
            });

            const results = await Promise.all(promises);
            const successfulUrls = results.filter((url): url is string => url !== null);

            if (successfulUrls.length > 0) {
                onStateChange({ resultImages: successfulUrls });
                successfulUrls.forEach(url => historyService.addToHistory({ 
                    tool: Tool.FloorPlan, prompt: activePrompt, 
                    sourceImageURL: sourceImage?.objectURL, resultImageURL: url 
                }));
            } else {
                throw new Error("Không thể tạo ảnh nào sau nhiều lần thử.");
            }

        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
            } else {
                showError(t(friendlyKey));
            }

            // Refund logic
            if (logId && onDeductCredits) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    try {
                        await refundCredits(user.id, cost, `Hoàn tiền: Lỗi mặt bằng (${rawMsg})`, logId);
                    } catch (refundErr) {
                        console.error("Refund failed:", refundErr);
                    }
                }
            }
        } finally { onStateChange({ isLoading: false }); }
    };

    const handleDownload = async () => {
        if (resultImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImages[selectedIndex], "floorplan-render.png");
            setIsDownloading(false);
        }
    };

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
        if (val === 'Standard') onStateChange({ referenceImages: [] });
    };

    const handleReferenceFilesChange = (files: FileData[]) => onStateChange({ referenceImages: files });

    // Determine if we show complex or simple UI
    const isComplexMode = planType === 'architecture' || planType === 'interior';
    const showAutoPromptButton = isComplexMode && !(planType === 'architecture' && renderMode === 'perspective');

    if (!isModeSelected) {
        return (
            <div className="max-w-7xl mx-auto pb-10 px-4">
                <div className="mb-8 md:mb-12 text-center animate-fade-in-up">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-text-primary dark:text-white mb-3 md:mb-4">
                        {language === 'vi' ? 'Bạn muốn Render mặt bằng nào?' : 'Which Floor Plan do you want to Render?'}
                    </h2>
                    <p className="text-text-secondary dark:text-gray-400 max-w-2xl mx-auto text-sm sm:text-base md:text-lg leading-relaxed px-4">
                        {language === 'vi' ? 'Chọn chế độ phù hợp để AI tối ưu hóa kết quả render mặt bằng của bạn.' : 'Select a mode for AI to optimize your floor plan rendering results.'}
                    </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {planModes.map((m, idx) => (
                        <button key={m.id} onClick={() => handleSelectMode(m.id)} className="group relative flex flex-col h-64 sm:h-72 md:h-80 rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl shadow-xl" style={{ animationDelay: `${idx * 100}ms` }} >
                            {m.image && <img src={m.image} alt={m.label} className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent dark:from-black/95 dark:via-black/60 dark:to-transparent"></div>
                            <div className="relative z-10 flex flex-col h-full p-6 sm:p-8 justify-end text-left">
                                <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
                                    <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-xl text-white border border-white/20 group-hover:bg-[#7f13ec] group-hover:border-[#7f13ec] transition-all duration-300">
                                        <span className="material-symbols-outlined text-xl sm:text-2xl notranslate">{m.icon}</span>
                                    </div>
                                    <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-[#E0E0E0] transition-colors">{m.label}</h3>
                                </div>
                                <p className="text-xs sm:text-sm text-gray-300 line-clamp-2 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">{m.desc}</p>
                                <div className="mt-4 sm:mt-6 flex items-center text-[10px] sm:text-xs font-bold text-white/50 group-hover:text-white transition-colors uppercase tracking-widest">
                                    {language === 'vi' ? 'Bắt đầu ngay' : 'Start now'}
                                    <span className="material-symbols-outlined text-sm ml-2 group-hover:translate-x-1 transition-transform notranslate">arrow_forward</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 md:gap-8 max-w-[1920px] mx-auto items-stretch px-2 sm:px-4">
            <style>{`
                .custom-sidebar-scroll::-webkit-scrollbar { width: 5px; }
                .custom-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #334155; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
            `}</style>

            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            <ErrorModal isOpen={isErrorModalOpen} onClose={() => setIsErrorModalOpen(false)} message={localErrorMessage} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <aside className="w-full lg:w-[350px] xl:w-[380px] flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-visible lg:h-[calc(100vh-130px)] lg:sticky lg:top-[120px] hidden lg:flex">
                <div className="p-3 space-y-4 flex-1 lg:overflow-y-auto custom-sidebar-scroll overflow-visible">
                    <div className="px-1 pt-1">
                        <button onClick={handleBackToDashboard} className="flex items-center gap-2 text-text-secondary dark:text-gray-400 hover:text-[#7f13ec] dark:hover:text-[#a855f7] transition-all font-bold text-xs sm:text-sm group" >
                            <span className="material-symbols-outlined notranslate group-hover:-translate-x-1 transition-transform">arrow_back</span>
                            <span>{t('common.back')}</span>
                        </button>
                    </div>

                    {/* Interactive Mode Dropdown */}
                    <div className="relative z-20" ref={modeDropdownRef}>
                        <button 
                            onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                            className="w-full bg-[#7f13ec]/5 dark:bg-[#7f13ec]/10 p-3 sm:p-4 rounded-2xl border border-[#7f13ec]/20 flex items-center justify-between hover:bg-[#7f13ec]/10 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 sm:p-2 bg-[#7f13ec] rounded-lg text-white">
                                    <span className="material-symbols-outlined text-base sm:text-lg notranslate">{planModes.find(m => m.id === planType)?.icon || 'dashboard'}</span>
                                </div>
                                <div className="text-left">
                                    <span className="block text-[8px] sm:text-[10px] font-bold text-[#7f13ec] uppercase tracking-wider">{language === 'vi' ? 'Chế độ (Nhấn để đổi)' : 'Mode (Click to switch)'}</span>
                                    <span className="block text-xs sm:text-sm font-black text-text-primary dark:text-white">{planModes.find(m => m.id === planType)?.label}</span>
                                </div>
                            </div>
                            <span className={`material-symbols-outlined text-[#7f13ec] transition-transform duration-200 ${isModeDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>

                        {isModeDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1E1E1E] rounded-xl shadow-2xl border border-border-color dark:border-[#302839] overflow-hidden animate-fade-in p-1.5 z-50">
                                {planModes.map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => {
                                            handleSelectMode(m.id);
                                            setIsModeDropdownOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${planType === m.id ? 'bg-[#7f13ec]/10 text-[#7f13ec]' : 'hover:bg-gray-100 dark:hover:bg-[#2A2A2A] text-text-primary dark:text-gray-200'}`}
                                    >
                                        <span className="material-symbols-outlined text-lg">{m.icon}</span>
                                        <span className="text-xs sm:text-sm font-bold">{m.label}</span>
                                        {planType === m.id && <span className="material-symbols-outlined text-sm ml-auto">check</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-3 border border-gray-200 dark:border-white/5">
                        {/* Top-Down / Perspective Toggle (Only for Arch/Int) */}
                        {isComplexMode && (
                            <div className="grid grid-cols-2 gap-2 bg-white dark:bg-[#121212] p-1 rounded-xl border border-gray-200 dark:border-[#302839] mb-3">
                                <button onClick={() => onStateChange({ renderMode: 'top-down' })} className={`py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-colors ${renderMode === 'top-down' ? 'bg-[#7f13ec] text-white' : 'text-gray-400'}`}>{topDownLabel}</button>
                                <button onClick={() => onStateChange({ renderMode: 'perspective' })} className={`py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-colors ${renderMode === 'perspective' ? 'bg-[#7f13ec] text-white' : 'text-gray-400'}`}>{perspectiveLabel}</button>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.floorplan.step1')}</label>
                            <ImageUpload onFileSelect={(f) => onStateChange({ sourceImage: f, resultImages: [] })} previewUrl={sourceImage?.objectURL} />
                        </div>
                    </div>

                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">
                                {isComplexMode 
                                    ? (renderMode === 'top-down' ? t('ext.floorplan.step4') : t('ext.floorplan.step3_perspective'))
                                    : t('img_gen.step2') // "Describe Idea" for Urban/Landscape
                                }
                            </label>
                            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                                <textarea 
                                    rows={window.innerWidth < 768 ? 4 : 6} 
                                    className="w-full bg-transparent outline-none text-xs sm:text-sm resize-none font-medium text-text-primary dark:text-white" 
                                    placeholder={t('ext.urban.prompt_ph')} 
                                    value={isComplexMode && renderMode === 'perspective' ? layoutPrompt : prompt} 
                                    onChange={(e) => onStateChange({ [isComplexMode && renderMode === 'perspective' ? 'layoutPrompt' : 'prompt']: e.target.value })} 
                                />
                            </div>
                            {showAutoPromptButton && (
                                <button type="button" onClick={handleAutoPrompt} disabled={!sourceImage || isAutoPromptLoading || isLoading} className="mt-2 w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all bg-gray-800 dark:bg-gray-700 hover:bg-black dark:hover:bg-gray-600 text-white shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400" >
                                    {isAutoPromptLoading ? <Spinner /> : <><span className="material-symbols-outlined text-sm sm:text-base">auto_awesome</span> <span>{t('ext.floorplan.auto_prompt')}</span></>}
                                </button>
                            )}
                        </div>
                        
                        {/* Specific Options ONLY for Architecture/Interior Top-Down */}
                        <div className="space-y-3">
                            {renderMode === 'top-down' && planType === 'architecture' && (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="fp-p-type" label={t('opt.building_type')} options={exteriorProjectTypeOptions} value={projectType} onChange={(v) => syncPrompt({ projectType: v })} variant="select" />
                                        <OptionSelector id="fp-area" label={language === 'vi' ? 'Khu vực' : 'Area'} options={importantAreaOptions} value={importantArea} onChange={(v) => syncPrompt({ importantArea: v })} variant="select" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="fp-time" label={t('ext.landscape.time')} options={timeOptions} value={time} onChange={(v) => syncPrompt({ time: v })} variant="select" />
                                        <OptionSelector id="fp-weather" label={t('opt.weather')} options={weatherOptions} value={weather} onChange={(v) => syncPrompt({ weather: v })} variant="select" />
                                    </div>
                                </>
                            )}
                            {renderMode === 'top-down' && planType === 'interior' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <OptionSelector id="fp-int-type" label={t('opt.int.project_type')} options={interiorProjectTypeOptions} value={projectType} onChange={(v) => syncPrompt({ projectType: v })} variant="select" />
                                    <OptionSelector id="fp-int-style" label={t('opt.style')} options={interiorStyleOptions} value={style} onChange={(v) => syncPrompt({ style: v })} variant="select" />
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        {/* Reference Images only shown in Perspective mode for complex types or if user is Urban/Landscape (optional but kept consistent) */}
                        {(planType === 'urban' || planType === 'landscape' || (isComplexMode && renderMode === 'perspective')) && (
                            <div>
                                <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.ref_images')}</label>
                                {resolution === 'Standard' ? (
                                    <div className="p-4 bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 h-28 shadow-inner"><span className="material-symbols-outlined text-yellow-500 text-xl">lock</span><p className="text-[10px] text-text-secondary dark:text-gray-400 px-2 leading-tight">{t('img_gen.ref_lock')}</p><button onClick={() => handleResolutionChange('1K')} className="text-[10px] text-[#7f13ec] hover:underline font-bold uppercase">{t('img_gen.upgrade')}</button></div>
                                ) : (
                                    <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                                )}
                            </div>
                        )}
                        <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({aspectRatio: val})} />
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({numberOfImages: val})} />
                    </div>
                </div>
                <div className="p-4 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] lg:sticky lg:bottom-0 z-10 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button onClick={handleGenerate} disabled={isLoading} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-3 sm:py-4 rounded-xl transition-all shadow-lg active:scale-95 text-sm sm:text-base">
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('ext.floorplan.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-base sm:text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>
            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden min-h-[400px] sm:min-h-[500px] lg:h-[calc(100vh-130px)] lg:sticky lg:top-[120px]">
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-[300px]">
                        {resultImages.length > 0 ? (
                            <div className="w-full h-full p-2 animate-fade-in flex flex-col items-center justify-center relative">
                                <div className="w-full h-full flex items-center justify-center overflow-hidden">{sourceImage ? <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[selectedIndex]} /> : <img src={resultImages[selectedIndex]} alt="Result" className="max-w-full max-h-full object-contain" />}</div>
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
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-20 select-none bg-main-bg dark:bg-[#121212] p-8 text-center"><span className="material-symbols-outlined text-4xl sm:text-6xl mb-4">dashboard</span><p className="text-sm sm:text-base font-medium">{t('msg.no_result_render')}</p></div>
                        )}
                        {isLoading && (
                            <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center"><Spinner /><p className="text-white mt-4 font-bold animate-pulse text-sm sm:text-base">{statusMessage}</p></div>
                        )}
                    </div>
                    {resultImages.length > 0 && !isLoading && (
                        <div className="flex-shrink-0 w-full p-2 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839]"><div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center items-center">{resultImages.map((url, idx) => (<button key={url} onClick={() => setSelectedIndex(idx)} className={`flex-shrink-0 w-12 sm:w-16 md:w-20 aspect-square rounded-lg border-2 transition-all overflow-hidden ${selectedIndex === idx ? 'border-[#7f13ec] ring-2 ring-purple-500/20 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}><img src={url} className="w-full h-full object-cover" alt={`Result ${idx + 1}`} /></button>))}</div></div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default FloorPlan;