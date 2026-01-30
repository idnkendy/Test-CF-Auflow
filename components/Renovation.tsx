
import React, { useState, useMemo, useEffect } from 'react';
import { FileData, Tool, AspectRatio, ImageResolution } from '../types';
import { RenovationState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import AspectRatioSelector from './common/AspectRatioSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import MaskingModal from './MaskingModal';
import ResolutionSelector from './common/ResolutionSelector';
import MultiImageUpload from './common/MultiImageUpload';
import OptionSelector from './common/OptionSelector';
import SafetyWarningModal from './common/SafetyWarningModal';
import { useLanguage } from '../hooks/useLanguage';

interface RenovationProps {
    state: RenovationState;
    onStateChange: (newState: Partial<RenovationState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

const Renovation: React.FC<RenovationProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { prompt, sourceImage, referenceImages, maskImage, isLoading, error, renovatedImages, numberOfImages, aspectRatio, resolution } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isMaskingModalOpen, setIsMaskingModalOpen] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        if (renovatedImages.length > 0) setSelectedIndex(0);
    }, [renovatedImages.length]);

    // Dynamic Renovation Suggestions
    const renovationSuggestions = useMemo(() => [
        { label: t('reno.sugg.add_floor'), prompt: language === 'vi' ? 'Nâng thêm 1 tầng cho công trình, giữ phong cách kiến trúc hiện có.' : 'Add 1 more floor to the building, keeping the existing architectural style.' },
        { label: t('reno.sugg.change_color'), prompt: language === 'vi' ? 'Thay đổi màu sơn ngoại thất của công trình thành màu trắng kem, các chi tiết cửa sổ màu đen.' : 'Change the exterior paint color to cream white, with black window details.' },
        { label: t('reno.sugg.keep_struct'), prompt: language === 'vi' ? 'Cải tạo lại mặt tiền nhưng giữ nguyên hình khối và cấu trúc chính.' : 'Renovate the facade but keep the main massing and structure intact.' },
        { label: t('reno.sugg.change_mass'), prompt: language === 'vi' ? 'Cải tạo toàn bộ, thay đổi hình khối của công trình để trở nên ấn tượng và hiện đại hơn.' : 'Renovate completely, changing the building massing to be more impressive and modern.' },
        { label: t('reno.sugg.sketch_to_space'), prompt: language === 'vi' ? 'Thiết kế hoàn thiện công trình ở ảnh tham chiếu và đưa vào vùng tô đỏ của ảnh thực tế.' : 'Complete the design from the reference image and place it into the red masked area of the real photo.' },
    ], [t, language]);

    useEffect(() => {
        const viDefault = 'Cải tạo mặt tiền ngôi nhà này theo phong cách hiện đại, tối giản. Sử dụng vật liệu gỗ, kính và bê tông. Thêm nhiều cây xanh xung quanh.';
        const enDefault = 'Renovate the facade of this house in a modern, minimalist style. Use wood, glass, and concrete materials. Add plenty of greenery around.';
        if (!prompt || prompt === viDefault || prompt === enDefault) {
             onStateChange({ prompt: language === 'vi' ? viDefault : enDefault });
        }
    }, [language]);

    const createCompositeImage = async (source: FileData, mask: FileData): Promise<FileData> => {
        return new Promise((resolve, reject) => {
            const imgSource = new Image();
            const imgMask = new Image();
            imgSource.crossOrigin = "Anonymous";
            imgMask.crossOrigin = "Anonymous";
            imgSource.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = imgSource.width;
                canvas.height = imgSource.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error("Canvas context error")); return; }
                ctx.drawImage(imgSource, 0, 0);
                imgMask.onload = () => {
                    ctx.drawImage(imgMask, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/png');
                    resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/png', objectURL: dataUrl });
                };
                imgMask.src = mask.objectURL;
            };
            imgSource.src = source.objectURL;
        });
    };

    const cost = numberOfImages * (resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5);

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
        if (val === 'Standard') onStateChange({ referenceImages: [] });
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             return;
        }
        if (!prompt || !sourceImage) return;

        onStateChange({ isLoading: true, error: null, renovatedImages: [] });
        setStatusMessage(t('common.processing'));

        try {
            const logId = onDeductCredits ? await onDeductCredits(cost, `Cải tạo AI`) : null;
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            
            let inputImages: FileData[] = [sourceImage];
            let finalPrompt = `Renovate this image. ${prompt}. Preserve the structure where not specified. Aspect ratio: ${aspectRatio}.`;
            
            if (maskImage) {
                const composite = await createCompositeImage(sourceImage, maskImage);
                inputImages = [sourceImage, composite];
                finalPrompt += " Apply changes ONLY to the RED MASK area.";
            }
            if (referenceImages.length > 0) inputImages.push(...referenceImages);

            const result = await externalVideoService.generateFlowImage(
                finalPrompt, inputImages, aspectRatio, numberOfImages, modelName, (msg) => setStatusMessage(msg)
            );

            if (result.imageUrls) {
                onStateChange({ renovatedImages: result.imageUrls });
                result.imageUrls.forEach(url => historyService.addToHistory({ tool: Tool.Renovation, prompt: prompt, sourceImageURL: sourceImage.objectURL, resultImageURL: url }));
            }
        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") setShowSafetyModal(true);
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleDownload = async () => {
        if (renovatedImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(renovatedImages[selectedIndex], "renovation.png");
            setIsDownloading(false);
        }
    };

    const handleSuggestionChange = (val: string) => {
        let newPrompt = prompt.trim();
        if (newPrompt && !newPrompt.includes(val)) newPrompt = `${newPrompt}, ${val}`;
        else if (!newPrompt) newPrompt = val;
        onStateChange({ prompt: newPrompt });
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
            {isMaskingModalOpen && sourceImage && (
                <MaskingModal 
                    image={sourceImage} 
                    initialMask={maskImage}
                    onClose={() => setIsMaskingModalOpen(false)} 
                    onApply={(m) => {
                        onStateChange({ maskImage: m });
                        setIsMaskingModalOpen(false);
                    }} 
                    maskColor="rgba(239, 68, 68, 0.5)" 
                />
            )}
            
            {/* SIDEBAR */}
            <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="p-3 space-y-4 flex-1 overflow-y-auto custom-sidebar-scroll">
                    
                    {/* SEGMENT 1: UPLOAD & MASK */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('reno.step1')}</label>
                            <ImageUpload onFileSelect={(f) => onStateChange({ sourceImage: f, renovatedImages: [], maskImage: null })} previewUrl={sourceImage?.objectURL} maskPreviewUrl={maskImage?.objectURL} />
                        </div>
                        {sourceImage && (
                            <div className="flex gap-2">
                                <button onClick={() => setIsMaskingModalOpen(true)} className="flex-1 py-2 px-3 bg-gray-800 dark:bg-gray-700 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-sm">draw</span> {maskImage ? t('reno.edit_mask') : t('reno.draw_mask')}
                                </button>
                                {maskImage && (
                                    <button onClick={() => onStateChange({ maskImage: null })} className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors">
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* SEGMENT 2: PROMPTS */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <OptionSelector id="reno-sugg" label={t('reno.step3')} options={renovationSuggestions.map(s => ({ value: s.prompt, label: s.label }))} value="" onChange={handleSuggestionChange} variant="grid" />
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('reno.step4')}</label>
                            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                                <textarea rows={6} className="w-full bg-transparent outline-none text-sm resize-none font-medium text-text-primary dark:text-white" placeholder={t('reno.prompt_placeholder')} value={prompt} onChange={(e) => onStateChange({ prompt: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    {/* SEGMENT 3: OUTPUT */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.ref_images')}</label>
                            {resolution === 'Standard' ? (
                                <div className="p-4 bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 h-28 shadow-inner">
                                    <span className="material-symbols-outlined text-yellow-500 text-xl">lock</span>
                                    <p className="text-[10px] text-text-secondary dark:text-gray-400 px-2 leading-tight">
                                        {t('img_gen.ref_lock')}
                                    </p>
                                    <button onClick={() => handleResolutionChange('1K')} className="text-[10px] text-[#7f13ec] hover:underline font-bold uppercase">{t('img_gen.upgrade')}</button>
                                </div>
                            ) : (
                                <MultiImageUpload onFilesChange={(fs) => onStateChange({ referenceImages: fs })} maxFiles={5} />
                            )}
                        </div>
                        <AspectRatioSelector value={aspectRatio} onChange={(v) => onStateChange({ aspectRatio: v })} />
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(v) => onStateChange({ numberOfImages: v })} />
                    </div>
                </div>

                <div className="sticky bottom-0 w-full bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] p-4 z-40 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base">
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('reno.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-0">
                        {renovatedImages.length > 0 ? (
                            <div className="w-full h-full p-2 animate-fade-in flex flex-col items-center justify-center relative">
                                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                                    {sourceImage ? (
                                        <ImageComparator originalImage={sourceImage.objectURL} resultImage={renovatedImages[selectedIndex]} />
                                    ) : (
                                        <img src={renovatedImages[selectedIndex]} alt="Result" className="max-w-full max-h-full object-contain" />
                                    )}
                                </div>
                                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                    <button onClick={handleDownload} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">download</span></button>
                                    <button onClick={() => setPreviewImage(renovatedImages[selectedIndex])} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">zoom_in</span></button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-20 select-none bg-main-bg dark:bg-[#121212]">
                                <span className="material-symbols-outlined text-6xl mb-4">home_work</span>
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

                    {renovatedImages.length > 0 && !isLoading && (
                        <div className="flex-shrink-0 w-full p-2 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839]">
                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center">
                                {renovatedImages.map((url, idx) => (
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

export default Renovation;
