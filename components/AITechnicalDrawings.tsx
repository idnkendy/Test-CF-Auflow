
import React, { useState } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { AITechnicalDrawingsState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService'; // Flow Import
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import OptionSelector from './common/OptionSelector';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import AspectRatioSelector from './common/AspectRatioSelector';

interface AITechnicalDrawingsProps {
    state: AITechnicalDrawingsState;
    onStateChange: (newState: Partial<AITechnicalDrawingsState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

const drawingTypeOptions = [
    { value: 'floor-plan', label: 'Mặt bằng (Floor Plan)' },
    { value: 'elevation', label: 'Mặt đứng (Elevation)' },
    { value: 'section', label: 'Mặt cắt (Section)' },
];

const AITechnicalDrawings: React.FC<AITechnicalDrawingsProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const { sourceImage, isLoading, error, resultImage, drawingType, detailLevel, resolution, aspectRatio } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
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
            onStateChange({ error: 'Vui lòng tải lên một ảnh Render để bắt đầu.' });
            return;
        }
        onStateChange({ isLoading: true, error: null, resultImage: null });
        setStatusMessage('Đang phân tích...');
        setUpscaleWarning(null);

        let logId: string | null = null;
        let jobId: string | null = null;
        
        const useFlow = resolution !== '4K';
        const prompt = `Convert this 3D render into a professional 2D ${drawingType} architectural drawing. White lines on blue background.`;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Tạo bản vẽ kỹ thuật (${drawingType}) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.AITechnicalDrawings,
                    prompt: `Create ${drawingType} technical drawing`,
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');
            
            let resultUrl = '';

            if (useFlow) {
                // --- FLOW LOGIC ---
                let aspectEnum = 'IMAGE_ASPECT_RATIO_SQUARE';
                if (aspectRatio === '16:9') aspectEnum = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
                else if (aspectRatio === '9:16') aspectEnum = 'IMAGE_ASPECT_RATIO_PORTRAIT';

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
                    if (resolution === '2K' && result.mediaIds && result.mediaIds.length > 0) {
                        setStatusMessage('Đang xử lý. Vui lòng đợi...');
                        try {
                            const upscaleRes = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId);
                            if (upscaleRes?.imageUrl) resultUrl = upscaleRes.imageUrl;
                        } catch (e: any) {
                            // STRICT 2K FAILURE
                            throw new Error(`Lỗi Upscale 2K: ${e.message}`);
                        }
                    }
                    historyService.addToHistory({ tool: Tool.AITechnicalDrawings, prompt: `Flow: ${prompt}`, sourceImageURL: sourceImage.objectURL, resultImageURL: resultUrl });
                } else throw new Error("Lỗi không có ảnh.");

            } else {
                // --- GEMINI 4K ---
                setStatusMessage('Đang xử lý. Vui lòng đợi...');
                const images = await geminiService.generateHighQualityImage(prompt, aspectRatio, resolution, sourceImage, jobId || undefined);
                resultUrl = images[0];
                historyService.addToHistory({ tool: Tool.AITechnicalDrawings, prompt: prompt, sourceImageURL: sourceImage.objectURL, resultImageURL: resultUrl });
            }

            onStateChange({ resultImage: resultUrl });
            if (jobId && resultUrl) await jobService.updateJobStatus(jobId, 'completed', resultUrl);

        } catch (err: any) {
            let msg = err.message;
            if (logId) msg += " (Credits đã hoàn lại)";
            onStateChange({ error: msg });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi tạo bản vẽ (${err.message})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            <h2 className="text-2xl font-bold">AI Tạo Bản Vẽ Kỹ Thuật</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border">
                    <ImageUpload onFileSelect={(f) => onStateChange({ sourceImage: f, resultImage: null })} previewUrl={sourceImage?.objectURL} />
                    <OptionSelector id="type" label="Loại bản vẽ" options={drawingTypeOptions} value={drawingType} onChange={(v) => onStateChange({ drawingType: v as any })} variant="grid" />
                    <AspectRatioSelector value={aspectRatio} onChange={(v) => onStateChange({ aspectRatio: v })} disabled={isLoading} />
                    <ResolutionSelector value={resolution} onChange={(v) => onStateChange({ resolution: v })} disabled={isLoading} />
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage || userCredits < cost} className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg shadow-lg">
                        {isLoading ? <><Spinner /> {statusMessage || 'Đang vẽ...'}</> : 'Tạo Bản Vẽ'}
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

export default AITechnicalDrawings;
