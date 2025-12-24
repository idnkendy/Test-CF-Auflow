
// ... existing imports ...
import React, { useState, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { UserStatus, Tool, FileData } from '../types';
import Header from './Header';
import { initialToolStates, VideoGeneratorState, VideoContextItem } from '../state/toolState';
import MultiImageUpload from './common/MultiImageUpload';
import ImageUpload from './common/ImageUpload';
import Spinner from './Spinner';
import * as geminiService from '../services/geminiService';
import * as externalVideoService from '../services/externalVideoService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';

const API_BASE_URL = "https://twilight-fire-b7d4.truongvohaiaune.workers.dev";

// ... existing AspectRatioSelector ...
const AspectRatioSelector = ({ value, onChange }: { value: '16:9' | '9:16' | 'default', onChange: (val: '16:9' | '9:16' | 'default') => void }) => {
    // ... (same as original file) ...
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getIcon = (val: string) => {
        switch(val) {
            case '16:9': return 'crop_landscape';
            case '9:16': return 'crop_portrait';
            default: return 'crop_landscape';
        }
    }

    const getLabel = (val: string) => {
            switch(val) {
            case '16:9': return '16:9';
            case '9:16': return '9:16';
            default: return '16:9';
        }
    }

    return (
        <div className="relative h-full" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="h-full w-full px-3 bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#353535] border border-gray-300 dark:border-[#302839] rounded-xl flex items-center gap-2 text-gray-800 dark:text-white font-medium transition-all shadow-sm whitespace-nowrap justify-between"
                title="Chọn tỷ lệ khung hình"
            >
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-[#7f13ec] notranslate">
                        {getIcon(value === 'default' ? '16:9' : value)}
                    </span>
                    <span>{getLabel(value === 'default' ? '16:9' : value)}</span>
                </div>
                <span className={`material-symbols-outlined text-gray-500 dark:text-gray-400 text-sm transition-transform duration-200 notranslate ${isOpen ? 'rotate-180' : ''}`}>
                    expand_less
                </span>
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-full min-w-[140px] bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#302839] rounded-xl shadow-xl overflow-hidden z-50 p-1 animate-fade-in">
                    <button
                        onClick={() => { onChange('16:9'); setIsOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                            value === '16:9' ? 'bg-[#7f13ec]/10 text-[#7f13ec]' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2A2A]'
                        }`}
                    >
                        <span className="material-symbols-outlined text-lg notranslate">crop_landscape</span>
                        <div className="flex flex-col items-start text-left">
                            <span className="font-bold">16:9</span>
                            <span className="text-[10px] opacity-70">Ngang</span>
                        </div>
                        {value === '16:9' && <span className="material-symbols-outlined text-sm ml-auto notranslate">check</span>}
                    </button>
                    <button
                        onClick={() => { onChange('9:16'); setIsOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                            value === '9:16' ? 'bg-[#7f13ec]/10 text-[#7f13ec]' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2A2A]'
                        }`}
                    >
                        <span className="material-symbols-outlined text-lg notranslate">crop_portrait</span>
                        <div className="flex flex-col items-start text-left">
                            <span className="font-bold">9:16</span>
                            <span className="text-[10px] opacity-70">Dọc</span>
                        </div>
                        {value === '9:16' && <span className="material-symbols-outlined text-sm ml-auto notranslate">check</span>}
                    </button>
                </div>
            )}
        </div>
    );
};

// ... existing ConfirmationModal ...
const ConfirmationModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; }> = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div 
                className="bg-surface dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#302839] rounded-2xl p-6 shadow-2xl max-w-sm w-full transform transition-all scale-100 origin-center"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-500 mb-2">
                        <span className="material-symbols-outlined notranslate text-2xl">delete</span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{message}</p>
                    <div className="flex gap-3 w-full mt-4">
                        <button onClick={onClose} className="flex-1 py-2.5 px-4 rounded-xl bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 font-medium transition-colors border border-gray-300 dark:border-gray-700"><span>Hủy bỏ</span></button>
                        <button onClick={onConfirm} className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-colors shadow-lg shadow-red-900/20"><span>Xóa ngay</span></button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ... existing sidebarItems ...
const sidebarItems = [
    { 
        id: 'arch-film', 
        label: 'Phim kiến trúc', 
        icon: <span className="material-symbols-outlined notranslate">movie_filter</span>,
        prompt: 'Cinematic architectural film, establishing shot, photorealistic, 4k, slow camera movement capturing the building details and atmosphere.',
        isMaintenance: false
    },
    { 
        id: 'img-to-video', 
        label: 'Tạo video từ ảnh', 
        icon: <span className="material-symbols-outlined notranslate">image</span>,
        prompt: 'High quality video generated from image, smooth motion, 4k, cinematic lighting.',
        isMaintenance: false
    },
    { 
        id: 'text-to-video', 
        label: 'Tạo video từ text', 
        icon: <span className="material-symbols-outlined notranslate">description</span>,
        prompt: 'A high quality video of modern architecture, cinematic view, 4k.',
        isMaintenance: true
    },
    { 
        id: 'transition', 
        label: 'Video chuyển cảnh', 
        icon: <span className="material-symbols-outlined notranslate">transition_push</span>,
        prompt: 'Smooth morphing transition, changing lighting from day to night, timelapse effect.',
        isMaintenance: true
    },
    {
        id: 'extend-video', 
        label: 'Mở rộng video',
        icon: <span className="material-symbols-outlined notranslate">playlist_add</span>,
        prompt: 'Nối tiếp cảnh quay hiện tại, giữ nguyên phong cách và ánh sáng, camera di chuyển mượt mà.',
        isMaintenance: true
    }
];

const DUMMY_FILE: FileData = {
    base64: '',
    mimeType: 'image/png',
    objectURL: 'https://placehold.co/600x400/1a1a1a/FFF?text=Text+To+Video'
};

const loadingMessages = [
    "Đang xử lý. Vui lòng đợi...",
    "Đang xử lý. Vui lòng đợi...",
    "Đang xử lý. Vui lòng đợi...",
];

const mapFriendlyErrorMessage = (errorMsg: string): string => {
    // ... same as original ...
    if (!errorMsg) return "Lỗi Kỹ Thuật: Đã xảy ra sự cố. Vui lòng thử lại sau.";
    const msg = errorMsg.toUpperCase();
    const suffix = " Vui lòng thử lại sau.";
    if (msg.includes("SAFETY_ERROR") || msg.includes("SAFETY") || msg.includes("BLOCK") || msg.includes("PROHIBITED")) return "Lỗi Nội Dung: Vi phạm chính sách an toàn." + suffix;
    if (msg.includes("QUOTA_ERROR") || msg.includes("429") || msg.includes("RESOURCE") || msg.includes("OVERLOAD")) return "Lỗi Quá Tải: Hệ thống đang bận." + suffix;
    if (msg.includes("TIMEOUT_ERROR") || msg.includes("HẾT THỜI GIAN") || msg.includes("TIMEOUT")) return "Lỗi Timeout: Quá trình xử lý quá lâu." + suffix;
    if (msg.includes("AUTH_ERROR") || msg.includes("401") || msg.includes("403") || msg.includes("TOKEN")) return "Lỗi Xác Thực: Phiên kết nối lỗi." + suffix;
    if (msg.includes("SYSTEM_ERROR") || msg.includes("500") || msg.includes("502") || msg.includes("NETWORK")) return "Lỗi Hệ Thống: Máy chủ gặp sự cố." + suffix;
    if (msg.includes("KHÔNG ĐỦ CREDITS")) return "Lỗi Thanh Toán: Bạn không đủ credits." + suffix;
    return `Lỗi Kỹ Thuật: ${errorMsg.substring(0, 40)}...` + suffix;
};

// ... MaintenanceView ...
const MaintenanceView = ({ title }: { title: string }) => (
    <div className="bg-white/80 dark:bg-[#191919]/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-[#302839] p-5 shadow-lg flex flex-col gap-6 h-full overflow-hidden items-center justify-center text-center animate-fade-in">
        <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mb-2 shadow-inner border border-yellow-500/20">
            <span className="material-symbols-outlined notranslate text-yellow-500 text-4xl">engineering</span>
        </div>
        <div>
            <h3 className="text-gray-900 dark:text-white font-bold text-2xl mb-3">{title}</h3>
            <div className="w-16 h-1 bg-yellow-500/50 mx-auto rounded-full mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 text-sm max-w-sm leading-relaxed mx-auto">
                Tính năng đang được tạm dừng để nâng cấp hệ thống máy chủ nhằm đảm bảo chất lượng render tốt nhất.
                <br/>
                Vui lòng quay lại sau!
            </p>
        </div>
        <div className="bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500/30 px-4 py-2 rounded-lg mt-2">
            <span className="text-yellow-600 dark:text-yellow-500 text-xs font-bold uppercase tracking-wider">Đang bảo trì</span>
        </div>
    </div>
);

// ... VideoPage Component ...
interface VideoPageProps {
    session: { user: User } | null;
    userStatus: UserStatus | null;
    onGoHome: () => void;
    onThemeToggle: () => void;
    theme: 'light' | 'dark';
    onSignOut: () => void;
    onOpenGallery: () => void;
    onUpgrade: () => void;
    onOpenProfile: () => void;
    onToggleNav: () => void;
    onDeductCredits: (amount: number, description: string) => Promise<string>;
    onRefreshCredits: () => Promise<void>;
}

const VideoPage: React.FC<VideoPageProps> = (props) => {
    // ... all existing logic ...
    const [activeItem, setActiveItem] = useState('arch-film');
    const [videoState, setVideoState] = useState<VideoGeneratorState>({ ...initialToolStates[Tool.VideoGeneration], aspectRatio: '16:9' });
    const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
    const [singleSourceImage, setSingleSourceImage] = useState<FileData | null>(null);
    const [singlePrompt, setSinglePrompt] = useState('');
    const [isSingleGenerating, setIsSingleGenerating] = useState(false);
    const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number>(0);
    const [isPlayingAll, setIsPlayingAll] = useState(false);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0); 
    const [isVideoMuted, setIsVideoMuted] = useState(false);
    const [isMusicMuted, setIsMusicMuted] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0); 
    const [audioDuration, setAudioDuration] = useState(0);
    const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; itemId: string | null }>({ isOpen: false, itemId: null });

    const mainVideoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const timelineContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const defaultItem = sidebarItems.find(item => item.id === activeItem);
        if (defaultItem) setSinglePrompt(defaultItem.prompt);
    }, [activeItem]);

    useEffect(() => {
        const videoEl = mainVideoRef.current;
        const audioEl = audioRef.current;
        if (isPlaying) {
            videoEl?.play().catch(() => {});
            if (isPlayingAll && !isMusicMuted) audioEl?.play().catch(() => {});
            else audioEl?.pause(); 
        } else {
            videoEl?.pause();
            audioEl?.pause();
        }
    }, [isPlaying, isPlayingAll, isMusicMuted]);

    useEffect(() => {
        if (mainVideoRef.current) mainVideoRef.current.muted = isVideoMuted;
        if (audioRef.current) audioRef.current.muted = isMusicMuted;
    }, [isVideoMuted, isMusicMuted]);

    useEffect(() => {
        if (isPlayingAll && isPlaying) {
            const videoEl = mainVideoRef.current;
            if (videoEl) {
                videoEl.currentTime = 0;
                videoEl.play().catch(() => {});
            }
        }
    }, [currentPlayingIndex]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (videoState.isLoading || isSingleGenerating || videoState.contextItems.some(i => i.isGeneratingVideo)) {
            interval = setInterval(() => {
                const currentIndex = loadingMessages.indexOf(videoState.loadingMessage);
                const nextIndex = (currentIndex + 1) % loadingMessages.length;
                setVideoState(prev => ({ ...prev, loadingMessage: loadingMessages[nextIndex] }));
            }, 5000); 
        }
        return () => { if (interval) clearInterval(interval); };
    }, [videoState.isLoading, isSingleGenerating, videoState.contextItems, videoState.loadingMessage]);

    // ... Playback functions (handleTimeUpdate, seekToPercent, handleSeek, handleTimelineClick, togglePlayPause, handleVideoEnded) ...
    // (omitted for brevity but they exist as per original file)
    const handleTimeUpdate = () => { if (!mainVideoRef.current) return; const currentClipTime = mainVideoRef.current.currentTime; const currentClipDuration = mainVideoRef.current.duration || 1; const playableItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline); const totalClips = playableItems.length; if (totalClips === 0) { setProgress(0); return; } if (isPlayingAll) { const segmentSize = 100 / totalClips; const currentClipProgressPercent = (currentClipTime / currentClipDuration) * segmentSize; const completedSegmentsPercent = currentPlayingIndex * segmentSize; const totalProgress = completedSegmentsPercent + currentClipProgressPercent; setProgress(Math.min(totalProgress, 100)); } else { setProgress((currentClipTime / currentClipDuration) * 100); } };
    const seekToPercent = (percent: number) => { const playableItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline); const totalClips = playableItems.length; if (totalClips === 0) return; if (isPlayingAll) { const segmentSize = 100 / totalClips; let targetIndex = Math.floor(percent / segmentSize); if (targetIndex >= totalClips) targetIndex = totalClips - 1; const percentWithinSegment = (percent % segmentSize) / segmentSize; if (targetIndex !== currentPlayingIndex) { setCurrentPlayingIndex(targetIndex); } setTimeout(() => { if (mainVideoRef.current) { const dur = mainVideoRef.current.duration || 1; mainVideoRef.current.currentTime = percentWithinSegment * dur; } }, 50); if (audioRef.current && audioDuration > 0) { audioRef.current.currentTime = (percent / 100) * audioDuration; } } else { if (mainVideoRef.current) { const dur = mainVideoRef.current.duration || 1; mainVideoRef.current.currentTime = (percent / 100) * dur; } } setProgress(percent); };
    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => seekToPercent(Number(e.target.value));
    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => { if (!timelineContainerRef.current) return; const rect = timelineContainerRef.current.getBoundingClientRect(); const x = e.clientX - rect.left; const percent = Math.max(0, Math.min(100, (x / rect.width) * 100)); seekToPercent(percent); };
    const togglePlayPause = () => { setIsPlaying(!isPlaying); const timelineCount = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline).length; if (!isPlaying && timelineCount > 1 && !isPlayingAll) { setIsPlayingAll(true); } };
    const handleVideoEnded = () => { if (!isPlayingAll) { setIsPlaying(false); return; } const playableItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline); if (currentPlayingIndex < playableItems.length - 1) { setCurrentPlayingIndex(prev => prev + 1); } else { setIsPlaying(false); setCurrentPlayingIndex(0); setProgress(0); if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } } };

    const handleSidebarClick = (item: typeof sidebarItems[0]) => { setActiveItem(item.id); setSinglePrompt(item.prompt); setVideoState(prev => ({ ...prev, error: null })); setSingleSourceImage(null); setIsSingleGenerating(false); };
    const handleAspectRatioChange = async (newRatio: '16:9' | '9:16' | 'default') => { if (videoState.aspectRatio === newRatio) return; setVideoState(prev => ({ ...prev, aspectRatio: newRatio })); if (videoState.contextItems.length > 0) { const updatedItems = await Promise.all(videoState.contextItems.map(async (item) => { if (item.isUploaded) return item; const croppedBase64 = await externalVideoService.resizeAndCropImage(item.originalFile, newRatio); const croppedFile: FileData = { base64: croppedBase64.split(',')[1], mimeType: 'image/jpeg', objectURL: croppedBase64 }; return { ...item, file: croppedFile }; })); setVideoState(prev => ({ ...prev, contextItems: updatedItems })); } };
    const handleFilesChange = async (files: FileData[]) => { const newItemsPromises = files.filter(f => !videoState.contextItems.some(item => item.originalFile.objectURL === f.objectURL)).map(async (f) => { const croppedBase64 = await externalVideoService.resizeAndCropImage(f, videoState.aspectRatio); const croppedFile: FileData = { base64: croppedBase64.split(',')[1], mimeType: 'image/jpeg', objectURL: croppedBase64 }; return { id: Math.random().toString(36).substr(2, 9), file: croppedFile, originalFile: f, prompt: '', isGeneratingPrompt: false, isUploaded: false, isInTimeline: false } as VideoContextItem; }); const newItems = await Promise.all(newItemsPromises); if (newItems.length > 0) { setVideoState(prev => ({ ...prev, contextItems: [...prev.contextItems, ...newItems] })); } };
    const handleGenerateContextPrompts = async () => { setIsGeneratingPrompts(true); const itemsToProcess = videoState.contextItems.filter(item => !item.isUploaded && !item.prompt && !item.videoUrl); setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(item => !item.isUploaded && !item.prompt && !item.videoUrl ? { ...item, isGeneratingPrompt: true } : item) })); try { const updatedItems = await Promise.all(itemsToProcess.map(async (item) => { try { const generatedPrompt = await geminiService.generateVideoPromptFromImage(item.file); return { ...item, prompt: generatedPrompt, isGeneratingPrompt: false }; } catch (error) { return { ...item, isGeneratingPrompt: false, prompt: "Cinematic architectural shot." }; } })); setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(item => updatedItems.find(u => u.id === item.id) || item) })); } finally { setIsGeneratingPrompts(false); } };

    const handleGenerateClip = async (item: VideoContextItem) => {
        const cost = 5;
        if ((props.userStatus?.credits || 0) < cost) { setVideoState(prev => ({ ...prev, error: mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") })); return; }
        if (!item.prompt) { setVideoState(prev => ({ ...prev, error: 'Vui lòng nhập prompt.' })); return; }
        
        // Changed to use the generic loading message
        setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, isGeneratingVideo: true } : i), error: null, loadingMessage: loadingMessages[0] }));
        
        let jobId: string | null = null;
        let logId: string | null = null;
        try {
            logId = await props.onDeductCredits(cost, `Tạo Video Clip (${activeItem})`);
            if (logId) localStorage.setItem('opzen_pending_tx', JSON.stringify({ logId: logId, amount: cost, reason: `Tạo Video Clip - ${item.prompt.substring(0, 20)}...`, timestamp: Date.now() }));
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) { jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.VideoGeneration, prompt: item.prompt, cost: cost, usage_log_id: logId }); if (!jobId && logId) throw new Error("Lỗi hệ thống: Không thể tạo bản ghi công việc."); localStorage.removeItem('opzen_pending_tx'); }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');
            const result = await externalVideoService.generateVideoExternal(item.prompt, "", item.file, videoState.aspectRatio);
            setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, videoUrl: result.videoUrl, isGeneratingVideo: false } : i), }));
            if (jobId) await jobService.updateJobStatus(jobId, 'completed', result.videoUrl);
            await historyService.addToHistory({ tool: Tool.VideoGeneration, prompt: item.prompt, sourceImageURL: item.file.objectURL, resultVideoURL: result.videoUrl });
        } catch (err: any) {
            const rawMsg = err.message || ""; let friendlyMsg = mapFriendlyErrorMessage(rawMsg); const { data: { user } } = await supabase.auth.getUser(); if (user && logId) { await refundCredits(user.id, cost, `Hoàn tiền: Lỗi tạo video (${rawMsg})`); await props.onRefreshCredits(); friendlyMsg += " (Credits đã được hoàn trả)"; } localStorage.removeItem('opzen_pending_tx'); setVideoState(prev => ({ ...prev, error: friendlyMsg, contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, isGeneratingVideo: false } : i) })); if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        }
    };

    const handleAddToTimeline = (id: string) => { setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(i => i.id === id ? { ...i, isInTimeline: true } : i) })); };
    const handleDeleteItem = (id: string) => { setDeleteModalState({ isOpen: true, itemId: id }); };
    const executeDelete = () => { if (deleteModalState.itemId) { setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.filter(i => i.id !== deleteModalState.itemId) })); } setDeleteModalState({ isOpen: false, itemId: null }); };
    const handleRemoveFromTimeline = (id: string) => { setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(i => i.id === id ? { ...i, isInTimeline: false } : i) })); };

    const handleSingleGeneration = async () => {
        const cost = 5;
        if ((props.userStatus?.credits || 0) < cost) { setVideoState(prev => ({ ...prev, error: mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") })); return; }
        if (!singlePrompt) { setVideoState(prev => ({ ...prev, error: 'Vui lòng nhập mô tả.' })); return; }
        if (activeItem === 'img-to-video' && !singleSourceImage) { setVideoState(prev => ({ ...prev, error: 'Vui lòng tải lên ảnh.' })); return; }
        
        setIsSingleGenerating(true);
        // Changed to use the generic loading message
        setVideoState(prev => ({ ...prev, error: null, generatedVideoUrl: null, loadingMessage: loadingMessages[0] }));
        
        let jobId: string | null = null;
        let logId: string | null = null;
        try {
            logId = await props.onDeductCredits(cost, `Tạo Video (${activeItem})`);
            if (logId) localStorage.setItem('opzen_pending_tx', JSON.stringify({ logId: logId, amount: cost, reason: `Tạo Single Video - ${activeItem}`, timestamp: Date.now() }));
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) { jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.VideoGeneration, prompt: singlePrompt, cost: cost, usage_log_id: logId }); if (!jobId && logId) throw new Error("Lỗi hệ thống: Không thể tạo bản ghi công việc."); localStorage.removeItem('opzen_pending_tx'); }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');
            let startImageToUse: FileData | null | undefined = singleSourceImage;
            if (activeItem === 'text-to-video') { startImageToUse = undefined; } else if (singleSourceImage) { const croppedBase64 = await externalVideoService.resizeAndCropImage(singleSourceImage, videoState.aspectRatio); startImageToUse = { base64: croppedBase64.split(',')[1], mimeType: 'image/jpeg', objectURL: croppedBase64 }; }
            const result = await externalVideoService.generateVideoExternal(singlePrompt, "", startImageToUse || undefined, videoState.aspectRatio);
            setVideoState(prev => ({ ...prev, generatedVideoUrl: result.videoUrl }));
            // handleSimpleDownload(result.videoUrl); // Optional auto-download
            if (jobId) await jobService.updateJobStatus(jobId, 'completed', result.videoUrl);
            await historyService.addToHistory({ tool: Tool.VideoGeneration, prompt: singlePrompt, sourceImageURL: startImageToUse?.objectURL, resultVideoURL: result.videoUrl });
        } catch (err: any) {
            const rawMsg = err.message || ""; let friendlyMsg = mapFriendlyErrorMessage(rawMsg); const { data: { user } } = await supabase.auth.getUser(); if (user && logId) { await refundCredits(user.id, cost, `Hoàn tiền: Lỗi tạo video (${rawMsg})`); await props.onRefreshCredits(); friendlyMsg += " (Credits đã được hoàn trả)"; } localStorage.removeItem('opzen_pending_tx'); setVideoState(prev => ({ ...prev, error: friendlyMsg })); if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        } finally { setIsSingleGenerating(false); }
    };

    // ... (rest of the file: handleMergeAndExport, handleDownloadSingle, handleDownloadAll, handleSimpleDownload, etc. are largely unchanged except ensuring context) ...
    // (omitted large unchanged sections for brevity, focusing on the fix)
    const handleMergeAndExport = async () => { /* ... */ };
    const handleDownloadSingle = (url: string, index: number) => { /* ... */ };
    const handleDownloadAll = async () => { /* ... */ };
    const handleSimpleDownload = async (urlOverride?: string) => { /* ... */ };
    const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => { /* ... */ };
    const handleExtendClip = (item: VideoContextItem) => { setActiveItem('extend-video'); setSinglePrompt("Nối tiếp cảnh quay hiện tại, giữ nguyên phong cách và ánh sáng, camera di chuyển mượt mà."); };
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => { setDraggedItemIndex(index); e.dataTransfer.effectAllowed = "move"; };
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
    const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => { e.preventDefault(); if (draggedItemIndex === null || draggedItemIndex === index) return; const timelineItems = videoState.contextItems.filter(item => item.videoUrl && item.isInTimeline); const draggedItem = timelineItems[draggedItemIndex]; const targetItem = timelineItems[index]; const mainDraggedIdx = videoState.contextItems.findIndex(i => i.id === draggedItem.id); const mainTargetIdx = videoState.contextItems.findIndex(i => i.id === targetItem.id); if (mainDraggedIdx > -1 && mainTargetIdx > -1) { const updatedMainList = [...videoState.contextItems]; const [removed] = updatedMainList.splice(mainDraggedIdx, 1); updatedMainList.splice(mainTargetIdx, 0, removed); setVideoState(prev => ({...prev, contextItems: updatedMainList})); } setDraggedItemIndex(null); };

    const creationItems = videoState.contextItems.filter(item => !item.isUploaded); 
    const timelineItems = videoState.contextItems.filter(item => item.videoUrl && item.isInTimeline);
    const activeMainVideoUrl = isPlayingAll ? timelineItems[currentPlayingIndex]?.videoUrl : (videoState.generatedVideoUrl || timelineItems.find(i => i.videoUrl)?.videoUrl);

    // ... Render code ...
    // (Ensure loadingMessage is used in the UI for single generation)
    // In the return JSX, find where isSingleGenerating is true:
    // {isSingleGenerating ? ( <div ...> <Spinner /> <span ...>{videoState.loadingMessage || 'Đang xử lý. Vui lòng đợi...'}</span> </div> ) : ... }

    return (
        // ... (Full JSX of VideoPage, ensuring `loadingMessages` usage is consistent with "Đang xử lý. Vui lòng đợi...") ...
        <div className="h-[100dvh] bg-main-bg dark:bg-dark-bg font-sans flex flex-col overflow-hidden text-text-primary dark:text-white transition-colors duration-300">
            {/* Header, Sidebar, Main Content structure matches original file */}
            {/* ... */}
            <Header 
                onGoHome={props.onGoHome} onThemeToggle={props.onThemeToggle} theme={props.theme} 
                onSignOut={props.onSignOut} onOpenGallery={props.onOpenGallery} onUpgrade={props.onUpgrade} 
                onOpenProfile={props.onOpenProfile} userStatus={props.userStatus} user={props.session?.user || null}
                onToggleNav={props.onToggleNav}
            />
            {/* ... */}
             <main className="flex-1 bg-main-bg dark:bg-[#121212] overflow-y-auto p-4 md:p-6 relative scrollbar-hide transition-colors duration-300">
                 {/* ... */}
                 {activeItem === 'img-to-video' && (
                     // ...
                     <button
                        onClick={handleSingleGeneration}
                        disabled={isSingleGenerating} 
                        className="flex-1 py-3 bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 h-full"
                    >
                        {isSingleGenerating ? <Spinner /> : <span className="material-symbols-outlined notranslate">movie_creation</span>}
                        <span className="whitespace-nowrap">{isSingleGenerating ? 'Đang xử lý...' : 'Tạo Video'}</span>
                    </button>
                     // ...
                 )}
                 {/* ... */}
                 {/* Single Mode Result Area */}
                 {/* ... */}
                 <div className="flex-1 bg-black rounded-xl border border-border-color dark:border-[#302839] relative flex items-center justify-center overflow-hidden min-h-[400px]">
                    {isSingleGenerating ? (
                        <div className="flex flex-col items-center justify-center text-gray-400 gap-3">
                            <Spinner />
                            <span className="animate-pulse text-sm">{videoState.loadingMessage || 'Đang xử lý. Vui lòng đợi...'}</span>
                        </div>
                    ) : videoState.generatedVideoUrl ? (
                        <video src={videoState.generatedVideoUrl} controls autoPlay loop className="w-full h-full object-contain max-h-[70vh]" />
                    ) : (
                        <div className="flex flex-col items-center opacity-30">
                            <span className="material-symbols-outlined text-6xl mb-2 text-white notranslate">video_file</span>
                            <p className="text-gray-300 text-sm">Kết quả sẽ hiển thị ở đây</p>
                        </div>
                    )}
                </div>
                 {/* ... */}
             </main>
        </div>
    );
};

export default VideoPage;
