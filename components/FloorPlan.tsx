
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

const FloorPlan: React.FC<FloorPlanProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { 
        prompt, layoutPrompt, sourceImage, referenceImages, isLoading, error, resultImages, 
        numberOfImages, renderMode, planType, resolution, aspectRatio,
        projectType, importantArea, time, weather 
    } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [upscaleWarning, setUpscaleWarning] = useState<string | null>(null);
    const [isAutoPromptLoading, setIsAutoPromptLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);

    // Using useMemo to ensure options update when language changes
    const exteriorProjectTypeOptions = useMemo(() => [
        { value: t('opt.building.townhouse'), label: t('opt.building.townhouse') },
        { value: t('opt.building.villa'), label: t('opt.building.villa') },
        { value: t('opt.building.apartment'), label: t('opt.building.apartment') },
        { value: 'Resort', label: 'Resort' },
        { value: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}`, label: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}` },
        { value: t('opt.building.office'), label: t('opt.building.office') },
        { value: 'Park', label: language === 'vi' ? 'Công viên' : 'Park' },
    ], [t, language]);

    const importantAreaOptions = useMemo(() => [
        { value: language === 'vi' ? 'Khu nhà ở' : 'Residential area', label: language === 'vi' ? 'Khu nhà ở' : 'Residential area' },
        { value: language === 'vi' ? 'Khu thương mại' : 'Commercial area', label: language === 'vi' ? 'Khu thương mại' : 'Commercial area' },
        { value: language === 'vi' ? 'Khu vui chơi' : 'Playground', label: language === 'vi' ? 'Khu vui chơi' : 'Playground' },
        { value: language === 'vi' ? 'Cổng' : 'Entrance', label: language === 'vi' ? 'Cổng' : 'Entrance' },
        { value: language === 'vi' ? 'Bungalow mái rơm' : 'Thatch Bungalow', label: language === 'vi' ? 'Bungalow mái rơm' : 'Thatch Bungalow' },
        { value: language === 'vi' ? 'Nhà hàng & Cafe' : 'Restaurant & Cafe', label: language === 'vi' ? 'Nhà hàng & Cafe' : 'Restaurant & Cafe' },
        { value: language === 'vi' ? 'Bãi đỗ xe' : 'Parking', label: language === 'vi' ? 'Bãi đỗ xe' : 'Parking' },
    ], [language]);

    const timeOptions = useMemo(() => [
        { value: language === 'vi' ? 'Ban ngày' : 'Daytime', label: language === 'vi' ? 'Ban ngày' : 'Daytime' },
        { value: language === 'vi' ? 'Hoàng hôn' : 'Sunset', label: language === 'vi' ? 'Hoàng hôn' : 'Sunset' },
        { value: language === 'vi' ? 'Ban đêm' : 'Night', label: language === 'vi' ? 'Ban đêm' : 'Night' },
    ], [language]);

    const weatherOptions = useMemo(() => [
        { value: language === 'vi' ? 'Nắng đẹp' : 'Sunny', label: language === 'vi' ? 'Nắng đẹp' : 'Sunny' },
        { value: language === 'vi' ? 'Nhiều mây' : 'Cloudy', label: language === 'vi' ? 'Nhiều mây' : 'Cloudy' },
        { value: language === 'vi' ? 'Mưa' : 'Rainy', label: language === 'vi' ? 'Mưa' : 'Rainy' },
    ], [language]);

    const interiorProjectTypeOptions = useMemo(() => [
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
        { value: t('opt.style.modern'), label: t('opt.style.modern') },
        { value: 'Classic', label: language === 'vi' ? 'Cổ điển' : 'Classic' },
        { value: t('opt.style.neoclassic'), label: t('opt.style.neoclassic') },
        { value: 'Indochine', label: 'Indochine' },
        { value: 'Vintage', label: 'Vintage' },
        { value: 'Mediterranean', label: language === 'vi' ? 'Địa Trung Hải' : 'Mediterranean' },
        { value: t('opt.style.minimalist'), label: t('opt.style.minimalist') },
    ], [t, language]);

    // Use specific keys for Top Down and Perspective labels based on planType (Interior/Exterior)
    const topDownLabel = planType === 'exterior' 
        ? t('ext.floorplan.mode.topdown_ext')
        : t('ext.floorplan.mode.topdown_int');

    const perspectiveLabel = planType === 'exterior' 
        ? t('ext.floorplan.mode.perspective_ext')
        : t('ext.floorplan.mode.perspective_int');

    useEffect(() => {
        const prompt1_vi = 'Biến thành ảnh chụp thực tế dự án';
        const prompt1_en = 'Transform into realistic project photo';
        const prompt2_vi = 'Biến thành ảnh chụp thực tế nội thất';
        const prompt2_en = 'Transform into realistic interior photo';

        if (renderMode === 'top-down') {
            if (planType === 'interior') {
                if (!prompt || prompt === prompt1_vi || prompt === prompt1_en || prompt === prompt2_vi || prompt === prompt2_en) {
                    onStateChange({ prompt: language === 'vi' ? prompt2_vi : prompt2_en });
                }
            } else if (planType === 'exterior') {
                if (!prompt || prompt === prompt2_vi || prompt === prompt2_en || prompt === prompt1_vi || prompt === prompt1_en) {
                    onStateChange({ prompt: language === 'vi' ? prompt1_vi : prompt1_en });
                }
            }
        }
    }, [renderMode, planType, onStateChange, language]);

    const appendToPrompt = (text: string) => {
        const targetPromptKey = renderMode === 'top-down' ? 'prompt' : 'layoutPrompt';
        let currentPrompt = state[targetPromptKey] || '';
        
        if (currentPrompt.includes(text)) return;

        const newPrompt = currentPrompt.trim() 
            ? `${currentPrompt}, ${text}` 
            : text;
            
        onStateChange({ [targetPromptKey]: newPrompt });
    };

    const handleProjectTypeChange = (val: string) => {
        const prefix = language === 'vi' ? 'Dự án' : 'Project';
        appendToPrompt(`${prefix} ${val}`);
        onStateChange({ projectType: val }); 
    };

    const handleImportantAreaChange = (val: string) => {
        appendToPrompt(val);
        onStateChange({ importantArea: val });
    };

    const handleInteriorStyleChange = (val: string) => {
        const prefix = language === 'vi' ? 'phong cách' : 'style';
        appendToPrompt(`${prefix} ${val}`);
    };

    const handleTimeChange = (val: string) => {
        appendToPrompt(val);
        onStateChange({ time: val });
    };

    const handleWeatherChange = (val: string) => {
        const prefix = language === 'vi' ? 'trời' : '';
        appendToPrompt(`${prefix} ${val}`);
        onStateChange({ weather: val });
    };

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
    const cost = numberOfImages * unitCost;

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
    };

    const handleAutoPrompt = async () => {
        if (!sourceImage) return;
        setIsAutoPromptLoading(true);
        onStateChange({ error: null });
        try {
            const newPrompt = await geminiService.generateFloorPlanPrompt(sourceImage, planType, renderMode, language);
            if (renderMode === 'top-down') {
                onStateChange({ prompt: newPrompt });
            } else {
                onStateChange({ layoutPrompt: newPrompt });
            }
        } catch (err: any) {
            onStateChange({ error: err.message || t('common.error') });
        } finally {
            setIsAutoPromptLoading(false);
        }
    };

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, resultImages: [] });
    };

    const handleReferenceFilesChange = (files: FileData[]) => {
        onStateChange({ referenceImages: files });
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

        const activePrompt = renderMode === 'top-down' ? prompt : layoutPrompt;

        if (!activePrompt || !activePrompt.trim()) {
            onStateChange({ error: 'Vui lòng nhập mô tả hoặc sử dụng gợi ý.' });
            return;
        }
        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên ảnh mặt bằng.' });
            return;
        }

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));
        setUpscaleWarning(null);

        let logId: string | null = null;
        let jobId: string | null = null;

        const useFlow = true;
        
        let finalPrompt = "";
        if (renderMode === 'top-down') {
            finalPrompt = `Convert this 2D floor plan into a photorealistic top-down 3D rendering. ${activePrompt}. Maintain accurate layout and proportions.`;
        } else {
            finalPrompt = `Convert this 2D floor plan into a photorealistic 3D perspective view. ${activePrompt}. Show depth and interior/exterior details based on the plan.`;
        }

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Render mặt bằng (${numberOfImages} ảnh) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.FloorPlan,
                    prompt: activePrompt,
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            let lastError: any = null;
            
            const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                try {
                    const inputImages = sourceImage ? [sourceImage, ...referenceImages] : [];
                    const result = await externalVideoService.generateFlowImage(
                        finalPrompt,
                        inputImages,
                        aspectRatio, // Pass actual ratio string (e.g., '3:4', '4:3', '16:9') directly
                        1,
                        modelName,
                        (msg) => setStatusMessage(t('common.processing'))
                    );

                    if (result.imageUrls && result.imageUrls.length > 0) {
                        let finalUrl = result.imageUrls[0];
                        const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                        if (shouldUpscale) {
                            const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                            const upscaleRes = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                            if (upscaleRes && upscaleRes.imageUrl) {
                                finalUrl = upscaleRes.imageUrl;
                            }
                        }
                        return finalUrl;
                    }
                    return null;
                } catch (e) {
                    console.error(`Image ${index+1} failed`, e);
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
                        tool: Tool.FloorPlan,
                        prompt: `Flow ${modelName}: ${finalPrompt}`,
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
                throw new Error("Không thể tạo ảnh nào sau nhiều lần thử.");
            }

        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                onStateChange({ error: t('msg.safety_violation') });
            } else {
                onStateChange({ error: friendlyMsg });
            }
            
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
            
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi hệ thống toàn bộ (${rawMsg})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    const handleDownload = async () => {
        if (resultImages.length === 0) return;
        setIsDownloading(true);
        await externalVideoService.forceDownload(resultImages[0], `floorplan-render-${Date.now()}.png`);
        setIsDownloading(false);
    };

    const showExteriorOptions = planType === 'exterior' && renderMode === 'top-down';
    const showInteriorOptions = planType === 'interior' && renderMode === 'top-down';

    return (
        <div className="flex flex-col gap-8">
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <h2 className="text-2xl font-bold text-text-primary dark:text-white mb-4">{t('ext.floorplan.title')}</h2>
            <p className="text-text-secondary dark:text-gray-300 -mt-6 mb-6">{t('ext.floorplan.subtitle')}</p>

            <div className="bg-main-bg/50 dark:bg-dark-bg/50 border border-border-color dark:border-gray-700 rounded-xl p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('ext.floorplan.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                        
                        {renderMode === 'perspective' && (
                            <div>
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('img_gen.ref_images')}</label>
                                <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                            </div>
                        )}
                    </div>
                    
                    <div className="space-y-4 flex flex-col h-full">
                         <div>
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('ext.floorplan.step2')}</label>
                            <div className="grid grid-cols-2 gap-2 bg-main-bg dark:bg-gray-800 p-1 rounded-lg">
                                <button onClick={() => onStateChange({ planType: 'interior' })} className={`py-2 rounded-md text-sm font-semibold transition-colors ${planType === 'interior' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>{language === 'vi' ? 'Nội thất' : 'Interior'}</button>
                                <button onClick={() => onStateChange({ planType: 'exterior' })} className={`py-2 rounded-md text-sm font-semibold transition-colors ${planType === 'exterior' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>{language === 'vi' ? 'Kiến trúc' : 'Architecture'}</button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 bg-main-bg dark:bg-gray-800 p-1 rounded-lg mt-2">
                                <button onClick={() => onStateChange({ renderMode: 'top-down' })} className={`py-2 rounded-md text-sm font-semibold transition-colors ${renderMode === 'top-down' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>{topDownLabel}</button>
                                <button onClick={() => onStateChange({ renderMode: 'perspective' })} className={`py-2 rounded-md text-sm font-semibold transition-colors ${renderMode === 'perspective' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>{perspectiveLabel}</button>
                            </div>
                        </div>
                        
                        {showExteriorOptions && (
                            <div className="pt-2 space-y-4">
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('ext.floorplan.step3')}</label>
                                <OptionSelector id="project-type" label={t('opt.int.project_type')} options={exteriorProjectTypeOptions} value={projectType} onChange={handleProjectTypeChange} disabled={isLoading} variant="grid" />
                                <OptionSelector id="important-area" label={language === 'vi' ? "Khu vực quan trọng" : "Key Area"} options={importantAreaOptions} value={importantArea} onChange={handleImportantAreaChange} disabled={isLoading} variant="select" />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <OptionSelector id="time-selector" label={t('ext.landscape.time')} options={timeOptions} value={time} onChange={handleTimeChange} disabled={isLoading} variant="select" />
                                    <OptionSelector id="weather-selector" label={t('opt.weather')} options={weatherOptions} value={weather} onChange={handleWeatherChange} disabled={isLoading} variant="select" />
                                </div>
                            </div>
                        )}

                        {showInteriorOptions && (
                            <div className="pt-2 space-y-4">
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('ext.floorplan.step3')}</label>
                                <OptionSelector id="int-project-type" label={t('opt.int.project_type')} options={interiorProjectTypeOptions} value={projectType} onChange={handleProjectTypeChange} disabled={isLoading} variant="grid" />
                                <OptionSelector id="int-style" label={t('opt.int.style')} options={interiorStyleOptions} value="" onChange={handleInteriorStyleChange} disabled={isLoading} variant="grid" />
                            </div>
                        )}

                        {renderMode === 'top-down' ? (
                            <div>
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">
                                    {showExteriorOptions || showInteriorOptions ? t('ext.floorplan.step4') : '3. Mô tả chi tiết (Prompt)'}
                                </label>
                                <textarea rows={6} className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-sm" placeholder={t('ext.urban.prompt_ph')} value={prompt} onChange={(e) => onStateChange({ prompt: e.target.value })} />
                                
                                {(planType === 'exterior' || planType === 'interior') && (
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
                                                <span>{t('ext.floorplan.analyzing')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-lg">auto_awesome</span>
                                                <span>{t('ext.floorplan.auto_prompt')}</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('ext.floorplan.step3_perspective')}</label>
                                <textarea rows={6} className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-sm" placeholder={t('ext.urban.prompt_ph')} value={layoutPrompt} onChange={(e) => onStateChange({ layoutPrompt: e.target.value })} />
                                
                                {planType === 'interior' && (
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
                                                <span>{t('ext.floorplan.analyzing')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-lg">auto_awesome</span>
                                                <span>{t('ext.floorplan.auto_prompt')}</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 mt-auto pt-4">
                            <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} disabled={isLoading} />
                            <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} disabled={isLoading} />
                        </div>
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} />

                         <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mt-4 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>{t('common.cost')}: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                            </div>
                            <div className="text-xs">
                                {userCredits < cost ? (
                                    <span className="text-red-500 font-semibold">{t('common.insufficient')}</span>
                                ) : (
                                    <span className="text-green-600 dark:text-green-400">{t('common.available')}: {userCredits}</span>
                                )}
                            </div>
                        </div>
                        <button 
                            onClick={handleGenerate} 
                            disabled={isLoading || !sourceImage}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2 shadow-lg"
                        >
                            {isLoading ? <><Spinner /> {statusMessage || t('common.processing')}</> : t('ext.floorplan.btn_generate')}
                        </button>
                    </div>
                </div>
                {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">{error}</div>}
                {upscaleWarning && <p className="mt-3 text-sm text-yellow-500 text-center font-medium bg-yellow-100 dark:bg-yellow-900/20 p-2 rounded">{upscaleWarning}</p>}
            </div>

            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold">{t('common.result')}</h3>
                    {resultImages.length > 0 && (
                         <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPreviewImage(resultImages[0])}
                                className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-text-primary dark:text-white transition-colors"
                                title="Phóng to"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                </svg>
                            </button>
                            <button 
                                onClick={handleDownload} 
                                disabled={isDownloading}
                                className="flex items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white px-3 py-1.5 rounded-lg font-bold shadow-lg text-sm transition-colors"
                            >
                                {isDownloading ? <Spinner /> : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                )}
                                <span>{t('common.download')}</span>
                            </button>
                        </div>
                    )}
                </div>
                <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden">
                    {isLoading ? (
                        <div className="flex flex-col items-center">
                            <Spinner />
                            <p className="mt-2 text-gray-400">{statusMessage || t('common.processing')}</p>
                        </div>
                    ) : resultImages.length === 1 && sourceImage ? <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[0]} /> : resultImages.length > 1 ? <ResultGrid images={resultImages} toolName="floorplan-render" /> : <p className="text-gray-400">{t('msg.no_result_render')}</p>}
                </div>
            </div>
        </div>
    );
};

export default FloorPlan;
