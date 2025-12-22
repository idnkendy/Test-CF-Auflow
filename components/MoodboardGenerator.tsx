
import React, { useState } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { MoodboardGeneratorState } from '../state/toolState';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import AspectRatioSelector from './common/AspectRatioSelector';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';

interface MoodboardGeneratorProps {
    state: MoodboardGeneratorState;
    onStateChange: (newState: Partial<MoodboardGeneratorState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

const MoodboardGenerator: React.FC<MoodboardGeneratorProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const { prompt, sourceImage, isLoading, error, resultImages, numberOfImages, aspectRatio, mode, resolution } = state;
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

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             onStateChange({ error: `Bạn không đủ credits. Cần ${cost} credits.` });
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên ảnh để bắt đầu.' });
            return;
        }
        onStateChange({ isLoading: true, error: null, resultImages: [] });

        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Tạo Moodboard (${numberOfImages} ảnh) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.Moodboard,
                    prompt: prompt,
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const fullPrompt = mode === 'moodboardToScene' 
                ? `Generate a photorealistic scene from this moodboard. Instruction: ${prompt}` 
                : `Extract materials and colors from this scene into a clean vertical moodboard layout.`;

            let imageUrls: string[] = [];
            if (resolution === '1K' || resolution === '2K' || resolution === '4K') {
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(fullPrompt, aspectRatio, resolution, sourceImage, jobId || undefined);
                    return images[0];
                });
                imageUrls = await Promise.all(promises);
            } else {
                const results = await geminiService.editImage(fullPrompt, sourceImage, numberOfImages);
                imageUrls = results.map(r => r.imageUrl);
            }

            onStateChange({ resultImages: imageUrls });
            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);
            
            imageUrls.forEach(url => {
                historyService.addToHistory({ tool: Tool.Moodboard, prompt: fullPrompt, sourceImageURL: sourceImage.objectURL, resultImageURL: url });
            });
        } catch (err: any) {
            onStateChange({ error: err.message });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi moodboard (${err.message})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            <h2 className="text-2xl font-bold">AI Moodboard</h2>
            <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border space-y-6">
                <div className="grid grid-cols-2 gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                    <button onClick={() => onStateChange({ mode: 'moodboardToScene', resultImages: [] })} className={`py-2 rounded-md text-sm font-semibold ${mode === 'moodboardToScene' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>Moodboard &rarr; Không gian</button>
                    <button onClick={() => onStateChange({ mode: 'sceneToMoodboard', resultImages: [] })} className={`py-2 rounded-md text-sm font-semibold ${mode === 'sceneToMoodboard' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>Không gian &rarr; Moodboard</button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ImageUpload onFileSelect={(f) => onStateChange({ sourceImage: f, resultImages: [] })} previewUrl={sourceImage?.objectURL} />
                    <div className="space-y-4">
                        <textarea rows={4} className="w-full bg-surface dark:bg-gray-700/50 border rounded-lg p-3 text-sm" placeholder="Mô tả..." value={prompt} onChange={(e) => onStateChange({ prompt: e.target.value })} />
                        <div className="grid grid-cols-2 gap-4">
                            <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                            <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} />
                        </div>
                        <ResolutionSelector value={resolution} onChange={(val) => onStateChange({ resolution: val })} />
                        <button onClick={handleGenerate} disabled={isLoading || !sourceImage || userCredits < cost} className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg transition-colors">
                            {isLoading ? <Spinner /> : 'Tạo Moodboard'}
                        </button>
                    </div>
                </div>
            </div>
            <div className="aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden">
                {isLoading ? <Spinner /> : resultImages.length > 0 ? <ResultGrid images={resultImages} toolName="moodboard" /> : <p className="text-gray-400">Kết quả sẽ hiển thị ở đây</p>}
            </div>
        </div>
    );
};

export default MoodboardGenerator;
