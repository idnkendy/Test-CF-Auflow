
import React, { useState } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { SketchConverterState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
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
    
    const getCostPerImage = () => {
        switch (resolution) {
            case 'Standard': return 5;
            case '1K': return 15;
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

        let logId: string | null = null;
        let jobId: string | null = null;

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

            const prompt = `Convert this realistic image into a highly detailed ${sketchStyle} sketch on clean white background.`;
            
            let resultUrl = '';
            if (resolution === '1K' || resolution === '2K' || resolution === '4K') {
                const images = await geminiService.generateHighQualityImage(prompt, '1:1', resolution, sourceImage, jobId || undefined);
                resultUrl = images[0];
            } else {
                const results = await geminiService.editImage(prompt, sourceImage, 1);
                resultUrl = results[0].imageUrl;
            }

            onStateChange({ resultImage: resultUrl });
            if (jobId && resultUrl) await jobService.updateJobStatus(jobId, 'completed', resultUrl);

            historyService.addToHistory({ tool: Tool.SketchConverter, prompt: prompt, sourceImageURL: sourceImage.objectURL, resultImageURL: resultUrl });
        } catch (err: any) {
            onStateChange({ error: err.message });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi sketch (${err.message})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <h2 className="text-2xl font-bold">AI Biến Ảnh Thành Sketch</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border">
                    <ImageUpload onFileSelect={(f) => onStateChange({ sourceImage: f, resultImage: null })} previewUrl={sourceImage?.objectURL} />
                    <OptionSelector id="style" label="Phong cách" options={styleOptions} value={sketchStyle} onChange={(v) => onStateChange({ sketchStyle: v as any })} variant="grid" />
                    <ResolutionSelector value={resolution} onChange={(v) => onStateChange({ resolution: v })} />
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage || userCredits < cost} className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg shadow-lg">
                        {isLoading ? <Spinner /> : 'Tạo Sketch'}
                    </button>
                </div>
                <div className="aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden">
                    {isLoading ? <Spinner /> : resultImage && sourceImage ? <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImage} /> : <p className="text-gray-400">Kết quả sẽ hiển thị ở đây</p>}
                </div>
            </div>
        </div>
    );
};

export default SketchConverter;
