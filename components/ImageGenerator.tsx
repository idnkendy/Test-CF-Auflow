
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
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [isAutoPromptLoading, setIsAutoPromptLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);

    // --- Dynamic Options with localized values ---
    // The 'value' is now language-dependent to ensure the generated prompt matches the user's language setting.

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

    // Handle Default Prompt Switching
    useEffect(() => {
        const viDefault = 'Biến thành ảnh chụp thực tế nhà ở';
        const enDefault = 'Transform into a realistic house photo';
        
        // Only update if current prompt matches one of the defaults
        if (customPrompt === viDefault || customPrompt === enDefault || !customPrompt) {
             onStateChange({ customPrompt: t('img_gen.default_prompt') });
        }
    }, [language, t]); // Run when language changes

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

        // Construct potential old parts in BOTH languages to ensure cleanup works even after language switch
        const oldPartVi = getPromptPart(type, oldValue, 'vi');
        const oldPartEn = getPromptPart(type, oldValue, 'en');
        
        // Construct new part in CURRENT language
        const newPart = getPromptPart(type, newValue, language);

        let nextPrompt = customPrompt;

        // Try to remove old part (check both VI and EN versions)
        if (oldPartVi && nextPrompt.includes(oldPartVi)) {
            nextPrompt = nextPrompt.replace(new RegExp(`,?\\s*${escapeRegExp(oldPartVi)}`), '').replace(new RegExp(`${escapeRegExp(oldPartVi)},?\\s*`), '');
        }
        if (oldPartEn && nextPrompt.includes(oldPartEn)) {
            nextPrompt = nextPrompt.replace(new RegExp(`,?\\s*${escapeRegExp(oldPartEn)}`), '').replace(new RegExp(`${escapeRegExp(oldPartEn)},?\\s*`), '');
        }

        // Add new part
        if (newPart) {
            nextPrompt = nextPrompt.trim() ? `${nextPrompt}, ${newPart}` : newPart;
        }

        // Cleanup commas
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
                 setActiveJobId(jobId);
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
                        const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds?.length > 0;

                        if (shouldUpscale) {
                            const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                            const upscaleRes = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                            if (upscaleRes.imageUrl) finalUrl = upscaleRes.imageUrl;
                        }
                        
                        return finalUrl;
                    }
                    return null;
                } catch (e) {
                    console.error(`Image generation ${index + 1} failed:`, e);
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
                    
                    const errorMsg = t('msg.refund_success')
                        .replace('{success}', successfulUrls.length.toString())
                        .replace('{total}', numberOfImages.toString())
                        .replace('{amount}', refundAmount.toString())
                        .replace('{failed}', failedCount.toString());
                    
                    onStateChange({ error: errorMsg });
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
        const url = upscaledImage || resultImages[0];
        if (!url) return;
        setIsDownloading(true);
        await externalVideoService.forceDownload(url, "opzen-render.png");
        setIsDownloading(false);
    };

    const handleSendImageToSync = async (imageUrl: string) => {
        try { const fileData = await geminiService.getFileDataFromUrl(imageUrl); onSendToViewSync(fileData); } catch (e) { onStateChange({ error: t('common.error') }); }
    };

    return (
        <div className="flex flex-col gap-8">
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl md:text-3xl font-bold text-text-primary dark:text-white">{t('img_gen.title')}</h2>
                <p className="text-sm md:text-base text-text-secondary dark:text-gray-400">{t('img_gen.subtitle')}</p>
            </div>
            
            <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-4 md:p-6 rounded-xl border border-border-color dark:border-gray-700">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('img_gen.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL}/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('img_gen.ref_images')}</label>
                            {resolution === 'Standard' ? (
                                <div className="p-4 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 min-h-[120px]">
                                    <span className="material-symbols-outlined text-yellow-500 text-3xl">lock</span>
                                    <p className="text-sm text-text-secondary dark:text-gray-400">{t('img_gen.ref_lock')}</p>
                                    <button onClick={() => handleResolutionChange('1K')} className="text-xs text-[#7f13ec] hover:underline font-semibold">{t('img_gen.upgrade')}</button>
                                </div>
                            ) : (
                                <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                            )}
                        </div>
                    </div>
                    <div className="space-y-4 flex flex-col">
                        <div className="relative">
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('img_gen.step2')}</label>
                            <textarea rows={4} className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-text-primary dark:text-gray-200 focus:ring-2 focus:ring-accent outline-none resize-none text-sm" placeholder={t('img_gen.prompt_placeholder')} value={customPrompt} onChange={(e) => onStateChange({ customPrompt: e.target.value })} disabled={isLoading} />
                            <button type="button" onClick={handleAutoPrompt} disabled={!sourceImage || isAutoPromptLoading || isLoading} className={`mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${!sourceImage || isAutoPromptLoading || isLoading ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed' : 'bg-[#334155] hover:bg-[#475569] text-white shadow-sm'}`}>
                                {isAutoPromptLoading ? <><Spinner /><span>{t('img_gen.analyzing')}</span></> : <><span className="material-symbols-outlined text-lg">auto_awesome</span><span>{t('img_gen.auto_prompt')}</span></>}
                            </button>
                        </div>
                        <div className="pt-2">
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('img_gen.step3')}</label>
                            <div className="space-y-4">
                                <OptionSelector id="building-type-selector" label={t('opt.building_type')} options={buildingTypeOptions} value={buildingType} onChange={handleBuildingTypeChange} disabled={isLoading} variant="grid" />
                                <OptionSelector id="style-selector" label={t('opt.style')} options={styleOptions} value={style} onChange={handleStyleChange} disabled={isLoading} variant="grid" />
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    <OptionSelector id="context-selector" label={t('opt.context')} options={contextOptions} value={context} onChange={handleContextChange} disabled={isLoading} variant="select" />
                                    <OptionSelector id="lighting-selector" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={handleLightingChange} disabled={isLoading} variant="select" />
                                    <OptionSelector id="weather-selector" label={t('opt.weather')} options={weatherOptions} value={weather} onChange={handleWeatherChange} disabled={isLoading} variant="select" />
                                </div>
                            </div>
                        </div>
                        <div className="pt-4 grid grid-cols-2 gap-4">
                            <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({numberOfImages: val})} disabled={isLoading} />
                            <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({aspectRatio: val})} disabled={isLoading} />
                        </div>
                        <div className="pt-4"><ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} /></div>
                    </div>
                </div>

                <div className="mt-4">
                    <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mb-3 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                            <span className="material-symbols-outlined text-yellow-500 text-lg">monetization_on</span>
                            <span>{t('common.cost')}: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                        </div>
                        <div className="text-xs">{userCredits < cost ? <span className="text-red-500 font-semibold">{t('common.insufficient')} ({t('common.available')}: {userCredits})</span> : <span className="text-green-600 dark:text-green-400">{t('common.available')}: {userCredits}</span>}</div>
                    </div>
                    <button onClick={handleGenerate} disabled={isLoading || !customPrompt.trim()} className="w-full flex justify-center items-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg shadow-lg">
                        {isLoading ? <><Spinner /> {statusMessage || t('common.processing')}</> : t('common.start_render')}
                    </button>
                    {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-300 rounded-lg text-sm">{error}</div>}
                </div>
            </div>

            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-text-primary dark:text-white">{t('common.result')}</h3>
                    {resultImages.length === 1 && (
                        <div className="flex items-center gap-2">
                            <button onClick={() => handleSendImageToSync(resultImages[0])} className="text-accent-600 bg-accent-50 hover:bg-accent-100 px-3 py-1.5 rounded-lg text-sm font-medium border border-accent-200">{t('tool.viewsync')}</button>
                            <button onClick={handleDownload} disabled={isDownloading} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2">
                                {isDownloading ? <Spinner /> : null} {t('common.download')}
                            </button>
                        </div>
                    )}
                </div>
                <div className="w-full aspect-[4/3] bg-gray-100 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center overflow-hidden relative">
                    {isLoading && (
                        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                            <div className="w-16 h-16 border-4 border-accent-200 border-t-accent-600 rounded-full animate-spin mb-4"></div>
                            <p className="text-accent-600 dark:text-accent-400 font-medium animate-pulse">{statusMessage || t('common.processing')}</p>
                        </div>
                    )}
                    {!isLoading && resultImages.length === 1 && sourceImage && <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[0]} />}
                    {!isLoading && resultImages.length === 1 && !sourceImage && <img src={resultImages[0]} className="w-full h-full object-contain" />}
                    {!isLoading && resultImages.length > 1 && <ResultGrid images={resultImages} toolName="architecture-render" onSendToViewSync={handleSendImageToSync} />}
                    {!isLoading && resultImages.length === 0 && <div className="text-center opacity-50"><p className="text-gray-500">{t('msg.no_result_render')}</p></div>}
                </div>
            </div>
        </div>
    );
};

export default ImageGenerator;
