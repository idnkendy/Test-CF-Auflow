
import React, { useState, useEffect } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { ImageEditorState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService'; 
import { supabase } from '../services/supabaseClient'; 
import * as jobService from '../services/jobService';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ResultGrid from './common/ResultGrid';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import MaskingModal from './MaskingModal';
import ImageComparator from './ImageComparator';
import ImagePreviewModal from './common/ImagePreviewModal';
import MultiImageUpload from './common/MultiImageUpload';
import ResolutionSelector from './common/ResolutionSelector';
import AspectRatioSelector from './common/AspectRatioSelector';
import SafetyWarningModal from './common/SafetyWarningModal';
import { useLanguage } from '../hooks/useLanguage';

interface ImageEditorProps {
    state: ImageEditorState;
    onStateChange: (newState: Partial<ImageEditorState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

const createCompositeImage = async (source: FileData, mask: FileData): Promise<FileData> => {
    return new Promise((resolve, reject) => {
        const imgSource = new Image();
        const imgMask = new Image();
        imgSource.crossOrigin = "Anonymous";
        imgMask.crossOrigin = "Anonymous";

        imgSource.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = imgSource.width;
            canvas.height = imgSource.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Canvas context error"));
                return;
            }
            
            ctx.drawImage(imgSource, 0, 0);

            imgMask.onload = () => {
                ctx.drawImage(imgMask, 0, 0, canvas.width, canvas.height);
                
                const dataUrl = canvas.toDataURL('image/png');
                resolve({
                    base64: dataUrl.split(',')[1],
                    mimeType: 'image/png',
                    objectURL: dataUrl
                });
            };
            imgMask.onerror = (e) => reject(new Error("Failed to load mask image"));
            imgMask.src = mask.objectURL;
        };
        imgSource.onerror = (e) => reject(new Error("Failed to load source image"));
        imgSource.src = source.objectURL;
    });
};

const getClosestAspectRatio = (width: number, height: number): AspectRatio => {
    const ratio = width / height;
    const ratios: { [key in AspectRatio]: number } = {
        "1:1": 1,
        "9:16": 9/16,
        "16:9": 16/9,
        "4:3": 4/3,
        "3:4": 3/4
    };
    
    let closest: AspectRatio = '1:1';
    let minDiff = Infinity;

    (Object.keys(ratios) as AspectRatio[]).forEach((r) => {
        const diff = Math.abs(ratio - ratios[r]);
        if (diff < minDiff) {
            minDiff = diff;
            closest = r;
        }
    });
    return closest;
};

const ImageEditor: React.FC<ImageEditorProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { prompt, sourceImage, maskImage, referenceImages, isLoading, error, resultImages, numberOfImages, resolution, aspectRatio } = state;
    
    const [isMaskingModalOpen, setIsMaskingModalOpen] = useState<boolean>(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [upscaleWarning, setUpscaleWarning] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    
    // Handle Default Prompt Switching
    useEffect(() => {
        const viDefault = 'Thêm một ban công sắt nghệ thuật vào cửa sổ tầng hai.';
        const enDefault = 'Add an artistic iron balcony to the second-floor window.';
        
        // If current prompt is empty or matches one of the defaults, update it to current language
        if (!prompt || prompt === viDefault || prompt === enDefault) {
             onStateChange({ prompt: language === 'vi' ? viDefault : enDefault });
        }
    }, [language]);

    const handleFileSelect = (fileData: FileData | null) => {
        if (fileData?.objectURL) {
            const img = new Image();
            img.onload = () => {
                const detected = getClosestAspectRatio(img.width, img.height);
                onStateChange({
                    sourceImage: fileData,
                    resultImages: [],
                    maskImage: null,
                    aspectRatio: detected
                });
            };
            img.src = fileData.objectURL;
        } else {
            onStateChange({
                sourceImage: fileData,
                resultImages: [],
                maskImage: null,
            });
        }
    };

    const handleReferenceFilesChange = (files: FileData[]) => {
        onStateChange({ referenceImages: files });
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

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: `${t('common.insufficient')}. Cần ${cost} credits.` });
             }
             return;
        }

        if (!prompt) {
            onStateChange({ error: 'Vui lòng nhập mô tả yêu cầu chỉnh sửa.' });
            return;
        }
        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên một ảnh để chỉnh sửa.' });
            return;
        }

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));
        setUpscaleWarning(null);

        let logId: string | null = null;
        let jobId: string | null = null;

        const effectiveAspectRatio = aspectRatio || '1:1';

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Chỉnh sửa ảnh (${numberOfImages} ảnh) - ${resolution}`);
            }
            
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.ImageEditing,
                    prompt: prompt,
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            
            // ERROR TRACKING VARIABLE
            let lastError: any = null;

            const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                try {
                    let flowPrompt = `Edit this image. ${prompt}. Keep the main composition but apply the changes described. Ensure aspect ratio is ${effectiveAspectRatio}.`;
                    let inputImages: FileData[] = [sourceImage];
                    
                    if (maskImage) {
                         try {
                             const compositeImage = await createCompositeImage(sourceImage, maskImage);
                             flowPrompt = `I have provided two images. 
                             1. The first image is the original. 
                             2. The second image shows the original with a RED MASK overlay indicating the area to edit.
                             
                             TASK: Edit the area covered by the RED MASK in the original image based on this instruction: "${prompt}".
                             Ensure the edit blends seamlessly with the surrounding environment, matching lighting, shadows, and perspective.`;
                             inputImages = [sourceImage, compositeImage];
                         } catch (e) {
                             console.error("Composite creation failed, falling back to source + mask", e);
                             flowPrompt = `Edit the first image based on the second mask image (white area is the edit zone). Instruction: ${prompt}. Seamlessly blended with the environment, matching perspective and lighting.`;
                             inputImages.push(maskImage);
                         }
                    }
                    
                    if (referenceImages.length > 0) {
                        inputImages.push(...referenceImages);
                    }

                    const result = await externalVideoService.generateFlowImage(
                        flowPrompt,
                        inputImages, 
                        effectiveAspectRatio, // Pass raw ratio
                        1,
                        modelName,
                        (msg) => setStatusMessage(t('common.processing'))
                    );

                    if (result.imageUrls && result.imageUrls.length > 0) {
                        let finalUrl = result.imageUrls[0];
                        const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                        
                        if (shouldUpscale) {
                            const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                            const upscaleResult = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, effectiveAspectRatio);
                            if (upscaleResult && upscaleResult.imageUrl) {
                                finalUrl = upscaleResult.imageUrl;
                            }
                        }
                        return finalUrl;
                    }
                    return null;
                } catch (e) {
                    console.error(`Image ${index+1} failed`, e);
                    lastError = e; // Capture specifically
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
                        tool: Tool.ImageEditing,
                        prompt: `Flow ${modelName}: ${prompt}`,
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
                // If no images generated, throw the specific last error if available
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
                onStateChange({ error: t(friendlyMsg) });
            }
            
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi chỉnh sửa ảnh (${rawMsg})`, logId);
            }
            
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    const handleApplyMask = (mask: FileData) => {
        onStateChange({ maskImage: mask });
        setIsMaskingModalOpen(false);
    };

    const handleRemoveMask = (e?: React.MouseEvent) => {
        if(e) e.preventDefault();
        onStateChange({ maskImage: null });
    };

    const handleDownload = async () => {
        if (resultImages.length !== 1) return;
        setIsDownloading(true);
        await externalVideoService.forceDownload(resultImages[0], "edited-image.png");
        setIsDownloading(false);
    };

    const scrollToTop = () => {
        const mainContainer = document.querySelector('main');
        if (mainContainer) {
            mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    return (
        <div>
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            {isMaskingModalOpen && sourceImage && (
                <MaskingModal
                    image={sourceImage}
                    onClose={() => setIsMaskingModalOpen(false)}
                    onApply={handleApplyMask}
                    maskColor="rgba(239, 68, 68, 0.5)"
                />
            )}
            <h2 className="text-2xl font-bold text-text-primary dark:text-white mb-4">{t('editor.title')}</h2>
            <p className="text-text-secondary dark:text-gray-300 mb-6">{t('editor.subtitle')}</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 flex flex-col">
                    <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('editor.step1')}</label>
                        <ImageUpload 
                            onFileSelect={handleFileSelect} 
                            previewUrl={sourceImage?.objectURL}
                            maskPreviewUrl={maskImage?.objectURL}
                        />
                         {sourceImage && (
                            <div className="mt-4">
                                <p className="text-sm text-text-secondary dark:text-gray-400 mb-2">{t('reno.mask_option')}</p>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={(e) => { 
                                            e.preventDefault(); 
                                            setIsMaskingModalOpen(true); 
                                            scrollToTop(); 
                                        }}
                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                                        title={t('reno.draw_mask')}
                                    >
                                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                                        {maskImage ? t('reno.edit_mask') : t('reno.draw_mask')}
                                    </button>
                                    {maskImage && (
                                        <button
                                            type="button"
                                            onClick={handleRemoveMask}
                                            className="bg-red-600 hover:bg-red-700 text-white font-semibold p-2 rounded-lg transition-colors"
                                            title="Xóa vùng chọn"
                                        >
                                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                        </button>
                                    )}
                                </div>
                                {maskImage && <p className="text-xs text-green-500 dark:text-green-400 mt-2">{t('reno.mask_applied')}</p>}
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('editor.step2')}</label>
                        {resolution === 'Standard' && !maskImage ? (
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
                            <>
                                <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                                <p className="text-xs text-text-secondary dark:text-gray-500 mt-2">{t('editor.ref_hint')}</p>
                            </>
                        )}
                    </div>
                </div>

                 <div className="space-y-6 flex flex-col h-full">
                     <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700 flex-grow flex flex-col">
                         <label htmlFor="prompt-editor" className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('editor.step3')}</label>
                         <textarea
                            id="prompt-editor"
                            rows={6}
                            className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-text-primary dark:text-gray-200 focus:ring-2 focus:ring-accent focus:outline-none transition-all flex-grow"
                            placeholder={t('editor.prompt_placeholder')}
                            value={prompt}
                            onChange={(e) => onStateChange({ prompt: e.target.value })}
                        />
                     </div>
                     
                     <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                         <div className="grid grid-cols-2 gap-4">
                            <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} disabled={isLoading} />
                            <AspectRatioSelector value={aspectRatio || '1:1'} onChange={(val) => onStateChange({ aspectRatio: val })} disabled={isLoading} />
                         </div>
                     </div>

                     <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                         <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} />
                     </div>
                    
                    <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mb-1 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
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
                        disabled={isLoading || !sourceImage || !prompt}
                        className="w-full flex justify-center items-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                        {isLoading ? <><Spinner /> {statusMessage || t('common.processing')}</> : t('editor.btn_generate')}
                    </button>
                    {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-300 rounded-lg text-sm">{error}</div>}
                    {upscaleWarning && <p className="mt-3 text-sm text-yellow-500 text-center font-medium bg-yellow-100 dark:bg-yellow-900/20 p-2 rounded">{upscaleWarning}</p>}
                 </div>
            </div>

            {/* Result Section */}
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-text-primary dark:text-white">{t('common.result')}</h3>
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
                <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-border-color dark:border-gray-700 flex items-center justify-center overflow-hidden">
                    {isLoading ? (
                        <div className="flex flex-col items-center">
                            <Spinner />
                            <p className="mt-2 text-text-secondary dark:text-gray-400">{statusMessage || t('common.processing')}</p>
                        </div>
                    ) : resultImages.length === 1 && sourceImage ? (
                        <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[0]} />
                    ) : resultImages.length > 1 ? (
                        <ResultGrid images={resultImages} toolName="image-editor" />
                    ) : (
                        <p className="text-text-secondary dark:text-gray-400 p-4 text-center">{t('msg.no_result_render')}</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImageEditor;
