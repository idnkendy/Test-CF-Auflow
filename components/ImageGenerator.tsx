
import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService';
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { ImageGeneratorState } from '../state/toolState';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import MultiImageUpload from './common/MultiImageUpload';
import ImageComparator from './ImageComparator';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import OptionSelector from './common/OptionSelector';
import AspectRatioSelector from './common/AspectRatioSelector';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import { supabase } from '../services/supabaseClient';
import SafetyWarningModal from './common/SafetyWarningModal';

const buildingTypeOptions = [
    { value: 'none', label: 'Tự động' },
    { value: 'nhà phố', label: 'Nhà phố' },
    { value: 'biệt thự', label: 'Biệt thự' },
    { value: 'nhà cấp 4', label: 'Nhà cấp 4' },
    { value: 'chung cư', label: 'Chung cư' },
    { value: 'toà nhà văn phòng', label: 'Văn phòng' },
    { value: 'quán cà phê', label: 'Cafe' },
    { value: 'nhà hàng', label: 'Nhà hàng' },
];

const styleOptions = [
    { value: 'none', label: 'Tự động' },
    { value: 'Hiện đại', label: 'Hiện đại' },
    { value: 'Tối giản', label: 'Tối giản' },
    { value: 'Tân Cổ điển', label: 'Tân Cổ điển' },
    { value: 'Scandinavian', label: 'Scandinavian' },
    { value: 'Công nghiệp', label: 'Industrial' },
    { value: 'Nhiệt đới', label: 'Nhiệt đới' },
    { value: 'Brutalism', label: 'Brutalism' },
];

const contextOptions = [
    { value: 'none', label: 'Tự động' },
    { value: 'trên một đường phố Việt Nam', label: 'Đường phố VN' },
    { value: 'ở một làng quê Việt Nam', label: 'Làng quê VN' },
    { value: 'trong một khu đô thị hiện đại Việt Nam', label: 'Đô thị hiện đại' },
    { value: 'tại một ngã ba đường phố Việt Nam', label: 'Ngã ba đường' },
    { value: 'tại một ngã tư đường phố Việt Nam', label: 'Ngã tư đường' },
];

const lightingOptions = [
    { value: 'none', label: 'Tự động' },
    { value: 'bình minh dịu nhẹ', label: 'Bình minh' },
    { value: 'buổi trưa, trời xanh trong', label: 'Trưa nắng' },
    { value: 'nắng chiều, nắng vàng cam', label: 'Hoàng hôn' },
    { value: 'buổi tối, đèn vàng từ trong nhà hắt ra, đèn đường sáng', label: 'Buổi tối' },
    { value: 'đêm khuya, đèn công trình sáng và bầu trời đầy sao', label: 'Đêm sao' },
];

const weatherOptions = [
    { value: 'none', label: 'Tự động' },
    { value: 'trời trong xanh, quang đãng', label: 'Trời trong' },
    { value: 'có mưa nhẹ và đường ướt', label: 'Mưa nhẹ' },
    { value: 'có tuyết rơi nhẹ', label: 'Tuyết rơi' },
    { value: 'under the scorching sun, clear shadows', label: 'Nắng gắt' },
    { value: 'after a rain, with puddles and reflections', label: 'Sau mưa' },
];

interface ImageGeneratorProps {
  state: ImageGeneratorState;
  onStateChange: (newState: Partial<ImageGeneratorState>) => void;
  onSendToViewSync: (image: FileData) => void;
  userCredits?: number;
  onDeductCredits?: (amount: number, description: string) => Promise<string>;
  onInsufficientCredits?: () => void;
}

const ImageGenerator: React.FC<ImageGeneratorProps> = ({ state, onStateChange, onSendToViewSync, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { 
        style, context, lighting, weather, buildingType, customPrompt, referenceImages, 
        sourceImage, isLoading, isUpscaling, error, resultImages, upscaledImage, 
        numberOfImages, aspectRatio, resolution 
    } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [isAutoPromptLoading, setIsAutoPromptLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);

    const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const updatePrompt = useCallback((type: string, newValue: string, oldValue: string) => {
        const getPromptPart = (partType: string, value: string): string => {
            if (value === 'none' || !value) return '';
            switch (partType) {
                case 'style': return `phong cách ${value}`;
                case 'context': return `bối cảnh ${value}`;
                case 'lighting': return `ánh sáng ${value}`;
                case 'weather': return `thời tiết ${value}`;
                case 'buildingType': return `là một ${value}`;
                default: return '';
            }
        };

        const oldPart = getPromptPart(type, oldValue);
        const newPart = getPromptPart(type, newValue);
        let nextPrompt = customPrompt;

        if (oldPart && nextPrompt.includes(oldPart)) {
             nextPrompt = newPart 
                ? nextPrompt.replace(oldPart, newPart) 
                : nextPrompt.replace(new RegExp(`,?\\s*${escapeRegExp(oldPart)}`), '').replace(new RegExp(`${escapeRegExp(oldPart)},?\\s*`), '');
        } else if (newPart) {
            nextPrompt = nextPrompt.trim() ? `${nextPrompt}, ${newPart}` : newPart;
        }

        onStateChange({ customPrompt: nextPrompt.replace(/,+/g, ',').split(',').map(p => p.trim()).filter(p => p.length > 0).join(', ') });
    }, [customPrompt, onStateChange]);

    const handleBuildingTypeChange = (newVal: string) => { updatePrompt('buildingType', newVal, buildingType); onStateChange({ buildingType: newVal }); };
    const handleStyleChange = (newVal: string) => { updatePrompt('style', newVal, style); onStateChange({ style: newVal }); };
    const handleContextChange = (newVal: string) => { updatePrompt('context', newVal, context); onStateChange({ context: newVal }); };
    const handleLightingChange = (newVal: string) => { updatePrompt('lighting', newVal, lighting); onStateChange({ lighting: newVal }); };
    const handleWeatherChange = (newVal: string) => { updatePrompt('weather', newVal, weather); onStateChange({ weather: newVal }); };
    
    const handleResolutionChange = (val: ImageResolution) => { 
        onStateChange({ resolution: val });
        if (val === 'Standard') onStateChange({ referenceImages: [] });
    };
    
    const handleFileSelect = (fileData: FileData | null) => onStateChange({ sourceImage: fileData, resultImages: [], upscaledImage: null });
    const handleReferenceFilesChange = (files: FileData[]) => onStateChange({ referenceImages: files });

    const getCostPerImage = () => {
        return resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5;
    };
    const unitCost = getCostPerImage();
    const cost = numberOfImages * unitCost;

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: `Bạn không đủ credits. Cần ${cost} credits.` });
             }
             return;
        }
        
        if (!customPrompt.trim()) { onStateChange({ error: 'Lời nhắc không được để trống.' }); return; }
        
        onStateChange({ isLoading: true, error: null, resultImages: [], upscaledImage: null });
        setStatusMessage('Đang tạo ảnh. Vui lòng đợi...');
        
        let jobId: string | null = null;
        let logId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Render kiến trúc (${numberOfImages} ảnh) - ${resolution}`);
            }
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                 jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.ArchitecturalRendering, prompt: customPrompt, cost: cost, usage_log_id: logId });
                 setActiveJobId(jobId);
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const promptForService = `You are a professional architectural renderer. ${sourceImage ? `Based on source image, generate ${aspectRatio} render.` : ''} ${customPrompt}, photorealistic, high detail.`;

            let lastError: any = null;

            const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                try {
                    const result = await externalVideoService.generateFlowImage(
                        promptForService,
                        [sourceImage, ...referenceImages].filter(Boolean) as FileData[], 
                        aspectRatio, 
                        1,
                        modelName,
                        (msg) => setStatusMessage(msg)
                    );

                    if (result.imageUrls && result.imageUrls.length > 0) {
                        let finalUrl = result.imageUrls[0];
                        const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds?.length > 0;

                        if (shouldUpscale) {
                            const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                            const upscaleRes = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                            if (upscaleRes.imageUrl) finalUrl = upscaleRes.imageUrl;
                        }
                        
                        return finalUrl;
                    }
                    return null;
                } catch (e) {
                    console.error(`Image generation ${index + 1} failed:`, e);
                    lastError = e;
                    return null;
                }
            });

            const results = await Promise.all(promises);
            const successfulUrls = results.filter((url): url is string => url !== null);
            const failedCount = numberOfImages - successfulUrls.length;

            if (successfulUrls.length > 0) {
                onStateChange({ resultImages: successfulUrls });
                successfulUrls.forEach(url => {
                    historyService.addToHistory({
                        tool: Tool.ArchitecturalRendering,
                        prompt: `Flow ${resolution}: ${customPrompt}`,
                        sourceImageURL: sourceImage?.objectURL,
                        resultImageURL: url,
                    });
                });

                if (jobId) await jobService.updateJobStatus(jobId, 'completed', successfulUrls[0]);

                if (failedCount > 0 && logId && user) {
                    const refundAmount = failedCount * unitCost;
                    await refundCredits(user.id, refundAmount, `Hoàn tiền: ${failedCount} ảnh lỗi`, logId);
                    onStateChange({ 
                        error: `Đã tạo thành công ${successfulUrls.length}/${numberOfImages} ảnh. Hệ thống đã hoàn lại ${refundAmount} credits cho ${failedCount} ảnh bị lỗi.` 
                    });
                }

            } else {
                if (lastError) throw lastError;
                throw new Error("Không thể tạo ảnh nào sau nhiều lần thử.");
            }

        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                onStateChange({ error: "Ảnh bị từ chối do vi phạm chính sách an toàn." });
            } else {
                onStateChange({ error: friendlyMsg });
            }
            
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
            
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi hệ thống toàn bộ (${rawMsg})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    const handleAutoPrompt = async () => {
        if (!sourceImage) return;
        setIsAutoPromptLoading(true);
        try {
            const newPrompt = await geminiService.generateArchitecturalPrompt(sourceImage);
            onStateChange({ customPrompt: newPrompt });
        } catch (err: any) {
            onStateChange({ error: "Không thể tạo prompt tự động." });
        } finally {
            setIsAutoPromptLoading(false);
        }
    };

    const handleDownload = async () => {
        const url = upscaledImage || resultImages[0];
        if (!url) return;
        setIsDownloading(true);
        await externalVideoService.forceDownload(url, "opzen-render.png");
        setIsDownloading(false);
    };

    const handleSendImageToSync = async (imageUrl: string) => {
        try { const fileData = await geminiService.getFileDataFromUrl(imageUrl); onSendToViewSync(fileData); } catch (e) { onStateChange({ error: "Lỗi chuyển ảnh." }); }
    };

    return (
        <div className="flex flex-col gap-8">
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl md:text-3xl font-bold text-text-primary dark:text-white">AI Render Kiến trúc</h2>
                <p className="text-sm md:text-base text-text-secondary dark:text-gray-400">Biến phác thảo thành hiện thực hoặc tạo ý tưởng mới từ mô tả văn bản.</p>
            </div>
            
            <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-4 md:p-6 rounded-xl border border-border-color dark:border-gray-700">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">1. Tải Lên Ảnh Phác Thảo (Sketch)</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL}/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">Ảnh Tham Chiếu (Tối đa 5 ảnh)</label>
                            {resolution === 'Standard' ? (
                                <div className="p-4 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 min-h-[120px]">
                                    <span className="material-symbols-outlined text-yellow-500 text-3xl">lock</span>
                                    <p className="text-sm text-text-secondary dark:text-gray-400">Ảnh tham chiếu chỉ hoạt động ở các bản Pro (1K trở lên).</p>
                                    <button onClick={() => handleResolutionChange('1K')} className="text-xs text-[#7f13ec] hover:underline font-semibold">Nâng cấp ngay</button>
                                </div>
                            ) : (
                                <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                            )}
                        </div>
                    </div>
                    <div className="space-y-4 flex flex-col">
                        <div className="relative">
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">2. Mô tả ý tưởng (Prompt)</label>
                            <textarea rows={4} className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-text-primary dark:text-gray-200 focus:ring-2 focus:ring-accent outline-none resize-none text-sm" placeholder="VD: Một ngôi nhà phố hiện đại, mặt tiền 5m, nhiều cây xanh..." value={customPrompt} onChange={(e) => onStateChange({ customPrompt: e.target.value })} disabled={isLoading} />
                            <button type="button" onClick={handleAutoPrompt} disabled={!sourceImage || isAutoPromptLoading || isLoading} className={`mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${!sourceImage || isAutoPromptLoading || isLoading ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed' : 'bg-[#334155] hover:bg-[#475569] text-white shadow-sm'}`}>
                                {isAutoPromptLoading ? <><Spinner /><span>Đang phân tích...</span></> : <><span className="material-symbols-outlined text-lg">auto_awesome</span><span>Tạo tự động Prompt</span></>}
                            </button>
                        </div>
                        <div className="pt-2">
                            <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">3. Tinh chỉnh chi tiết</label>
                            <div className="space-y-4">
                                <OptionSelector id="building-type-selector" label="Loại công trình" options={buildingTypeOptions} value={buildingType} onChange={handleBuildingTypeChange} disabled={isLoading} variant="grid" />
                                <OptionSelector id="style-selector" label="Phong cách" options={styleOptions} value={style} onChange={handleStyleChange} disabled={isLoading} variant="grid" />
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    <OptionSelector id="context-selector" label="Bối cảnh" options={contextOptions} value={context} onChange={handleContextChange} disabled={isLoading} variant="select" />
                                    <OptionSelector id="lighting-selector" label="Ánh sáng" options={lightingOptions} value={lighting} onChange={handleLightingChange} disabled={isLoading} variant="select" />
                                    <OptionSelector id="weather-selector" label="Thời tiết" options={weatherOptions} value={weather} onChange={handleWeatherChange} disabled={isLoading} variant="select" />
                                </div>
                            </div>
                        </div>
                        <div className="pt-4 grid grid-cols-2 gap-4">
                            <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({numberOfImages: val})} disabled={isLoading} />
                            <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({aspectRatio: val})} disabled={isLoading} />
                        </div>
                        <div className="pt-4"><ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} /></div>
                    </div>
                </div>

                <div className="mt-4">
                    <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mb-3 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                            <span className="material-symbols-outlined text-yellow-500 text-lg">monetization_on</span>
                            <span>Chi phí: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                        </div>
                        <div className="text-xs">{userCredits < cost ? <span className="text-red-500 font-semibold">Không đủ (Có: {userCredits})</span> : <span className="text-green-600 dark:text-green-400">Khả dụng: {userCredits}</span>}</div>
                    </div>
                    <button onClick={handleGenerate} disabled={isLoading || !customPrompt.trim()} className="w-full flex justify-center items-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg shadow-lg">
                        {isLoading ? <><Spinner /> {statusMessage || 'Đang xử lý...'}</> : `Bắt đầu Render`}
                    </button>
                    {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-300 rounded-lg text-sm">{error}</div>}
                </div>
            </div>

            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-text-primary dark:text-white">Kết quả</h3>
                    {resultImages.length === 1 && (
                        <div className="flex items-center gap-2">
                            <button onClick={() => handleSendImageToSync(resultImages[0])} className="text-accent-600 bg-accent-50 hover:bg-accent-100 px-3 py-1.5 rounded-lg text-sm font-medium border border-accent-200">Đồng bộ View</button>
                            <button onClick={handleDownload} disabled={isDownloading} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2">
                                {isDownloading ? <Spinner /> : null} Tải xuống
                            </button>
                        </div>
                    )}
                </div>
                <div className="w-full aspect-[4/3] bg-gray-100 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center overflow-hidden relative">
                    {isLoading && (
                        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                            <div className="w-16 h-16 border-4 border-accent-200 border-t-accent-600 rounded-full animate-spin mb-4"></div>
                            <p className="text-accent-600 dark:text-accent-400 font-medium animate-pulse">{statusMessage || 'Đang xử lý...'}</p>
                        </div>
                    )}
                    {!isLoading && resultImages.length === 1 && sourceImage && <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[0]} />}
                    {!isLoading && resultImages.length === 1 && !sourceImage && <img src={resultImages[0]} className="w-full h-full object-contain" />}
                    {!isLoading && resultImages.length > 1 && <ResultGrid images={resultImages} toolName="architecture-render" onSendToViewSync={handleSendImageToSync} />}
                    {!isLoading && resultImages.length === 0 && <div className="text-center opacity-50"><p className="text-gray-500">Kết quả render sẽ xuất hiện ở đây</p></div>}
                </div>
            </div>
        </div>
    );
};

export default ImageGenerator;
