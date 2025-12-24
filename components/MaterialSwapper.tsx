
import React, { useState } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { MaterialSwapperState } from '../state/toolState';
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
import AspectRatioSelector from './common/AspectRatioSelector';

interface MaterialSwapperProps {
    state: MaterialSwapperState;
    onStateChange: (newState: Partial<MaterialSwapperState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

const MaterialSwapper: React.FC<MaterialSwapperProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const { prompt, sceneImage, materialImage, isLoading, error, resultImages, numberOfImages, resolution, aspectRatio } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);

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

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             onStateChange({ error: `Bạn không đủ credits. Cần ${cost} credits.` });
             return;
        }

        if (!prompt || !sceneImage || !materialImage) {
            onStateChange({ error: 'Vui lòng điền đủ thông tin và tải ảnh.' });
            return;
        }

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        let logId: string | null = null;
        let jobId: string | null = null;

        try {
             if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Thay vật liệu (${numberOfImages} ảnh) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.MaterialSwap,
                    prompt: prompt,
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const fullPrompt = `${prompt}. Maintain ${aspectRatio} ratio. Photorealistic quality.`;
            let imageUrls: string[] = [];

            if (resolution === '1K' || resolution === '2K' || resolution === '4K') {
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(fullPrompt, aspectRatio, resolution, sceneImage, jobId || undefined, [materialImage]);
                    return images[0];
                });
                imageUrls = await Promise.all(promises);
            } else {
                const results = await geminiService.editImageWithReference(fullPrompt, sceneImage, materialImage, numberOfImages);
                imageUrls = results.map(r => r.imageUrl);
            }

            onStateChange({ resultImages: imageUrls });
            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);

            imageUrls.forEach(url => {
                 historyService.addToHistory({ tool: Tool.MaterialSwap, prompt: fullPrompt, sourceImageURL: sceneImage.objectURL, resultImageURL: url });
            });
        } catch (err: any) {
            onStateChange({ error: err.message });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi thay vật liệu (${err.message})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    return (
        <div>
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            <h2 className="text-2xl font-bold mb-4">AI Thay Vật Liệu / Staging</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border">
                    <ImageUpload onFileSelect={(f) => onStateChange({ sceneImage: f, resultImages: [] })} previewUrl={sceneImage?.objectURL} />
                    <ImageUpload onFileSelect={(f) => onStateChange({ materialImage: f })} previewUrl={materialImage?.objectURL} />
                    <textarea rows={3} className="w-full bg-surface dark:bg-gray-700/50 border rounded-lg p-3 text-sm" placeholder="Mô tả yêu cầu..." value={prompt} onChange={(e) => onStateChange({ prompt: e.target.value })} />
                    <div className="grid grid-cols-2 gap-4">
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                        <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} />
                    </div>
                    <ResolutionSelector value={resolution} onChange={(val) => onStateChange({ resolution: val })} />
                    <div className="flex justify-between text-sm">
                        <span>Chi phí: <b>{cost} Credits</b></span>
                        <span>{userCredits < cost ? 'Không đủ' : `Còn: ${userCredits}`}</span>
                    </div>
                    <button onClick={handleGenerate} disabled={isLoading || !sceneImage || !materialImage || userCredits < cost} className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg">
                        {isLoading ? <Spinner /> : 'Thực Hiện Thay Thế'}
                    </button>
                </div>
                <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden">
                    {isLoading ? <Spinner /> : resultImages.length === 1 && sceneImage ? <ImageComparator originalImage={sceneImage.objectURL} resultImage={resultImages[0]} /> : resultImages.length > 1 ? <ResultGrid images={resultImages} toolName="material-swap" /> : <p className="text-gray-400">Kết quả sẽ hiển thị ở đây</p>}
                </div>
            </div>
        </div>
    );
};

export default MaterialSwapper;
