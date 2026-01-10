
import React, { useState } from 'react';
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { RenovationState } from '../state/toolState';
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
import AspectRatioSelector from './common/AspectRatioSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import MaskingModal from './MaskingModal';
import ResolutionSelector from './common/ResolutionSelector';
import MultiImageUpload from './common/MultiImageUpload';
import OptionSelector from './common/OptionSelector';

const renovationSuggestions = [
    { label: 'Nâng tầng', prompt: 'Nâng thêm 1 tầng cho công trình, giữ phong cách kiến trúc hiện có.' },
    { label: 'Đổi màu sơn', prompt: 'Thay đổi màu sơn ngoại thất của công trình thành màu trắng kem, các chi tiết cửa sổ màu đen.' },
    { label: 'Giữ lại khối', prompt: 'Cải tạo lại mặt tiền nhưng giữ nguyên hình khối và cấu trúc chính.' },
    { label: 'Thay đổi khối', prompt: 'Cải tạo toàn bộ, thay đổi hình khối của công trình để trở nên ấn tượng và hiện đại hơn.' },
    { label: 'Đưa ảnh vẽ tay vào không gian', prompt: 'Thiết kế hoàn thiện công trình ở ảnh tham chiếu và đưa vào vùng tô đỏ của ảnh thực tế.' },
    { label: 'Đưa mẫu công trình vào không gian', prompt: 'Đưa mẫu công trình ở ảnh tham chiếu và đưa vào vùng tô đỏ của ảnh thực tế.' },
];

// Helper to merge source and mask into a single composite image
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
            
            // Draw Source
            ctx.drawImage(imgSource, 0, 0);

            imgMask.onload = () => {
                // Draw Mask Overlay
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

interface RenovationProps {
    state: RenovationState;
    onStateChange: (newState: Partial<RenovationState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

const Renovation: React.FC<RenovationProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const { prompt, sourceImage, referenceImages, maskImage, isLoading, error, renovatedImages, numberOfImages, aspectRatio, resolution } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isMaskingModalOpen, setIsMaskingModalOpen] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [upscaleWarning, setUpscaleWarning] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

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
        if (val === 'Standard') {
            onStateChange({ referenceImages: [] });
        }
    };

    const constructRenovationPrompt = () => {
        let finalPrompt = `Generate an image with a strict aspect ratio of ${aspectRatio}. Adapt the composition from the source image to fit this new frame while performing the renovation. Do not add black bars or letterbox. The renovation instruction is: ${prompt}`;
        if (referenceImages && referenceImages.length > 0) {
            finalPrompt += " Also, take aesthetic inspiration (colors, materials, atmosphere) from the provided reference image(s).";
        }
        finalPrompt = `You are a professional architectural renovator. ${finalPrompt}`;
        return finalPrompt;
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             onStateChange({ error: jobService.mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") });
             return;
        }

        if (!prompt) {
            onStateChange({ error: 'Vui lòng nhập mô tả phương án cải tạo.' });
            return;
        }
        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên một hình ảnh thực tế để bắt đầu.' });
            return;
        }

        onStateChange({ isLoading: true, error: null, renovatedImages: [] });
        setStatusMessage('Đang xử lý. Vui lòng đợi...');
        setUpscaleWarning(null);

        let logId: string | null = null;
        let jobId: string | null = null;

        // Use Flow for ALL cases (Standard, 1K, 2K, 4K) even with Mask
        const useFlow = true; 
        let promptForService = constructRenovationPrompt();

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Cải tạo thiết kế (${numberOfImages} ảnh) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                 jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.Renovation,
                    prompt: prompt,
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            let imageUrls: string[] = [];

            if (useFlow) {
                // --- FLOW LOGIC ---
                let aspectEnum = 'IMAGE_ASPECT_RATIO_SQUARE';
                if (aspectRatio === '16:9') {
                    aspectEnum = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
                } else if (aspectRatio === '9:16') {
                    aspectEnum = 'IMAGE_ASPECT_RATIO_PORTRAIT';
                }

                const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
                const collectedUrls: string[] = [];
                let completedCount = 0;
                let lastError: any = null;

                // PREPARE INPUT IMAGES
                let inputImages: FileData[] = [sourceImage];
                
                // MASK HANDLING
                if (maskImage) {
                     try {
                        const composite = await createCompositeImage(sourceImage, maskImage);
                        // If mask exists, send Original + Composite (Red Mask)
                        inputImages = [sourceImage, composite];
                        promptForService += " I have provided two images. The second image contains a RED MASK overlay indicating the specific area to renovate. Apply the renovation design ONLY to the masked area, blending it seamlessly with the rest of the original image.";
                     } catch(e) {
                        console.error("Composite creation failed", e);
                        inputImages.push(maskImage);
                        promptForService += " Use the second image as a mask for renovation.";
                     }
                }

                if (referenceImages && referenceImages.length > 0) {
                    inputImages.push(...referenceImages);
                }

                const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                    try {
                        setStatusMessage('Đang xử lý. Vui lòng đợi...');
                        
                        const result = await externalVideoService.generateFlowImage(
                            promptForService,
                            inputImages,
                            aspectEnum,
                            1,
                            modelName,
                            (msg) => setStatusMessage('Đang xử lý. Vui lòng đợi...')
                        );

                        if (result.imageUrls && result.imageUrls.length > 0) {
                            let finalUrl = result.imageUrls[0];

                            // Upscale Check
                            const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                            if (shouldUpscale) {
                                setStatusMessage(resolution === '4K' ? 'Đang xử lý (Upscale 4K)...' : 'Đang xử lý (Upscale 2K)...');
                                try {
                                    const mediaId = result.mediaIds[0];
                                    if (mediaId) {
                                        const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                                        const upscaleResult = await externalVideoService.upscaleFlowImage(mediaId, result.projectId, targetRes);
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
                            onStateChange({ renovatedImages: [...collectedUrls] });
                            
                            historyService.addToHistory({
                                tool: Tool.Renovation,
                                prompt: `Flow (${modelName}): ${promptForService}`,
                                sourceImageURL: sourceImage?.objectURL,
                                resultImageURL: finalUrl,
                            });
                        }
                    } catch (e: any) {
                        console.error(`Image ${index+1} failed`, e);
                        lastError = e;
                    }
                });

                await Promise.all(promises);
                if (collectedUrls.length === 0) {
                    const errorMsg = lastError ? (lastError.message || lastError.toString()) : "Không thể tạo ảnh nào. Vui lòng thử lại sau.";
                    throw new Error(errorMsg);
                }
                if (jobId && collectedUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', collectedUrls[0]);

            } else {
                // --- GOOGLE API LOGIC (Fallback - Unreachable if useFlow=true) ---
                setStatusMessage('Đang xử lý. Vui lòng đợi...');
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(
                        promptForService, 
                        aspectRatio, 
                        resolution === 'Standard' ? '1K' : resolution, 
                        sourceImage, 
                        jobId || undefined, 
                        referenceImages,
                        maskImage || undefined
                    );
                    return images[0];
                });
                
                const imageUrls = await Promise.all(promises);
                onStateChange({ renovatedImages: imageUrls });
                if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);
                
                imageUrls.forEach(url => historyService.addToHistory({
                    tool: Tool.Renovation,
                    prompt: `Gemini API: ${promptForService}`,
                    sourceImageURL: sourceImage?.objectURL,
                    resultImageURL: url,
                }));
            }

        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi hệ thống (${rawMsg})`, logId);
                friendlyMsg += " (Credits đã được hoàn trả)";
            }
            
            onStateChange({ error: friendlyMsg });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    const handleSuggestionChange = (val: string) => {
        // Logic: Append new text, ignoring previous selection state.
        // We do not replace old text, we just append to build a complex prompt.
        let newPrompt = prompt.trim();
        if (newPrompt && !newPrompt.includes(val)) {
            newPrompt = `${newPrompt}, ${val}`;
        } else if (!newPrompt) {
            newPrompt = val;
        }
        onStateChange({ prompt: newPrompt });
    };

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, renovatedImages: [], maskImage: null });
    };

    const handleReferenceFilesChange = (files: FileData[]) => {
        onStateChange({ referenceImages: files });
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
        if (renovatedImages.length !== 1) return;
        setIsDownloading(true);
        await externalVideoService.forceDownload(renovatedImages[0], "renovated-image.png");
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
        <div className="flex flex-col gap-8">
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            {isMaskingModalOpen && sourceImage && (
                <MaskingModal 
                    image={sourceImage} 
                    onClose={() => setIsMaskingModalOpen(false)} 
                    onApply={handleApplyMask} 
                    maskColor="rgba(239, 68, 68, 0.5)"
                />
            )}
            <div>
                <h2 className="text-2xl font-bold text-text-primary dark:text-white mb-4">AI Cải Tạo Kiến Trúc</h2>
                <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">1. Tải Lên Ảnh Hiện Trạng</label>
                                <ImageUpload 
                                    onFileSelect={handleFileSelect} 
                                    previewUrl={sourceImage?.objectURL} 
                                    maskPreviewUrl={maskImage?.objectURL} 
                                />
                                
                                {sourceImage && (
                                    <div className="mt-4">
                                        <p className="text-sm text-text-secondary dark:text-gray-400 mb-2">Tùy chọn vùng chọn:</p>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={(e) => { 
                                                    e.preventDefault(); 
                                                    setIsMaskingModalOpen(true); 
                                                    scrollToTop(); 
                                                }}
                                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                                                title="Vẽ vùng chọn"
                                            >
                                               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                                                {maskImage ? 'Sửa vùng chọn' : 'Vẽ vùng chọn (Mask)'}
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
                                        {maskImage && <p className="text-xs text-green-500 dark:text-green-400 mt-2">Đã áp dụng vùng chọn. AI sẽ chỉ cải tạo trong vùng này.</p>}
                                    </div>
                                )}
                            </div>

                            {/* 2. Reference Images */}
                            <div className="bg-main-bg dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">2. Ảnh Tham Chiếu (Tùy chọn)</label>
                                {resolution === 'Standard' && !maskImage ? (
                                    <div className="p-4 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 min-h-[120px]">
                                        <span className="material-symbols-outlined text-yellow-500 text-3xl">lock</span>
                                        <p className="text-sm text-text-secondary dark:text-gray-400">
                                            Ảnh tham chiếu chỉ hoạt động ở các bản <span className="font-bold text-text-primary dark:text-white">Nano Pro</span> (1K trở lên) hoặc khi dùng Mask.
                                        </p>
                                        <button 
                                            onClick={() => handleResolutionChange('1K')}
                                            className="text-xs text-[#7f13ec] hover:underline font-semibold"
                                        >
                                            Nâng cao chất lượng ảnh ngay
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                                        <p className="text-xs text-text-secondary dark:text-gray-500 mt-2">Tải lên tối đa 5 ảnh để AI tham khảo phong cách.</p>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* --- RIGHT COLUMN: CONTROLS --- */}
                        <div className="space-y-6 flex flex-col h-full">
                            <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700 flex-grow flex flex-col">
                                
                                <div className="mb-4">
                                    <OptionSelector 
                                        id="renovation-suggestions"
                                        label="3. Thêm gợi ý (nhấn để thêm)"
                                        options={renovationSuggestions.map(s => ({ value: s.prompt, label: s.label }))}
                                        value={""} 
                                        onChange={handleSuggestionChange}
                                        disabled={isLoading}
                                        variant="grid"
                                    />
                                </div>

                                <label htmlFor="prompt-renovation" className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">4. Chi tiết yêu cầu</label>
                                <textarea
                                    id="prompt-renovation"
                                    rows={6}
                                    className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-text-primary dark:text-gray-200 focus:ring-2 focus:ring-accent outline-none flex-grow resize-none"
                                    placeholder="Mô tả chi tiết những thay đổi bạn muốn..."
                                    value={prompt}
                                    onChange={(e) => onStateChange({ prompt: e.target.value })}
                                    disabled={isLoading}
                                />
                            </div>
                            
                            <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                                <div className="grid grid-cols-2 gap-4">
                                    <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} disabled={isLoading} />
                                    <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} disabled={isLoading} />
                                </div>
                            </div>

                            <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                                <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} />
                            </div>

                            <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mb-1 border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span>Chi phí: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                                </div>
                                <div className="text-xs">
                                    {userCredits < cost ? <span className="text-red-500 font-semibold">Không đủ (Có: {userCredits})</span> : <span className="text-green-600">Khả dụng: {userCredits}</span>}
                                </div>
                            </div>

                            <button 
                                onClick={handleGenerate}
                                disabled={isLoading || !prompt || !sourceImage || userCredits < cost}
                                className="w-full flex justify-center items-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg"
                            >
                                {isLoading ? <><Spinner /> {statusMessage || 'Đang xử lý...'}</> : 'Tạo Phương Án Cải Tạo'}
                            </button>
                            {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-300 rounded-lg text-sm">{error}</div>}
                            {upscaleWarning && <div className="text-xs text-yellow-500 text-center">{upscaleWarning}</div>}
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-text-primary dark:text-white">Kết quả Cải tạo</h3>
                    {renovatedImages.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPreviewImage(renovatedImages[0])}
                                className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-text-primary dark:text-white transition-colors"
                                title="Phóng to"
                            >
                                <span className="material-symbols-outlined text-lg">zoom_in</span>
                            </button>
                            <button 
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="flex items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white px-3 py-1.5 rounded-lg font-bold shadow-lg text-sm transition-colors"
                            >
                                {isDownloading ? <Spinner /> : <span className="material-symbols-outlined text-lg">download</span>}
                                <span>{isDownloading ? 'Đang tải...' : 'Tải xuống'}</span>
                            </button>
                        </div>
                    )}
                </div>
                <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-border-color dark:border-gray-700 flex items-center justify-center overflow-hidden">
                    {isLoading && (
                        <div className="flex flex-col items-center">
                            <Spinner />
                            <p className="mt-2 text-gray-400">{statusMessage || 'Đang xử lý. Vui lòng đợi...'}</p>
                        </div>
                    )}
                    {!isLoading && renovatedImages.length === 1 && sourceImage && (
                        <ImageComparator originalImage={sourceImage.objectURL} resultImage={renovatedImages[0]} />
                    )}
                    {!isLoading && renovatedImages.length > 1 && (
                        <ResultGrid images={renovatedImages} toolName="renovation" />
                    )}
                    {!isLoading && renovatedImages.length === 0 && (
                         <p className="text-text-secondary dark:text-gray-400 text-center p-4">Kết quả sẽ hiển thị ở đây.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Renovation;
