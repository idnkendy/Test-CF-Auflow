
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { LandscapeRenderingState } from '../state/toolState';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import MultiImageUpload from './common/MultiImageUpload';
import ImageComparator from './ImageComparator';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import OptionSelector from './common/OptionSelector';
import AspectRatioSelector from './common/AspectRatioSelector';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import SafetyWarningModal from './common/SafetyWarningModal';
import { useLanguage } from '../hooks/useLanguage';

interface LandscapeRenderingProps {
  state: LandscapeRenderingState;
  onStateChange: (newState: Partial<LandscapeRenderingState>) => void;
  onSendToViewSync: (image: FileData) => void;
  userCredits?: number;
  onDeductCredits?: (amount: number, description: string) => Promise<string>;
  onInsufficientCredits?: () => void;
}

const LandscapeRendering: React.FC<LandscapeRenderingProps> = ({ state, onStateChange, onSendToViewSync, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { 
        gardenStyle, timeOfDay, features, customPrompt, referenceImages, 
        sourceImage, isLoading, isUpscaling, error, resultImages, upscaledImage, 
        numberOfImages, aspectRatio, resolution
    } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isAutoPromptLoading, setIsAutoPromptLoading] = useState(false);

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

    // Handle Default Prompt Switching
    useEffect(() => {
        const viDefault = 'Render một sân vườn nhỏ phía sau nhà, có lối đi bằng đá, nhiều hoa và một bộ bàn ghế nhỏ.';
        const enDefault = 'Render a small backyard garden with stone path, flowers, and a small table set.';
        if (!customPrompt || customPrompt === viDefault || customPrompt === enDefault) {
             onStateChange({ customPrompt: language === 'vi' ? viDefault : enDefault });
        }
    }, [language]);

    const gardenStyleOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Japanese Zen garden', label: language === 'vi' ? 'Vườn Zen Nhật Bản' : 'Japanese Zen' },
        { value: 'tropical garden', label: language === 'vi' ? 'Vườn nhiệt đới' : 'Tropical' },
        { value: 'modern minimalist garden', label: language === 'vi' ? 'Sân vườn hiện đại, tối giản' : 'Modern Minimalist' },
        { value: 'Vietnamese rural garden', label: language === 'vi' ? 'Vườn làng quê Việt Nam' : 'Vietnamese Rural' },
    ], [t, language]);

    const timeOfDayOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'sunny daytime', label: language === 'vi' ? 'Ban ngày nắng đẹp' : 'Sunny Day' },
        { value: 'golden hour sunset', label: language === 'vi' ? 'Hoàng hôn' : 'Sunset' },
        { value: 'night with garden lights', label: language === 'vi' ? 'Ban đêm' : 'Night' },
    ], [t, language]);

    const featureOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'small Koi pond', label: language === 'vi' ? 'Hồ cá Koi nhỏ' : 'Koi Pond' },
        { value: 'stone pathway', label: language === 'vi' ? 'Lối đi bằng đá cuội' : 'Stone Path' },
        { value: 'small waterfall', label: language === 'vi' ? 'Thác nước nhỏ' : 'Waterfall' },
    ], [t, language]);

    const handleFileSelect = (fileData: FileData | null) => onStateChange({ sourceImage: fileData, resultImages: [] });
    const handleReferenceFilesChange = (files: FileData[]) => onStateChange({ referenceImages: files });
    
    // --- Fix: Added missing handleResolutionChange function to handle resolution selection and clear reference images on Standard resolution ---
    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
        if (val === 'Standard') onStateChange({ referenceImages: [] });
    };

    const handleAutoPrompt = async () => {
        if (!sourceImage) return;
        setIsAutoPromptLoading(true);
        try {
            const newPrompt = await geminiService.generateArchitecturalPrompt(sourceImage, language);
            onStateChange({ customPrompt: newPrompt });
        } catch (err: any) {
            console.error(err);
        } finally {
            setIsAutoPromptLoading(false);
        }
    };

    const cost = numberOfImages * (resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5);

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             return;
        }
        if (!customPrompt.trim()) return;

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));
        let logId: string | null = null;
        
        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Render sân vườn`);
            }
            
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const promptForService = `Professional landscape rendering. ${customPrompt}`;
            const inputImages = [sourceImage, ...referenceImages].filter(Boolean) as FileData[];

            // Parallel Generation Loop
            const promises = Array.from({ length: numberOfImages }).map(async (_, idx) => {
                const result = await externalVideoService.generateFlowImage(
                    promptForService,
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

            // --- Fix: Completed the truncated handleGenerate logic and resolved the "Cannot find name 'url'" error ---
            if (successfulUrls.length > 0) {
                onStateChange({ resultImages: successfulUrls });
                successfulUrls.forEach(url => historyService.addToHistory({ 
                    tool: Tool.LandscapeRendering, 
                    prompt: customPrompt, 
                    sourceImageURL: sourceImage?.objectURL, 
                    resultImageURL: url 
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
                onStateChange({ error: t(friendlyKey) });
            }

            // Refund logic
            if (logId && onDeductCredits) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    try {
                        await refundCredits(user.id, cost, `Hoàn tiền: Lỗi cảnh quan (${rawMsg})`, logId);
                    } catch (refundErr) {
                        console.error("Refund failed:", refundErr);
                    }
                }
            }
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleDownload = async () => {
        if (resultImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImages[selectedIndex], "landscape-render.png");
            setIsDownloading(false);
        }
    };

    // --- Fix: Added missing JSX return for LandscapeRendering to resolve the assignability error ---
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
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            {/* SIDEBAR */}
            <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="p-3 space-y-4 flex-1 overflow-y-auto custom-sidebar-scroll">
                    
                    {/* SEGMENT 1: HEADER & UPLOAD */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div className="mb-1">
                            <h2 className="text-xl font-extrabold text-text-primary dark:text-white leading-tight">{t('ext.landscape.title')}</h2>
                            <p className="text-[11px] text-text-secondary dark:text-gray-400 mt-0.5">{t('dash.landscape.desc')}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                    </div>

                    {/* SEGMENT 2: PROMPT & OPTIONS */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.step2')}</label>
                            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                                <textarea 
                                    rows={4} 
                                    className="w-full bg-transparent outline-none text-sm resize-none font-medium text-text-primary dark:text-white" 
                                    placeholder={t('ext.landscape.prompt_ph')} 
                                    value={customPrompt} 
                                    onChange={(e) => onStateChange({ customPrompt: e.target.value })} 
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleAutoPrompt}
                                disabled={!sourceImage || isAutoPromptLoading || isLoading}
                                className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all bg-gray-800 dark:bg-gray-700 hover:bg-black dark:hover:bg-gray-600 text-white shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                            >
                                {isAutoPromptLoading ? <Spinner /> : <><span className="material-symbols-outlined text-sm">auto_awesome</span> <span>{t('img_gen.auto_prompt')}</span></>}
                            </button>
                        </div>

                        <div className="space-y-3">
                            <OptionSelector id="g-style" label={t('ext.landscape.style')} options={gardenStyleOptions} value={gardenStyle} onChange={(v) => onStateChange({ gardenStyle: v })} variant="select" />
                            <div className="grid grid-cols-2 gap-2">
                                <OptionSelector id="g-feature" label={t('ext.landscape.feature')} options={featureOptions} value={features} onChange={(v) => onStateChange({ features: v })} variant="select" />
                                <OptionSelector id="g-time" label={t('ext.landscape.time')} options={timeOfDayOptions} value={timeOfDay} onChange={(v) => onStateChange({ timeOfDay: v })} variant="select" />
                            </div>
                        </div>
                    </div>

                    {/* SEGMENT 3: OUTPUT */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.ref_images')}</label>
                            {resolution === 'Standard' ? (
                                <div className="p-4 bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 h-28 shadow-inner">
                                    <span className="material-symbols-outlined text-yellow-500 text-xl">lock</span>
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
                    <button onClick={handleGenerate} disabled={isLoading} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base">
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
                                    <button onClick={handleDownload} className="group/btn relative p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.download')}</span>
                                        <span className="material-symbols-outlined text-lg">download</span>
                                    </button>
                                    <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="group/btn relative p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.zoom')}</span>
                                        <span className="material-symbols-outlined text-lg">zoom_in</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-20 select-none bg-main-bg dark:bg-[#121212]">
                                <span className="material-symbols-outlined text-6xl mb-4">park</span>
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

export default LandscapeRendering;
