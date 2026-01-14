
import React, { useState } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { SketchConverterState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService'; 
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import OptionSelector from './common/OptionSelector';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import AspectRatioSelector from './common/AspectRatioSelector';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import SafetyWarningModal from './common/SafetyWarningModal';

interface SketchConverterProps {
    state: SketchConverterState;
    onStateChange: (newState: Partial<SketchConverterState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

const sketchStyleOptions = [
    { value: 'pencil', label: 'Chì (Pencil)' },
    { value: 'charcoal', label: 'Than (Charcoal)' },
    { value: 'watercolor', label: 'Màu nước (Watercolor)' },
];

const detailLevelOptions = [
    { value: 'medium', label: 'Trung bình' },
    { value: 'high', label: 'Chi tiết cao' },
];

const SketchConverter: React.FC<SketchConverterProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { sourceImage, isLoading, error, resultImage, sketchStyle, detailLevel, resolution, aspectRatio } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false); // NEW

    // Cost logic
    const getCostPerImage = () => {
        switch (resolution) {
            case 'Standard': return 5;
            case '1K': return 10;
            case '2K': return 20;
            case '4K': return 30;
            default: return 5;
        }
    };
    const cost = getCostPerImage(); 

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, resultImage: null });
    };

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: jobService.mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") });
             }
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên ảnh để chuyển đổi.' });
            return;
        }

        onStateChange({ isLoading: true, error: null, resultImage: null });
        setStatusMessage('Đang phác thảo...');

        // Prompt construction
        const styleText = sketchStyle === 'pencil' ? 'pencil sketch' : sketchStyle === 'charcoal' ? 'charcoal drawing' : 'watercolor painting';
        const detailText = detailLevel === 'high' ? 'highly detailed, intricate' : 'loose, artistic';
        const fullPrompt = `Convert this image into a ${styleText}. Style: ${detailText}. Professional architectural rendering style. Keep main lines and perspective. White background if pencil/charcoal.`;

        // Use Flow for ALL resolutions
        const useFlow = true;
        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Sketch Converter (${sketchStyle}) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.SketchConverter,
                    prompt: fullPrompt,
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');
            
            let resultUrl = '';

            if (useFlow) {
                // --- FLOW LOGIC ---
                const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
                
                setStatusMessage('Đang xử lý. Vui lòng đợi...');
                const result = await externalVideoService.generateFlowImage(
                    fullPrompt,
                    [sourceImage],
                    aspectRatio, // Pass raw ratio directly
                    1,
                    modelName,
                    (msg) => setStatusMessage('Đang xử lý. Vui lòng đợi...')
                );

                if (result.imageUrls && result.imageUrls.length > 0) {
                    resultUrl = result.imageUrls[0];
                    
                    // Upscale Check
                    const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                    
                    if (shouldUpscale) {
                        setStatusMessage(resolution === '4K' ? 'Đang xử lý (Upscale 4K)...' : 'Đang xử lý (Upscale 2K)...');
                        try {
                            const mediaId = result.mediaIds[0];
                            if (mediaId) {
                                const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                                // Pass aspectRatio to upscale function for final crop if needed
                                const upscaleRes = await externalVideoService.upscaleFlowImage(mediaId, result.projectId, targetRes, aspectRatio);
                                if (upscaleRes?.imageUrl) resultUrl = upscaleRes.imageUrl;
                            }
                        } catch (e: any) {
                            throw new Error(`Lỗi Upscale: ${e.message}`);
                        }
                    }
                    historyService.addToHistory({ tool: Tool.SketchConverter, prompt: `Flow: ${fullPrompt}`, sourceImageURL: sourceImage.objectURL, resultImageURL: resultUrl });
                } else throw new Error("Lỗi không có ảnh.");

            } else {
                // Fallback
                setStatusMessage('Đang xử lý. Vui lòng đợi...');
                const images = await geminiService.generateHighQualityImage(fullPrompt, aspectRatio, resolution, sourceImage, jobId || undefined);
                resultUrl = images[0];
                historyService.addToHistory({ tool: Tool.SketchConverter, prompt: fullPrompt, sourceImageURL: sourceImage.objectURL, resultImageURL: resultUrl });
            }

            onStateChange({ resultImage: resultUrl });
            if (jobId && resultUrl) await jobService.updateJobStatus(jobId, 'completed', resultUrl);

        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            // --- SAFETY MODAL TRIGGER ---
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                onStateChange({ error: "Ảnh bị từ chối do vi phạm chính sách an toàn." });
            } else {
                onStateChange({ error: friendlyMsg });
            }
            
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi sketch (${rawMsg})`, logId);
                friendlyMsg += " (Credits đã được hoàn trả)";
            }
            
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    const handleDownload = async () => {
        if (!resultImage) return;
        setIsDownloading(true);
        await externalVideoService.forceDownload(resultImage, `sketch-${Date.now()}.png`);
        setIsDownloading(false);
    };

    return (
        <div className="flex flex-col gap-8">
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <h2 className="text-2xl font-bold text-text-primary dark:text-white mb-4">AI Biến Ảnh Thành Sketch</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">1. Tải Lên Ảnh Gốc</label>
                        <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <OptionSelector 
                            id="sketch-style" 
                            label="Phong cách" 
                            options={sketchStyleOptions} 
                            value={sketchStyle} 
                            onChange={(v) => onStateChange({ sketchStyle: v as any })} 
                            variant="select" 
                        />
                        <OptionSelector 
                            id="detail-level" 
                            label="Độ chi tiết" 
                            options={detailLevelOptions} 
                            value={detailLevel} 
                            onChange={(v) => onStateChange({ detailLevel: v as any })} 
                            variant="select" 
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <AspectRatioSelector value={aspectRatio} onChange={(v) => onStateChange({ aspectRatio: v })} disabled={isLoading} />
                        </div>
                        {/* Use hidden for number selector as this tool usually produces 1 result, but grid layout needs spacing */}
                        <div className="hidden"><NumberOfImagesSelector value={1} onChange={()=>{}} disabled={true} /></div>
                    </div>
                    
                    <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} />

                    <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                            <span className="material-symbols-outlined text-yellow-500 text-sm">monetization_on</span>
                            <span>Chi phí: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                        </div>
                        <div className="text-xs">
                            {userCredits < cost ? (
                                <span className="text-red-500 font-semibold">Không đủ</span>
                            ) : (
                                <span className="text-green-600 dark:text-green-400">Khả dụng</span>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !sourceImage}
                        className="w-full flex justify-center items-center gap-3 bg-accent hover:bg-accent-600 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                        {isLoading ? <><Spinner /> {statusMessage || 'Đang vẽ...'}</> : 'Tạo Sketch'}
                    </button>
                    {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-300 rounded-lg text-sm">{error}</div>}
                </div>

                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-text-primary dark:text-white">Kết quả Sketch</h3>
                        {resultImage && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPreviewImage(resultImage)}
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
                                    <span>Tải xuống</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-border-color dark:border-gray-700 flex items-center justify-center overflow-hidden">
                        {isLoading ? (
                            <div className="flex flex-col items-center">
                                <Spinner />
                                <p className="mt-2 text-gray-400">{statusMessage}</p>
                            </div>
                        ) : resultImage && sourceImage ? (
                            <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImage} />
                        ) : resultImage ? (
                             <img src={resultImage} alt="Result" className="w-full h-full object-contain" />
                        ) : (
                             <p className="text-text-secondary dark:text-gray-400 text-center p-4">Kết quả sẽ hiển thị ở đây.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SketchConverter;
