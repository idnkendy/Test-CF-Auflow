
import React, { useState, useCallback } from 'react';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { LandscapeRenderingState } from '../state/toolState';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
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

const gardenStyleOptions = [
    { value: 'none', label: 'Tự động' },
    { value: 'vườn Zen Nhật Bản', label: 'Zen Nhật Bản' },
    { value: 'vườn nhiệt đới rậm rạp', label: 'Nhiệt đới' },
    { value: 'sân vườn Anh Quốc cổ điển', label: 'Anh Quốc' },
    { value: 'sân vườn hiện đại, tối giản', label: 'Hiện đại' },
    { value: 'vườn Địa Trung Hải', label: 'Địa Trung Hải' },
    { value: 'vườn làng quê Việt Nam', label: 'Quê Việt Nam' },
];

const timeOfDayOptions = [
    { value: 'none', label: 'Tự động' },
    { value: 'ban ngày nắng đẹp', label: 'Nắng đẹp' },
    { value: 'hoàng hôn (giờ vàng)', label: 'Hoàng hôn' },
    { value: 'ban đêm với đèn sân vườn', label: 'Ban đêm' },
    { value: 'ngày u ám, nhiều mây', label: 'U ám' },
    { value: 'sau cơn mưa, mặt đất ẩm ướt', label: 'Sau mưa' },
];

const featureOptions = [
    { value: 'none', label: 'Tự động' },
    { value: 'có một hồ cá Koi nhỏ', label: 'Hồ cá Koi' },
    { value: 'có lối đi bằng đá cuội', label: 'Lối đi đá' },
    { value: 'có một giàn hoa giấy', label: 'Giàn hoa' },
    { value: 'có khu vực BBQ ngoài trời', label: 'Khu BBQ' },
    { value: 'có một thác nước nhỏ', label: 'Thác nước' },
    { value: 'có nhiều loại hoa đầy màu sắc', label: 'Vườn hoa' },
];

interface LandscapeRenderingProps {
  state: LandscapeRenderingState;
  onStateChange: (newState: Partial<LandscapeRenderingState>) => void;
  onSendToViewSync: (image: FileData) => void;
  userCredits?: number;
  onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

const LandscapeRendering: React.FC<LandscapeRenderingProps> = ({ state, onStateChange, onSendToViewSync, userCredits, onDeductCredits }) => {
    const { 
        gardenStyle, timeOfDay, features, customPrompt, referenceImages, 
        sourceImage, isLoading, isUpscaling, error, resultImages, upscaledImage, 
        numberOfImages, aspectRatio, resolution
    } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const escapeRegExp = (string: string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const updatePrompt = useCallback((type: 'gardenStyle' | 'timeOfDay' | 'features', newValue: string, oldValue: string) => {
        const getPromptPart = (partType: string, value: string): string => {
            if (value === 'none' || !value) return '';
            switch (partType) {
                case 'gardenStyle': return `theo phong cách ${value}`;
                case 'timeOfDay': return `vào lúc ${value}`;
                case 'features': return `và ${value}`;
                default: return '';
            }
        };

        const oldPart = getPromptPart(type, oldValue);
        const newPart = getPromptPart(type, newValue);
        
        let nextPrompt = customPrompt;

        if (oldPart && nextPrompt.includes(oldPart)) {
             const escapedOldPart = escapeRegExp(oldPart);
             nextPrompt = newPart 
                ? nextPrompt.replace(oldPart, newPart) 
                : nextPrompt.replace(new RegExp(`,?\\s*${escapedOldPart}`), '').replace(new RegExp(`${escapedOldPart},?\\s*`), '');
        } else if (newPart) {
            nextPrompt = nextPrompt.trim() ? `${nextPrompt}, ${newPart}` : newPart;
        }

        const cleanedPrompt = nextPrompt
            .replace(/,+/g, ',')
            .split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .join(', ');
            
        onStateChange({ customPrompt: cleanedPrompt });

    }, [customPrompt, onStateChange]);

    const handleGardenStyleChange = (newVal: string) => {
        updatePrompt('gardenStyle', newVal, gardenStyle);
        onStateChange({ gardenStyle: newVal });
    };

    const handleTimeOfDayChange = (newVal: string) => {
        updatePrompt('timeOfDay', newVal, timeOfDay);
        onStateChange({ timeOfDay: newVal });
    };

    const handleFeaturesChange = (newVal: string) => {
        updatePrompt('features', newVal, features);
        onStateChange({ features: newVal });
    };

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
    };

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ 
            sourceImage: fileData, 
            resultImages: [], 
            upscaledImage: null 
        });
    }

    const handleReferenceFilesChange = (files: FileData[]) => {
        onStateChange({ referenceImages: files });
    };

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
        if (onDeductCredits && (userCredits || 0) < cost) {
             onStateChange({ error: `Bạn không đủ credits. Cần ${cost} credits.` });
             return;
        }

        if (!customPrompt.trim()) {
            onStateChange({ error: 'Lời nhắc không được trống.' });
            return;
        }
        onStateChange({ isLoading: true, error: null, resultImages: [], upscaledImage: null });
        
        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Render sân vườn (${numberOfImages} ảnh) - ${resolution || 'Standard'}`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                 jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.LandscapeRendering,
                    prompt: customPrompt,
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            let imageUrls: string[] = [];
            let promptForService = "";
            if (sourceImage) {
                promptForService = `Generate a photorealistic landscape/garden rendering with a strict aspect ratio of ${aspectRatio}. Develop the provided sketch/photo into a complete 3D scene. The main creative instruction is: ${customPrompt}`;
                if (referenceImages && referenceImages.length > 0) {
                    promptForService += ` Also, take aesthetic inspiration from the provided reference image(s).`;
                }
            } else {
                promptForService = `${customPrompt}, photorealistic landscape rendering, detailed garden design, masterpiece`;
            }

            if (resolution === '1K' || resolution === '2K' || resolution === '4K') {
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(promptForService, aspectRatio, resolution, sourceImage || undefined, undefined, referenceImages);
                    return images[0];
                });
                imageUrls = await Promise.all(promises);
            } 
            else {
                if (sourceImage && referenceImages && referenceImages.length > 0) {
                    const results = await geminiService.editImageWithMultipleReferences(promptForService, sourceImage, referenceImages, numberOfImages);
                    imageUrls = results.map(r => r.imageUrl);
                } else {
                    imageUrls = await geminiService.generateStandardImage(promptForService, aspectRatio, numberOfImages, sourceImage || undefined);
                }
            }
            
            onStateChange({ resultImages: imageUrls });
            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);
            
            imageUrls.forEach(url => {
                historyService.addToHistory({
                    tool: Tool.LandscapeRendering,
                    prompt: customPrompt,
                    sourceImageURL: sourceImage?.objectURL,
                    resultImageURL: url,
                });
            });

        } catch (err: any) {
            let errorMessage = err.message || 'Đã xảy ra lỗi.';
            if (logId) errorMessage += " (Credits đã được hoàn lại)";
            onStateChange({ error: errorMessage });
            
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi render sân vườn (${err.message})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleUpscale = async () => {
        if (resultImages.length !== 1) return;
        const resultImage = resultImages[0];
        onStateChange({ isUpscaling: true, error: null });
        try {
            const imageToUpscale = await geminiService.getFileDataFromUrl(resultImage);
            const upscalePrompt = "Upscale this landscape rendering to a high resolution.";
            const result = await geminiService.editImage(upscalePrompt, imageToUpscale, 1);
            onStateChange({ upscaledImage: result[0].imageUrl });
        } catch (err: any) {
            onStateChange({ error: err.message || "Failed to upscale." });
        } finally {
            onStateChange({ isUpscaling: false });
        }
    };

    const handleDownload = () => {
        const url = upscaledImage || (resultImages.length > 0 ? resultImages[0] : null);
        if (!url) return;
        const link = document.createElement('a'); link.href = url; link.download = "landscape-render.png";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const handleSendImageToSync = async (imageUrl: string) => {
        try {
            const fileData = await geminiService.getFileDataFromUrl(imageUrl);
            onSendToViewSync(fileData);
        } catch (e) {
            onStateChange({ error: "Không thể chuyển ảnh." });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            <div>
                <h2 className="text-2xl font-bold text-text-primary dark:text-white mb-4">AI Render Sân vườn & Tiểu cảnh</h2>
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">1. Tải Lên Ảnh Phác Thảo</label>
                                <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL}/>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">Ảnh Tham Chiếu</label>
                                <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                            </div>
                        </div>
                         <div className="space-y-4 flex flex-col">
                             <div>
                                <label htmlFor="custom-prompt-landscape" className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">2. Mô tả yêu cầu</label>
                                <textarea id="custom-prompt-landscape" rows={4} className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-text-primary dark:text-gray-200 focus:ring-2 focus:ring-accent outline-none" value={customPrompt} onChange={(e) => onStateChange({ customPrompt: e.target.value })} disabled={isLoading} />
                             </div>
                            <div className="pt-2">
                                <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">3. Tinh chỉnh</label>
                                <div className="space-y-4">
                                    <OptionSelector id="style-selector" label="Phong cách vườn" options={gardenStyleOptions} value={gardenStyle} onChange={handleGardenStyleChange} disabled={isLoading} variant="grid" />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <OptionSelector id="time-selector" label="Thời gian" options={timeOfDayOptions} value={timeOfDay} onChange={handleTimeOfDayChange} disabled={isLoading} variant="select" />
                                        <OptionSelector id="feature-selector" label="Thêm chi tiết" options={featureOptions} value={features} onChange={handleFeaturesChange} disabled={isLoading} variant="select" />
                                    </div>
                                </div>
                            </div>
                            <div className="pt-4 grid grid-cols-2 gap-4">
                                <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({numberOfImages: val})} disabled={isLoading} />
                                <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({aspectRatio: val})} disabled={isLoading} />
                            </div>
                            <div className="pt-4">
                                <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} />
                            </div>
                        </div>
                    </div>
                    <div className="mt-4">
                         <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 mb-3 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>Chi phí: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                            </div>
                            <div className="text-xs">
                                {userCredits && userCredits < cost ? <span className="text-red-500 font-semibold">Không đủ</span> : <span className="text-green-600">Khả dụng: {userCredits}</span>}
                            </div>
                        </div>
                        <button onClick={handleGenerate} disabled={isLoading || !customPrompt.trim() || isUpscaling || ((userCredits || 0) < cost)} className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold rounded-lg transition-colors">
                           {isLoading ? <Spinner /> : 'Bắt đầu Render'}
                        </button>
                    </div>
                    {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}
                </div>
            </div>
             <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold text-text-primary dark:text-white">Kết quả</h3>
                    <div className="flex items-center gap-2">
                        {resultImages.length === 1 && (
                             <>
                                <button onClick={() => handleSendImageToSync(upscaledImage || resultImages[0])} className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold">Đồng bộ</button>
                                <button onClick={() => setPreviewImage(upscaledImage || resultImages[0])} className="bg-gray-600 text-white p-2 rounded-lg"><span className="material-symbols-outlined">zoom_in</span></button>
                                 <button onClick={handleDownload} className="bg-gray-600 text-white px-4 py-1.5 rounded-lg text-sm">Tải xuống</button>
                            </>
                        )}
                    </div>
                </div>
                <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                    {isLoading && <Spinner />}
                    {!isLoading && upscaledImage && resultImages.length === 1 && <ImageComparator originalImage={resultImages[0]} resultImage={upscaledImage} />}
                    {!isLoading && !upscaledImage && resultImages.length === 1 && sourceImage && <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[0]} />}
                    {!isLoading && !upscaledImage && resultImages.length === 1 && !sourceImage && <img src={resultImages[0]} className="w-full h-full object-contain" />}
                    {!isLoading && resultImages.length > 1 && <ResultGrid images={resultImages} toolName="landscape-render" onSendToViewSync={handleSendImageToSync} />}
                </div>
              </div>
        </div>
    );
};

export default LandscapeRendering;
