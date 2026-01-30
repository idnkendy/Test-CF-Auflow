
import React, { useState, useMemo, useEffect } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { AITechnicalDrawingsState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import AspectRatioSelector from './common/AspectRatioSelector';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import SafetyWarningModal from './common/SafetyWarningModal';
import { useLanguage } from '../hooks/useLanguage';

interface AITechnicalDrawingsProps {
    state: AITechnicalDrawingsState;
    onStateChange: (newState: Partial<AITechnicalDrawingsState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

const AITechnicalDrawings: React.FC<AITechnicalDrawingsProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { sourceImage, isLoading, error, resultImages = [], numberOfImages = 1, resolution, aspectRatio, prompt } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false); 
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

    useEffect(() => {
        const viDefault = 'Tạo một bảng trình bày kiến trúc (architectural presentation board) sử dụng thiết kế của tòa nhà này. Tạo các bản vẽ đặc trưng gồm: mặt bằng, mặt cắt, phối cảnh trục đo axonometric và 5 sơ đồ diễn tiến khối (massing evolution) từng bước. Tạo thêm các cảnh khác, nội thất, mặt đứng và khiến bảng trình bày trở nên mạch lạc và thu hút bằng bố cục và phần chữ được sắp xếp hợp lý.';
        const enDefault = 'Create an architectural presentation board using the design of this building. Generate characteristic drawings including: floor plans, sections, axonometric perspectives, and 5 step-by-step massing evolution diagrams. Add other views, interiors, elevations, and make the presentation coherent and attractive with well-arranged layout and typography.';
        
        // Cập nhật prompt nếu nó đang trống hoặc khớp với giá trị cũ (để hỗ trợ chuyển đổi ngôn ngữ)
        if (!prompt || prompt.length < 20 || prompt.includes('bản vẽ chiếu vuông góc') || prompt.includes('orthogonal drawing')) {
             onStateChange({ prompt: language === 'vi' ? viDefault : enDefault });
        }
    }, [language]);

    const cost = numberOfImages * (resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5);

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             return;
        }
        if (!sourceImage) return;

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));

        const fullPrompt = `Architectural Technical Presentation Task: ${prompt}. Use the source image as design base. Ensure professional clean architectural lines and coherent board layout.`;

        try {
            if (onDeductCredits) await onDeductCredits(cost, `Tạo bản vẽ kỹ thuật - ${resolution}`);
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            
            const result = await externalVideoService.generateFlowImage(
                fullPrompt, [sourceImage], aspectRatio, numberOfImages, modelName,
                (msg) => setStatusMessage(msg)
            );

            if (result.imageUrls) {
                onStateChange({ resultImages: result.imageUrls });
                result.imageUrls.forEach(url => historyService.addToHistory({ tool: Tool.AITechnicalDrawings, prompt: fullPrompt, sourceImageURL: sourceImage.objectURL, resultImageURL: url }));
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
        if (resultImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImages[selectedIndex], `technical-${Date.now()}.png`);
            setIsDownloading(false);
        }
    };

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, resultImages: [] });
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
            
            {/* SIDEBAR */}
            <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="p-3 space-y-4 flex-1 overflow-y-auto custom-sidebar-scroll">
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.tech.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                    </div>

                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.tech.step2')}</label>
                            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                                <textarea rows={8} className="w-full bg-transparent outline-none text-sm resize-none font-medium text-text-primary dark:text-white" placeholder="Yêu cầu kỹ thuật..." value={prompt || ''} onChange={(e) => onStateChange({ prompt: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} />
                        <ResolutionSelector value={resolution} onChange={(v) => onStateChange({ resolution: v })} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(v) => onStateChange({ numberOfImages: v })} />
                    </div>
                </div>

                <div className="sticky bottom-0 w-full bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] p-4 z-40 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base">
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('ext.tech.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-0">
                        {resultImages.length > 0 ? (
                            <div className="w-full h-full p-2 animate-fade-in flex flex-col items-center justify-center relative">
                                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                                    {sourceImage ? (
                                        <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[selectedIndex]} />
                                    ) : (
                                        <img src={resultImages[selectedIndex]} alt="Result" className="max-w-full max-h-full object-contain" />
                                    )}
                                </div>
                                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                    <button onClick={handleDownload} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">download</span></button>
                                    <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">zoom_in</span></button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center py-40 opacity-20 select-none bg-main-bg dark:bg-[#121212] flex-grow">
                                <span className="material-symbols-outlined text-6xl mb-4">architecture</span>
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

                    {resultImages.length > 0 && !isLoading && (
                        <div className="flex-shrink-0 w-full p-2 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839]">
                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center">
                                {resultImages.map((url, idx) => (
                                    <button key={url} onClick={() => setSelectedIndex(idx)} className={`flex-shrink-0 w-16 sm:w-20 aspect-square rounded-lg border-2 transition-all overflow-hidden ${selectedIndex === idx ? 'border-[#7f13ec] ring-2 ring-purple-500/20 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                                        <img src={url} className="w-full h-full object-cover" alt={`Result ${idx + 1}`} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AITechnicalDrawings;
