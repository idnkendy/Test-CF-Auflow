
import React, { useState, useEffect } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { StagingState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import MultiImageUpload from './common/MultiImageUpload';
import ImageComparator from './ImageComparator';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import ImagePreviewModal from './common/ImagePreviewModal';
import ResolutionSelector from './common/ResolutionSelector';
import AspectRatioSelector from './common/AspectRatioSelector';
import SafetyWarningModal from './common/SafetyWarningModal';
import { useLanguage } from '../hooks/useLanguage';

interface StagingProps {
    state: StagingState;
    onStateChange: (newState: Partial<StagingState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

const Staging: React.FC<StagingProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { prompt, sceneImage, objectImages, isLoading, error, resultImages, numberOfImages, resolution, aspectRatio } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [upscaleWarning, setUpscaleWarning] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);

    // Handle Default Prompt Switching
    useEffect(() => {
        const viDefault = 'Đặt các đồ vật này vào không gian một cách hợp lý và tự nhiên.';
        const enDefault = 'Place these objects into the space reasonably and naturally.';
        
        // If current prompt is empty or matches one of the defaults, update it
        if (!prompt || prompt === viDefault || prompt === enDefault) {
             onStateChange({ prompt: language === 'vi' ? viDefault : enDefault });
        }
    }, [language]);

    // Calculate cost based on resolution
    const getCostPerImage = () => {
        switch (resolution) {
            case 'Standard': return 5;
            case '1K': return 10;
            case '2K': return 20;
            case '4K': return 30;
            default: return 5;
        }
    };
    
    const cost = numberOfImages * getCostPerImage();

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
    };

    const handleGenerate = async () => {
        // --- MODAL TRIGGER: Check credits ---
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: jobService.mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") });
             }
             return;
        }

        if (!prompt) {
            onStateChange({ error: 'Vui lòng nhập mô tả yêu cầu.' });
            return;
        }
        if (!sceneImage) {
            onStateChange({ error: 'Vui lòng tải lên ảnh không gian.' });
            return;
        }

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('ext.floorplan.analyzing'));
        setUpscaleWarning(null);

        let logId: string | null = null;
        let jobId: string | null = null;

        // Use Flow for ALL resolutions
        const useFlow = true;

        // Build prompt with aspect ratio instruction
        const ratioInstruction = `The final generated image must strictly have a ${aspectRatio} aspect ratio. Adapt the view to fit this frame naturally.`;
        const fullPrompt = `Virtual Staging Task: ${prompt}. Integrate furniture and decor into the scene realistically. Ensure lighting and shadows match. ${ratioInstruction}`;

        try {
             if (onDeductCredits) {
                logId = await onDeductCredits(cost, `AI Staging (${numberOfImages} ảnh) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.Staging,
                    prompt: prompt,
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            let imageUrls: string[] = [];

            if (useFlow) {
                // --- FLOW LOGIC ---
                // Standard -> GEM_PIX (Flash)
                // 1K / 2K -> GEM_PIX_2 (Pro)
                const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
                
                // Combine Scene + Objects for Flow Input
                const inputImages = [sceneImage, ...objectImages];

                const collectedUrls: string[] = [];
                let completedCount = 0;
                let lastError: any = null;

                const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                    try {
                        setStatusMessage(t('common.processing'));
                        
                        const result = await externalVideoService.generateFlowImage(
                            fullPrompt,
                            inputImages, 
                            aspectRatio, // Pass raw ratio
                            1,
                            modelName,
                            (msg) => setStatusMessage(t('common.processing'))
                        );

                        if (result.imageUrls && result.imageUrls.length > 0) {
                            let finalUrl = result.imageUrls[0];

                            // Upscale Check (2K or 4K)
                            const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                            if (shouldUpscale) {
                                setStatusMessage(resolution === '4K' ? 'Đang xử lý (Upscale 4K)...' : 'Đang xử lý (Upscale 2K)...');
                                try {
                                    const mediaId = result.mediaIds[0];
                                    if (mediaId) {
                                        const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                                        const upscaleResult = await externalVideoService.upscaleFlowImage(mediaId, result.projectId, targetRes, aspectRatio);
                                        if (upscaleResult && upscaleResult.imageUrl) {
                                            finalUrl = upscaleResult.imageUrl;
                                        }
                                    }
                                } catch (upscaleErr: any) {
                                    throw new Error(`Lỗi Upscale: ${upscaleErr.message}`);
                                }
                            }
                            
                            collectedUrls.push(finalUrl);
                            completedCount++;
                            onStateChange({ resultImages: [...collectedUrls] });
                            setStatusMessage(`Hoàn tất ${completedCount}/${numberOfImages}`);
                            
                            historyService.addToHistory({
                                tool: Tool.Staging,
                                prompt: `Flow (${modelName}): ${fullPrompt}`,
                                sourceImageURL: sceneImage?.objectURL,
                                resultImageURL: finalUrl,
                            });
                        }
                    } catch (e: any) {
                        console.error(`Image ${index+1} failed`, e);
                        lastError = e;
                    }
                });

                await Promise.all(promises);
                imageUrls = collectedUrls;
                if (collectedUrls.length === 0) {
                    const errorMsg = lastError ? (lastError.message || lastError.toString()) : "Không thể tạo ảnh nào. Vui lòng thử lại sau.";
                    throw new Error(errorMsg);
                }

            } else {
                // Fallback (Not reached with useFlow=true)
                setStatusMessage(t('common.processing'));
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(
                        fullPrompt, 
                        aspectRatio, 
                        resolution,
                        sceneImage, 
                        jobId || undefined, 
                        objectImages
                    );
                    return images[0];
                });
                imageUrls = await Promise.all(promises);
                
                onStateChange({ resultImages: imageUrls });
                imageUrls.forEach(url => {
                     historyService.addToHistory({
                        tool: Tool.Staging,
                        prompt: fullPrompt,
                        sourceImageURL: sceneImage.objectURL,
                        resultImageURL: url,
                    });
                });
            }

            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);

        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            let displayMsg = t(friendlyKey);
            
            // --- SAFETY MODAL TRIGGER ---
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                displayMsg = t('msg.safety_violation');
            }
            
            onStateChange({ error: displayMsg });

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi Staging (${rawMsg})`, logId);
                if (friendlyKey !== "SAFETY_POLICY_VIOLATION") {
                     onStateChange({ error: displayMsg + t('video.msg.refund') });
                }
            }
            
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    const handleSceneFileSelect = (fileData: FileData | null) => {
        onStateChange({ sceneImage: fileData, resultImages: [] });
    };

    const handleObjectFilesChange = (files: FileData[]) => {
        onStateChange({ objectImages: files });
    };

    const handleDownload = async () => {
        if (resultImages.length === 0) return;
        setIsDownloading(true);
        await externalVideoService.forceDownload(resultImages[0], `staging-${Date.now()}.png`);
        setIsDownloading(false);
    };

    return (
        <div>
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            <h2 className="text-2xl font-bold mb-4">{t('ext.staging.title')}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('ext.staging.step1')}</label>
                        <ImageUpload onFileSelect={handleSceneFileSelect} previewUrl={sceneImage?.objectURL} />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('ext.staging.step2')}</label>
                        <MultiImageUpload onFilesChange={handleObjectFilesChange} maxFiles={5} />
                    </div>

                    <textarea rows={4} className="w-full bg-surface dark:bg-gray-700/50 border rounded-lg p-3 text-sm" placeholder={t('ext.staging.prompt_ph')} value={prompt} onChange={(e) => onStateChange({ prompt: e.target.value })} />
                    
                    <div className="grid grid-cols-2 gap-4">
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} disabled={isLoading} />
                        <AspectRatioSelector value={aspectRatio || '16:9'} onChange={(val) => onStateChange({ aspectRatio: val })} disabled={isLoading} />
                    </div>
                    <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} />
                    
                    <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                            <span className="material-symbols-outlined text-yellow-500 text-sm">monetization_on</span>
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
                    
                    <button onClick={handleGenerate} disabled={isLoading || !sceneImage} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors shadow-lg flex justify-center items-center gap-2">
                        {isLoading ? <><Spinner /> {statusMessage || t('common.processing')}</> : t('ext.staging.btn_generate')}
                    </button>
                    
                    {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-300 rounded-lg text-sm">{error}</div>}
                    {upscaleWarning && <div className="text-xs text-yellow-500 text-center">{upscaleWarning}</div>}
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
                                <p className="mt-2 text-gray-400">{statusMessage}</p>
                            </div>
                        ) : resultImages.length === 1 && sceneImage ? (
                            <ImageComparator originalImage={sceneImage.objectURL} resultImage={resultImages[0]} />
                        ) : resultImages.length > 1 ? (
                            <ResultGrid images={resultImages} toolName="staging" />
                        ) : (
                            <p className="text-gray-400">{t('msg.no_result_render')}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Staging;
