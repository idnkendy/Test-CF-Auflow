
import React, { useState } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { ViewSyncState } from '../state/toolState';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import AspectRatioSelector from './common/AspectRatioSelector';
import OptionSelector from './common/OptionSelector';
import DirectionalModal from './DirectionalModal';
import ResolutionSelector from './common/ResolutionSelector';

const perspectiveAngles = [
    { id: 'default', label: 'Mặc định', promptClause: "the same general perspective as the source image" },
    { id: 'front', label: 'Chính diện', promptClause: "a straight-on front elevation view of the building" },
    { id: 'left-side', label: '3/4 Trái', promptClause: "a 3/4 perspective view from the front-left, showing both the front and left facades" },
    { id: 'right-side', label: '3/4 Phải', promptClause: "a 3/4 perspective view from the front-right, showing both the front and right facades" },
    { id: 'wide-frame', label: 'Góc rộng', promptClause: "a view that is zoomed out from the building, showing more of the surrounding environment and context" },
    { id: 'top-down', label: 'Trên cao', promptClause: "a top-down aerial or bird's-eye view" },
];

const atmosphericAngles = [
    { id: 'default', label: 'Mặc định', promptClause: "with standard daylight lighting" },
    { id: 'early-morning', label: 'Sáng sớm', promptClause: "in the early morning, with soft, gentle sunrise light" },
    { id: 'night', label: 'Ban đêm', promptClause: "at night, with interior and exterior lights turned on" },
];

interface ViewSyncProps {
    state: ViewSyncState;
    onStateChange: (newState: Partial<ViewSyncState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

const ViewSync: React.FC<ViewSyncProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const {
        sourceImage, directionImage, isLoading, error, resultImages, numberOfImages, sceneType,
        aspectRatio, customPrompt, selectedPerspective, selectedAtmosphere,
        selectedFraming, selectedInteriorAngle, resolution
    } = state;

    const [isDirectionModalOpen, setIsDirectionModalOpen] = useState(false);

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
            onStateChange({ error: 'Vui lòng tải lên một ảnh gốc để bắt đầu.' });
            return;
        }
        onStateChange({ isLoading: true, error: null, resultImages: [] });

        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Đồng bộ view (${numberOfImages} ảnh) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.ViewSync,
                    prompt: customPrompt || 'Synced view rendering',
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const promptParts = [];
            const perspective = perspectiveAngles.find(p => p.id === selectedPerspective);
            const atmosphere = atmosphericAngles.find(a => a.id === selectedAtmosphere);
            if (perspective) promptParts.push(perspective.promptClause);
            if (atmosphere) promptParts.push(atmosphere.promptClause);
            if (customPrompt) promptParts.push(customPrompt);
            
            const finalPrompt = `${promptParts.join(', ')}. Aspect ratio: ${aspectRatio}. Maintain consistent style.`;

            let imageUrls: string[] = [];
            if (resolution === '1K' || resolution === '2K' || resolution === '4K') {
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(finalPrompt, aspectRatio, resolution, sourceImage, jobId || undefined);
                    return images[0];
                });
                imageUrls = await Promise.all(promises);
            } else {
                const results = directionImage 
                    ? await geminiService.editImageWithReference(finalPrompt, sourceImage, directionImage, numberOfImages)
                    : await geminiService.editImage(finalPrompt, sourceImage, numberOfImages);
                imageUrls = results.map(r => r.imageUrl);
            }

            onStateChange({ resultImages: imageUrls });
            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);
            
            imageUrls.forEach(url => historyService.addToHistory({ tool: Tool.ViewSync, prompt: finalPrompt, sourceImageURL: sourceImage.objectURL, resultImageURL: url }));
        } catch (err: any) {
            onStateChange({ error: err.message });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi đồng bộ view (${err.message})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
        }
    };
    
    const handleFileSelect = (fileData: FileData | null) => onStateChange({ sourceImage: fileData, resultImages: [], directionImage: null });
    const handleApplyDirection = (direction: FileData) => { onStateChange({ directionImage: direction }); setIsDirectionModalOpen(false); };

    return (
        <div>
            {isDirectionModalOpen && sourceImage && <DirectionalModal image={sourceImage} onClose={() => setIsDirectionModalOpen(false)} onApply={handleApplyDirection} />}
            <h2 className="text-2xl font-bold mb-4">Đồng Bộ View</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border">
                        <label className="block text-sm font-medium mb-2">1. Tải Lên Ảnh Gốc</label>
                        <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} directionPreviewUrl={directionImage?.objectURL} />
                        {sourceImage && <button onClick={() => setIsDirectionModalOpen(true)} className="w-full mt-4 bg-purple-600 text-white py-2 rounded-lg text-sm font-semibold">Vẽ Hướng Cần Tạo</button>}
                    </div>
                    <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border space-y-4">
                        <OptionSelector id="perspective" label="2. Chọn Góc Máy" options={perspectiveAngles.map(a => ({ value: a.id, label: a.label }))} value={selectedPerspective} onChange={(val) => onStateChange({ selectedPerspective: val })} variant="grid" />
                        <textarea rows={3} className="w-full bg-surface dark:bg-gray-700/50 border rounded-lg p-3 text-sm" placeholder="Yêu cầu thêm..." value={customPrompt} onChange={(e) => onStateChange({ customPrompt: e.target.value })} />
                        <div className="grid grid-cols-2 gap-4">
                            <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                            <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} />
                        </div>
                        <ResolutionSelector value={resolution} onChange={(val) => onStateChange({ resolution: val })} />
                        <button onClick={handleGenerate} disabled={isLoading || !sourceImage || userCredits < cost} className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg transition-colors">
                            {isLoading ? <Spinner /> : 'Tạo Góc Nhìn'}
                        </button>
                    </div>
                </div>
                <div className="aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden">
                    {isLoading ? <Spinner /> : resultImages.length > 0 ? <ResultGrid images={resultImages} toolName="view-sync" /> : <p className="text-gray-400">Kết quả sẽ hiển thị ở đây</p>}
                </div>
            </div>
        </div>
    );
};

export default ViewSync;
