
import React, { useState, useEffect } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { SketchConverterState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService'; 
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import OptionSelector from './common/OptionSelector';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import AspectRatioSelector from './common/AspectRatioSelector';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import SafetyWarningModal from './common/SafetyWarningModal';
import { useLanguage } from '../hooks/useLanguage';

interface SketchConverterProps {
    state: SketchConverterState;
    onStateChange: (newState: Partial<SketchConverterState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

const SketchConverter: React.FC<SketchConverterProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { sourceImage, isLoading, error, resultImage, sketchStyle, detailLevel, resolution, aspectRatio } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);

    const sketchStyleOptions = [
        { value: 'pencil', label: language === 'vi' ? 'Chì (Pencil)' : 'Pencil' },
        { value: 'charcoal', label: language === 'vi' ? 'Than (Charcoal)' : 'Charcoal' },
        { value: 'watercolor', label: language === 'vi' ? 'Màu nước (Watercolor)' : 'Watercolor' },
    ];

    const detailLevelOptions = [
        { value: 'medium', label: language === 'vi' ? 'Trung bình' : 'Medium' },
        { value: 'high', label: language === 'vi' ? 'Chi tiết cao' : 'High' },
    ];

    const cost = resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5;

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, resultImage: null });
    };

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             return;
        }
        if (!sourceImage) return;

        onStateChange({ isLoading: true, error: null, resultImage: null });
        setStatusMessage(t('common.processing'));

        const styleText = sketchStyle === 'pencil' ? 'pencil sketch' : sketchStyle === 'charcoal' ? 'charcoal drawing' : 'watercolor painting';
        const detailText = detailLevel === 'high' ? 'highly detailed, intricate' : 'loose, artistic';
        const fullPrompt = `Convert this image into a ${styleText}. Style: ${detailText}. Professional architectural rendering style.`;

        try {
            if (onDeductCredits) await onDeductCredits(cost, `Sketch Converter (${sketchStyle}) - ${resolution}`);
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            
            const result = await externalVideoService.generateFlowImage(
                fullPrompt, [sourceImage], aspectRatio, 1, modelName,
                (msg) => setStatusMessage(msg)
            );

            if (result.imageUrls?.length) {
                const resultUrl = result.imageUrls[0];
                onStateChange({ resultImage: resultUrl });
                historyService.addToHistory({ tool: Tool.SketchConverter, prompt: fullPrompt, sourceImageURL: sourceImage.objectURL, resultImageURL: resultUrl });
            }
        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") setShowSafetyModal(true);
            else onStateChange({ error: t(friendlyKey) });
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleDownload = async () => {
        if (resultImage) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImage, `sketch-${Date.now()}.png`);
            setIsDownloading(false);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 md:gap-8 max-w-[1920px] mx-auto items-stretch px-2 sm:px-4">
            <style>{`
                .custom-sidebar-scroll::-webkit-scrollbar { width: 5px; }
                .custom-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #334155; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
                @keyframes scale-up { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
                .animate-scale-up { animation: scale-up 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            `}</style>

            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="p-3 space-y-4 flex-1 overflow-y-auto custom-sidebar-scroll">
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.sketch.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                    </div>
                    
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <OptionSelector id="sketch-style" label={t('ext.sketch.style')} options={sketchStyleOptions} value={sketchStyle} onChange={(v) => onStateChange({ sketchStyle: v as any })} variant="select" />
                        <OptionSelector id="detail-level" label={t('ext.sketch.detail')} options={detailLevelOptions} value={detailLevel} onChange={(v) => onStateChange({ detailLevel: v as any })} variant="select" />
                    </div>
                    
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        <AspectRatioSelector value={aspectRatio} onChange={(v) => onStateChange({ aspectRatio: v })} />
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                    </div>
                </div>

                <div className="sticky bottom-0 w-full bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] p-4 z-40 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base">
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('ext.sketch.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-0">
                        {resultImage ? (
                            <div className="w-full h-full p-2 animate-fade-in flex flex-col items-center justify-center relative">
                                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                                    {sourceImage ? (
                                        <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImage} />
                                    ) : (
                                        <img src={resultImage} alt="Result" className="max-w-full max-h-full object-contain" />
                                    )}
                                </div>
                                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                    <button onClick={handleDownload} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">download</span></button>
                                    <button onClick={() => setPreviewImage(resultImage)} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">zoom_in</span></button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center py-40 opacity-20 select-none bg-main-bg dark:bg-[#121212] flex-grow">
                                <span className="material-symbols-outlined text-6xl mb-4">edit_square</span>
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
                </div>
            </main>
        </div>
    );
};

export default SketchConverter;
