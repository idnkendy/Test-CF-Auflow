
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
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
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/thumbnail-ngoai-that.png'
        },
        { 
            id: 'interior', 
            label: t('img_gen.mode_interior'), 
            desc: t('services.interior_desc'),
            icon: 'chair',
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/thumbnail-noi-that.jpeg'
        },
        { 
            id: 'urban', 
            label: t('img_gen.mode_urban'), 
            desc: t('services.urban_desc'),
            icon: 'map',
            image: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=800&auto=format&fit=crop'
        },
        { 
            id: 'landscape', 
            label: t('img_gen.mode_landscape'), 
            desc: t('services.landscape_desc'),
            icon: 'park',
            image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/thumnail-san-vuon.jpeg'
        }
    ], [t]);

    // --- FULL OPTIONS SYNCED FROM VI.TS ---
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
        { value: 'Low density suburban', label: language === 'vi' ? 'Ngoại ô thấp tầng' : 'Low density suburban' },
        { value: 'Medium density mixed-use', label: language === 'vi' ? 'Phức hợp vừa' : 'Medium density mixed-use' },
        { value: 'High density urban core', label: language === 'vi' ? 'Đô thị cao tầng' : 'High density urban core' },
        { value: 'Park and green space', label: language === 'vi' ? 'Công viên cây xanh' : 'Park and green space' },
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
        
        // Helper to get label for current selection
        const getLabel = (options: {value: string, label: string}[], val: string) => {
            if (val === 'none') return "";
            return options.find(o => o.value === val)?.label || "";
        };

        let base = "";
        const isVi = language === 'vi';
        
        // Mode specific base
        switch(s.renderMode) {
            case 'arch': 
                const bType = getLabel(buildingTypeOptions, s.buildingType);
                base = isVi ? "Biến thành ảnh chụp thực tế" : "Transform into a realistic photo of"; 
                if (bType) base += ` ${bType.toLowerCase()}`;
                else base += isVi ? " công trình" : " building";
                break;
            case 'interior':
                const rType = getLabel(roomTypeOptions, s.roomType);
                base = isVi ? "Biến thành ảnh chụp thực tế" : "Transform into a realistic photo of";
                if (rType) base += ` ${rType.toLowerCase()}`;
                else base += isVi ? " không gian nội thất" : " interior space";
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

        // Appending details
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

        if (details.length > 0) {
            base += `, ${details.join(', ')}`;
        }

        base += isVi ? ". Chất lượng cao, chân thực." : ". High quality, realistic.";
        
        onStateChange({ ...overrides, customPrompt: base });
    };

    const handleSelectMode = (mode: ImageGeneratorState['renderMode']) => {
        setIsModeSelected(true);
        // Reset current mode state and sync prompt
        syncPrompt({ 
            renderMode: mode, 
            buildingType: 'none', 
            style: 'none', 
            context: 'none',
            lighting: 'none', 
            weather: 'none', 
            roomType: 'none',
            colorPalette: 'none',
            viewType: 'none',
            density: 'none',
            gardenStyle: 'none',
            features: 'none',
            resultImages: [] 
        });
    };

    const handleBackToDashboard = () => {
        setIsModeSelected(false);
    };

    const handleFileSelect = (fileData: FileData | null) => onStateChange({ sourceImage: fileData, resultImages: [] });
    const handleReferenceFilesChange = (files: FileData[]) => onStateChange({ referenceImages: files });
    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
        if (val === 'Standard') onStateChange({ referenceImages: [] });
    };

    const showError = (msg: string) => {
        setLocalErrorMessage(msg);
        setIsErrorModalOpen(true);
    };

    const handleAutoPrompt = async () => {
        if (!sourceImage) return;
        setIsAutoPromptLoading(true);
        try {
            let newPrompt = "";
            if (renderMode === 'arch') newPrompt = await geminiService.generateArchitecturalPrompt(sourceImage, language);
            else if (renderMode === 'interior') newPrompt = await geminiService.generateInteriorPrompt(sourceImage, language);
            else newPrompt = await geminiService.generateArchitecturalPrompt(sourceImage, language); 
            onStateChange({ customPrompt: newPrompt });
        } catch (err: any) {
            showError("Không thể tạo prompt tự động.");
        } finally {
            setIsAutoPromptLoading(false);
        }
    };

    const cost = numberOfImages * (resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5);

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) { 
            if (onInsufficientCredits) onInsufficientCredits();
            else showError(t('common.insufficient'));
            return; 
        }
        if (!customPrompt.trim()) return;

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));
        
        try {
            const toolName = renderMode === 'arch' ? 'Kiến trúc' : renderMode === 'interior' ? 'Nội thất' : renderMode === 'urban' ? 'Quy hoạch' : 'Sân vườn';
            const logId = onDeductCredits ? await onDeductCredits(cost, `Render ${toolName}`) : null;
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            
            const result = await externalVideoService.generateFlowImage(
                customPrompt,
                [sourceImage, ...referenceImages].filter(Boolean) as FileData[], 
                aspectRatio, 
                numberOfImages,
                modelName,
                (msg) => setStatusMessage(msg)
            );

            if (result.imageUrls) {
                onStateChange({ resultImages: result.imageUrls });
                result.imageUrls.forEach(url => historyService.addToHistory({ 
                    tool: Tool.ArchitecturalRendering, 
                    prompt: customPrompt, 
                    sourceImageURL: sourceImage?.objectURL, 
                    resultImageURL: url 
                }));
            }
        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") setShowSafetyModal(true);
            else showError(t(friendlyKey));
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleDownload = async () => {
        if (resultImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImages[selectedIndex], "render.png");
            setIsDownloading(false);
        }
    };

    // --- RENDER SELECTION DASHBOARD ---
    if (!isModeSelected) {
        return (
            <div className="max-w-7xl mx-auto pb-10 px-4">
                <div className="mb-12 text-center animate-fade-in-up">
                    <h2 className="text-4xl font-extrabold text-text-primary dark:text-white mb-4">
                        {language === 'vi' ? 'Bạn muốn Render không gian nào?' : 'What space do you want to Render?'}
                    </h2>
                    <p className="text-text-secondary dark:text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">
                        {language === 'vi' ? 'Chọn chế độ phù hợp để AI tối ưu hóa chất lượng ảnh render của bạn.' : 'Select a mode for AI to optimize your render quality.'}
                    </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {modes.map((m, idx) => (
                        <button
                            key={m.id}
                            onClick={() => handleSelectMode(m.id as any)}
                            className="group relative flex flex-col h-80 rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl shadow-xl"
                            style={{ animationDelay: `${idx * 100}ms` }}
                        >
                            <img src={m.image} alt={m.label} className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent dark:from-black/95 dark:via-black/60 dark:to-transparent"></div>
                            
                            <div className="relative z-10 flex flex-col h-full p-8 justify-end text-left">
                                <div className="flex items-center gap-4 mb-3">
                                    <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-xl text-white border border-white/20 group-hover:bg-[#7f13ec] group-hover:border-[#7f13ec] transition-all duration-300">
                                        <span className="material-symbols-outlined text-2xl notranslate">{m.icon}</span>
                                    </div>
                                    <h3 className="text-2xl font-black text-white group-hover:text-[#E0E0E0] transition-colors">{m.label}</h3>
                                </div>
                                <p className="text-sm text-gray-300 line-clamp-2 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">
                                    {m.desc}
                                </p>
                                <div className="mt-6 flex items-center text-xs font-bold text-white/50 group-hover:text-white transition-colors uppercase tracking-widest">
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

    // --- RENDER GENERATOR VIEW ---
    return (
        <div className="flex flex-col lg:flex-row gap-6 md:gap-8 max-w-[1920px] mx-auto items-stretch px-2 sm:px-4 animate-fade-in">
            <style>{`
                .custom-sidebar-scroll::-webkit-scrollbar { width: 5px; }
                .custom-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #334155; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
                @keyframes scale-up { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
                .animate-scale-up { animation: scale-up 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            `}</style>

            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            <ErrorModal isOpen={isErrorModalOpen} onClose={() => setIsErrorModalOpen(false)} message={localErrorMessage} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            {/* SIDEBAR */}
            <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="p-3 space-y-4 flex-1 overflow-y-auto custom-sidebar-scroll">
                    
                    {/* BACK BUTTON (TOP LEFT) */}
                    <div className="px-1 pt-1">
                        <button 
                            onClick={handleBackToDashboard}
                            className="flex items-center gap-2 text-text-secondary dark:text-gray-400 hover:text-[#7f13ec] dark:hover:text-[#a855f7] transition-all font-bold text-sm group"
                        >
                            <span className="material-symbols-outlined notranslate group-hover:-translate-x-1 transition-transform">arrow_back</span>
                            <span>{t('common.back')}</span>
                        </button>
                    </div>

                    {/* MODE INDICATOR */}
                    <div className="bg-[#7f13ec]/5 dark:bg-[#7f13ec]/10 p-4 rounded-2xl border border-[#7f13ec]/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-[#7f13ec] rounded-lg text-white">
                                <span className="material-symbols-outlined text-lg notranslate">
                                    {modes.find(m => m.id === renderMode)?.icon || 'image'}
                                </span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-[#7f13ec] uppercase tracking-wider">{language === 'vi' ? 'Chế độ' : 'Mode'}</span>
                                <span className="block text-sm font-black text-text-primary dark:text-white">{modes.find(m => m.id === renderMode)?.label}</span>
                            </div>
                        </div>
                    </div>

                    {/* SEGMENT 1: UPLOAD */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                    </div>

                    {/* SEGMENT 2: PROMPT & SPECIALIZED OPTIONS */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.step2')}</label>
                            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                                <textarea 
                                    rows={6} 
                                    className="w-full bg-transparent outline-none text-sm resize-none font-medium text-text-primary dark:text-white" 
                                    placeholder={t('img_gen.prompt_placeholder')} 
                                    value={customPrompt} 
                                    onChange={(e) => onStateChange({ customPrompt: e.target.value })} 
                                />
                            </div>
                            {(renderMode === 'arch' || renderMode === 'interior') && (
                                <button
                                    type="button"
                                    onClick={handleAutoPrompt}
                                    disabled={!sourceImage || isAutoPromptLoading || isLoading}
                                    className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all bg-gray-800 dark:bg-gray-700 hover:bg-black dark:hover:bg-gray-600 text-white shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                                >
                                    {isAutoPromptLoading ? <Spinner /> : <><span className="material-symbols-outlined text-sm">auto_awesome</span> <span>{t('img_gen.auto_prompt')}</span></>}
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {renderMode === 'arch' && (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="b-type" label={t('opt.building_type')} options={buildingTypeOptions} value={buildingType} onChange={(v) => syncPrompt({ buildingType: v })} variant="select" />
                                        <OptionSelector id="style" label={t('opt.style')} options={styleOptions} value={style} onChange={(v) => syncPrompt({ style: v })} variant="select" />
                                    </div>
                                    <OptionSelector id="context" label={t('opt.context')} options={contextOptions} value={context} onChange={(v) => syncPrompt({ context: v })} variant="select" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="lt" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={(v) => syncPrompt({ lighting: v })} variant="select" />
                                        <OptionSelector id="wt" label={t('opt.weather')} options={weatherOptions} value={weather} onChange={(v) => syncPrompt({ weather: v })} variant="select" />
                                    </div>
                                </>
                            )}
                            {renderMode === 'interior' && (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="room-type" label={t('opt.int.project_type')} options={roomTypeOptions} value={roomType} onChange={(v) => syncPrompt({ roomType: v })} variant="select" />
                                        <OptionSelector id="int-style" label={t('opt.style')} options={styleOptions} value={style} onChange={(v) => syncPrompt({ style: v })} variant="select" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="int-lt" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={(v) => syncPrompt({ lighting: v })} variant="select" />
                                        <OptionSelector id="int-color" label={t('opt.int.color')} options={colorPaletteOptions} value={colorPalette} onChange={(v) => syncPrompt({ colorPalette: v })} variant="select" />
                                    </div>
                                </>
                            )}
                            {renderMode === 'urban' && (
                                <>
                                    <OptionSelector id="v-type" label={t('ext.urban.view_type')} options={viewTypeOptions} value={viewType} onChange={(v) => syncPrompt({ viewType: v })} variant="select" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="v-density" label={t('ext.urban.density')} options={densityOptions} value={density} onChange={(v) => syncPrompt({ density: v })} variant="select" />
                                        <OptionSelector id="v-light" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={(v) => syncPrompt({ lighting: v })} variant="select" />
                                    </div>
                                </>
                            )}
                            {renderMode === 'landscape' && (
                                <>
                                    <OptionSelector id="g-style" label={t('ext.landscape.style')} options={gardenStyleOptions} value={gardenStyle} onChange={(v) => syncPrompt({ gardenStyle: v })} variant="select" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="g-feature" label={t('ext.landscape.feature')} options={featureOptions} value={features} onChange={(v) => syncPrompt({ features: v })} variant="select" />
                                        <OptionSelector id="g-time" label={t('ext.landscape.time')} options={lightingOptions} value={lighting} onChange={(v) => syncPrompt({ lighting: v })} variant="select" />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* SEGMENT 3: OUTPUT SETTINGS */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.ref_images')}</label>
                            {resolution === 'Standard' ? (
                                <div className="p-4 bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 h-28 shadow-inner">
                                    <span className="material-symbols-outlined text-yellow-500 text-xl notranslate">lock</span>
                                    <p className="text-[10px] text-text-secondary dark:text-gray-400 px-2 leading-tight">
                                        {t('img_gen.ref_lock')}
                                    </p>
                                    <button onClick={() => handleResolutionChange('1K')} className="text-[10px] text-[#7f13ec] hover:underline font-bold uppercase">{t('img_gen.upgrade')}</button>
                                </div>
                            ) : (
                                <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                            )}
                        </div>
                        <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({aspectRatio: val})} />
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({numberOfImages: val})} />
                    </div>
                </div>

                <div className="sticky bottom-0 w-full bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] p-4 z-40 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button 
                        onClick={handleGenerate} 
                        disabled={isLoading} 
                        className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base"
                    >
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('common.start_render')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
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
                                    <button onClick={() => onSendToViewSync(sourceImage!)} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-purple-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg notranslate">view_in_ar</span></button>
                                    <button onClick={handleDownload} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg notranslate">download</span></button>
                                    <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg notranslate">zoom_in</span></button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-20 select-none bg-main-bg dark:bg-[#121212]">
                                <span className="material-symbols-outlined text-6xl mb-4 notranslate">image</span>
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
    );
};

export default ImageGenerator;
