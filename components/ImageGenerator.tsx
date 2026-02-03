import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService'; // Added for refund logic
import { supabase } from '../services/supabaseClient'; // Added for user auth in refund
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { ImageGeneratorState } from '../state/toolState';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import MultiImageUpload from './common/MultiImageUpload';
import ImageComparator from './ImageComparator';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import OptionSelector from './common/OptionSelector';
import AspectRatioSelector from './common/AspectRatioSelector';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import SafetyWarningModal from './common/SafetyWarningModal';
import { useLanguage } from '../hooks/useLanguage';

interface ImageGeneratorProps {
  state: ImageGeneratorState;
  onStateChange: (newState: Partial<ImageGeneratorState>) => void;
  onSendToViewSync: (image: FileData) => void;
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

const ImageGenerator: React.FC<ImageGeneratorProps> = ({ state, onStateChange, onSendToViewSync, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { 
        renderMode, style, context, lighting, weather, buildingType, roomType, colorPalette, 
        viewType, density, gardenStyle, features,
        customPrompt, referenceImages, sourceImage, isLoading, resultImages, 
        numberOfImages, aspectRatio, resolution 
    } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [localErrorMessage, setLocalErrorMessage] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isAutoPromptLoading, setIsAutoPromptLoading] = useState(false);
    
    // New local state to handle the mode selection dashboard
    const [isModeSelected, setIsModeSelected] = useState(false);
    
    // Dropdown state for quick mode switch
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

    // Mode options for the dashboard
    const modes = useMemo(() => [
        { 
            id: 'arch', 
            label: t('img_gen.mode_arch'), 
            desc: t('services.arch_desc'),
            icon: 'apartment',
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/Render-Anh/ngoai-that.png'
        },
        { 
            id: 'interior', 
            label: t('img_gen.mode_interior'), 
            desc: t('services.interior_desc'),
            icon: 'chair',
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/Render-Anh/noi-that.png'
        },
        { 
            id: 'urban', 
            label: t('img_gen.mode_urban'), 
            desc: t('services.urban_desc'),
            icon: 'map',
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/render-quy-hoach-do-thi.jpeg'
        },
        { 
            id: 'landscape', 
            label: t('img_gen.mode_landscape'), 
            desc: t('services.landscape_desc'),
            icon: 'park',
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/Render-Anh/san-vuon.png'
        }
    ], [t]);

    // --- OPTIONS ---
    const buildingTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Townhouse', label: t('opt.building.townhouse') },
        { value: 'Villa', label: t('opt.building.villa') },
        { value: 'One-story House', label: t('opt.building.level4') },
        { value: 'Apartment', label: t('opt.building.apartment') },
        { value: 'Office', label: t('opt.building.office') },
        { value: 'Cafe', label: t('opt.building.cafe') },
        { value: 'Restaurant', label: t('opt.building.restaurant') },
    ], [t]);

    const styleOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Modern', label: t('opt.style.modern') },
        { value: 'Minimalist', label: t('opt.style.minimalist') },
        { value: 'Neoclassical', label: t('opt.style.neoclassic') },
        { value: 'Scandinavian', label: t('opt.style.scandinavian') },
        { value: 'Industrial', label: t('opt.style.industrial') },
        { value: 'Tropical', label: t('opt.style.tropical') },
        { value: 'Brutalism', label: t('opt.style.brutalism') },
        { value: 'Indochine', label: 'Indochine' },
        { value: 'Japandi', label: 'Japandi' },
    ], [t]);

    const contextOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Vietnam Street', label: t('opt.context.street_vn') },
        { value: 'Vietnam Countryside', label: t('opt.context.rural_vn') },
        { value: 'Modern Urban Area', label: t('opt.context.urban') },
        { value: 'T-Junction', label: t('opt.context.intersection_3') },
        { value: 'Crossroads', label: t('opt.context.intersection_4') },
    ], [t]);

    const lightingOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Soft Sunrise', label: t('opt.lighting.sunrise') },
        { value: 'Sunny Noon', label: t('opt.lighting.noon') },
        { value: 'Sunset', label: t('opt.lighting.sunset') },
        { value: 'Evening', label: t('opt.lighting.evening') },
        { value: 'Night Stars', label: t('opt.lighting.night_stars') },
    ], [t]);

    const weatherOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Sunny', label: t('opt.weather.sunny') },
        { value: 'Rainy', label: t('opt.weather.rainy') },
        { value: 'Snowy', label: t('opt.weather.snowy') },
        { value: 'Scorching', label: t('opt.weather.scorching') },
        { value: 'After Rain', label: t('opt.weather.after_rain') },
    ], [t]);

    const roomTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Living room', label: language === 'vi' ? 'Phòng khách' : 'Living room' },
        { value: 'Bedroom', label: language === 'vi' ? 'Phòng ngủ' : 'Bedroom' },
        { value: 'Kitchen & Dining', label: language === 'vi' ? 'Bếp & Phòng ăn' : 'Kitchen & Dining' },
        { value: 'Bathroom', label: language === 'vi' ? 'Phòng tắm' : 'Bathroom' },
        { value: 'Workspace', label: language === 'vi' ? 'Phòng làm việc' : 'Workspace' },
    ], [t, language]);

    const viewTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Bird\'s eye view', label: language === 'vi' ? 'Phối cảnh mắt chim' : "Bird's eye view" },
        { value: 'Aerial 45-degree view', label: language === 'vi' ? 'Phối cảnh 45°' : 'Aerial 45°' },
        { value: 'Street-level perspective', label: language === 'vi' ? 'Góc nhìn người' : 'Street level' },
        { value: 'Waterfront view', label: language === 'vi' ? 'Ven sông/biển' : 'Waterfront' },
    ], [t, language]);

    const densityOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'low density suburban', label: language === 'vi' ? 'Ngoại ô thấp tầng' : 'Low density suburban' },
        { value: 'medium density mixed-use', label: language === 'vi' ? 'Phức hợp vừa' : 'Medium density mixed-use' },
        { value: 'high density urban core', label: language === 'vi' ? 'Đô thị cao tầng' : 'High density urban core' },
        { value: 'park and green space', label: language === 'vi' ? 'Công viên cây xanh' : 'Park and green space' },
    ], [t, language]);

    const gardenStyleOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Japanese Zen', label: language === 'vi' ? 'Vườn Nhật Bản' : 'Japanese Zen' },
        { value: 'Tropical', label: language === 'vi' ? 'Nhiệt đới' : 'Tropical' },
        { value: 'Modern', label: language === 'vi' ? 'Hiện đại' : 'Modern' },
        { value: 'Traditional', label: language === 'vi' ? 'Truyền thống' : 'Traditional' },
    ], [t, language]);

    const featureOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Koi Pond', label: language === 'vi' ? 'Hồ cá Koi' : 'Koi Pond' },
        { value: 'Wooden Deck', label: language === 'vi' ? 'Sàn gỗ' : 'Wooden Deck' },
        { value: 'Stone Path', label: language === 'vi' ? 'Stone Path' : 'Stone Path' },
        { value: 'Outdoor Furniture', label: language === 'vi' ? 'Nội thất ngoài trời' : 'Outdoor Furniture' },
    ], [t, language]);

    const colorPaletteOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Warm', label: language === 'vi' ? 'Tone ấm' : 'Warm' },
        { value: 'Cool', label: language === 'vi' ? 'Tone lạnh' : 'Cool' },
        { value: 'Neutral', label: language === 'vi' ? 'Trung tính' : 'Neutral' }
    ], [t, language]);

    // Helper to rebuild prompt based on current state values
    const syncPrompt = (overrides: Partial<ImageGeneratorState>) => {
        const s = { ...state, ...overrides };
        const getLabel = (options: {value: string, label: string}[], val: string) => {
            if (val === 'none') return "";
            return options.find(o => o.value === val)?.label || "";
        };

        let base = "";
        const isVi = language === 'vi';
        
        // Define base prompt per mode as requested
        switch(s.renderMode) {
            case 'arch': 
                base = isVi ? "Biến thành ảnh chụp thực tế nhà ở" : "Transform into realistic house photo";
                const bType = getLabel(buildingTypeOptions, s.buildingType);
                if (bType) base += `, ${bType.toLowerCase()}`;
                break;
            case 'interior':
                base = isVi ? "Biến thành ảnh chụp thực tế không gian nội thất" : "Transform into realistic interior space";
                const rType = getLabel(roomTypeOptions, s.roomType);
                if (rType) base += `, ${rType.toLowerCase()}`;
                break;
            case 'urban':
                const vType = getLabel(viewTypeOptions, s.viewType);
                base = isVi ? "Render một khu đô thị" : "Render an urban area";
                if (vType) base += ` ${isVi ? 'với' : 'with'} ${vType.toLowerCase()}`;
                break;
            case 'landscape':
                const gStyle = getLabel(gardenStyleOptions, s.gardenStyle);
                base = isVi ? "Render một sân vườn" : "Render a garden";
                if (gStyle) base += ` ${isVi ? 'phong cách' : 'style'} ${gStyle.toLowerCase()}`;
                break;
        }

        const details = [];
        const styleLabel = getLabel(styleOptions, s.style);
        const contextLabel = getLabel(contextOptions, s.context);
        const lightingLabel = getLabel(lightingOptions, s.lighting);
        const weatherLabel = getLabel(weatherOptions, s.weather);
        const colorLabel = getLabel(colorPaletteOptions, s.colorPalette);
        const densityLabel = getLabel(densityOptions, s.density);
        const featureLabel = getLabel(featureOptions, s.features);

        if (styleLabel) details.push(`${isVi ? 'phong cách' : 'in'} ${styleLabel.toLowerCase()} ${isVi ? '' : 'style'}`);
        if (contextLabel && s.renderMode === 'arch') details.push(`${isVi ? 'trong bối cảnh' : 'in the context of'} ${contextLabel.toLowerCase()}`);
        if (lightingLabel) details.push(`${isVi ? 'ánh sáng' : 'with'} ${lightingLabel.toLowerCase()} ${isVi ? '' : 'lighting'}`);
        if (weatherLabel && s.renderMode === 'arch') details.push(`${isVi ? 'thời tiết' : 'weather'} ${weatherLabel.toLowerCase()}`);
        if (colorLabel && s.renderMode === 'interior') details.push(`${isVi ? 'tông màu' : 'color palette'} ${colorLabel.toLowerCase()}`);
        if (densityLabel && s.renderMode === 'urban') details.push(`${isVi ? 'mật độ' : 'density'} ${densityLabel.toLowerCase()}`);
        if (featureLabel && s.renderMode === 'landscape') details.push(`${isVi ? 'có' : 'featuring'} ${featureLabel.toLowerCase()}`);

        if (details.length > 0) base += `, ${details.join(', ')}`;
        onStateChange({ ...overrides, customPrompt: base });
    };

    const handleSelectMode = (mode: ImageGeneratorState['renderMode']) => {
        setIsModeSelected(true);
        // Reset options but sync the new base prompt
        syncPrompt({ 
            renderMode: mode, buildingType: 'none', style: 'none', context: 'none',
            lighting: 'none', weather: 'none', roomType: 'none', colorPalette: 'none',
            viewType: 'none', density: 'none', gardenStyle: 'none', features: 'none',
            resultImages: [] 
        });
    };

    const handleBackToDashboard = () => setIsModeSelected(false);
    const handleFileSelect = (fileData: FileData | null) => onStateChange({ sourceImage: fileData, resultImages: [] });
    const handleReferenceFilesChange = (files: FileData[]) => onStateChange({ referenceImages: files });
    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
        if (val === 'Standard') onStateChange({ referenceImages: [] });
    };

    const showError = (msg: string) => { setLocalErrorMessage(msg); setIsErrorModalOpen(true); };

    const handleAutoPrompt = async () => {
        if (!sourceImage) return;
        setIsAutoPromptLoading(true);
        try {
            let newPrompt = "";
            if (renderMode === 'arch') newPrompt = await geminiService.generateArchitecturalPrompt(sourceImage, language);
            else if (renderMode === 'interior') newPrompt = await geminiService.generateInteriorPrompt(sourceImage, language);
            else newPrompt = await geminiService.generateArchitecturalPrompt(sourceImage, language); 
            onStateChange({ customPrompt: newPrompt });
        } catch (err: any) { showError("Không thể tạo prompt tự động."); }
        finally { setIsAutoPromptLoading(false); }
    };

    const cost = numberOfImages * (resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5);

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) { 
            if (onInsufficientCredits) onInsufficientCredits(); else showError(t('common.insufficient'));
            return; 
        }
        if (!customPrompt.trim()) return;

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));
        let logId: string | null = null;
        
        try {
            const toolName = renderMode === 'arch' ? 'Kiến trúc' : renderMode === 'interior' ? 'Nội thất' : renderMode === 'urban' ? 'Quy hoạch' : 'Sân vườn';
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Render ${toolName}`);
            }
            
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            
            // Construct the advanced system prompt
            let finalPrompt = customPrompt;
            if (renderMode === 'arch') {
                finalPrompt = `You are a professional architectural renderer. ${customPrompt}, photorealistic, high detail.`;
            } else if (renderMode === 'interior') {
                finalPrompt = `You are a professional interior designer. Adapt the composition of the interior scene from the source image to fit this new frame. Do not add black bars or letterbox. The main creative instruction is: ${customPrompt}. Make it photorealistic interior design.`;
            }

            const inputImages = [sourceImage, ...referenceImages].filter(Boolean) as FileData[];

            // CRITICAL: Parallel generation for better upscale reliability
            const promises = Array.from({ length: numberOfImages }).map(async (_, idx) => {
                const result = await externalVideoService.generateFlowImage(
                    finalPrompt, inputImages, aspectRatio, 1, modelName,
                    (msg) => setStatusMessage(`${t('common.processing')} (${idx + 1}/${numberOfImages})`)
                );
                
                if (result.imageUrls && result.imageUrls.length > 0) {
                    let finalUrl = result.imageUrls[0];
                    // Handle Pro Resolution Upscaling
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
                    tool: Tool.ArchitecturalRendering, prompt: finalPrompt, 
                    sourceImageURL: sourceImage?.objectURL, resultImageURL: url 
                }));
            }
        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
            } else {
                showError(t(friendlyKey));
            }

            // --- REFUND LOGIC ---
            if (logId && onDeductCredits) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    try {
                        await refundCredits(user.id, cost, `Hoàn tiền: Lỗi render (${rawMsg})`, logId);
                        if (friendlyKey !== "SAFETY_POLICY_VIOLATION") {
                            setLocalErrorMessage(prev => `${prev}\n\n(Credits đã được hoàn trả vào tài khoản)`);
                        }
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
            await externalVideoService.forceDownload(resultImages[selectedIndex], "render.png");
            setIsDownloading(false);
        }
    };

    if (!isModeSelected) {
        return (
            <div className="max-w-7xl mx-auto pb-10 px-4">
                <div className="mb-8 md:mb-12 text-center animate-fade-in-up">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-text-primary dark:text-white mb-3 md:mb-4">
                        {language === 'vi' ? 'Bạn muốn Render không gian nào?' : 'What space do you want to Render?'}
                    </h2>
                    <p className="text-text-secondary dark:text-gray-400 max-w-2xl mx-auto text-sm sm:text-base md:text-lg leading-relaxed px-4">
                        {language === 'vi' ? 'Chọn chế độ phù hợp để AI tối ưu hóa chất lượng ảnh render của bạn.' : 'Select a mode for AI to optimize your render quality.'}
                    </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {modes.map((m, idx) => (
                        <button key={m.id} onClick={() => handleSelectMode(m.id as any)} className="group relative flex flex-col h-64 sm:h-72 md:h-80 rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl shadow-xl" style={{ animationDelay: `${idx * 100}ms` }} >
                            <img src={m.image} alt={m.label} className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
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
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 md:gap-8 max-w-[1920px] mx-auto items-stretch px-2 sm:px-4 animate-fade-in">
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
            
            <aside className="w-full lg:w-[350px] xl:w-[380px] flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-visible lg:h-[calc(100vh-130px)] lg:sticky lg:top-[120px]">
                <div className="p-3 space-y-4 flex-1 lg:overflow-y-auto custom-sidebar-scroll overflow-visible">
                    <div className="px-1 pt-1">
                        <button onClick={handleBackToDashboard} className="flex items-center gap-2 text-text-secondary dark:text-gray-400 hover:text-[#7f13ec] dark:hover:text-[#a855f7] transition-all font-bold text-xs sm:text-sm group" >
                            <span className="material-symbols-outlined notranslate group-hover:-translate-x-1 transition-transform">arrow_back</span>
                            <span>{t('common.back')}</span>
                        </button>
                    </div>
                    
                    {/* New Interactive Mode Dropdown */}
                    <div className="relative z-20" ref={modeDropdownRef}>
                        <button 
                            onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                            className="w-full bg-[#7f13ec]/5 dark:bg-[#7f13ec]/10 p-3 sm:p-4 rounded-2xl border border-[#7f13ec]/20 flex items-center justify-between hover:bg-[#7f13ec]/10 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 sm:p-2 bg-[#7f13ec] rounded-lg text-white">
                                    <span className="material-symbols-outlined text-base sm:text-lg notranslate">{modes.find(m => m.id === renderMode)?.icon || 'image'}</span>
                                </div>
                                <div className="text-left">
                                    <span className="block text-[8px] sm:text-[10px] font-bold text-[#7f13ec] uppercase tracking-wider">{language === 'vi' ? 'Chế độ (Nhấn để đổi)' : 'Mode (Click to switch)'}</span>
                                    <span className="block text-xs sm:text-sm font-black text-text-primary dark:text-white">{modes.find(m => m.id === renderMode)?.label}</span>
                                </div>
                            </div>
                            <span className={`material-symbols-outlined text-[#7f13ec] transition-transform duration-200 ${isModeDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>

                        {isModeDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1E1E1E] rounded-xl shadow-2xl border border-border-color dark:border-[#302839] overflow-hidden animate-fade-in p-1.5 z-50">
                                {modes.map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => {
                                            handleSelectMode(m.id as any);
                                            setIsModeDropdownOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${renderMode === m.id ? 'bg-[#7f13ec]/10 text-[#7f13ec]' : 'hover:bg-gray-100 dark:hover:bg-[#2A2A2A] text-text-primary dark:text-gray-200'}`}
                                    >
                                        <span className="material-symbols-outlined text-lg">{m.icon}</span>
                                        <span className="text-xs sm:text-sm font-bold">{m.label}</span>
                                        {renderMode === m.id && <span className="material-symbols-outlined text-sm ml-auto">check</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.step1')}</label>
                        <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                    </div>
                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.step2')}</label>
                        <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                            <textarea rows={window.innerWidth < 768 ? 4 : 6} className="w-full bg-transparent outline-none text-xs sm:text-sm resize-none font-medium text-text-primary dark:text-white" placeholder={t('img_gen.prompt_placeholder')} value={customPrompt} onChange={(e) => onStateChange({ customPrompt: e.target.value })} />
                        </div>
                        {(renderMode === 'arch' || renderMode === 'interior') && (
                            <button type="button" onClick={handleAutoPrompt} disabled={!sourceImage || isAutoPromptLoading || isLoading} className="mt-2 w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all bg-gray-800 dark:bg-gray-700 hover:bg-black dark:hover:bg-gray-600 text-white shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400" >
                                {isAutoPromptLoading ? <Spinner /> : <><span className="material-symbols-outlined text-sm sm:text-base">auto_awesome</span> <span>{t('img_gen.auto_prompt')}</span></>}
                            </button>
                        )}
                        <div className="space-y-3">
                            {renderMode === 'arch' && (
                                <><div className="grid grid-cols-2 gap-2"><OptionSelector id="b-type" label={t('opt.building_type')} options={buildingTypeOptions} value={buildingType} onChange={(v) => syncPrompt({ buildingType: v })} variant="select" /><OptionSelector id="style" label={t('opt.style')} options={styleOptions} value={style} onChange={(v) => syncPrompt({ style: v })} variant="select" /></div><OptionSelector id="context" label={t('opt.context')} options={contextOptions} value={context} onChange={(v) => syncPrompt({ context: v })} variant="select" /><div className="grid grid-cols-2 gap-2"><OptionSelector id="lt" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={(v) => syncPrompt({ lighting: v })} variant="select" /><OptionSelector id="wt" label={t('opt.weather')} options={weatherOptions} value={weather} onChange={(v) => syncPrompt({ weather: v })} variant="select" /></div></>
                            )}
                            {renderMode === 'interior' && (
                                <><div className="grid grid-cols-2 gap-2"><OptionSelector id="room-type" label={t('opt.int.project_type')} options={roomTypeOptions} value={roomType} onChange={(v) => syncPrompt({ roomType: v })} variant="select" /><OptionSelector id="int-style" label={t('opt.style')} options={styleOptions} value={style} onChange={(v) => syncPrompt({ style: v })} variant="select" /></div><div className="grid grid-cols-2 gap-2"><OptionSelector id="int-lt" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={(v) => syncPrompt({ lighting: v })} variant="select" /><OptionSelector id="int-color" label={t('opt.int.color')} options={colorPaletteOptions} value={colorPalette} onChange={(v) => syncPrompt({ colorPalette: v })} variant="select" /></div></>
                            )}
                            {renderMode === 'urban' && (
                                <><OptionSelector id="v-type" label={t('ext.urban.view_type')} options={viewTypeOptions} value={viewType} onChange={(v) => onStateChange({ viewType: v })} variant="select" /><div className="grid grid-cols-2 gap-2"><OptionSelector id="v-density" label={t('ext.urban.density')} options={densityOptions} value={density} onChange={(v) => onStateChange({ density: v })} variant="select" /><OptionSelector id="v-light" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={(v) => onStateChange({ lighting: v })} variant="select" /></div></>
                            )}
                            {renderMode === 'landscape' && (
                                <><OptionSelector id="g-style" label={t('ext.landscape.style')} options={gardenStyleOptions} value={gardenStyle} onChange={(v) => onStateChange({ gardenStyle: v })} variant="select" /><div className="grid grid-cols-2 gap-2"><OptionSelector id="g-feature" label={t('ext.landscape.feature')} options={featureOptions} value={features} onChange={(v) => onStateChange({ features: v })} variant="select" /><OptionSelector id="g-time" label={t('ext.landscape.time')} options={lightingOptions} value={lighting} onChange={(v) => onStateChange({ lighting: v })} variant="select" /></div></>
                            )}
                        </div>
                    </div>
                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.ref_images')}</label>
                        {resolution === 'Standard' ? (
                            <div className="p-4 bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 h-28 shadow-inner">
                                <span className="material-symbols-outlined text-yellow-500 text-base sm:text-xl notranslate">lock</span>
                                <p className="text-[9px] sm:text-[10px] text-text-secondary dark:text-gray-400 px-2 leading-tight">{t('img_gen.ref_lock')}</p>
                                <button onClick={() => handleResolutionChange('1K')} className="text-[9px] sm:text-[10px] text-[#7f13ec] hover:underline font-bold uppercase">{t('img_gen.upgrade')}</button>
                            </div>
                        ) : (
                            <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                        )}
                        <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({aspectRatio: val})} />
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({numberOfImages: val})} />
                    </div>
                </div>
                <div className="p-4 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] lg:sticky lg:bottom-0 z-10">
                    <button onClick={handleGenerate} disabled={isLoading} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-3 sm:py-4 rounded-xl transition-all shadow-lg active:scale-95 text-sm sm:text-base">
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('common.start_render')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-base sm:text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden min-h-[400px] sm:min-h-[500px] lg:h-[calc(100vh-130px)] lg:sticky lg:top-[120px]">
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-[300px]">
                        {resultImages.length > 0 ? (
                            <div className="w-full h-full p-2 animate-fade-in flex flex-col items-center justify-center relative">
                                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                                    {sourceImage ? <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[selectedIndex]} /> : <img src={resultImages[selectedIndex]} alt="Result" className="max-w-full max-h-full object-contain" />}
                                </div>
                                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                    <button onClick={() => onSendToViewSync(sourceImage!)} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-purple-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('tool.viewsync')}</span>
                                        <span className="material-symbols-outlined text-base sm:text-lg notranslate">view_in_ar</span>
                                    </button>
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
                                <span className="material-symbols-outlined text-4xl sm:text-6xl mb-4 notranslate">image</span>
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
                                    <button key={url} onClick={() => setSelectedIndex(idx)} className={`flex-shrink-0 w-12 sm:w-16 md:w-20 aspect-square rounded-lg border-2 transition-all overflow-hidden ${selectedIndex === idx ? 'border-[#7f13ec] ring-2 ring-purple-500/20 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}><img src={url} className="w-full h-full object-cover" alt={`Result ${idx + 1}`} /></button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default ImageGenerator;