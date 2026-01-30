
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { FloorPlanState } from '../state/toolState';
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
import ImagePreviewModal from './common/ImagePreviewModal';
import ResolutionSelector from './common/ResolutionSelector';
import AspectRatioSelector from './common/AspectRatioSelector';
import MultiImageUpload from './common/MultiImageUpload';
import OptionSelector from './common/OptionSelector';
import SafetyWarningModal from './common/SafetyWarningModal';
import { useLanguage } from '../hooks/useLanguage';

interface FloorPlanProps {
    state: FloorPlanState;
    onStateChange: (newState: Partial<FloorPlanState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

// Local Error Modal Component
const ErrorModal: React.FC<{ isOpen: boolean; onClose: () => void; message: string }> = ({ isOpen, onClose, message }) => {
    const { t } = useLanguage();
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
            <div className="bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#302839] rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center animate-scale-up">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-red-600 dark:text-red-500 text-4xl">error</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('common.error')}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6 leading-relaxed">{message}</p>
                <button 
                    onClick={onClose}
                    className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-black font-bold rounded-xl transition-all hover:opacity-90"
                >
                    {t('common.close')}
                </button>
            </div>
        </div>
    );
};

const FloorPlan: React.FC<FloorPlanProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { 
        prompt, layoutPrompt, sourceImage, referenceImages, isLoading, error, resultImages, 
        numberOfImages, renderMode, planType, resolution, aspectRatio,
        projectType, importantArea, time, weather 
    } = state;
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [localErrorMessage, setLocalErrorMessage] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isAutoPromptLoading, setIsAutoPromptLoading] = useState(false);

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

    const exteriorProjectTypeOptions = useMemo(() => [
        { value: t('opt.building.townhouse'), label: t('opt.building.townhouse') },
        { value: t('opt.building.villa'), label: t('opt.building.villa') },
        { value: t('opt.building.apartment'), label: t('opt.building.apartment') },
        { value: 'Resort', label: 'Resort' },
        { value: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}`, label: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}` },
        { value: t('opt.building.office'), label: t('opt.building.office') },
        { value: language === 'vi' ? 'Công viên' : 'Park', label: language === 'vi' ? 'Công viên' : 'Park' },
    ], [t, language]);

    const importantAreaOptions = useMemo(() => [
        { value: language === 'vi' ? 'Khu nhà ở' : 'Residential area', label: language === 'vi' ? 'Khu nhà ở' : 'Residential area' },
        { value: language === 'vi' ? 'Khu thương mại' : 'Commercial area', label: language === 'vi' ? 'Khu thương mại' : 'Commercial area' },
        { value: language === 'vi' ? 'Khu vui chơi' : 'Playground', label: language === 'vi' ? 'Khu vui chơi' : 'Playground' },
        { value: language === 'vi' ? 'Cổng' : 'Entrance', label: language === 'vi' ? 'Cổng' : 'Entrance' },
        { value: language === 'vi' ? 'Bungalow mái rơm' : 'Thatch Bungalow', label: language === 'vi' ? 'Bungalow mái rơm' : 'Thatch Bungalow' },
        { value: language === 'vi' ? 'Nhà hàng & Cafe' : 'Restaurant & Cafe', label: language === 'vi' ? 'Nhà hàng & Cafe' : 'Restaurant & Cafe' },
        { value: language === 'vi' ? 'Bãi đỗ xe' : 'Parking', label: language === 'vi' ? 'Bãi đỗ xe' : 'Parking' },
    ], [language]);

    const interiorProjectTypeOptions = useMemo(() => [
        { value: language === 'vi' ? 'Nhà ở' : 'House', label: language === 'vi' ? 'Nhà ở' : 'House' },
        { value: t('opt.building.apartment'), label: t('opt.building.apartment') },
        { value: t('opt.building.villa'), label: t('opt.building.villa') },
        { value: language === 'vi' ? 'Thương mại' : 'Commercial', label: language === 'vi' ? 'Thương mại' : 'Commercial' },
        { value: t('opt.building.office'), label: t('opt.building.office') },
        { value: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}`, label: `${t('opt.building.restaurant')} / ${t('opt.building.cafe')}` },
    ], [t, language]);

    const topDownLabel = planType === 'exterior' ? t('ext.floorplan.mode.topdown_ext') : t('ext.floorplan.mode.topdown_int');
    const perspectiveLabel = planType === 'exterior' ? t('ext.floorplan.mode.perspective_ext') : t('ext.floorplan.mode.perspective_int');

    useEffect(() => {
        const defaults = {
            vi: { topdown_ext: 'Biến thành ảnh chụp thực tế dự án', topdown_int: 'Biến thành ảnh chụp thực tế nội thất', persp_ext: 'Phối cảnh 3D ngoại thất từ mặt bằng', persp_int: 'Phối cảnh 3D nội thất từ mặt bằng' },
            en: { topdown_ext: 'Transform into realistic project photo', topdown_int: 'Transform into realistic interior photo', persp_ext: '3D exterior perspective from floor plan', persp_int: '3D interior perspective from floor plan' }
        };
        const activeDefaults = language === 'vi' ? defaults.vi : defaults.en;
        let targetDefault = '';
        if (renderMode === 'top-down') {
             targetDefault = planType === 'exterior' ? activeDefaults.topdown_ext : activeDefaults.topdown_int;
             if (!prompt || Object.values(defaults.vi).includes(prompt) || Object.values(defaults.en).includes(prompt)) onStateChange({ prompt: targetDefault });
        } else {
             targetDefault = planType === 'exterior' ? activeDefaults.persp_ext : activeDefaults.persp_int;
             if (!layoutPrompt || Object.values(defaults.vi).includes(layoutPrompt) || Object.values(defaults.en).includes(layoutPrompt)) onStateChange({ layoutPrompt: targetDefault });
        }
    }, [renderMode, planType, language]);

    const showError = (msg: string) => { setLocalErrorMessage(msg); setIsErrorModalOpen(true); };

    const handleAutoPrompt = async () => {
        if (!sourceImage) return;
        setIsAutoPromptLoading(true);
        onStateChange({ error: null });
        try {
            const newPrompt = await geminiService.generateFloorPlanPrompt(sourceImage, planType, renderMode, language);
            if (renderMode === 'top-down') onStateChange({ prompt: newPrompt });
            else onStateChange({ layoutPrompt: newPrompt });
        } catch (err: any) { showError(err.message || t('common.error')); } finally { setIsAutoPromptLoading(false); }
    };

    const cost = numberOfImages * (resolution === '4K' ? 30 : resolution === '2K' ? 20 : resolution === '1K' ? 10 : 5);

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             else showError(t('common.insufficient'));
             return;
        }
        const activePrompt = renderMode === 'top-down' ? prompt : layoutPrompt;
        if (!activePrompt || !activePrompt.trim()) { showError('Vui lòng nhập mô tả hoặc sử dụng gợi ý.'); return; }
        if (!sourceImage) { showError('Vui lòng tải lên ảnh mặt bằng.'); return; }

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));

        const finalPrompt = renderMode === 'top-down' 
            ? `Convert this 2D floor plan into a photorealistic top-down 3D rendering. ${activePrompt}.` 
            : `Convert this 2D floor plan into a photorealistic 3D perspective view. ${activePrompt}.`;

        try {
            const logId = onDeductCredits ? await onDeductCredits(cost, `Render mặt bằng`) : null;
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";

            const result = await externalVideoService.generateFlowImage(
                finalPrompt,
                [sourceImage, ...referenceImages].filter(Boolean) as FileData[],
                aspectRatio,
                numberOfImages,
                modelName,
                (msg) => setStatusMessage(msg)
            );

            if (result.imageUrls) {
                onStateChange({ resultImages: result.imageUrls });
                result.imageUrls.forEach(url => historyService.addToHistory({ tool: Tool.FloorPlan, prompt: activePrompt, sourceImageURL: sourceImage?.objectURL, resultImageURL: url }));
            }
        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") setShowSafetyModal(true);
            else showError(t(friendlyKey));
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleDownload = async () => {
        if (resultImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImages[selectedIndex], "floorplan-render.png");
            setIsDownloading(false);
        }
    };

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
        if (val === 'Standard') onStateChange({ referenceImages: [] });
    };

    const handleReferenceFilesChange = (files: FileData[]) => {
        onStateChange({ referenceImages: files });
    };

    // Hide Auto Prompt button for Exterior (Kiến trúc) and Perspective (3D) mode
    const showAutoPromptButton = !(planType === 'exterior' && renderMode === 'perspective');

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
            <ErrorModal isOpen={isErrorModalOpen} onClose={() => setIsErrorModalOpen(false)} message={localErrorMessage} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            {/* SIDEBAR */}
            <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="p-3 space-y-4 flex-1 overflow-y-auto custom-sidebar-scroll">
                    
                    {/* SEGMENT 1: TYPE & UPLOAD */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-3 border border-gray-200 dark:border-white/5">
                        <div className="grid grid-cols-2 gap-2 bg-white dark:bg-[#121212] p-1 rounded-xl border border-gray-200 dark:border-[#302839]">
                            <button onClick={() => onStateChange({ planType: 'interior' })} className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${planType === 'interior' ? 'bg-[#7f13ec] text-white' : 'text-gray-400'}`}>{language === 'vi' ? 'Nội thất' : 'Interior'}</button>
                            <button onClick={() => onStateChange({ planType: 'exterior' })} className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${planType === 'exterior' ? 'bg-[#7f13ec] text-white' : 'text-gray-400'}`}>{language === 'vi' ? 'Kiến trúc' : 'Architecture'}</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 bg-white dark:bg-[#121212] p-1 rounded-xl border border-gray-200 dark:border-[#302839]">
                            <button onClick={() => onStateChange({ renderMode: 'top-down' })} className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${renderMode === 'top-down' ? 'bg-[#7f13ec] text-white' : 'text-gray-400'}`}>{topDownLabel}</button>
                            <button onClick={() => onStateChange({ renderMode: 'perspective' })} className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${renderMode === 'perspective' ? 'bg-[#7f13ec] text-white' : 'text-gray-400'}`}>{perspectiveLabel}</button>
                        </div>
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.floorplan.step1')}</label>
                            <ImageUpload onFileSelect={(f) => onStateChange({ sourceImage: f, resultImages: [] })} previewUrl={sourceImage?.objectURL} />
                        </div>
                    </div>

                    {/* SEGMENT 2: PROMPT & OPTIONS */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{renderMode === 'top-down' ? t('ext.floorplan.step4') : t('ext.floorplan.step3_perspective')}</label>
                            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                                <textarea 
                                    rows={6} 
                                    className="w-full bg-transparent outline-none text-sm resize-none font-medium text-text-primary dark:text-white" 
                                    placeholder={t('ext.urban.prompt_ph')} 
                                    value={renderMode === 'top-down' ? prompt : layoutPrompt} 
                                    onChange={(e) => onStateChange({ [renderMode === 'top-down' ? 'prompt' : 'layoutPrompt']: e.target.value })} 
                                />
                            </div>
                            {showAutoPromptButton && (
                                <button
                                    type="button"
                                    onClick={handleAutoPrompt}
                                    disabled={!sourceImage || isAutoPromptLoading || isLoading}
                                    className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all bg-gray-800 dark:bg-gray-700 hover:bg-black dark:hover:bg-gray-600 text-white shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                                >
                                    {isAutoPromptLoading ? <Spinner /> : <><span className="material-symbols-outlined text-sm">auto_awesome</span> <span>{t('ext.floorplan.auto_prompt')}</span></>}
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {planType === 'exterior' && renderMode === 'top-down' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <OptionSelector id="fp-p-type" label={t('opt.int.project_type')} options={exteriorProjectTypeOptions} value={projectType} onChange={(v) => onStateChange({ projectType: v })} variant="select" />
                                    <OptionSelector id="fp-area" label="Khu vực" options={importantAreaOptions} value={importantArea} onChange={(v) => onStateChange({ importantArea: v })} variant="select" />
                                </div>
                            )}
                            {planType === 'interior' && renderMode === 'top-down' && (
                                <OptionSelector id="fp-int-type" label={t('opt.int.project_type')} options={interiorProjectTypeOptions} value={projectType} onChange={(v) => onStateChange({ projectType: v })} variant="select" />
                            )}
                        </div>
                    </div>

                    {/* SEGMENT 3: OUTPUT */}
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        {renderMode === 'perspective' && (
                            <div>
                                <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('img_gen.ref_images')}</label>
                                {resolution === 'Standard' ? (
                                    <div className="p-4 bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-center gap-2 h-28 shadow-inner">
                                        <span className="material-symbols-outlined text-yellow-500 text-xl">lock</span>
                                        <p className="text-[10px] text-text-secondary dark:text-gray-400 px-2 leading-tight">
                                            {t('img_gen.ref_lock')}
                                        </p>
                                        <button onClick={() => handleResolutionChange('1K')} className="text-[10px] text-[#7f13ec] hover:underline font-bold uppercase">
                                            {t('img_gen.upgrade')}
                                        </button>
                                    </div>
                                ) : (
                                    <MultiImageUpload onFilesChange={handleReferenceFilesChange} maxFiles={5} />
                                )}
                            </div>
                        )}
                        <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({aspectRatio: val})} />
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({numberOfImages: val})} />
                    </div>
                </div>

                {/* STICKY FOOTER */}
                <div className="sticky bottom-0 w-full bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] p-4 z-40 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button 
                        onClick={handleGenerate} 
                        disabled={isLoading} 
                        className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base"
                    >
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('ext.floorplan.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-lg align-middle notranslate">monetization_on</span></>}
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
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-20 select-none bg-main-bg dark:bg-[#121212]">
                                <span className="material-symbols-outlined text-6xl mb-4">dashboard</span>
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

export default FloorPlan;
