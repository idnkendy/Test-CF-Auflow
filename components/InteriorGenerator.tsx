
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService';
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { InteriorGeneratorState } from '../state/toolState';
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

interface InteriorGeneratorProps {
  state: InteriorGeneratorState;
  onStateChange: (newState: Partial<InteriorGeneratorState>) => void;
  onSendToViewSync: (image: FileData) => void;
  userCredits?: number;
  onDeductCredits?: (amount: number, description: string) => Promise<string>;
  onInsufficientCredits?: () => void;
}

const InteriorGenerator: React.FC<InteriorGeneratorProps> = ({ state, onStateChange, onSendToViewSync, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { 
        style, roomType, lighting, colorPalette, customPrompt, referenceImages, sourceImage, 
        isLoading, isUpscaling, error, resultImages, upscaledImage, numberOfImages, aspectRatio, resolution
    } = state;

    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [upscaleWarning, setUpscaleWarning] = useState<string | null>(null);
    const [isAutoPromptLoading, setIsAutoPromptLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);

    // --- Dynamic Options with localized values ---
    const styleOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.style.modern'), label: t('opt.style.modern') },
        { value: t('opt.style.neoclassic'), label: t('opt.style.neoclassic') },
        { value: 'Indochine', label: 'Indochine' },
        { value: 'Vintage', label: 'Vintage' },
        { value: 'Mediterranean', label: 'Mediterranean' },
        { value: t('opt.style.minimalist'), label: t('opt.style.minimalist') },
        { value: t('opt.style.scandinavian'), label: t('opt.style.scandinavian') },
        { value: t('opt.style.industrial'), label: t('opt.style.industrial') },
        { value: 'Luxury', label: 'Luxury' },
    ], [t]);

    const projectTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.building.townhouse'), label: t('opt.building.townhouse') },
        { value: t('opt.building.apartment'), label: t('opt.building.apartment') },
        { value: t('opt.building.villa'), label: t('opt.building.villa') },
        { value: t('opt.building.office'), label: t('opt.building.office') },
        { value: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}`, label: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}` },
        { value: 'Showroom', label: 'Showroom' },
    ], [t]);

    const interiorLightingOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.lighting.sunrise'), label: t('opt.lighting.sunrise') },
        { value: t('opt.lighting.evening'), label: t('opt.lighting.evening') },
        { value: t('opt.lighting.night_stars'), label: t('opt.lighting.night_stars') },
    ], [t]);

    const colorPaletteOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: 'Neutral', label: 'Neutral' },
        { value: 'Warm', label: 'Warm' },
        { value: 'Cool', label: 'Cool' },
        { value: 'Pastel', label: 'Pastel' },
        { value: 'High Contrast', label: 'High Contrast' },
    ], [t]);

    // Handle Default Prompt Switching
    useEffect(() => {
        const viDefault = 'Biến thành ảnh chụp thực tế không gian nội thất';
        const enDefault = 'Transform into realistic interior space';
        
        if (customPrompt === viDefault || customPrompt === enDefault || !customPrompt) {
            onStateChange({ customPrompt: t('int.default_prompt') });
        }
    }, [language, t]);

    const escapeRegExp = (string: string) => { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    
    const updatePrompt = useCallback((type: 'style' | 'projectType' | 'lighting' | 'colorPalette', newValue: string, oldValue: string) => {
        const getPromptPart = (partType: string, value: string, lang: string): string => {
            if (value === 'none' || !value) return '';
            const isVi = lang === 'vi';
            switch (partType) {
                case 'style': return isVi ? `phong cách ${value}` : `style ${value}`;
                case 'projectType': return isVi ? `cho ${value}` : `for ${value}`;
                case 'lighting': return isVi ? `với ${value}` : `with ${value}`;
                case 'colorPalette': return isVi ? `tông màu ${value}` : `color tone ${value}`;
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
        
        const cleanedPrompt = nextPrompt.replace(/,+/g, ',').split(',').map(p => p.trim()).filter(p => p.length > 0).join(', ');
        onStateChange({ customPrompt: cleanedPrompt });
    }, [customPrompt, onStateChange, language]);

    const handleStyleChange = (newVal: string) => { updatePrompt('style', newVal, style); onStateChange({ style: newVal }); };
    const handleProjectTypeChange = (newVal: string) => { updatePrompt('projectType', newVal, roomType); onStateChange({ roomType: newVal }); };
    const handleLightingChange = (newVal: string) => { updatePrompt('lighting', newVal, lighting); onStateChange({ lighting: newVal }); };
    const handleColorPaletteChange = (newVal: string) => { updatePrompt('colorPalette', newVal, colorPalette); onStateChange({ colorPalette: newVal }); };
    
    const handleResolutionChange = (val: ImageResolution) => { onStateChange({ resolution: val }); if (val === 'Standard') { onStateChange({ referenceImages: [] }); } };
    const handleFileSelect = (fileData: FileData | null) => { onStateChange({ sourceImage: fileData, resultImages: [], upscaledImage: null, }); }
    const handleReferenceFilesChange = (files: FileData[]) => { onStateChange({ referenceImages: files }); };
    const getCostPerImage = () => { switch (resolution) { case 'Standard': return 5; case '1K': return 10; case '2K': return 20; case '4K': return 30; default: return 5; } };
    const unitCost = getCostPerImage();
    const cost = numberOfImages * unitCost;
    
    const constructInteriorPrompt = () => { 
        let basePrompt = `Generate an image with a strict aspect ratio of ${aspectRatio}. Adapt the composition of the interior scene from the source image to fit this new frame. Do not add black bars or letterbox. The main creative instruction is: ${customPrompt}. Make it photorealistic interior design.`; 
        if (referenceImages && referenceImages.length > 0) { basePrompt += ` Also, take aesthetic inspiration (colors, materials, atmosphere) from the provided reference image(s).`; } 
        basePrompt = `You are a professional interior designer. ${basePrompt}`; 
        return basePrompt; 
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) { 
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: `${t('common.insufficient')}. Cần ${cost} credits.` });
             }
             return; 
        }
        if (!sourceImage) { onStateChange({ error: 'Vui lòng tải lên một hình ảnh phác thảo hoặc không gian.' }); return; }
        if (!customPrompt.trim()) { onStateChange({ error: 'Lời nhắc (prompt) không được để trống.' }); return; }

        onStateChange({ isLoading: true, error: null, resultImages: [], upscaledImage: null });
        setStatusMessage(t('common.processing'));
        setUpscaleWarning(null);

        const promptForService = constructInteriorPrompt();
        let jobId: string | null = null;
        let logId: string | null = null;
        
        try {
            if (onDeductCredits) { logId = await onDeductCredits(cost, `Render nội thất (${numberOfImages} ảnh) - ${resolution || 'Standard'}`); }
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) { jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.InteriorRendering, prompt: customPrompt, cost: cost, usage_log_id: logId }); }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            
            // ERROR TRACKING
            let lastError: any = null;

            const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                try {
                    const inputImages: FileData[] = [];
                    if (sourceImage) inputImages.push(sourceImage);
                    if (referenceImages && referenceImages.length > 0) inputImages.push(...referenceImages);

                    const result = await externalVideoService.generateFlowImage(
                        promptForService,
                        inputImages,
                        aspectRatio, 
                        1, 
                        modelName,
                        (msg) => setStatusMessage(msg)
                    );

                    if (result.imageUrls && result.imageUrls.length > 0) {
                        let finalUrl = result.imageUrls[0];
                        const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;

                        if (shouldUpscale) {
                            const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                            const upscaleRes = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                            if (upscaleRes && upscaleRes.imageUrl) finalUrl = upscaleRes.imageUrl;
                        }
                        return finalUrl;
                    }
                    return null;
                } catch (e) {
                    console.error(`Image ${index+1} failed`, e);
                    lastError = e; // Capture specific error
                    return null;
                }
            });

            const results = await Promise.all(promises);
            const successfulUrls = results.filter((url): url is string => url !== null);
            const failedCount = numberOfImages - successfulUrls.length;

            if (successfulUrls.length > 0) {
                onStateChange({ resultImages: successfulUrls });
                successfulUrls.forEach(url => historyService.addToHistory({ tool: Tool.InteriorRendering, prompt: `Flow ${modelName}: ${promptForService}`, sourceImageURL: sourceImage?.objectURL, resultImageURL: url }));
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
                throw new Error("Không thể tạo ảnh nào sau nhiều lần thử.");
            }

        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                onStateChange({ error: t('msg.safety_violation') });
            } else {
                onStateChange({ error: t(friendlyMsg) });
            }
            
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) await refundCredits(user.id, cost, `Hoàn tiền: Lỗi toàn bộ (${rawMsg})`, logId);
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    const handleAutoPrompt = async () => {
        if (!sourceImage) return;
        setIsAutoPromptLoading(true);
        onStateChange({ error: null });
        try {
            const newPrompt = await geminiService.generateInteriorPrompt(sourceImage, language);
            onStateChange({ customPrompt: newPrompt });
        } catch (err: any) {
            onStateChange({ error: err.message || "Không thể tạo prompt tự động." });
        } finally {
            setIsAutoPromptLoading(false);
        }
    };

    const handleUpscale = async () => {
        if (resultImages.length !== 1) return;
        onStateChange({ isUpscaling: true, error: null });
        setStatusMessage(t('common.processing'));
        try {
            const imageToUpscale = await geminiService.getFileDataFromUrl(resultImages[0]);
            const result = await geminiService.editImage("Upscale this interior design rendering to a high resolution.", imageToUpscale, 1);
            onStateChange({ upscaledImage: result[0].imageUrl });
        } catch (err: any) { onStateChange({ error: err.message || "Failed to upscale image." }); } finally { onStateChange({ isUpscaling: false }); setStatusMessage(null); }
    };
    
    const handleDownload = async () => { 
        const url = upscaledImage || (resultImages.length > 0 ? resultImages[0] : null); 
        if (!url) return; 
        setIsDownloading(true);
        await externalVideoService.forceDownload(url, "generated-interior.png");
        setIsDownloading(false);
    };
    
    const handleSendImageToSync = async (imageUrl: string) => { try { const fileData = await geminiService.getFileDataFromUrl(imageUrl); onSendToViewSync(fileData); } catch (e) { onStateChange({ error: "Không thể chuyển ảnh, định dạng không hợp lệ." }); } };

    return (
        <div className="flex flex-col gap-8">
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            <div>
                <h2 className="text-2xl font-bold text-text-primary dark:text-white mb-4">{t('int.title')}</h2>
                <p className="text-text-secondary dark:text-gray-300 mb-6">{t('services.interior_desc')}</p>
                
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('int.step1')}</label>
                                <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL}/>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('img_gen.ref_images')}</label>
                                {resolution === 'Standard' ? (
                                    <div className="p-4 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 min-h-[120px]">
                                        <span className="material-symbols-outlined text-yellow-500 text-3xl">lock</span>
                                        <p className="text-sm text-text-secondary dark:text-gray-400">
                                            {t('img_gen.ref_lock')}
                                        </p>
                                        <button 
                                            onClick={() => handleResolutionChange('1K')}
                                            className="text-xs text-[#7f13ec] hover:underline font-semibold"
                                        >
                                            {t('img_gen.upgrade')}
                                        </button>
                                    </div>
                                ) : (
                                    <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                                )}
                            </div>
                        </div>

                         <div className="space-y-4 flex flex-col">
                             <div className="relative">
                                <label htmlFor="custom-prompt-interior" className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('int.step2')}</label>
                                <div className="relative">
                                    <textarea
                                        id="custom-prompt-interior"
                                        rows={4}
                                        className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-text-primary dark:text-gray-200 focus:ring-2 focus:ring-accent focus:outline-none transition-all"
                                        placeholder={t('int.prompt_placeholder')}
                                        value={customPrompt}
                                        onChange={(e) => onStateChange({ customPrompt: e.target.value })}
                                        disabled={isLoading}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAutoPrompt}
                                    disabled={!sourceImage || isAutoPromptLoading || isLoading}
                                    className={`mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200
                                        ${!sourceImage || isAutoPromptLoading || isLoading
                                            ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                                            : 'bg-[#334155] hover:bg-[#475569] text-white shadow-sm hover:shadow'
                                        }
                                    `}
                                    title={t('img_gen.auto_prompt')}
                                >
                                    {isAutoPromptLoading ? (
                                        <>
                                            <Spinner />
                                            <span>{t('img_gen.analyzing')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-lg">auto_awesome</span>
                                            <span>{t('img_gen.auto_prompt')}</span>
                                        </>
                                    )}
                                </button>
                             </div>
                            
                            <div className="pt-2">
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('int.step3')}</label>
                                <div className="space-y-4">
                                    <OptionSelector id="project-type-selector" label={t('opt.int.project_type')} options={projectTypeOptions} value={roomType} onChange={handleProjectTypeChange} disabled={isLoading} variant="grid" />
                                    <OptionSelector id="style-selector-int" label={t('opt.int.style')} options={styleOptions} value={style} onChange={handleStyleChange} disabled={isLoading} variant="grid" />
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <OptionSelector id="lighting-selector-int" label={t('opt.int.lighting')} options={interiorLightingOptions} value={lighting} onChange={handleLightingChange} disabled={isLoading} variant="select" />
                                        <OptionSelector id="color-palette-selector" label={t('opt.int.color')} options={colorPaletteOptions} value={colorPalette} onChange={handleColorPaletteChange} disabled={isLoading} variant="select" />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="pt-4 grid grid-cols-2 gap-4">
                                <div>
                                    <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} disabled={isLoading || isUpscaling} />
                                </div>
                                <div>
                                    <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} disabled={isLoading || isUpscaling} />
                                </div>
                            </div>
                            <div className="pt-4">
                                <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading || isUpscaling} />
                            </div>
                        </div>
                    </div>

                    <div className="mt-4">
                         <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mb-3 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>{t('common.cost')}: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                            </div>
                            <div className="text-xs">
                                {userCredits < cost ? (
                                    <span className="text-red-500 font-semibold">{t('common.insufficient')} ({t('common.available')}: {userCredits})</span>
                                ) : (
                                    <span className="text-green-600 dark:text-green-400">{t('common.available')}: {userCredits}</span>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={isLoading || !sourceImage || isUpscaling}
                            className="w-full flex justify-center items-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
                        >
                           {isLoading ? <><Spinner /> {statusMessage || t('common.processing')}</> : t('int.btn_generate')}
                        </button>
                    </div>
                    {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-300 rounded-lg text-sm">{error}</div>}
                    {upscaleWarning && <p className="mt-3 text-sm text-yellow-500 text-center font-medium bg-yellow-100 dark:bg-yellow-900/20 p-2 rounded">{upscaleWarning}</p>}
                </div>
            </div>

             <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold text-text-primary dark:text-white">{t('int.result_title')}</h3>
                    <div className="flex items-center gap-2">
                        {resultImages.length === 1 && !upscaledImage && (
                            <button
                                onClick={handleUpscale}
                                disabled={isUpscaling || isLoading}
                                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-1 px-3 rounded-md text-sm transition-colors"
                            >
                                {isUpscaling ? <Spinner/> : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                    </svg>
                                )}
                                <span>{isUpscaling ? t('common.processing') : t('int.btn_upscale')}</span>
                            </button>
                        )}
                        {resultImages.length === 1 && (
                            <>
                                 <button
                                    onClick={() => handleSendImageToSync(upscaledImage || resultImages[0])}
                                    className="text-center bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 transition-colors rounded-lg text-sm flex items-center gap-2"
                                    title="Chuyển ảnh này tới Đồng Bộ View để xử lý tiếp"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                    {t('int.btn_sync')}
                                </button>
                                 <button
                                    onClick={() => setPreviewImage(upscaledImage || resultImages[0])}
                                    className="text-center bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 transition-colors rounded-lg text-sm flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                </button>
                                 <button onClick={handleDownload} disabled={isDownloading} className="text-center bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 transition-colors rounded-lg text-sm flex items-center gap-2">
                                    {isDownloading ? <Spinner /> : null} {t('common.download')}
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-border-color dark:border-gray-700 flex items-center justify-center overflow-hidden">
                    {isLoading && (
                        <div className="flex flex-col items-center">
                            <Spinner />
                            <p className="mt-2 text-text-secondary dark:text-gray-400">{statusMessage || t('common.processing')}</p>
                        </div>
                    )}
                    {!isLoading && upscaledImage && resultImages.length === 1 && (
                         <ImageComparator originalImage={resultImages[0]} resultImage={upscaledImage} />
                    )}
                    {!isLoading && !upscaledImage && resultImages.length === 1 && sourceImage &&(
                         <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[0]} />
                    )}
                     {!isLoading && resultImages.length > 1 && (
                        <ResultGrid images={resultImages} toolName="interior-render" onSendToViewSync={handleSendImageToSync} />
                    )}
                    {!isLoading && resultImages.length === 0 && (
                        <p className="text-text-secondary dark:text-gray-400 p-4 text-center">{sourceImage ? t('msg.no_result_render') : t('common.upload_placeholder')}</p>
                    )}
                </div>
              </div>
        </div>
    );
};

export default InteriorGenerator;
