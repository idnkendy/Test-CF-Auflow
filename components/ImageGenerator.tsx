
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
        viewType, density, gardenStyle, timeOfDay, features,
        customPrompt, referenceImages, sourceImage, isLoading, error, resultImages, 
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

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

    // Handle Default Prompt Reset on Mode Change
    const resetPromptForMode = (mode: ImageGeneratorState['renderMode']) => {
        let newPrompt = "";
        switch(mode) {
            case 'arch': newPrompt = t('img_gen.default_prompt'); break;
            case 'interior': newPrompt = t('int.default_prompt'); break;
            case 'urban': newPrompt = language === 'vi' ? 'Render một khu đô thị ven sông hiện đại' : 'Render a modern riverside urban area'; break;
            case 'landscape': newPrompt = language === 'vi' ? 'Render một sân vườn nhỏ phía sau nhà với hồ cá Koi' : 'Render a small backyard garden with a Koi pond'; break;
        }
        onStateChange({ renderMode: mode, customPrompt: newPrompt, resultImages: [] });
    };

    // --- OPTIONS MEMOS ---
    const buildingTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.building.townhouse'), label: t('opt.building.townhouse') },
        { value: t('opt.building.villa'), label: t('opt.building.villa') },
        { value: t('opt.building.apartment'), label: t('opt.building.apartment') },
        { value: t('opt.building.office'), label: t('opt.building.office') },
    ], [t]);

    const styleOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.style.modern'), label: t('opt.style.modern') },
        { value: t('opt.style.minimalist'), label: t('opt.style.minimalist') },
        { value: t('opt.style.neoclassic'), label: t('opt.style.neoclassic') },
        { value: t('opt.style.scandinavian'), label: t('opt.style.scandinavian') },
        { value: 'Indochine', label: 'Indochine' },
        { value: 'Japandi', label: 'Japandi' },
    ], [t]);

    const lightingOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.lighting.sunrise'), label: t('opt.lighting.sunrise') },
        { value: t('opt.lighting.noon'), label: t('opt.lighting.noon') },
        { value: t('opt.lighting.sunset'), label: t('opt.lighting.sunset') },
        { value: t('opt.lighting.night_stars'), label: t('opt.lighting.night_stars') },
    ], [t]);

    const roomTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: language === 'vi' ? 'Phòng khách' : 'Living room', label: language === 'vi' ? 'Phòng khách' : 'Living room' },
        { value: language === 'vi' ? 'Phòng ngủ' : 'Bedroom', label: language === 'vi' ? 'Phòng ngủ' : 'Bedroom' },
        { value: language === 'vi' ? 'Bếp & Phòng ăn' : 'Kitchen & Dining', label: language === 'vi' ? 'Bếp & Phòng ăn' : 'Kitchen & Dining' },
        { value: language === 'vi' ? 'Phòng tắm' : 'Bathroom', label: language === 'vi' ? 'Phòng tắm' : 'Bathroom' },
    ], [t, language]);

    const viewTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'birds-eye view', label: language === 'vi' ? 'Góc nhìn từ trên cao' : "Bird's eye view" },
        { value: 'street-level', label: language === 'vi' ? 'Góc nhìn người đi bộ' : 'Street level' },
    ], [t, language]);

    const densityOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'low density', label: language === 'vi' ? 'Mật độ thấp' : 'Low density' },
        { value: 'medium density', label: language === 'vi' ? 'Mật độ trung bình' : 'Medium density' },
        { value: 'high density', label: language === 'vi' ? 'Mật độ cao' : 'High density' },
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
            else newPrompt = await geminiService.generateArchitecturalPrompt(sourceImage, language); // Fallback
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
            
            const promptParts = [customPrompt];
            if (style !== 'none') promptParts.push(`in ${style} style`);
            if (lighting !== 'none') promptParts.push(`with ${lighting} lighting`);
            if (renderMode === 'arch' && buildingType !== 'none') promptParts.push(`for a ${buildingType}`);
            if (renderMode === 'interior' && roomType !== 'none') promptParts.push(`in a ${roomType}`);
            if (renderMode === 'urban') {
                if (viewType !== 'none') promptParts.push(`viewed from ${viewType}`);
                if (density !== 'none') promptParts.push(`with ${density} density`);
            }
            if (renderMode === 'landscape') {
                if (gardenStyle !== 'none') promptParts.push(`${gardenStyle} garden style`);
                if (features !== 'none') promptParts.push(`featuring ${features}`);
            }

            const finalPromptForService = `Professional ${toolName.toLowerCase()} rendering. ${promptParts.join(', ')}. Photorealistic, high quality.`;

            const result = await externalVideoService.generateFlowImage(
                finalPromptForService,
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

    return (
        <div className="flex flex-col lg:flex-row gap-6 md:gap-8 max-w-[1920px] mx-auto items-stretch px-2 sm:px-4">
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
                    
                    {/* SEGMENT 1: MODE SELECTION & UPLOAD */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div className="grid grid-cols-2 lg:grid-cols-4 bg-gray-200 dark:bg-[#252525] p-1 gap-1 border border-gray-300 dark:border-[#302839] rounded-2xl shadow-inner">
                            {[
                                { id: 'arch', label: t('img_gen.mode_arch') },
                                { id: 'interior', label: t('img_gen.mode_interior') },
                                { id: 'urban', label: t('img_gen.mode_urban') },
                                { id: 'landscape', label: t('img_gen.mode_landscape') }
                            ].map(m => (
                                <button 
                                    key={m.id}
                                    onClick={() => resetPromptForMode(m.id as any)}
                                    className={`flex items-center justify-center px-1 py-3 transition-all text-[11px] font-extrabold rounded-xl ${
                                        renderMode === m.id 
                                            ? 'bg-[#7f13ec] text-white shadow-md transform scale-[1.02]' 
                                            : 'text-text-secondary dark:text-gray-400 hover:bg-white/50 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <span className="truncate">{m.label}</span>
                                </button>
                            ))}
                        </div>

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
                                        <OptionSelector id="b-type" label={t('opt.building_type')} options={buildingTypeOptions} value={buildingType} onChange={(v) => onStateChange({ buildingType: v })} variant="select" />
                                        <OptionSelector id="style" label={t('opt.style')} options={styleOptions} value={style} onChange={(v) => onStateChange({ style: v })} variant="select" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="lt" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={(v) => onStateChange({ lighting: v })} variant="select" />
                                        <OptionSelector id="wt" label={t('opt.weather')} options={[{value:'none', label:t('opt.none')}, {value:'sunny', label:t('opt.weather.sunny')}, {value:'rainy', label:t('opt.weather.rainy')}]} value={weather} onChange={(v) => onStateChange({ weather: v })} variant="select" />
                                    </div>
                                </>
                            )}
                            {renderMode === 'interior' && (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="room-type" label={t('opt.int.project_type')} options={roomTypeOptions} value={roomType} onChange={(v) => onStateChange({ roomType: v })} variant="select" />
                                        <OptionSelector id="int-style" label={t('opt.style')} options={styleOptions} value={style} onChange={(v) => onStateChange({ style: v })} variant="select" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="int-lt" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={(v) => onStateChange({ lighting: v })} variant="select" />
                                        <OptionSelector id="int-color" label={t('opt.int.color')} options={[{value:'none', label:t('opt.none')}, {value:'warm', label:'Warm'}, {value:'cool', label:'Cool'}]} value={colorPalette} onChange={(v) => onStateChange({ colorPalette: v })} variant="select" />
                                    </div>
                                </>
                            )}
                            {renderMode === 'urban' && (
                                <>
                                    <OptionSelector id="v-type" label={t('ext.urban.view_type')} options={viewTypeOptions} value={viewType} onChange={(v) => onStateChange({ viewType: v })} variant="select" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="v-density" label={t('ext.urban.density')} options={densityOptions} value={density} onChange={(v) => onStateChange({ density: v })} variant="select" />
                                        <OptionSelector id="v-light" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={(v) => onStateChange({ lighting: v })} variant="select" />
                                    </div>
                                </>
                            )}
                            {renderMode === 'landscape' && (
                                <>
                                    <OptionSelector id="g-style" label={t('ext.landscape.style')} options={gardenStyleOptions} value={gardenStyle} onChange={(v) => onStateChange({ gardenStyle: v })} variant="select" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <OptionSelector id="g-feature" label={t('ext.landscape.feature')} options={featureOptions} value={features} onChange={(v) => onStateChange({ features: v })} variant="select" />
                                        <OptionSelector id="g-time" label={t('ext.landscape.time')} options={lightingOptions} value={lighting} onChange={(v) => onStateChange({ lighting: v })} variant="select" />
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
                                    <span className="material-symbols-outlined text-yellow-500 text-xl">lock</span>
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
                                    <button onClick={() => onSendToViewSync(sourceImage!)} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-purple-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">view_in_ar</span></button>
                                    <button onClick={handleDownload} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">download</span></button>
                                    <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">zoom_in</span></button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-20 select-none bg-main-bg dark:bg-[#121212]">
                                <span className="material-symbols-outlined text-6xl mb-4">image</span>
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
