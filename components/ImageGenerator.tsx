
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService';
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { ImageGeneratorState } from '../state/toolState';
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
import { supabase } from '../services/supabaseClient';
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

const ImageGenerator: React.FC<ImageGeneratorProps> = ({ state, onStateChange, onSendToViewSync, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { 
        style, context, lighting, weather, buildingType, customPrompt, referenceImages, 
        sourceImage, isLoading, isUpscaling, error, resultImages, upscaledImage, 
        numberOfImages, aspectRatio, resolution 
    } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isAutoPromptLoading, setIsAutoPromptLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        if (resultImages.length > 0) {
            setSelectedIndex(0);
        }
    }, [resultImages.length]);

    const buildingTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.building.townhouse'), label: t('opt.building.townhouse') },
        { value: t('opt.building.villa'), label: t('opt.building.villa') },
        { value: t('opt.building.level4'), label: t('opt.building.level4') },
        { value: t('opt.building.apartment'), label: t('opt.building.apartment') },
        { value: t('opt.building.office'), label: t('opt.building.office') },
        { value: t('opt.building.cafe'), label: t('opt.building.cafe') },
        { value: t('opt.building.restaurant'), label: t('opt.building.restaurant') },
    ], [t]);

    const styleOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.style.modern'), label: t('opt.style.modern') },
        { value: t('opt.style.minimalist'), label: t('opt.style.minimalist') },
        { value: t('opt.style.neoclassic'), label: t('opt.style.neoclassic') },
        { value: t('opt.style.scandinavian'), label: t('opt.style.scandinavian') },
        { value: t('opt.style.industrial'), label: t('opt.style.industrial') },
        { value: t('opt.style.tropical'), label: t('opt.style.tropical') },
        { value: t('opt.style.brutalism'), label: t('opt.style.brutalism') },
    ], [t]);

    const contextOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.context.street_vn'), label: t('opt.context.street_vn') },
        { value: t('opt.context.rural_vn'), label: t('opt.context.rural_vn') },
        { value: t('opt.context.urban'), label: t('opt.context.urban') },
        { value: t('opt.context.intersection_3'), label: t('opt.context.intersection_3') },
        { value: t('opt.context.intersection_4'), label: t('opt.context.intersection_4') },
    ], [t]);

    const lightingOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.lighting.sunrise'), label: t('opt.lighting.sunrise') },
        { value: t('opt.lighting.noon'), label: t('opt.lighting.noon') },
        { value: t('opt.lighting.sunset'), label: t('opt.lighting.sunset') },
        { value: t('opt.lighting.evening'), label: t('opt.lighting.evening') },
        { value: t('opt.lighting.night_stars'), label: t('opt.lighting.night_stars') },
    ], [t]);

    const weatherOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.weather.sunny'), label: t('opt.weather.sunny') },
        { value: t('opt.weather.rainy'), label: t('opt.weather.rainy') },
        { value: t('opt.weather.snowy'), label: t('opt.weather.snowy') },
        { value: t('opt.weather.scorching'), label: t('opt.weather.scorching') },
        { value: t('opt.weather.after_rain'), label: t('opt.weather.after_rain') },
    ], [t]);

    useEffect(() => {
        const viDefault = 'Biến thành ảnh chụp thực tế nhà ở';
        const enDefault = 'Transform into a realistic house photo';
        if (customPrompt === viDefault || customPrompt === enDefault || !customPrompt) {
             onStateChange({ customPrompt: t('img_gen.default_prompt') });
        }
    }, [language, t]);

    const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const updatePrompt = useCallback((type: string, newValue: string, oldValue: string) => {
        const getPromptPart = (partType: string, value: string, lang: string): string => {
            if (value === 'none' || !value) return '';
            const isVi = lang === 'vi';
            switch (partType) {
                case 'style': return isVi ? `phong cách ${value}` : `style ${value}`;
                case 'context': return isVi ? `bối cảnh ${value}` : `context ${value}`;
                case 'lighting': return isVi ? `ánh sáng ${value}` : `lighting ${value}`;
                case 'weather': return isVi ? `thời tiết ${value}` : `weather ${value}`;
                case 'buildingType': return isVi ? `là một ${value}` : `is a ${value}`;
                default: return '';
            }
        };

        const oldPartVi = getPromptPart(type, oldValue, 'vi');
        const oldPartEn = getPromptPart(type, oldValue, 'en');
        const newPart = getPromptPart(type, newValue, language);

        let nextPrompt = customPrompt;
        if (oldPartVi && nextPrompt.includes(oldPartVi)) {
            nextPrompt = nextPrompt.replace(new RegExp(`,?\\s*${escapeRegExp(oldPartVi)}`), '').replace(new RegExp(`${escapeRegExp(oldPartVi)},?\\s*`), '');
        }
        if (oldPartEn && nextPrompt.includes(oldPartEn)) {
            nextPrompt = nextPrompt.replace(new RegExp(`,?\\s*${escapeRegExp(oldPartEn)}`), '').replace(new RegExp(`${escapeRegExp(oldPartEn)},?\\s*`), '');
        }
        if (newPart) {
            nextPrompt = nextPrompt.trim() ? `${nextPrompt}, ${newPart}` : newPart;
        }
        onStateChange({ customPrompt: nextPrompt.replace(/,+/g, ',').split(',').map(p => p.trim()).filter(p => p.length > 0).join(', ') });
    }, [customPrompt, onStateChange, language]);

    const handleBuildingTypeChange = (newVal: string) => { updatePrompt('buildingType', newVal, buildingType); onStateChange({ buildingType: newVal }); };
    const handleStyleChange = (newVal: string) => { updatePrompt('style', newVal, style); onStateChange({ style: newVal }); };
    const handleContextChange = (newVal: string) => { updatePrompt('context', newVal, context); onStateChange({ context: newVal }); };
    const handleLightingChange = (newVal: string) => { updatePrompt('lighting', newVal, lighting); onStateChange({ lighting: newVal }); };
    const handleWeatherChange = (newVal: string) => { updatePrompt('weather', newVal, weather); onStateChange({ weather: newVal }); };
    
    const handleResolutionChange = (val: ImageResolution) => { 
        onStateChange({ resolution: val });
        if (val === 'Standard') onStateChange({ referenceImages: [] });
    };
    
    const handleFileSelect = (fileData: FileData | null) => onStateChange({ sourceImage: fileData, resultImages: [], upscaledImage: null });
    const handleReferenceFilesChange = (files: FileData[]) => onStateChange({ referenceImages: files });

    const getCostPerImage = () => {
        return resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5;
    };
    const unitCost = getCostPerImage();
    const cost = numberOfImages * unitCost;

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: t('common.insufficient') });
             }
             return;
        }
        if (!customPrompt.trim()) { onStateChange({ error: t('common.error') }); return; }
        onStateChange({ isLoading: true, error: null, resultImages: [], upscaledImage: null });
        setStatusMessage(t('common.processing'));
        
        let jobId: string | null = null;
        let logId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Render kiến trúc (${numberOfImages} ảnh) - ${resolution}`);
            }
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                 jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.ArchitecturalRendering, prompt: customPrompt, cost: cost, usage_log_id: logId });
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const promptForService = `You are a professional architectural renderer. ${sourceImage ? `Based on source image, generate ${aspectRatio} render.` : ''} ${customPrompt}, photorealistic, high detail.`;

            let lastError: any = null;
            const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                try {
                    const result = await externalVideoService.generateFlowImage(
                        promptForService,
                        [sourceImage, ...referenceImages].filter(Boolean) as FileData[], 
                        aspectRatio, 
                        1,
                        modelName,
                        (msg) => setStatusMessage(msg)
                    );
                    if (result.imageUrls && result.imageUrls.length > 0) {
                        let finalUrl = result.imageUrls[0];
                        if ((resolution === '2K' || resolution === '4K') && result.mediaIds?.length > 0) {
                            const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                            const upscaleRes = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                            if (upscaleRes.imageUrl) finalUrl = upscaleRes.imageUrl;
                        }
                        return finalUrl;
                    }
                    return null;
                } catch (e) {
                    lastError = e;
                    return null;
                }
            });

            const results = await Promise.all(promises);
            const successfulUrls = results.filter((url): url is string => url !== null);
            const failedCount = numberOfImages - successfulUrls.length;

            if (successfulUrls.length > 0) {
                onStateChange({ resultImages: successfulUrls });
                successfulUrls.forEach(url => {
                    historyService.addToHistory({
                        tool: Tool.ArchitecturalRendering,
                        prompt: `Flow ${resolution}: ${customPrompt}`,
                        sourceImageURL: sourceImage?.objectURL,
                        resultImageURL: url,
                    });
                });
                if (jobId) await jobService.updateJobStatus(jobId, 'completed', successfulUrls[0]);
                if (failedCount > 0 && logId && user) {
                    const refundAmount = failedCount * unitCost;
                    await refundCredits(user.id, refundAmount, `Hoàn tiền: ${failedCount} ảnh lỗi`, logId);
                    onStateChange({ error: t('msg.refund_success').replace('{success}', successfulUrls.length.toString()).replace('{total}', numberOfImages.toString()).replace('{amount}', refundAmount.toString()).replace('{failed}', failedCount.toString()) });
                }
            } else {
                if (lastError) throw lastError;
                throw new Error(t('err.gen.failed'));
            }
        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                onStateChange({ error: t('msg.safety_violation') });
            } else {
                onStateChange({ error: t(friendlyMsg) });
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi hệ thống toàn bộ (${rawMsg})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    const handleAutoPrompt = async () => {
        if (!sourceImage) return;
        setIsAutoPromptLoading(true);
        try {
            const newPrompt = await geminiService.generateArchitecturalPrompt(sourceImage, language);
            onStateChange({ customPrompt: newPrompt });
        } catch (err: any) {
            onStateChange({ error: t('common.error') });
        } finally {
            setIsAutoPromptLoading(false);
        }
    };

    const handleDownload = async () => {
        const url = resultImages[selectedIndex];
        if (!url) return;
        setIsDownloading(true);
        await externalVideoService.forceDownload(url, "opzen-render.png");
        setIsDownloading(false);
    };

    const handleSendImageToSync = async (imageUrl: string) => {
        try { const fileData = await geminiService.getFileDataFromUrl(imageUrl); onSendToViewSync(fileData); } catch (e) { onStateChange({ error: t('common.error') }); }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 md:gap-8 max-w-[1920px] mx-auto overflow-hidden px-2 sm:px-4 md:px-6 h-full lg:h-[calc(100vh-140px)]">
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            {/* SIDEBAR: LEFT (Fixed width for Tablet/Mobile, 1/3 for Desktop) */}
            <aside className="w-full md:w-[300px] lg:w-1/3 xl:w-[30%] flex flex-col overflow-hidden flex-shrink-0 bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative">
                
                {/* Header Section */}
                <div className="p-4 sm:p-5 md:p-6 border-b border-border-color dark:border-[#302839] flex-shrink-0">
                    <h2 className="text-xl font-bold text-text-primary dark:text-white">{t('img_gen.title')}</h2>
                    <p className="text-xs text-text-secondary dark:text-gray-400">{t('img_gen.subtitle')}</p>
                </div>

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-6 scrollbar-hide space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-text-secondary dark:text-gray-400 mb-2">{t('img_gen.step1')}</label>
                        <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} className="!aspect-video" />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-text-secondary dark:text-gray-400 mb-2">{t('img_gen.ref_images')}</label>
                        {resolution === 'Standard' ? (
                            <div className="p-3 bg-gray-50 dark:bg-[#121212] border border-dashed border-gray-300 dark:border-[#302839] rounded-xl flex flex-col items-center justify-center text-center gap-1.5 min-h-[100px]">
                                <span className="material-symbols-outlined text-yellow-500 text-xl">lock</span>
                                <p className="text-[10px] text-gray-500 leading-tight px-4">{t('img_gen.ref_lock')}</p>
                                <button onClick={() => handleResolutionChange('1K')} className="text-[10px] text-[#7f13ec] font-bold underline">{t('img_gen.upgrade')}</button>
                            </div>
                        ) : (
                            <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} gridClassName="grid-cols-2 sm:grid-cols-3 md:grid-cols-2" />
                        )}
                    </div>

                    <div className="p-3 rounded-2xl border-2 border-dashed border-border-color dark:border-[#302839] bg-main-bg dark:bg-[#121212]">
                        <label className="block text-sm font-bold text-text-secondary dark:text-gray-400 mb-2">{t('img_gen.step2')}</label>
                        <textarea 
                            rows={4} 
                            className="w-full bg-surface dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-xl p-3 text-text-primary dark:text-gray-200 focus:ring-2 focus:ring-accent outline-none resize-none text-sm transition-all" 
                            placeholder={t('img_gen.prompt_placeholder')} 
                            value={customPrompt} 
                            onChange={(e) => onStateChange({ customPrompt: e.target.value })} 
                            disabled={isLoading} 
                        />
                        <button type="button" onClick={handleAutoPrompt} disabled={!sourceImage || isAutoPromptLoading || isLoading} className={`mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${!sourceImage || isAutoPromptLoading || isLoading ? 'bg-gray-100 dark:bg-gray-800 text-gray-400' : 'bg-gray-800 hover:bg-gray-900 dark:bg-black text-white shadow-sm'}`}>
                            {isAutoPromptLoading ? <Spinner /> : <span className="material-symbols-outlined text-base">auto_awesome</span>}
                            <span>{isAutoPromptLoading ? t('img_gen.analyzing') : t('img_gen.auto_prompt')}</span>
                        </button>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-sm font-bold text-text-secondary dark:text-gray-400 mb-2">{t('img_gen.step3')}</label>
                        <div className="space-y-3">
                            <OptionSelector id="building-type-selector" label={t('opt.building_type')} options={buildingTypeOptions} value={buildingType} onChange={handleBuildingTypeChange} disabled={isLoading} variant="select" />
                            <OptionSelector id="style-selector" label={t('opt.style')} options={styleOptions} value={style} onChange={handleStyleChange} disabled={isLoading} variant="select" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-3">
                                <OptionSelector id="context-selector" label={t('opt.context')} options={contextOptions} value={context} onChange={handleContextChange} disabled={isLoading} variant="select" />
                                <OptionSelector id="lighting-selector-custom" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={handleLightingChange} disabled={isLoading} variant="select" />
                                <OptionSelector id="weather-selector-custom" label={t('opt.weather')} options={weatherOptions} value={weather} onChange={handleWeatherChange} disabled={isLoading} variant="select" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 pt-2">
                        <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({aspectRatio: val})} disabled={isLoading} />
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({numberOfImages: val})} disabled={isLoading} />
                    </div>
                </div>

                {/* Bottom Actions: Fixed and flush to bottom */}
                <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-[#1A1A1A] z-20 pt-4 pb-4 px-4 sm:px-6 border-t border-border-color dark:border-[#302839] flex-shrink-0">
                    <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-text-secondary dark:text-gray-300">
                            <span className="material-symbols-outlined text-yellow-500 text-base">monetization_on</span>
                            <span>{t('common.cost')}: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                        </div>
                        <div className="text-[9px] font-bold text-[#7f13ec] bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full">{t('common.available')}: {userCredits}</div>
                    </div>
                    <button onClick={handleGenerate} disabled={isLoading || !customPrompt.trim()} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] disabled:bg-gray-400 dark:disabled:bg-gray-800 text-white font-bold py-3.5 px-4 rounded-xl transition-all text-sm shadow-md shadow-purple-500/10 transform active:scale-95">
                        {isLoading ? <><Spinner /> <span className="text-xs">{statusMessage || t('common.processing')}</span></> : <><span className="material-symbols-outlined text-lg">rocket_launch</span> <span>{t('common.start_render')}</span></>}
                    </button>
                    {error && <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-[10px] leading-tight">{error}</div>}
                </div>
            </aside>

            {/* MAIN CONTENT: RIGHT (Responsive Width) */}
            <main className="flex-1 flex flex-col gap-4 min-w-0 bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl p-3 sm:p-4 md:p-6 shadow-sm overflow-hidden relative group">
                
                {/* 1. Large Image Frame (TOP) */}
                <div className="flex-1 bg-gray-100 dark:bg-[#121212] rounded-[24px] border border-border-color dark:border-[#302839] relative overflow-hidden flex items-center justify-center min-h-[300px] sm:min-h-[400px] lg:min-h-[450px] shadow-inner">
                    
                    {/* Action Overlay: Floating buttons inside viewer */}
                    {resultImages.length > 0 && !isLoading && (
                        <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
                             <button 
                                onClick={() => handleSendImageToSync(resultImages[selectedIndex])}
                                className="p-2.5 rounded-xl bg-white/90 dark:bg-[#252525]/90 border border-white/20 text-gray-800 dark:text-gray-100 hover:bg-accent/10 hover:text-accent transition-all shadow-xl backdrop-blur-md"
                                title={t('tool.viewsync')}
                            >
                                <span className="material-symbols-outlined text-xl">view_in_ar</span>
                            </button>
                            <button 
                                onClick={handleDownload} 
                                disabled={isDownloading}
                                className="p-2.5 rounded-xl bg-white/90 dark:bg-[#252525]/90 border border-white/20 text-gray-800 dark:text-gray-100 hover:bg-blue-500/10 hover:text-blue-500 transition-all shadow-xl backdrop-blur-md"
                                title={t('common.download')}
                            >
                                {isDownloading ? <Spinner /> : <span className="material-symbols-outlined text-xl">download</span>}
                            </button>
                            <button 
                                onClick={() => setPreviewImage(resultImages[selectedIndex])}
                                className="p-2.5 rounded-xl bg-[#7f13ec] text-white hover:bg-[#690fca] transition-all shadow-xl shadow-purple-500/20"
                                title="Zoom"
                            >
                                <span className="material-symbols-outlined text-xl">zoom_in</span>
                            </button>
                        </div>
                    )}

                    {isLoading && (
                        <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-md z-20 flex flex-col items-center justify-center text-center p-6">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 relative mb-4">
                                <div className="absolute inset-0 rounded-full border-4 border-accent/10 border-t-accent animate-spin"></div>
                                <div className="absolute inset-4 rounded-full border-4 border-purple-500/20 border-b-purple-500 animate-spin-slow"></div>
                            </div>
                            <p className="text-base sm:text-lg font-bold text-white mb-1">{statusMessage || t('common.processing')}</p>
                            <p className="text-[10px] sm:text-xs text-gray-400 animate-pulse">{t('video.loading.5')}</p>
                        </div>
                    )}

                    {resultImages.length > 0 ? (
                        <div className="w-full h-full p-1 sm:p-2 animate-fade-in">
                             {sourceImage ? (
                                <ImageComparator 
                                    originalImage={sourceImage.objectURL} 
                                    resultImage={resultImages[selectedIndex]} 
                                />
                             ) : (
                                <img 
                                    src={resultImages[selectedIndex]} 
                                    className="w-full h-full object-contain rounded-2xl" 
                                    alt="Full View" 
                                />
                             )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center opacity-20 select-none">
                            <span className="material-symbols-outlined text-5xl sm:text-7xl mb-4 text-gray-500">photo_library</span>
                            <p className="text-sm sm:text-base font-medium text-gray-500">{t('msg.no_result_render')}</p>
                        </div>
                    )}
                </div>

                {/* 2. Thumbnail List Area (BOTTOM) */}
                {resultImages.length > 0 && (
                    <div className="bg-main-bg dark:bg-[#121212] p-2 sm:p-3 rounded-2xl border-2 border-border-color dark:border-[#302839] shadow-sm animate-slide-up">
                        <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
                            {resultImages.map((url, idx) => (
                                <button
                                    key={url}
                                    onClick={() => setSelectedIndex(idx)}
                                    className={`relative flex-shrink-0 w-24 sm:w-28 md:w-36 aspect-video rounded-lg overflow-hidden border-2 transition-all duration-300 transform snap-center ${
                                        selectedIndex === idx 
                                            ? 'border-[#7f13ec] ring-2 ring-purple-500/10 scale-105 shadow-md z-10' 
                                            : 'border-transparent opacity-60 hover:opacity-100 grayscale-[40%] hover:grayscale-0'
                                    }`}
                                >
                                    <img src={url} className="w-full h-full object-cover" alt={`Thumb ${idx + 1}`} />
                                    {selectedIndex === idx && (
                                        <div className="absolute inset-0 bg-accent/5 pointer-events-none"></div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default ImageGenerator;
