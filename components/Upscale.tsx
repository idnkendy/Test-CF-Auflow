
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

// --- CONFIGURATION ---
const UPSCALE_QUALITY_WEBAPP_ID = "1977269629011808257";
const UPSCALE_FAST_WEBAPP_ID = "1983430456135852034";
// API Key has been removed and moved to Backend

// Helper to fetch from local proxy
const fetchProxy = async (endpoint: string, body: any) => {
    // Determine backend URL (local dev vs prod)
    // @ts-ignore
    const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || "https://twilight-fire-b7d4.truongvohaiaune.workers.dev";
    
    // Clean URL
    const baseUrl = BACKEND_URL.replace(/\/$/, ""); 
    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${path}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`Proxy error: ${response.status}`);
    }
    return await response.json();
};

interface UpscaleProps {
    state: UpscaleState;
    onStateChange: (newState: Partial<UpscaleState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

const Upscale: React.FC<UpscaleProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const { sourceImage, isLoading, error, upscaledImages, detailMode } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    
    // Internal state for RunningHub tracking
    const [runningHubTaskId, setRunningHubTaskId] = useState<string | null>(null);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);
    const pollingIntervalRef = useRef<number | null>(null);

    // Cost logic
    const cost = detailMode === 'fast' ? 20 : 30;

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, []);

    // Helper: Upload to Supabase Storage
    const uploadToSupabase = async (fileData: FileData): Promise<string> => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Vui lòng đăng nhập để sử dụng tính năng này.");

            // Convert blob URL to Blob for upload
            const res = await fetch(fileData.objectURL);
            const blob = await res.blob();
            
            const fileExt = blob.type.split('/')[1] || 'png';
            const fileName = `${user.id}/uploads/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('assets')
                .upload(fileName, blob, {
                    contentType: blob.type,
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('assets')
                .getPublicUrl(fileName);

            return data.publicUrl;
        } catch (error: any) {
            console.error("Supabase Upload Error:", error);
            throw new Error(error.message || 'Lỗi tải ảnh lên máy chủ.');
        }
    };

    // Polling Effect
    useEffect(() => {
        if (!runningHubTaskId) return;

        let attempts = 0;
        const maxAttempts = 120; // ~10 minutes

        pollingIntervalRef.current = window.setInterval(async () => {
            if (attempts >= maxAttempts) {
                handleError("Quá thời gian xử lý.");
                return;
            }
            attempts++;

            try {
                // Call Backend Proxy for Check
                const data = await fetchProxy('/upscale-check', { 
                    taskId: runningHubTaskId 
                });

                if (data?.code === 0) {
                    const resultIndex = 0;
                    const processedImageUrl = data.data?.[resultIndex]?.fileUrl;

                    if (processedImageUrl) {
                        handleSuccess(processedImageUrl);
                    }
                } else if (data?.code !== 1) { 
                     // Handle other codes if necessary
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 5000);

        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runningHubTaskId]);

    const handleSuccess = async (resultUrl: string) => {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setRunningHubTaskId(null);
        
        onStateChange({ upscaledImages: [resultUrl], isLoading: false });
        setStatusMessage(null);

        if (sourceImage) {
            historyService.addToHistory({ 
                tool: Tool.Upscale, 
                prompt: `Upscale (${detailMode})`, 
                sourceImageURL: sourceImage.objectURL, 
                resultImageURL: resultUrl 
            });
        }

        if (currentJobId) {
            await jobService.updateJobStatus(currentJobId, 'completed', resultUrl);
            setCurrentJobId(null);
        }
    };

    const handleError = async (msg: string) => {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setRunningHubTaskId(null);
        onStateChange({ isLoading: false, error: msg });
        setStatusMessage(null);

        if (currentJobId) {
            await jobService.updateJobStatus(currentJobId, 'failed', undefined, msg);
            setCurrentJobId(null);
        }
    };

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, upscaledImages: [], error: null });
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             onStateChange({ error: `Bạn không đủ credits. Cần ${cost} credits.` });
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên một ảnh để nâng cấp.' });
            return;
        }

        onStateChange({ isLoading: true, error: null, upscaledImages: [] });
        setStatusMessage(detailMode === 'fast' ? 'Đang tải ảnh & khởi tạo...' : 'Đang tải ảnh & khởi tạo (Pro)...');

        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Upscale (${detailMode})`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.Upscale,
                    prompt: `Upscale image (${detailMode})`,
                    cost: cost,
                    usage_log_id: logId
                });
                setCurrentJobId(jobId);
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            // 1. Upload to Supabase Storage
            setStatusMessage('Đang tải ảnh lên máy chủ...');
            const publicImageUrl = await uploadToSupabase(sourceImage);

            // 2. Prepare RunningHub Payload
            setStatusMessage('Đang gửi yêu cầu xử lý AI...');
            let runningHubPayload;
            
            if (detailMode === 'fast') {
                runningHubPayload = {
                    webappId: UPSCALE_FAST_WEBAPP_ID,
                    // ApiKey injected at Backend
                    nodeInfoList: [{ nodeId: "15", fieldName: "image", fieldValue: publicImageUrl, description: "Load Image" }]
                };
            } else {
                runningHubPayload = {
                    webappId: UPSCALE_QUALITY_WEBAPP_ID,
                    // ApiKey injected at Backend
                    nodeInfoList: [
                        { nodeId: "41", fieldName: "image", fieldValue: publicImageUrl, description: "Ảnh gốc" },
                        { nodeId: "71", fieldName: "value", fieldValue: "0.25", description: "Mức độ thay đổi" }
                    ]
                };
            }

            // 3. Call Backend Proxy
            const data = await fetchProxy('/upscale-create', runningHubPayload);

            if (!data || (data.code && data.code !== 0) || !data.data?.taskId) {
                throw new Error(data.msg || 'Không thể bắt đầu tác vụ xử lý hình ảnh.');
            }

            // 4. Start Polling (Triggered by state change)
            setRunningHubTaskId(data.data.taskId);
            setStatusMessage(detailMode === 'fast' ? 'AI đang nâng cấp nhanh...' : 'AI đang tái tạo chi tiết...');

        } catch (err: any) {
            let msg = err.message;
            if (logId) msg += " (Credits đã hoàn lại)";
            onStateChange({ error: msg, isLoading: false });
            setStatusMessage(null);
            
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi Upscale (${err.message})`, logId);
            }
            setCurrentJobId(null);
        }
    };

    const handleDownload = async () => {
        if (upscaledImages.length === 0) return;
        const url = upscaledImages[0];
        const filename = `upscaled-${detailMode}-${Date.now()}.png`;

        setIsDownloading(true);
        await externalVideoService.forceDownload(url, filename);
        setIsDownloading(false);
    };

    return (
        <div className="flex flex-col gap-8">
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <h2 className="text-2xl font-bold text-text-primary dark:text-white mb-4">AI Tăng Độ Chi Tiết (Upscale)</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">1. Tải Lên Ảnh Cần Nâng Cấp</label>
                        <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400">2. Chọn Chế Độ</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => onStateChange({ detailMode: 'fast' })}
                                disabled={isLoading}
                                className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                                    detailMode === 'fast'
                                        ? 'bg-[#7f13ec]/10 border-[#7f13ec] shadow-md'
                                        : 'bg-surface dark:bg-gray-800 border-border-color dark:border-gray-700 hover:border-gray-400'
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="material-symbols-outlined text-yellow-500">bolt</span>
                                    <span className={`font-bold ${detailMode === 'fast' ? 'text-[#7f13ec]' : 'text-text-primary dark:text-white'}`}>Nhanh (4K Fast)</span>
                                </div>
                                <p className="text-xs text-text-secondary dark:text-gray-400 mb-2">Tăng độ nét cơ bản, giữ nguyên chi tiết gốc. Tốc độ cao.</p>
                                <div className="inline-flex items-center gap-1 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-xs font-bold text-text-primary dark:text-white">
                                    <span className="material-symbols-outlined text-[10px] text-yellow-500">monetization_on</span> 20 Credits
                                </div>
                            </button>

                            <button
                                onClick={() => onStateChange({ detailMode: 'quality' })}
                                disabled={isLoading}
                                className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                                    detailMode === 'quality'
                                        ? 'bg-[#7f13ec]/10 border-[#7f13ec] shadow-md'
                                        : 'bg-surface dark:bg-gray-800 border-border-color dark:border-gray-700 hover:border-gray-400'
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="material-symbols-outlined text-purple-500">auto_awesome</span>
                                    <span className={`font-bold ${detailMode === 'quality' ? 'text-[#7f13ec]' : 'text-text-primary dark:text-white'}`}>Chi tiết (4K Quality)</span>
                                </div>
                                <p className="text-xs text-text-secondary dark:text-gray-400 mb-2">Tái tạo  và nâng cấp chi tiết, thêm texture 4K, phù hợp ảnh quy mô lớn.</p>
                                <div className="inline-flex items-center gap-1 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-xs font-bold text-text-primary dark:text-white">
                                    <span className="material-symbols-outlined text-[10px] text-yellow-500">monetization_on</span> 30 Credits
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                            <span className="material-symbols-outlined text-yellow-500 text-sm">monetization_on</span>
                            <span>Chi phí: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                        </div>
                        <div className="text-xs">
                            {userCredits < cost ? (
                                <span className="text-red-500 font-semibold">Không đủ</span>
                            ) : (
                                <span className="text-green-600 dark:text-green-400">Đủ điều kiện</span>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !sourceImage || userCredits < cost}
                        className="w-full flex justify-center items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg"
                    >
                        {isLoading ? <><Spinner /> {statusMessage || 'Đang xử lý...'}</> : 'Thực hiện Nâng cấp'}
                    </button>
                    {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-300 rounded-lg text-sm">{error}</div>}
                </div>

                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-text-primary dark:text-white">Kết quả So sánh</h3>
                        {upscaledImages.length > 0 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPreviewImage(upscaledImages[0])}
                                    className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-text-primary dark:text-white transition-colors"
                                    title="Phóng to"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                </button>
                                <button 
                                    onClick={handleDownload} 
                                    disabled={isDownloading}
                                    className="flex items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white px-3 py-1.5 rounded-lg font-bold shadow-lg text-sm transition-colors"
                                >
                                    {isDownloading ? <Spinner /> : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                    )}
                                    <span>Tải xuống</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-border-color dark:border-gray-700 flex items-center justify-center overflow-hidden">
                        {isLoading ? (
                            <div className="flex flex-col items-center">
                                <Spinner />
                                <p className="mt-2 text-gray-400 text-sm animate-pulse">{statusMessage}</p>
                            </div>
                        ) : upscaledImages.length > 0 && sourceImage ? (
                            <ImageComparator originalImage={sourceImage.objectURL} resultImage={upscaledImages[0]} />
                        ) : (
                             <div className="text-center text-text-secondary dark:text-gray-400 p-4">
                                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">compare</span>
                                <p>Kết quả sẽ hiển thị ở đây.</p>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Upscale;
