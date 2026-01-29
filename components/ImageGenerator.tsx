
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
import { useLanguage } from '../hooks/useLanguage';

interface ImageGeneratorProps {
  state: ImageGeneratorState;
  onStateChange: (newState: Partial<ImageGeneratorState>) => void;
  onSendToViewSync: (image: FileData) => void;
  userCredits?: number;
  onDeductCredits?: (amount: number, description: string) => Promise<string>;
  onInsufficientCredits?: () => void;
}

const ImageGenerator: React.FC<ImageGeneratorProps> = ({ state, onStateChange, onSendToViewSync, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { 
        style, context, lighting, weather, buildingType, customPrompt, referenceImages, 
        sourceImage, isLoading, isUpscaling, error, resultImages, upscaledImage, 
        numberOfImages, aspectRatio, resolution 
    } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

    const buildingTypeOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.building.townhouse'), label: t('opt.building.townhouse') },
        { value: t('opt.building.villa'), label: t('opt.building.villa') },
        { value: t('opt.building.level4'), label: t('opt.building.level4') },
        { value: t('opt.building.apartment'), label: t('opt.building.apartment') },
        { value: t('opt.building.office'), label: t('opt.building.office') },
        { value: t('opt.building.cafe'), label: t('opt.building.cafe') },
        { value: t('opt.building.restaurant'), label: t('opt.building.restaurant') },
    ], [t]);

    const styleOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.style.modern'), label: t('opt.style.modern') },
        { value: t('opt.style.minimalist'), label: t('opt.style.minimalist') },
        { value: t('opt.style.neoclassic'), label: t('opt.style.neoclassic') },
        { value: t('opt.style.scandinavian'), label: t('opt.style.scandinavian') },
        { value: t('opt.style.industrial'), label: t('opt.style.industrial') },
        { value: t('opt.style.tropical'), label: t('opt.style.tropical') },
        { value: t('opt.style.brutalism'), label: t('opt.style.brutalism') },
    ], [t]);

    const contextOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.context.street_vn'), label: t('opt.context.street_vn') },
        { value: t('opt.context.rural_vn'), label: t('opt.context.rural_vn') },
        { value: t('opt.context.urban'), label: t('opt.context.urban') },
        { value: t('opt.context.intersection_3'), label: t('opt.context.intersection_3') },
        { value: t('opt.context.intersection_4'), label: t('opt.context.intersection_4') },
    ], [t]);

    const lightingOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.lighting.sunrise'), label: t('opt.lighting.sunrise') },
        { value: t('opt.lighting.noon'), label: t('opt.lighting.noon') },
        { value: t('opt.lighting.sunset'), label: t('opt.lighting.sunset') },
        { value: t('opt.lighting.evening'), label: t('opt.lighting.evening') },
        { value: t('opt.lighting.night_stars'), label: t('opt.lighting.night_stars') },
    ], [t]);

    const weatherOptions = useMemo(() => [
        { value: 'none', label: t('opt.none') },
        { value: t('opt.weather.sunny'), label: t('opt.weather.sunny') },
        { value: t('opt.weather.rainy'), label: t('opt.weather.rainy') },
        { value: t('opt.weather.snowy'), label: t('opt.weather.snowy') },
        { value: t('opt.weather.scorching'), label: t('opt.weather.scorching') },
        { value: t('opt.weather.after_rain'), label: t('opt.weather.after_rain') },
    ], [t]);

    const handleBuildingTypeChange = (newVal: string) => onStateChange({ buildingType: newVal });
    const handleStyleChange = (newVal: string) => onStateChange({ style: newVal });
    const handleContextChange = (newVal: string) => onStateChange({ context: newVal });
    const handleLightingChange = (newVal: string) => onStateChange({ lighting: newVal });
    const handleWeatherChange = (newVal: string) => onStateChange({ weather: newVal });
    
    const handleResolutionChange = (val: ImageResolution) => { 
        onStateChange({ resolution: val });
        if (val === 'Standard') onStateChange({ referenceImages: [] });
    };
    
    const handleFileSelect = (fileData: FileData | null) => onStateChange({ sourceImage: fileData, resultImages: [], upscaledImage: null });
    const handleReferenceFilesChange = (files: FileData[]) => onStateChange({ referenceImages: files });

    const cost = numberOfImages * (resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5);

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             else onStateChange({ error: t('common.insufficient') });
             return;
        }
        if (!customPrompt.trim()) return;
        onStateChange({ isLoading: true, error: null, resultImages: [], upscaledImage: null });
        setStatusMessage(t('common.processing'));
        
        try {
            const logId = onDeductCredits ? await onDeductCredits(cost, `Render kiến trúc`) : null;
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const promptForService = `Professional architectural render. ${customPrompt}`;

            const result = await externalVideoService.generateFlowImage(
                promptForService,
                [sourceImage, ...referenceImages].filter(Boolean) as FileData[], 
                aspectRatio, 
                numberOfImages,
                modelName,
                (msg) => setStatusMessage(msg)
            );

            if (result.imageUrls) {
                onStateChange({ resultImages: result.imageUrls });
                result.imageUrls.forEach(url => historyService.addToHistory({ tool: Tool.ArchitecturalRendering, prompt: customPrompt, sourceImageURL: sourceImage?.objectURL, resultImageURL: url }));
            }
        } catch (err: any) {
            onStateChange({ error: t('common.error') });
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleDownload = async () => {
        if (resultImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImages[selectedIndex], "render.png");
            setIsDownloading(false);
        }
    };

    const handleSendImageToSync = async (imageUrl: string) => {
        const fileData = await geminiService.getFileDataFromUrl(imageUrl);
        onSendToViewSync(fileData);
    };

    return (
        <div className="relative flex flex-col gap-6 md:gap-8 max-w-[1920px] mx-auto items-stretch px-2 sm:px-4 pb-32">
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-start">
                {/* SIDEBAR - Cài đặt */}
                <aside className="w-full lg:w-1/3 xl:w-[30%] flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-border-color dark:border-[#302839]">
                        <h2 className="text-xl font-bold text-text-primary dark:text-white">{t('img_gen.title')}</h2>
                        <p className="text-xs text-text-secondary dark:text-gray-400">{t('img_gen.subtitle')}</p>
                    </div>

                    <div className="p-5 space-y-5">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">{t('img_gen.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">{t('img_gen.ref_images')}</label>
                            <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                        </div>

                        <div className="p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-black/20">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">{t('img_gen.step2')}</label>
                            <textarea rows={3} className="w-full bg-transparent outline-none text-sm resize-none" placeholder={t('img_gen.prompt_placeholder')} value={customPrompt} onChange={(e) => onStateChange({ customPrompt: e.target.value })} />
                        </div>

                        <div className="space-y-4">
                            <OptionSelector id="b-type" label={t('opt.building_type')} options={buildingTypeOptions} value={buildingType} onChange={handleBuildingTypeChange} variant="select" />
                            <OptionSelector id="style" label={t('opt.style')} options={styleOptions} value={style} onChange={handleStyleChange} variant="select" />
                            <div className="grid grid-cols-2 gap-3">
                                <OptionSelector id="lt" label={t('opt.lighting')} options={lightingOptions} value={lighting} onChange={handleLightingChange} variant="select" />
                                <OptionSelector id="wt" label={t('opt.weather')} options={weatherOptions} value={weather} onChange={handleWeatherChange} variant="select" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({aspectRatio: val})} />
                            <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                            <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({numberOfImages: val})} />
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT - Kết quả */}
                <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-0 flex flex-col h-full items-start">
                        
                        {/* Image Area */}
                        <div className="w-full bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex flex-col items-start min-h-[400px] lg:min-h-[600px]">
                            {resultImages.length > 0 ? (
                                <div className="w-full p-0 animate-fade-in flex flex-col items-start relative">
                                    <div className="w-full min-h-[400px] lg:min-h-[600px] flex items-center justify-center">
                                        {sourceImage ? (
                                            <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[selectedIndex]} />
                                        ) : (
                                            <img src={resultImages[selectedIndex]} alt="Result" className="max-w-full max-h-[80vh] object-contain" />
                                        )}
                                    </div>
                                    
                                    {/* Action Buttons Overlay */}
                                    <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                        <button onClick={() => handleSendImageToSync(resultImages[selectedIndex])} className="p-2.5 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-purple-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined">view_in_ar</span></button>
                                        <button onClick={handleDownload} className="p-2.5 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined">download</span></button>
                                        <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="p-2.5 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined">zoom_in</span></button>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center py-60 opacity-20 select-none">
                                    <span className="material-symbols-outlined text-6xl mb-4">photo_library</span>
                                    <p className="text-base font-medium">{t('msg.no_result_render')}</p>
                                </div>
                            )}

                            {isLoading && (
                                <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
                                    <Spinner />
                                    <p className="text-white mt-4 font-bold animate-pulse">{statusMessage}</p>
                                </div>
                            )}
                        </div>

                        {/* Thumbnail List */}
                        {resultImages.length > 0 && !isLoading && (
                            <div className="w-full p-3 sm:p-4 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839]">
                                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                                    {resultImages.map((url, idx) => (
                                        <button 
                                            key={url} 
                                            onClick={() => setSelectedIndex(idx)} 
                                            className={`flex-shrink-0 w-24 sm:w-32 aspect-video rounded-lg border-2 transition-all overflow-hidden ${
                                                selectedIndex === idx 
                                                    ? 'border-[#7f13ec] ring-2 ring-purple-500/20 scale-105' 
                                                    : 'border-transparent opacity-60 hover:opacity-100'
                                            }`}
                                        >
                                            <img src={url} className="w-full h-full object-cover" alt={`Result ${idx + 1}`} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* FLOATING RENDER BUBBLE - STICKY BOTTOM LEFT OF SCREEN (Fixed Viewport via Portal) */}
            {createPortal(
                <div className="fixed bottom-0 left-0 w-full z-[100] pointer-events-none">
                    {/* Padding wrapper to match main content padding in App.tsx (approximately) */}
                    <div className="px-3 sm:px-6 lg:px-8 pb-0">
                        {/* Constraints matching the ImageGenerator content */}
                        <div className="max-w-[1920px] mx-auto px-2 sm:px-4 pb-2">
                            <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-end">
                                <div className="w-full lg:w-1/3 xl:w-[30%] pointer-events-auto">
                                     <div className="w-full animate-slide-up">
                                         <div className="bg-white/90 dark:bg-[#1A1A1A]/95 backdrop-blur-2xl border border-border-color dark:border-[#302839] p-2 pr-2 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.25)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex items-center justify-between gap-3">
                                            
                                            {/* Cost Info */}
                                            <div className="flex items-center gap-4 pl-4 py-1">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 uppercase font-black tracking-widest opacity-70">
                                                        <span className="material-symbols-outlined text-yellow-500 text-[14px]">monetization_on</span>
                                                        {t('common.cost')}
                                                    </div>
                                                    <span className="text-sm font-black text-gray-900 dark:text-white leading-tight">{cost} Credits</span>
                                                </div>
                                                
                                                <div className="h-8 w-px bg-gray-200 dark:bg-gray-700/50"></div>
                                                
                                                <div className="flex flex-col">
                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-black tracking-widest opacity-70 mb-0.5">{t('common.available')}</div>
                                                    <span className="text-sm font-black text-purple-600 dark:text-purple-400 leading-tight">{userCredits}</span>
                                                </div>
                                            </div>
                                            
                                            {/* Render Button */}
                                            <button 
                                                onClick={handleGenerate} 
                                                disabled={isLoading || !customPrompt.trim()} 
                                                className="relative group overflow-hidden bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-3 px-6 rounded-[18px] transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 flex-1 max-w-[200px]"
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                                                {isLoading ? (
                                                    <><Spinner /> <span className="text-xs uppercase tracking-widest font-black">{t('common.processing')}</span></>
                                                ) : (
                                                    <><span className="material-symbols-outlined text-lg">rocket_launch</span> <span className="text-xs uppercase tracking-widest font-black">{t('common.start_render')}</span></>
                                                )}
                                            </button>
                                         </div>
                                         {error && <div className="mt-2 text-[10px] text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded-xl border border-red-200 dark:border-red-800 text-center font-bold shadow-sm">{error}</div>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                @keyframes shimmer {
                    100% { transform: translateX(100%); }
                }
                @keyframes slide-up {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-slide-up {
                    animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
        </div>
    );
};

export default ImageGenerator;
