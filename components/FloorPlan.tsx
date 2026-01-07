
import React, { useState, useEffect } from 'react';
import { FileData, Tool, ImageResolution } from '../types';
import { FloorPlanState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService'; // Flow Import
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
import MultiImageUpload from './common/MultiImageUpload';
import OptionSelector from './common/OptionSelector';

interface FloorPlanProps {
    state: FloorPlanState;
    onStateChange: (newState: Partial<FloorPlanState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

// Exterior Options
const exteriorProjectTypeOptions = [
    { value: 'Nhà phố', label: 'Nhà phố' },
    { value: 'Biệt thự', label: 'Biệt thự' },
    { value: 'Chung cư', label: 'Chung cư' },
    { value: 'Resort', label: 'Resort' },
    { value: 'Nhà hàng/Cafe', label: 'Nhà hàng/Cafe' },
    { value: 'Văn phòng', label: 'Văn phòng' },
    { value: 'Công viên', label: 'Công viên' },
];

const importantAreaOptions = [
    { value: 'Khu nhà ở', label: 'Khu nhà ở' },
    { value: 'Khu công trình thương mại', label: 'Khu thương mại' },
    { value: 'Khu vực vui chơi', label: 'Khu vui chơi' },
    { value: 'Cổng', label: 'Cổng' },
    { value: 'Khu vực bungalow mái rơm', label: 'Bungalow mái rơm' },
    { value: 'Nhà hàng và quán cafe', label: 'Nhà hàng & Cafe' },
    { value: 'Khu vực đỗ xe', label: 'Bãi đỗ xe' },
];

const timeOptions = [
    { value: 'Ban ngày', label: 'Ban ngày' },
    { value: 'Hoàng hôn', label: 'Hoàng hôn' },
    { value: 'Ban đêm', label: 'Ban đêm' },
];

const weatherOptions = [
    { value: 'Nắng đẹp', label: 'Nắng đẹp' },
    { value: 'Nhiều mây', label: 'Nhiều mây' },
    { value: 'Mưa', label: 'Mưa' },
];

// Interior Options
const interiorProjectTypeOptions = [
    { value: 'Công trình nhà ở', label: 'Nhà ở' },
    { value: 'Căn hộ chung cư', label: 'Chung cư' },
    { value: 'Biệt thự', label: 'Biệt thự' },
    { value: 'Công trình thương mại', label: 'Thương mại' },
    { value: 'Văn phòng làm việc', label: 'Văn phòng' },
    { value: 'Nhà hàng / Quán Cafe', label: 'Nhà hàng/Cafe' },
    { value: 'Khách sạn / Resort', label: 'Khách sạn/Resort' },
    { value: 'Showroom', label: 'Showroom' },
];

const interiorStyleOptions = [
    { value: 'Hiện đại (Modern)', label: 'Hiện đại' },
    { value: 'Cổ điển (Classic)', label: 'Cổ điển' },
    { value: 'Tân Cổ điển (Neoclassical)', label: 'Tân Cổ điển' },
    { value: 'Indochine (Đông Dương)', label: 'Indochine' },
    { value: 'Vintage', label: 'Vintage' },
    { value: 'Địa Trung Hải (Mediterranean)', label: 'Địa Trung Hải' },
    { value: 'Tối giản (Minimalism)', label: 'Tối giản' },
];

const FloorPlan: React.FC<FloorPlanProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const { 
        prompt, layoutPrompt, sourceImage, referenceImages, isLoading, error, resultImages, 
        numberOfImages, renderMode, planType, resolution, aspectRatio,
        projectType, importantArea, time, weather 
    } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [upscaleWarning, setUpscaleWarning] = useState<string | null>(null);

    // Set default prompt on mount or mode change
    useEffect(() => {
        if (renderMode === 'top-down') {
            if (planType === 'interior') {
                if (!prompt || prompt === 'Biến thành ảnh chụp thực tế dự án') {
                    onStateChange({ prompt: 'Biến thành ảnh chụp thực tế nội thất' });
                }
            } else if (planType === 'exterior') {
                if (!prompt || prompt === 'Biến thành ảnh chụp thực tế nội thất') {
                    onStateChange({ prompt: 'Biến thành ảnh chụp thực tế dự án' });
                }
            }
        }
    }, [renderMode, planType]);

    const appendToPrompt = (text: string) => {
        const targetPromptKey = renderMode === 'top-down' ? 'prompt' : 'layoutPrompt';
        let currentPrompt = state[targetPromptKey] || '';
        
        // Avoid duplicate exact phrases to keep prompt clean
        if (currentPrompt.includes(text)) return;

        const newPrompt = currentPrompt.trim() 
            ? `${currentPrompt}, ${text}` 
            : text;
            
        onStateChange({ [targetPromptKey]: newPrompt });
    };

    const handleProjectTypeChange = (val: string) => {
        appendToPrompt(`Dự án ${val}`);
        onStateChange({ projectType: val }); 
    };

    const handleImportantAreaChange = (val: string) => {
        appendToPrompt(val);
        onStateChange({ importantArea: val });
    };

    const handleInteriorStyleChange = (val: string) => {
        appendToPrompt(`phong cách ${val}`);
        // We use projectType to store style temporarily or just append to prompt since state might not have style field
    };

    const handleTimeChange = (val: string) => {
        appendToPrompt(val);
        onStateChange({ time: val });
    };

    const handleWeatherChange = (val: string) => {
        appendToPrompt(`trời ${val}`);
        onStateChange({ weather: val });
    };

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
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             onStateChange({ error: `Bạn không đủ credits. Cần ${cost} credits nhưng chỉ còn ${userCredits}. Vui lòng nạp thêm.` });
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên một bản vẽ mặt bằng.' });
            return;
        }
        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage('Đang phân tích bản vẽ...');
        setUpscaleWarning(null);

        let logId: string | null = null;
        let jobId: string | null = null;
        
        // Use Flow for ALL resolutions
        const useFlow = true;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Render mặt bằng (${numberOfImages} ảnh) - ${resolution}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.FloorPlan,
                    prompt: renderMode === 'top-down' ? prompt : (layoutPrompt || 'Perspective render'),
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            let fullPrompt = '';
            if (renderMode === 'top-down') {
                fullPrompt = `Faithfully convert this 2D floor plan into a 3D rendered floor plan. Style: ${prompt}. Aspect Ratio: ${aspectRatio}`;
            } else {
                fullPrompt = `3D exterior/interior perspective from this floor plan. Style: ${layoutPrompt}. Aspect Ratio: ${aspectRatio}`;
            }

            let imageUrls: string[] = [];

            if (useFlow) {
                // --- FLOW LOGIC ---
                let aspectEnum = 'IMAGE_ASPECT_RATIO_SQUARE';
                if (aspectRatio === '16:9') aspectEnum = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
                else if (aspectRatio === '9:16') aspectEnum = 'IMAGE_ASPECT_RATIO_PORTRAIT';

                const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
                const collectedUrls: string[] = [];
                // Combine source and references
                const inputImages = [sourceImage, ...referenceImages];

                const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                    setStatusMessage('Đang xử lý. Vui lòng đợi...');
                    const result = await externalVideoService.generateFlowImage(
                        fullPrompt,
                        inputImages,
                        aspectEnum,
                        1,
                        modelName,
                        (msg) => setStatusMessage('Đang xử lý. Vui lòng đợi...')
                    );

                    if (result.imageUrls && result.imageUrls.length > 0) {
                        let finalUrl = result.imageUrls[0];
                        
                        // Upscale Check (2K or 4K)
                        const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                        if (shouldUpscale) {
                            setStatusMessage(resolution === '4K' ? 'Đang xử lý (Upscale 4K)...' : 'Đang xử lý (Upscale 2K)...');
                            try {
                                const mediaId = result.mediaIds[0];
                                if (mediaId) {
                                    const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                                    const upscaleRes = await externalVideoService.upscaleFlowImage(mediaId, result.projectId, targetRes);
                                    if (upscaleRes?.imageUrl) finalUrl = upscaleRes.imageUrl;
                                }
                            } catch (e: any) {
                                // STRICT FAILURE
                                throw new Error(`Lỗi Upscale: ${e.message}`);
                            }
                        }
                        collectedUrls.push(finalUrl);
                        onStateChange({ resultImages: [...collectedUrls] });
                        historyService.addToHistory({ tool: Tool.FloorPlan, prompt: `Flow: ${fullPrompt}`, sourceImageURL: sourceImage.objectURL, resultImageURL: finalUrl });
                    }
                });
                await Promise.all(promises);
                imageUrls = collectedUrls;

            } else {
                // Fallback (Not reached with useFlow=true)
                setStatusMessage('Đang xử lý. Vui lòng đợi...');
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(fullPrompt, aspectRatio, resolution, sourceImage, jobId || undefined, referenceImages);
                    return images[0];
                });
                imageUrls = await Promise.all(promises);
                onStateChange({ resultImages: imageUrls });
                imageUrls.forEach(url => {
                     historyService.addToHistory({ tool: Tool.FloorPlan, prompt: fullPrompt, sourceImageURL: sourceImage.objectURL, resultImageURL: url });
                });
            }
            
            if (jobId && imageUrls.length > 0) {
                await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);
            }

        } catch (err: any) {
            let msg = err.message;
            if (logId) msg += " (Credits đã hoàn lại)";
            onStateChange({ error: msg });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi render mặt bằng (${err.message})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };
    
    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, resultImages: [], referenceImages: [] });
    }
    
    const handleReferenceFilesChange = (files: FileData[]) => {
        onStateChange({ referenceImages: files });
    };

    const handleDownload = () => {
        if (resultImages.length !== 1) return;
        const link = document.createElement('a');
        link.href = resultImages[0];
        link.download = "floorplan-render-3d.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    // Check conditions to show options
    const showExteriorOptions = planType === 'exterior' && renderMode === 'top-down';
    const showInteriorOptions = planType === 'interior' && renderMode === 'top-down';

    // Dynamic labels based on planType
    const topDownLabel = planType === 'exterior' ? 'Phối cảnh tổng thể' : 'Mặt bằng 3D';
    const perspectiveLabel = planType === 'exterior' ? 'Góc nhìn kiến trúc 3D' : 'Góc nhìn nội thất 3D';

    return (
        <div className="flex flex-col gap-8">
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            <div>
                <h2 className="text-2xl font-bold text-text-primary dark:text-white mb-4">AI Render Mặt Bằng</h2>
                <div className="bg-main-bg/50 dark:bg-dark-bg/50 border border-border-color dark:border-gray-700 rounded-xl p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">1. Tải Lên Mặt Bằng 2D</label>
                                <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                            </div>
                            
                            {/* Reference Images: Moved to left column for Perspective modes */}
                            {renderMode === 'perspective' && (
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">Ảnh tham chiếu (Tùy chọn)</label>
                                    <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                                </div>
                            )}
                        </div>
                        
                        <div className="space-y-4 flex flex-col h-full">
                             <div>
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">2. Chọn loại & chế độ</label>
                                <div className="grid grid-cols-2 gap-2 bg-main-bg dark:bg-gray-800 p-1 rounded-lg">
                                    <button onClick={() => onStateChange({ planType: 'interior' })} className={`py-2 rounded-md text-sm font-semibold transition-colors ${planType === 'interior' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>Nội thất</button>
                                    <button onClick={() => onStateChange({ planType: 'exterior' })} className={`py-2 rounded-md text-sm font-semibold transition-colors ${planType === 'exterior' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>Kiến trúc</button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 bg-main-bg dark:bg-gray-800 p-1 rounded-lg mt-2">
                                    <button onClick={() => onStateChange({ renderMode: 'top-down' })} className={`py-2 rounded-md text-sm font-semibold transition-colors ${renderMode === 'top-down' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>{topDownLabel}</button>
                                    <button onClick={() => onStateChange({ renderMode: 'perspective' })} className={`py-2 rounded-md text-sm font-semibold transition-colors ${renderMode === 'perspective' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>{perspectiveLabel}</button>
                                </div>
                            </div>
                            
                            {/* Option Selectors - Exterior + Top-down */}
                            {showExteriorOptions && (
                                <div className="pt-2 space-y-4">
                                    <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">3. Tinh chỉnh chi tiết (Nhấn để thêm)</label>
                                    <OptionSelector id="project-type" label="Loại dự án" options={exteriorProjectTypeOptions} value={projectType} onChange={handleProjectTypeChange} disabled={isLoading} variant="grid" />
                                    <OptionSelector id="important-area" label="Khu vực quan trọng" options={importantAreaOptions} value={importantArea} onChange={handleImportantAreaChange} disabled={isLoading} variant="select" />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <OptionSelector id="time-selector" label="Thời gian" options={timeOptions} value={time} onChange={handleTimeChange} disabled={isLoading} variant="select" />
                                        <OptionSelector id="weather-selector" label="Thời tiết" options={weatherOptions} value={weather} onChange={handleWeatherChange} disabled={isLoading} variant="select" />
                                    </div>
                                </div>
                            )}

                            {/* Option Selectors - Interior + Top-down */}
                            {showInteriorOptions && (
                                <div className="pt-2 space-y-4">
                                    <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">3. Tinh chỉnh chi tiết (Nhấn để thêm)</label>
                                    <OptionSelector id="int-project-type" label="Thể loại công trình" options={interiorProjectTypeOptions} value={projectType} onChange={handleProjectTypeChange} disabled={isLoading} variant="grid" />
                                    <OptionSelector id="int-style" label="Phong cách thiết kế" options={interiorStyleOptions} value={""} onChange={handleInteriorStyleChange} disabled={isLoading} variant="grid" />
                                </div>
                            )}

                            {renderMode === 'top-down' ? (
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">
                                        {showExteriorOptions || showInteriorOptions ? '4. Mô tả chi tiết (Prompt)' : '3. Mô tả chi tiết (Prompt)'}
                                    </label>
                                    <textarea rows={6} className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-sm" placeholder="Mô tả phong cách..." value={prompt} onChange={(e) => onStateChange({ prompt: e.target.value })} />
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">3. Mô tả góc nhìn</label>
                                    <textarea rows={6} className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-sm" placeholder="Mô tả góc nhìn..." value={layoutPrompt} onChange={(e) => onStateChange({ layoutPrompt: e.target.value })} />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 mt-auto pt-4">
                                <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} disabled={isLoading} />
                                <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} disabled={isLoading} />
                            </div>
                            <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} />

                             <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mt-4 border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
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
                            <button 
                                onClick={handleGenerate} 
                                disabled={isLoading || !sourceImage || userCredits < cost} 
                                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2 shadow-lg"
                            >
                                {isLoading ? <><Spinner /> {statusMessage || 'Đang xử lý. Vui lòng đợi...'}</> : 'Bắt đầu Render'}
                            </button>
                        </div>
                    </div>
                    {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">{error}</div>}
                    {upscaleWarning && <p className="mt-3 text-sm text-yellow-500 text-center font-medium bg-yellow-100 dark:bg-yellow-900/20 p-2 rounded">{upscaleWarning}</p>}
                </div>
            </div>

            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold">Kết quả</h3>
                    {resultImages.length === 1 && <button onClick={handleDownload} className="bg-gray-600 text-white px-4 py-1.5 rounded-lg text-sm">Tải xuống</button>}
                </div>
                <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden">
                    {isLoading ? (
                        <div className="flex flex-col items-center">
                            <Spinner />
                            <p className="mt-2 text-gray-400">{statusMessage || 'Đang xử lý. Vui lòng đợi...'}</p>
                        </div>
                    ) : resultImages.length === 1 && sourceImage ? <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[0]} /> : resultImages.length > 1 ? <ResultGrid images={resultImages} toolName="floorplan-render" /> : <p className="text-gray-400">Kết quả sẽ hiển thị ở đây</p>}
                </div>
            </div>
        </div>
    );
};

export default FloorPlan;
