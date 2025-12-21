
import React, { useState } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { UpscaleState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import ImagePreviewModal from './common/ImagePreviewModal';
import ResolutionSelector from './common/ResolutionSelector';

interface UpscaleProps {
    state: UpscaleState;
    onStateChange: (newState: Partial<UpscaleState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

const Upscale: React.FC<UpscaleProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const { sourceImage, isLoading, error, upscaledImages, numberOfImages, resolution } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const getCostPerImage = () => {
        switch (resolution) {
            case 'Standard': return 5;
            case '1K': return 15;
            case '2K': return 20;
            case '4K': return 30;
            default: return 5;
        }
    };
    const cost = numberOfImages * getCostPerImage();

    const handleUpscale = async () => {
        if (onDeductCredits && userCredits < cost) {
             onStateChange({ error: `Bạn không đủ credits. Cần ${cost} credits.` });
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên một hình ảnh để nâng cấp.' });
            return;
        }
        onStateChange({ isLoading: true, error: null, upscaledImages: [] });

        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Upscale ảnh (${numberOfImages} ảnh) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.Upscale,
                    prompt: "Upscale image to higher resolution",
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const upscalePrompt = "Upscale this image to a high resolution. Enhance details while maintaining original composition.";
            let imageUrls: string[] = [];
            
            if (resolution === '1K' || resolution === '2K' || resolution === '4K') {
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(upscalePrompt, '1:1', resolution, sourceImage, jobId || undefined);
                    return images[0];
                });
                imageUrls = await Promise.all(promises);
            } else {
                const results = await geminiService.editImage(upscalePrompt, sourceImage, numberOfImages);
                imageUrls = results.map(r => r.imageUrl);
            }

            onStateChange({ upscaledImages: imageUrls });
            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);

            imageUrls.forEach(url => {
                historyService.addToHistory({
                    tool: Tool.Upscale,
                    prompt: "Nâng cấp chi tiết ảnh",
                    sourceImageURL: sourceImage.objectURL,
                    resultImageURL: url,
                });
            });
        } catch (err: any) {
            onStateChange({ error: err.message });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi upscale (${err.message})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
        }
    };
    
    const handleFileSelect = (fileData: FileData | null) => onStateChange({ sourceImage: fileData, upscaledImages: [] });

    return (
        <div className="flex flex-col gap-8">
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            <div>
                <h2 className="text-2xl font-bold mb-4">AI Upscale AI</h2>
                <div className="bg-main-bg/50 dark:bg-dark-bg/50 border border-border-color rounded-xl p-6 flex flex-col items-center">
                    <div className="w-full max-w-lg space-y-4">
                        <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                        <ResolutionSelector value={resolution} onChange={(val) => onStateChange({ resolution: val })} />
                        <div className="flex justify-between text-sm py-2">
                            <span>Chi phí: <b>{cost} Credits</b></span>
                            <span>Có sẵn: {userCredits}</span>
                        </div>
                        <button onClick={handleUpscale} disabled={isLoading || !sourceImage || userCredits < cost} className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg shadow-lg">
                            {isLoading ? <Spinner /> : 'Bắt Đầu Nâng Cấp'}
                        </button>
                    </div>
                    {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm w-full max-w-lg">{error}</div>}
                </div>
            </div>
            <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden">
                {isLoading ? <Spinner /> : upscaledImages.length === 1 && sourceImage ? <ImageComparator originalImage={sourceImage.objectURL} resultImage={upscaledImages[0]} /> : upscaledImages.length > 1 ? <ResultGrid images={upscaledImages} toolName="upscale" /> : <p className="text-gray-400">Kết quả sẽ hiển thị ở đây</p>}
            </div>
        </div>
    );
};

export default Upscale;
