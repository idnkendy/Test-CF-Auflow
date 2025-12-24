
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
    const cost = numberOfImages * getCostPerImage();

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
        // Nếu chuyển về Standard, xóa ảnh hướng dẫn vì không hỗ trợ
        if (val === 'Standard') {
            onStateChange({ directionImage: null });
        }
    };

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
        setStatusMessage('Đang phân tích góc nhìn...');
        setUpscaleWarning(null);

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
            
            // Build the core instruction
            if (perspective && perspective.id !== 'default') promptParts.push(`Change the view to ${perspective.promptClause}`);
            if (atmosphere && atmosphere.id !== 'default') promptParts.push(`Render it ${atmosphere.promptClause}`);
            if (customPrompt) promptParts.push(customPrompt);
            
            // Base prompt construction
            let finalPrompt = "";
            if (promptParts.length > 0) {
                finalPrompt = `Keep the main subject (building/room) exactly as it is, but ${promptParts.join(', ')}.`;
            } else {
                finalPrompt = "Enhance the quality and clarity of this view. Maintain the exact same architectural style and content.";
            }
            
            finalPrompt += ` Output strictly in ${aspectRatio} aspect ratio. Photorealistic architectural photography.`;

            let imageUrls: string[] = [];

            // --- GOOGLE GEMINI API LOGIC (ALL RESOLUTIONS) ---
            if (resolution === '1K' || resolution === '2K' || resolution === '4K') {
                // High Quality Mode (Pro Model)
                setStatusMessage(`Đang xử lý với Gemini Pro (${resolution})...`);
                
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(
                        finalPrompt, 
                        aspectRatio, 
                        resolution, 
                        sourceImage, 
                        jobId || undefined,
                        directionImage ? [directionImage] : undefined // Truyền ảnh hướng nếu có (chỉ Pro mới hiểu)
                    );
                    return images[0];
                });
                imageUrls = await Promise.all(promises);
            } else {
                // Standard Mode (Flash Model)
                // Note: Standard mode does NOT support directionImage via generateStandardImage currently
                setStatusMessage('Đang xử lý với Gemini Flash...');
                imageUrls = await geminiService.generateStandardImage(
                    finalPrompt, 
                    aspectRatio, 
                    numberOfImages, 
                    sourceImage, 
                    jobId || undefined
                );
            }

            onStateChange({ resultImages: imageUrls });
            
            // Log history
            imageUrls.forEach(url => historyService.addToHistory({ 
                tool: Tool.ViewSync, 
                prompt: `Gemini API: ${finalPrompt}`, 
                sourceImageURL: sourceImage.objectURL, 
                resultImageURL: url 
            }));

            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);
            
        } catch (err: any) {
            onStateChange({ error: err.message });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi đồng bộ view (${err.message})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
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
                        
                        {sourceImage && (
                            resolution === 'Standard' ? (
                                <div className="p-4 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 mt-4">
                                    <span className="material-symbols-outlined text-yellow-500 text-3xl">lock</span>
                                    <p className="text-sm text-text-secondary dark:text-gray-400">
                                        Tính năng vẽ hướng chỉ hoạt động ở các bản <span className="font-bold text-text-primary dark:text-white">Nano Pro</span> (1K trở lên).
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
                                    <button onClick={() => setIsDirectionModalOpen(true)} className="w-full mt-4 bg-purple-600 text-white py-2 rounded-lg text-sm font-semibold">Vẽ Hướng Cần Tạo</button>
                                    {directionImage && <p className="text-xs text-green-500 mt-2">*Đã nhận diện hướng vẽ. AI sẽ ưu tiên hướng này khi tạo ảnh.</p>}
                                </>
                            )
                        )}
                    </div>
                    <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border space-y-4">
                        <OptionSelector id="perspective" label="2. Chọn Góc Máy (Nếu không vẽ hướng)" options={perspectiveAngles.map(a => ({ value: a.id, label: a.label }))} value={selectedPerspective} onChange={(val) => onStateChange({ selectedPerspective: val })} variant="grid" disabled={!!directionImage} />
                        <textarea rows={3} className="w-full bg-surface dark:bg-gray-700/50 border rounded-lg p-3 text-sm" placeholder="Mô tả thêm (ví dụ: trời nắng đẹp, nhiều cây xanh)..." value={customPrompt} onChange={(e) => onStateChange({ customPrompt: e.target.value })} />
                        <div className="grid grid-cols-2 gap-4">
                            <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                            <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} />
                        </div>
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                        
                        <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mb-1 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Chi phí: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                            </div>
                            <div className="text-xs">
                                {userCredits < cost ? (
                                    <span className="text-red-500 font-semibold">Không đủ (Có: {userCredits})</span>
                                ) : (
                                    <span className="text-green-600 dark:text-green-400">Khả dụng: {userCredits}</span>
                                )}
                            </div>
                        </div>

                        <button onClick={handleGenerate} disabled={isLoading || !sourceImage || userCredits < cost} className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2">
                            {isLoading ? <><Spinner /> {statusMessage || 'Đang xử lý...'}</> : 'Tạo Góc Nhìn'}
                        </button>
                        {upscaleWarning && <p className="mt-2 text-xs text-yellow-500 text-center">{upscaleWarning}</p>}
                    </div>
                </div>
                <div className="aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden">
                    {isLoading ? (
                        <div className="flex flex-col items-center">
                            <Spinner />
                            <p className="mt-2 text-text-secondary dark:text-gray-400">{statusMessage || 'Đang xử lý...'}</p>
                        </div>
                    ) : resultImages.length > 0 ? <ResultGrid images={resultImages} toolName="view-sync" /> : <p className="text-gray-400">Kết quả sẽ hiển thị ở đây</p>}
                </div>
            </div>
        </div>
    );
};

export default ViewSync;
