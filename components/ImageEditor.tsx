import React, { useState, useEffect } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { ImageEditorState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService'; 
import { supabase } from '../services/supabaseClient'; 
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
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
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

    useEffect(() => {
        const viDefault = 'Thêm một ban công sắt nghệ thuật vào cửa sổ tầng hai.';
        const enDefault = 'Add an artistic iron balcony to the second-floor window.';
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

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             return;
        }
        if (!prompt || !sourceImage) return;

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));

        let logId: string | null = null;
        let jobId: string | null = null;
        const effectiveAspectRatio = aspectRatio || '1:1';

        try {
            if (onDeductCredits) logId = await onDeductCredits(cost, `Chỉnh sửa ảnh (${numberOfImages} ảnh) - ${resolution}`);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id, tool_id: Tool.ImageEditing, prompt: prompt, cost: cost, usage_log_id: logId
                });
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            let lastError: any = null;

            // Parallel Generation Loop
            const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                try {
                    let flowPrompt = `Edit this image. ${prompt}. Keep the main composition but apply the changes described. Ensure aspect ratio is ${effectiveAspectRatio}.`;
                    let inputImages: FileData[] = [sourceImage];
                    
                    if (maskImage) {
                         const compositeImage = await createCompositeImage(sourceImage, maskImage);
                         flowPrompt = `I have provided two images. 1. Original. 2. Original with RED MASK overlay. TASK: Edit the RED MASK area based on: "${prompt}". Blend naturally.`;
                         inputImages = [sourceImage, compositeImage];
                    }
                    if (referenceImages.length > 0) inputImages.push(...referenceImages);

                    const result = await externalVideoService.generateFlowImage(
                        flowPrompt, 
                        inputImages, 
                        effectiveAspectRatio, 
                        1, // Force 1 per request
                        modelName,
                        (msg) => setStatusMessage(`${t('common.processing')} (${index + 1}/${numberOfImages})`)
                    );

                    if (result.imageUrls && result.imageUrls.length > 0) {
                        let finalUrl = result.imageUrls[0];
                        if ((resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0) {
                            const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                            const upscaleResult = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, effectiveAspectRatio);
                            if (upscaleResult && upscaleResult.imageUrl) finalUrl = upscaleResult.imageUrl;
                        }
                        return finalUrl;
                    }
                    return null;
                } catch (e) { lastError = e; return null; }
            });

            const results = await Promise.all(promises);
            const successfulUrls = results.filter((url): url is string => url !== null);
            
            if (successfulUrls.length > 0) {
                onStateChange({ resultImages: successfulUrls });
                successfulUrls.forEach(url => historyService.addToHistory({ tool: Tool.ImageEditing, prompt: prompt, sourceImageURL: sourceImage?.objectURL, resultImageURL: url }));
                if (jobId) await jobService.updateJobStatus(jobId, 'completed', successfulUrls[0]);
            } else { 
                if (lastError) throw lastError; 
                throw new Error("Lỗi tạo ảnh."); 
            }
        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
            } else {
                onStateChange({ error: t(friendlyMsg) });
            }

            // Refund logic
            if (logId && onDeductCredits) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    try {
                        await refundCredits(user.id, cost, `Hoàn tiền: Lỗi chỉnh sửa (${rawMsg})`, logId);
                    } catch (refundErr) {
                        console.error("Refund failed:", refundErr);
                    }
                }
            }
        } finally { onStateChange({ isLoading: false }); setStatusMessage(null); }
    };

    const handleDownload = async () => {
        if (resultImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImages[selectedIndex], "edited.png");
            setIsDownloading(false);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 md:gap-8 max-w-[1920px] mx-auto items-stretch px-2 sm:px-4">
            <style>{`
                .custom-sidebar-scroll::-webkit-scrollbar { width: 5px; }
                .custom-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #334155; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
            `}</style>

            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            {isMaskingModalOpen && sourceImage && (
                <MaskingModal 
                    image={sourceImage} 
                    initialMask={maskImage}
                    onClose={() => setIsMaskingModalOpen(false)} 
                    onApply={(m) => {
                        onStateChange({ maskImage: m });
                        setIsMaskingModalOpen(false);
                    }} 
                    maskColor="rgba(239, 68, 68, 0.5)" 
                />
            )}
            
            {/* SIDEBAR */}
            <aside className="w-full lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden lg:h-[calc(100vh-130px)] lg:sticky lg:top-[120px]">
                <div className="p-3 space-y-4 flex-1 lg:overflow-y-auto custom-sidebar-scroll">
                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('editor.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} maskPreviewUrl={maskImage?.objectURL} />
                        </div>
                        {sourceImage && (
                            <div className="flex gap-2">
                                <button onClick={() => setIsMaskingModalOpen(true)} className="flex-1 py-2 px-3 bg-gray-800 dark:bg-gray-700 hover:bg-black text-white rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-sm">draw</span> {maskImage ? t('reno.edit_mask') : t('reno.draw_mask')}
                                </button>
                                {maskImage && (
                                    <button onClick={() => onStateChange({ maskImage: null })} className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors">
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('editor.step3')}</label>
                            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                                <textarea rows={window.innerWidth < 768 ? 4 : 6} className="w-full bg-transparent outline-none text-xs sm:text-sm resize-none font-medium text-text-primary dark:text-white" placeholder={t('editor.prompt_placeholder')} value={prompt} onChange={(e) => onStateChange({ prompt: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('editor.step2')}</label>
                            {resolution === 'Standard' ? (
                                <div className="p-4 bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 h-28 shadow-inner">
                                    <span className="material-symbols-outlined text-yellow-500 text-xl">lock</span>
                                    <p className="text-[10px] text-text-secondary dark:text-gray-400 px-2 leading-tight">
                                        {t('img_gen.ref_lock')}
                                    </p>
                                    <button onClick={() => onStateChange({ resolution: '1K' })} className="text-[10px] text-[#7f13ec] hover:underline font-bold uppercase">{t('img_gen.upgrade')}</button>
                                </div>
                            ) : (
                                <MultiImageUpload onFilesChange={(fs) => onStateChange({ referenceImages: fs })} maxFiles={5} />
                            )}
                        </div>
                        <AspectRatioSelector value={aspectRatio || '1:1'} onChange={(v) => onStateChange({ aspectRatio: v })} />
                        <ResolutionSelector value={resolution} onChange={(v) => onStateChange({ resolution: v })} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(v) => onStateChange({ numberOfImages: v })} />
                    </div>
                </div>

                <div className="p-4 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] lg:sticky lg:bottom-0 z-10 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-3 sm:py-4 rounded-xl transition-all shadow-lg active:scale-95 text-sm sm:text-base">
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('editor.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-base sm:text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden min-h-[400px] sm:min-h-[500px] lg:h-[calc(100vh-130px)] lg:sticky lg:top-[120px]">
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-[300px]">
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
                                    <button onClick={handleDownload} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.download')}</span>
                                        <span className="material-symbols-outlined text-base sm:text-lg">download</span>
                                    </button>
                                    <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.zoom')}</span>
                                        <span className="material-symbols-outlined text-base sm:text-lg">zoom_in</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-20 select-none bg-main-bg dark:bg-[#121212] p-8 text-center">
                                <span className="material-symbols-outlined text-4xl sm:text-6xl mb-4">edit</span>
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
                                    <button key={url} onClick={() => setSelectedIndex(idx)} className={`flex-shrink-0 w-12 sm:w-16 md:w-20 aspect-square rounded-lg border-2 transition-all overflow-hidden ${selectedIndex === idx ? 'border-[#7f13ec] ring-2 ring-purple-500/20 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}>
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

export default ImageEditor;