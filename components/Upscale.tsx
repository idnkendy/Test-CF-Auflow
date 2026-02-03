import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileData, Tool } from '../types';
import { UpscaleState } from '../state/toolState';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import ImagePreviewModal from './common/ImagePreviewModal';
import SafetyWarningModal from './common/SafetyWarningModal'; 
import { useLanguage } from '../hooks/useLanguage';
import { BACKEND_URL } from '../services/config';

const UPSCALE_QUALITY_WEBAPP_ID = "1977269629011808257";
const UPSCALE_FAST_WEBAPP_ID = "1983430456135852034";

const fetchProxy = async (endpoint: string, body: any) => {
    const baseUrl = BACKEND_URL.replace(/\/$/, ""); 
    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
    return await response.json();
};

interface UpscaleProps {
    state: UpscaleState;
    onStateChange: (newState: Partial<UpscaleState>) => void;
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

const Upscale: React.FC<UpscaleProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t } = useLanguage();
    const { sourceImage, isLoading, error, upscaledImages, detailMode } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false); 
    const [runningHubTaskId, setRunningHubTaskId] = useState<string | null>(null);
    const [currentLogId, setCurrentLogId] = useState<string | null>(null);
    const pollingIntervalRef = useRef<number | null>(null);
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [localErrorMessage, setLocalErrorMessage] = useState("");

    const cost = detailMode === 'fast' ? 20 : 30;

    useEffect(() => {
        return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
    }, []);

    const uploadToSupabase = async (fileData: FileData): Promise<string> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Vui lòng đăng nhập.");
        const res = await fetch(fileData.objectURL);
        const blob = await res.blob();
        const fileExt = blob.type.split('/')[1] || 'png';
        const fileName = `${user.id}/uploads/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('assets').upload(fileName, blob, { contentType: blob.type, upsert: false });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('assets').getPublicUrl(fileName);
        return data.publicUrl;
    };

    useEffect(() => {
        if (!runningHubTaskId) return;
        let attempts = 0;
        pollingIntervalRef.current = window.setInterval(async () => {
            if (attempts >= 120) { 
                handleError(t('ext.upscale.timeout_error')); 
                return; 
            }
            attempts++;
            try {
                const data = await fetchProxy('/upscale-check', { taskId: runningHubTaskId });
                if (data?.code === 0 && data.data?.[0]?.fileUrl) handleSuccess(data.data[0].fileUrl);
                // Also check for failure status in response data if available
            } catch (e) {
                // Network error during poll, ignore
            }
        }, 5000);
        return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
    }, [runningHubTaskId]);

    const handleSuccess = async (resultUrl: string) => {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setRunningHubTaskId(null);
        setCurrentLogId(null);
        onStateChange({ upscaledImages: [resultUrl], isLoading: false });
        setStatusMessage(null);
        if (sourceImage) historyService.addToHistory({ tool: Tool.Upscale, prompt: `Upscale (${detailMode})`, sourceImageURL: sourceImage.objectURL, resultImageURL: resultUrl });
    };

    const showError = (msg: string) => { setLocalErrorMessage(msg); setIsErrorModalOpen(true); };

    const handleError = async (msg: string) => {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setRunningHubTaskId(null);
        
        let friendlyKey = jobService.mapFriendlyErrorMessage(msg);
        
        if (friendlyKey === "SAFETY_POLICY_VIOLATION") {
            setShowSafetyModal(true);
        } else {
            showError(t(friendlyKey));
        }

        // REFUND LOGIC
        if (currentLogId && onDeductCredits) {
             const { data: { user } } = await supabase.auth.getUser();
             if (user) {
                 try {
                     await refundCredits(user.id, cost, `Hoàn tiền: Lỗi Upscale (${msg})`, currentLogId);
                     if (friendlyKey !== "SAFETY_POLICY_VIOLATION") {
                        setLocalErrorMessage(prev => `${prev}\n\n(Credits đã được hoàn trả)`);
                     }
                 } catch (e) { console.error("Refund failed", e); }
             }
        }
        setCurrentLogId(null);
        onStateChange({ isLoading: false, error: t(friendlyKey) });
        setStatusMessage(null);
    };

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, upscaledImages: [], error: null });
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             else showError(t('common.insufficient'));
             return;
        }
        if (!sourceImage) return;

        onStateChange({ isLoading: true, error: null, upscaledImages: [] });
        setStatusMessage(t('ext.upscale.status_init'));
        
        let logId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Upscale (${detailMode})`);
                setCurrentLogId(logId);
            }
            
            const publicImageUrl = await uploadToSupabase(sourceImage);
            let payload = detailMode === 'fast' 
                ? { webappId: UPSCALE_FAST_WEBAPP_ID, nodeInfoList: [{ nodeId: "15", fieldName: "image", fieldValue: publicImageUrl }] }
                : { webappId: UPSCALE_QUALITY_WEBAPP_ID, nodeInfoList: [{ nodeId: "41", fieldName: "image", fieldValue: publicImageUrl }, { nodeId: "71", fieldName: "value", fieldValue: "0.25" }] };

            const data = await fetchProxy('/upscale-create', payload);
            if (data?.code === 0 && data.data?.taskId) {
                setRunningHubTaskId(data.data.taskId);
                setStatusMessage(detailMode === 'fast' ? t('ext.upscale.status_process_fast') : t('ext.upscale.status_process_quality'));
            } else {
                throw new Error(data.msg || "Lỗi khởi tạo.");
            }
        } catch (err: any) { 
            handleError(err.message || ""); 
        }
    };

    const handleDownload = async () => {
        if (upscaledImages.length > 0) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(upscaledImages[0], `upscaled-${Date.now()}.png`);
            setIsDownloading(false);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 md:gap-8 max-w-[1920px] mx-auto items-stretch px-2 sm:px-4">
            <style>{`
                .custom-sidebar-scroll::-webkit-scrollbar { width: 5px; }
                .custom-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #334155; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
            `}</style>

            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            <ErrorModal isOpen={isErrorModalOpen} onClose={() => setIsErrorModalOpen(false)} message={localErrorMessage} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <aside className="w-full lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden lg:h-[calc(100vh-130px)] lg:sticky lg:top-[120px]">
                <div className="p-3 space-y-4 flex-1 lg:overflow-y-auto custom-sidebar-scroll">
                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.upscale.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                    </div>

                    <div className="bg-gray-100 dark:bg-black/20 p-3 sm:p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <label className="block text-xs sm:text-sm font-extrabold text-text-primary dark:text-white mb-2">2. {t('ext.upscale.step2')}</label>
                        <div className="grid grid-cols-1 gap-3 sm:gap-4">
                            {/* FAST MODE */}
                            <button 
                                onClick={() => onStateChange({ detailMode: 'fast' })} 
                                disabled={isLoading} 
                                className={`group p-4 sm:p-5 rounded-2xl border-2 transition-all text-left flex flex-col gap-3 relative overflow-hidden ${
                                    detailMode === 'fast' 
                                        ? 'bg-[#7f13ec]/5 border-[#7f13ec] shadow-lg shadow-[#7f13ec]/10' 
                                        : 'bg-white dark:bg-[#1E1E1E] border-gray-200 dark:border-[#302839] hover:border-gray-400 dark:hover:border-[#404040]'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`material-symbols-outlined text-xl sm:text-2xl ${detailMode === 'fast' ? 'text-yellow-500' : 'text-gray-400 group-hover:text-yellow-500'}`}>bolt</span>
                                    <div className="font-extrabold text-sm sm:text-base dark:text-white">
                                        <span className={detailMode === 'fast' ? 'text-[#a855f7]' : ''}>Fast</span> (4K Fast)
                                    </div>
                                </div>
                                <div className="text-[10px] sm:text-xs text-text-secondary dark:text-gray-400 leading-relaxed pr-2">
                                    {t('ext.upscale.fast_desc')}
                                </div>
                                <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-[#2A2A2A] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg w-fit border border-gray-200 dark:border-[#333]">
                                    <span className="material-symbols-outlined text-xs sm:text-sm text-yellow-500">monetization_on</span>
                                    <span className="text-[10px] sm:text-xs font-bold dark:text-gray-200">20 Credits</span>
                                </div>
                            </button>

                            {/* QUALITY MODE */}
                            <button 
                                onClick={() => onStateChange({ detailMode: 'quality' })} 
                                disabled={isLoading} 
                                className={`group p-4 sm:p-5 rounded-2xl border-2 transition-all text-left flex flex-col gap-3 relative overflow-hidden ${
                                    detailMode === 'quality' 
                                        ? 'bg-[#7f13ec]/5 border-[#7f13ec] shadow-lg shadow-[#7f13ec]/10' 
                                        : 'bg-white dark:bg-[#1E1E1E] border-gray-200 dark:border-[#302839] hover:border-gray-400 dark:hover:border-[#404040]'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`material-symbols-outlined text-xl sm:text-2xl ${detailMode === 'quality' ? 'text-[#a855f7]' : 'text-gray-400 group-hover:text-[#a855f7]'}`}>auto_awesome</span>
                                    <div className="font-extrabold text-sm sm:text-base dark:text-white">
                                        Detailed (4K Quality)
                                    </div>
                                </div>
                                <div className="text-[10px] sm:text-xs text-text-secondary dark:text-gray-400 leading-relaxed pr-2">
                                    {t('ext.upscale.quality_desc')}
                                </div>
                                <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-[#2A2A2A] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg w-fit border border-gray-200 dark:border-[#333]">
                                    <span className="material-symbols-outlined text-xs sm:text-sm text-yellow-500">monetization_on</span>
                                    <span className="text-[10px] sm:text-xs font-bold dark:text-gray-200">30 Credits</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] lg:sticky lg:bottom-0 z-10 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-3 sm:py-4 rounded-xl transition-all shadow-lg active:scale-95 text-sm sm:text-base">
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('ext.upscale.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-base sm:text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden min-h-[400px] sm:min-h-[500px] lg:h-[calc(100vh-130px)] lg:sticky lg:top-[120px]">
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-[300px]">
                        {upscaledImages.length > 0 ? (
                            <div className="w-full h-full p-2 animate-fade-in flex flex-col items-center justify-center relative">
                                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                                    {sourceImage ? (
                                        <ImageComparator originalImage={sourceImage.objectURL} resultImage={upscaledImages[0]} />
                                    ) : (
                                        <img src={upscaledImages[0]} alt="Result" className="max-w-full max-h-full object-contain" />
                                    )}
                                </div>
                                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                    <button onClick={handleDownload} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.download')}</span>
                                        <span className="material-symbols-outlined text-base sm:text-lg">download</span>
                                    </button>
                                    <button onClick={() => setPreviewImage(upscaledImages[0])} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.zoom')}</span>
                                        <span className="material-symbols-outlined text-base sm:text-lg">zoom_in</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center py-20 opacity-20 select-none bg-main-bg dark:bg-[#121212] p-8 text-center">
                                <span className="material-symbols-outlined text-4xl sm:text-6xl mb-4">hd</span>
                                <p className="text-sm sm:text-base font-medium">{t('msg.no_result_render')}</p>
                            </div>
                        )}
                        {isLoading && (
                            <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center">
                                <Spinner />
                                <p className="text-white mt-4 font-bold animate-pulse text-sm sm:text-base">{statusMessage}</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Upscale;