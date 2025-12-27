
import React, { useState } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { SketchConverterState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService'; // Flow Import
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import ResolutionSelector from './common/ResolutionSelector';
import OptionSelector from './common/OptionSelector';

interface SketchConverterProps {
    state: SketchConverterState;
    onStateChange: (newState: Partial<SketchConverterState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

const styleOptions = [
    { value: 'pencil', label: 'Bút chì' },
    { value: 'charcoal', label: 'Than củi' },
    { value: 'watercolor', label: 'Màu nước' },
];

const SketchConverter: React.FC<SketchConverterProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const { sourceImage, isLoading, error, resultImage, sketchStyle, detailLevel, resolution } = state;
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [upscaleWarning, setUpscaleWarning] = useState<string | null>(null);
    
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

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             onStateChange({ error: `Bạn không đủ credits. Cần ${cost} credits.` });
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên một ảnh để chuyển đổi.' });
            return;
        }
        onStateChange({ isLoading: true, error: null, resultImage: null });
        setStatusMessage('Đang chuyển đổi...');
        setUpscaleWarning(null);

        let logId: string | null = null;
        let jobId: string | null = null;
        
        // Use Flow for ALL resolutions
        const useFlow = true;
        const prompt = `Convert this realistic image into a highly detailed ${sketchStyle} sketch on clean white background.`;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Chuyển đổi Sketch (${sketchStyle}) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.SketchConverter,
                    prompt: `Convert to ${sketchStyle} sketch`,
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');
            
            let resultUrl = '';

            if (useFlow) {
                // --- FLOW LOGIC ---
                // Default to Landscape for Sketch conversion
                const aspectEnum = 'IMAGE_ASPECT_RATIO_LANDSCAPE'; 
                const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";

                setStatusMessage('Đang xử lý. Vui lòng đợi...');
                const result = await externalVideoService.generateFlowImage(
                    prompt,
                    [sourceImage],
                    aspectEnum,
                    1,
                    modelName,
                    (msg) => setStatusMessage('Đang xử lý. Vui lòng đợi...')
                );

                if (result.imageUrls && result.imageUrls.length > 0) {
                    resultUrl = result.imageUrls[0];
                    
                    // Check for 2K/4K Upscale
                    const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                    
                    if (shouldUpscale) {
                        setStatusMessage(resolution === '4K' ? 'Đang xử lý (Upscale 4K)...' : 'Đang xử lý (Upscale 2K)...');
                        try {
                            const mediaId = result.mediaIds[0];
                            if (mediaId) {
                                const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                                const upscaleRes = await externalVideoService.upscaleFlowImage(mediaId, result.projectId, targetRes);
                                if (upscaleRes?.imageUrl) resultUrl = upscaleRes.imageUrl;
                            }
                        } catch (upscaleErr: any) {
                            // STRICT FAILURE
                            throw new Error(`Lỗi Upscale: ${upscaleErr.message}`);
                        }
                    }
                    
                    historyService.addToHistory({ tool: Tool.SketchConverter, prompt: `Flow: ${prompt}`, sourceImageURL: sourceImage.objectURL, resultImageURL: resultUrl });
                } else {
                    throw new Error("Không nhận được ảnh.");
                }

            } else {
                // Fallback (Not reached if useFlow=true)
                setStatusMessage('Đang xử lý. Vui lòng đợi...');
                const images = await geminiService.generateHighQualityImage(prompt, '1:1', resolution, sourceImage, jobId || undefined);
                resultUrl = images[0];
                historyService.addToHistory({ tool: Tool.SketchConverter, prompt: prompt, sourceImageURL: sourceImage.objectURL, resultImageURL: resultUrl });
            }

            onStateChange({ resultImage: resultUrl });
            if (jobId && resultUrl) await jobService.updateJobStatus(jobId, 'completed', resultUrl);

        } catch (err: any) {
            let msg = err.message;
            if (logId) msg += " (Credits đã hoàn lại)";
            onStateChange({ error: msg });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) await refundCredits(user.id, cost, `Hoàn tiền: Lỗi sketch (${err.message})`, logId);
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <h2 className="text-2xl font-bold">AI Biến Ảnh Thành Sketch</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border">
                    <ImageUpload onFileSelect={(f) => onStateChange({ sourceImage: f, resultImage: null })} previewUrl={sourceImage?.objectURL} />
                    <OptionSelector id="style" label="Phong cách" options={styleOptions} value={sketchStyle} onChange={(v) => onStateChange({ sketchStyle: v as any })} variant="grid" />
                    <ResolutionSelector value={resolution} onChange={(v) => onStateChange({ resolution: v })} disabled={isLoading} />
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage || userCredits < cost} className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg shadow-lg">
                        {isLoading ? <><Spinner /> {statusMessage || 'Đang vẽ...'}</> : 'Tạo Sketch'}
                    </button>
                    {error && <div className="p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}
                    {upscaleWarning && <div className="text-xs text-yellow-500 text-center">{upscaleWarning}</div>}
                </div>
                <div className="aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden">
                    {isLoading ? (
                        <div className="flex flex-col items-center">
                            <Spinner />
                            <p className="mt-2 text-gray-400">{statusMessage}</p>
                        </div>
                    ) : resultImage && sourceImage ? <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImage} /> : <p className="text-gray-400">Kết quả sẽ hiển thị ở đây</p>}
                </div>
            </div>
        </div>
    );
};

export default SketchConverter;
