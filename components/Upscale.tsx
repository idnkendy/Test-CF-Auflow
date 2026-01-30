
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

const Upscale: React.FC<UpscaleProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t } = useLanguage();
    const { sourceImage, isLoading, error, upscaledImages, detailMode } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false); 
    const [runningHubTaskId, setRunningHubTaskId] = useState<string | null>(null);
    const pollingIntervalRef = useRef<number | null>(null);

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
            if (attempts >= 120) { handleError(t('ext.upscale.timeout_error')); return; }
            attempts++;
            try {
                const data = await fetchProxy('/upscale-check', { taskId: runningHubTaskId });
                if (data?.code === 0 && data.data?.[0]?.fileUrl) handleSuccess(data.data[0].fileUrl);
            } catch (e) {}
        }, 5000);
        return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
    }, [runningHubTaskId]);

    const handleSuccess = async (resultUrl: string) => {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setRunningHubTaskId(null);
        onStateChange({ upscaledImages: [resultUrl], isLoading: false });
        setStatusMessage(null);
        if (sourceImage) historyService.addToHistory({ tool: Tool.Upscale, prompt: `Upscale (${detailMode})`, sourceImageURL: sourceImage.objectURL, resultImageURL: resultUrl });
    };

    const handleError = async (msg: string) => {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setRunningHubTaskId(null);
        let friendlyKey = jobService.mapFriendlyErrorMessage(msg);
        if (friendlyKey === "SAFETY_POLICY_VIOLATION") setShowSafetyModal(true);
        onStateChange({ isLoading: false, error: t(friendlyKey) });
        setStatusMessage(null);
    };

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, upscaledImages: [], error: null });
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             return;
        }
        if (!sourceImage) return;

        onStateChange({ isLoading: true, error: null, upscaledImages: [] });
        setStatusMessage(t('ext.upscale.status_init'));

        try {
            if (onDeductCredits) await onDeductCredits(cost, `Upscale (${detailMode})`);
            const publicImageUrl = await uploadToSupabase(sourceImage);
            let payload = detailMode === 'fast' 
                ? { webappId: UPSCALE_FAST_WEBAPP_ID, nodeInfoList: [{ nodeId: "15", fieldName: "image", fieldValue: publicImageUrl }] }
                : { webappId: UPSCALE_QUALITY_WEBAPP_ID, nodeInfoList: [{ nodeId: "41", fieldName: "image", fieldValue: publicImageUrl }, { nodeId: "71", fieldName: "value", fieldValue: "0.25" }] };

            const data = await fetchProxy('/upscale-create', payload);
            if (data?.code === 0 && data.data?.taskId) {
                setRunningHubTaskId(data.data.taskId);
                setStatusMessage(detailMode === 'fast' ? t('ext.upscale.status_process_fast') : t('ext.upscale.status_process_quality'));
            } else throw new Error(data.msg || "Lỗi khởi tạo.");
        } catch (err: any) { handleError(err.message || ""); }
    };

    const handleDownload = async () => {
        if (upscaledImages.length > 0) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(upscaledImages[0], `upscaled-${Date.now()}.png`);
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
            `}</style>

            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="p-3 space-y-4 flex-1 overflow-y-auto custom-sidebar-scroll">
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.upscale.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                    </div>

                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">2. {t('ext.upscale.step2')}</label>
                        <div className="grid grid-cols-1 gap-4">
                            {/* FAST MODE */}
                            <button 
                                onClick={() => onStateChange({ detailMode: 'fast' })} 
                                disabled={isLoading} 
                                className={`group p-5 rounded-2xl border-2 transition-all text-left flex flex-col gap-3 relative overflow-hidden ${
                                    detailMode === 'fast' 
                                        ? 'bg-[#7f13ec]/5 border-[#7f13ec] shadow-lg shadow-[#7f13ec]/10' 
                                        : 'bg-white dark:bg-[#1E1E1E] border-gray-200 dark:border-[#302839] hover:border-gray-400 dark:hover:border-[#404040]'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`material-symbols-outlined text-2xl ${detailMode === 'fast' ? 'text-yellow-500' : 'text-gray-400 group-hover:text-yellow-500'}`}>bolt</span>
                                    <div className="font-extrabold text-base dark:text-white">
                                        <span className={detailMode === 'fast' ? 'text-[#a855f7]' : ''}>Fast</span> (4K Fast)
                                    </div>
                                </div>
                                <div className="text-xs text-text-secondary dark:text-gray-400 leading-relaxed pr-2">
                                    {t('ext.upscale.fast_desc')}
                                </div>
                                <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-[#2A2A2A] px-2.5 py-1 rounded-lg w-fit border border-gray-200 dark:border-[#333]">
                                    <span className="material-symbols-outlined text-sm text-yellow-500">monetization_on</span>
                                    <span className="text-xs font-bold dark:text-gray-200">20 Credits</span>
                                </div>
                            </button>

                            {/* QUALITY MODE */}
                            <button 
                                onClick={() => onStateChange({ detailMode: 'quality' })} 
                                disabled={isLoading} 
                                className={`group p-5 rounded-2xl border-2 transition-all text-left flex flex-col gap-3 relative overflow-hidden ${
                                    detailMode === 'quality' 
                                        ? 'bg-[#7f13ec]/5 border-[#7f13ec] shadow-lg shadow-[#7f13ec]/10' 
                                        : 'bg-white dark:bg-[#1E1E1E] border-gray-200 dark:border-[#302839] hover:border-gray-400 dark:hover:border-[#404040]'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`material-symbols-outlined text-2xl ${detailMode === 'quality' ? 'text-[#a855f7]' : 'text-gray-400 group-hover:text-[#a855f7]'}`}>auto_awesome</span>
                                    <div className="font-extrabold text-base dark:text-white">
                                        Detailed (4K Quality)
                                    </div>
                                </div>
                                <div className="text-xs text-text-secondary dark:text-gray-400 leading-relaxed pr-2">
                                    {t('ext.upscale.quality_desc')}
                                </div>
                                <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-[#2A2A2A] px-2.5 py-1 rounded-lg w-fit border border-gray-200 dark:border-[#333]">
                                    <span className="material-symbols-outlined text-sm text-yellow-500">monetization_on</span>
                                    <span className="text-xs font-bold dark:text-gray-200">30 Credits</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="sticky bottom-0 w-full bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] p-4 z-40 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base">
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('ext.upscale.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-0">
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
                                    <button onClick={handleDownload} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">download</span></button>
                                    <button onClick={() => setPreviewImage(upscaledImages[0])} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">zoom_in</span></button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center py-40 opacity-20 select-none bg-main-bg dark:bg-[#121212] flex-grow">
                                <span className="material-symbols-outlined text-6xl mb-4">hd</span>
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

export default Upscale;
