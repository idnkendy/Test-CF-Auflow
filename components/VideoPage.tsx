
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
}

const sidebarItems = [
    { 
        id: 'arch-film', 
        label: 'Phim kiến trúc', 
        icon: <span className="material-symbols-outlined">movie_filter</span>,
        prompt: 'Cinematic architectural film, establishing shot, photorealistic, 4k, slow camera movement capturing the building details and atmosphere.',
        isMaintenance: false
    },
    { 
        id: 'img-to-video', 
        label: 'Tạo video từ ảnh', 
        icon: <span className="material-symbols-outlined">image</span>,
        prompt: 'High quality video generated from image, smooth motion, 4k, cinematic lighting.',
        isMaintenance: false
    },
    { 
        id: 'text-to-video', 
        label: 'Tạo video từ text', 
        icon: <span className="material-symbols-outlined">description</span>,
        prompt: 'A high quality video of modern architecture, cinematic view, 4k.',
        isMaintenance: true
    },
    { 
        id: 'transition', 
        label: 'Video chuyển cảnh', 
        icon: <span className="material-symbols-outlined">transition_push</span>,
        prompt: 'Smooth morphing transition, changing lighting from day to night, timelapse effect.',
        isMaintenance: true
    },
    {
        id: 'extend-video',
        label: 'Mở rộng video',
        icon: <span className="material-symbols-outlined">playlist_add</span>,
        prompt: 'Nối tiếp cảnh quay hiện tại, giữ nguyên phong cách và ánh sáng, camera di chuyển mượt mà.',
        isMaintenance: true
    }
];

// Placeholder for text-to-video dummy file
const DUMMY_FILE: FileData = {
    base64: '',
    mimeType: 'image/png',
    objectURL: 'https://placehold.co/600x400/1a1a1a/FFF?text=Text+To+Video'
};

const loadingMessages = [
    "Đang kết nối với máy chủ Veo...",
    "Đang gửi yêu cầu đến Worker...",
    "AI đang khởi tạo các photon ánh sáng...",
    "Đang tổng hợp từng khung hình...",
    "Vui lòng không tắt tab này...",
    "Quá trình có thể mất 3-6 phút...",
    "Nếu quá lâu, hệ thống sẽ tự động thử lại...",
];

const mapFriendlyErrorMessage = (errorMsg: string): string => {
    if (!errorMsg) return "Lỗi Kỹ Thuật: Đã xảy ra sự cố. Vui lòng thử lại sau.";
    
    const msg = errorMsg.toUpperCase();
    const suffix = " Vui lòng thử lại sau.";

    if (msg.includes("SAFETY_ERROR") || msg.includes("SAFETY") || msg.includes("BLOCK") || msg.includes("PROHIBITED")) {
        return "Lỗi Nội Dung: Vi phạm chính sách an toàn." + suffix;
    }
    if (msg.includes("QUOTA_ERROR") || msg.includes("429") || msg.includes("RESOURCE") || msg.includes("OVERLOAD")) {
        return "Lỗi Quá Tải: Hệ thống đang bận." + suffix;
    }
    if (msg.includes("TIMEOUT_ERROR") || msg.includes("HẾT THỜI GIAN") || msg.includes("TIMEOUT")) {
        return "Lỗi Timeout: Quá trình xử lý quá lâu." + suffix;
    }
    if (msg.includes("AUTH_ERROR") || msg.includes("401") || msg.includes("403") || msg.includes("TOKEN")) {
        return "Lỗi Xác Thực: Phiên kết nối lỗi." + suffix;
    }
    if (msg.includes("SYSTEM_ERROR") || msg.includes("500") || msg.includes("502") || msg.includes("NETWORK")) {
        return "Lỗi Hệ Thống: Máy chủ gặp sự cố." + suffix;
    }
    if (msg.includes("KHÔNG ĐỦ CREDITS")) {
        return "Lỗi Thanh Toán: Bạn không đủ credits." + suffix;
    }

    // Default for unknown errors with truncated message
    return `Lỗi Kỹ Thuật: ${errorMsg.substring(0, 40)}...` + suffix;
};

// --- MAINTENANCE COMPONENT ---
const MaintenanceView = ({ title }: { title: string }) => (
    <div className="bg-[#191919]/80 backdrop-blur-md rounded-2xl border border-[#302839] p-5 shadow-lg flex flex-col gap-6 h-full overflow-hidden items-center justify-center text-center animate-fade-in">
        <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mb-2 shadow-inner border border-yellow-500/20">
            <span className="material-symbols-outlined text-yellow-500 text-4xl">engineering</span>
        </div>
        <div>
            <h3 className="text-white font-bold text-2xl mb-3">{title}</h3>
            <div className="w-16 h-1 bg-yellow-500/50 mx-auto rounded-full mb-4"></div>
            <p className="text-gray-400 text-sm max-w-sm leading-relaxed mx-auto">
                Tính năng đang được tạm dừng để nâng cấp hệ thống máy chủ nhằm đảm bảo chất lượng render tốt nhất.
                <br/>
                Vui lòng quay lại sau!
            </p>
        </div>
        <div className="bg-yellow-900/20 border border-yellow-500/30 px-4 py-2 rounded-lg mt-2">
            <span className="text-yellow-500 text-xs font-bold uppercase tracking-wider">Đang bảo trì</span>
        </div>
    </div>
);

const VideoPage: React.FC<VideoPageProps> = (props) => {
    const [activeItem, setActiveItem] = useState('arch-film');
    const [videoState, setVideoState] = useState<VideoGeneratorState>(initialToolStates[Tool.VideoGeneration]);
    const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
    
    // --- SINGLE MODE STATES (Img2Vid, Text2Vid, Transition) ---
    const [singleSourceImage, setSingleSourceImage] = useState<FileData | null>(null);
    const [singleEndImage, setSingleEndImage] = useState<FileData | null>(null); // For transition
    const [singlePrompt, setSinglePrompt] = useState('');
    const [isSingleGenerating, setIsSingleGenerating] = useState(false);

    // --- EXTEND VIDEO STATE ---
    const [videoToExtend, setVideoToExtend] = useState<VideoContextItem | null>(null);

    // --- TIMELINE & PLAYER STATES ---
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

    const mainVideoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const timelineContainerRef = useRef<HTMLDivElement>(null);

    // Initialize prompt
    useEffect(() => {
        const defaultItem = sidebarItems.find(item => item.id === activeItem);
        if (defaultItem) {
            setSinglePrompt(defaultItem.prompt);
        }
    }, [activeItem]);

    // Sync Playback
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
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [videoState.isLoading, isSingleGenerating, videoState.contextItems, videoState.loadingMessage]);

    // --- TIMELINE CONTROLS ---
    const handleTimeUpdate = () => {
        if (!mainVideoRef.current) return;
        const currentClipTime = mainVideoRef.current.currentTime;
        const currentClipDuration = mainVideoRef.current.duration || 1; 
        const playableItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        const totalClips = playableItems.length;

        if (totalClips === 0) { setProgress(0); return; }

        if (isPlayingAll) {
            const segmentSize = 100 / totalClips;
            const currentClipProgressPercent = (currentClipTime / currentClipDuration) * segmentSize;
            const completedSegmentsPercent = currentPlayingIndex * segmentSize;
            const totalProgress = completedSegmentsPercent + currentClipProgressPercent;
            setProgress(Math.min(totalProgress, 100));
        } else {
            setProgress((currentClipTime / currentClipDuration) * 100);
        }
    };

    const seekToPercent = (percent: number) => {
        const playableItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        const totalClips = playableItems.length;
        if (totalClips === 0) return;

        if (isPlayingAll) {
            const segmentSize = 100 / totalClips;
            let targetIndex = Math.floor(percent / segmentSize);
            if (targetIndex >= totalClips) targetIndex = totalClips - 1; 
            const percentWithinSegment = (percent % segmentSize) / segmentSize;
            
            if (targetIndex !== currentPlayingIndex) {
                setCurrentPlayingIndex(targetIndex);
            }
            setTimeout(() => {
                if (mainVideoRef.current) {
                    const dur = mainVideoRef.current.duration || 1;
                    mainVideoRef.current.currentTime = percentWithinSegment * dur;
                }
            }, 50);
            if (audioRef.current && audioDuration > 0) {
                audioRef.current.currentTime = (percent / 100) * audioDuration;
            }
        } else {
            if (mainVideoRef.current) {
                const dur = mainVideoRef.current.duration || 1;
                mainVideoRef.current.currentTime = (percent / 100) * dur;
            }
        }
        setProgress(percent);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => seekToPercent(Number(e.target.value));
    
    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineContainerRef.current) return;
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        seekToPercent(percent);
    };

    const togglePlayPause = () => {
        setIsPlaying(!isPlaying);
        const timelineCount = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline).length;
        if (!isPlaying && timelineCount > 1 && !isPlayingAll) {
            setIsPlayingAll(true);
        }
    };

    const handleVideoEnded = () => {
        if (!isPlayingAll) {
            setIsPlaying(false);
            return;
        }
        const playableItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        if (currentPlayingIndex < playableItems.length - 1) {
            setCurrentPlayingIndex(prev => prev + 1);
        } else {
            setIsPlaying(false);
            setCurrentPlayingIndex(0);
            setProgress(0);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        }
    };

    // --- SIDEBAR & MODE SWITCH ---
    const handleSidebarClick = (item: typeof sidebarItems[0]) => {
        setActiveItem(item.id);
        setSinglePrompt(item.prompt);
        setVideoState(prev => ({ ...prev, error: null }));
        // Reset single mode states
        setSingleSourceImage(null);
        setSingleEndImage(null);
        setIsSingleGenerating(false);
        if (item.id !== 'extend-video') {
            setVideoToExtend(null);
        }
    };

    // --- ASPECT RATIO CHANGE HANDLER ---
    const handleAspectRatioChange = async (newRatio: '16:9' | '9:16') => {
        if (videoState.aspectRatio === newRatio) return;

        // 1. Update ratio state
        setVideoState(prev => ({ ...prev, aspectRatio: newRatio }));

        // 2. If there are existing image items, re-crop them to match the new ratio
        if (videoState.contextItems.length > 0) {
            const updatedItems = await Promise.all(videoState.contextItems.map(async (item) => {
                if (item.isUploaded) return item; // Skip uploaded videos

                // Re-crop using originalFile
                const croppedBase64 = await externalVideoService.resizeAndCropImage(item.originalFile, newRatio);
                const croppedFile: FileData = { 
                    base64: croppedBase64.split(',')[1], 
                    mimeType: 'image/jpeg', 
                    objectURL: croppedBase64 
                };
                
                // Return updated item
                return { ...item, file: croppedFile };
            }));

            setVideoState(prev => ({ ...prev, contextItems: updatedItems }));
        }
    };

    // --- ARCH FILM (BATCH) LOGIC ---
    const handleFilesChange = async (files: FileData[]) => {
        const newItemsPromises = files
            .filter(f => !videoState.contextItems.some(item => item.originalFile.objectURL === f.objectURL))
            .map(async (f) => {
                const croppedBase64 = await externalVideoService.resizeAndCropImage(f, videoState.aspectRatio);
                const croppedFile: FileData = { base64: croppedBase64.split(',')[1], mimeType: 'image/jpeg', objectURL: croppedBase64 };
                return {
                    id: Math.random().toString(36).substr(2, 9),
                    file: croppedFile, originalFile: f, prompt: '', isGeneratingPrompt: false, isUploaded: false, isInTimeline: false
                } as VideoContextItem;
            });
        
        const newItems = await Promise.all(newItemsPromises);
        if (newItems.length > 0) {
            setVideoState(prev => ({ ...prev, contextItems: [...prev.contextItems, ...newItems] }));
        }
    };

    const handleGenerateContextPrompts = async () => {
        setIsGeneratingPrompts(true);
        const itemsToProcess = videoState.contextItems.filter(item => !item.isUploaded && !item.prompt && !item.videoUrl);
        
        setVideoState(prev => ({
            ...prev,
            contextItems: prev.contextItems.map(item => !item.isUploaded && !item.prompt && !item.videoUrl ? { ...item, isGeneratingPrompt: true } : item)
        }));

        try {
            const updatedItems = await Promise.all(itemsToProcess.map(async (item) => {
                try {
                    const generatedPrompt = await geminiService.generateVideoPromptFromImage(item.file);
                    return { ...item, prompt: generatedPrompt, isGeneratingPrompt: false };
                } catch (error) {
                    return { ...item, isGeneratingPrompt: false, prompt: "Cinematic architectural shot." };
                }
            }));
            setVideoState(prev => ({
                ...prev,
                contextItems: prev.contextItems.map(item => updatedItems.find(u => u.id === item.id) || item)
            }));
        } finally {
            setIsGeneratingPrompts(false);
        }
    };

    // --- GENERAL GENERATION LOGIC (Used by Arch Film clips) ---
    const handleGenerateClip = async (item: VideoContextItem) => {
        const cost = 5;
        if (props.onDeductCredits && (props.userStatus?.credits || 0) < cost) {
             setVideoState(prev => ({ ...prev, error: mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") }));
             return;
        }
        if (!item.prompt) {
            setVideoState(prev => ({ ...prev, error: 'Vui lòng nhập prompt.' }));
            return;
        }

        setVideoState(prev => ({
            ...prev,
            contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, isGeneratingVideo: true } : i),
            error: null,
            loadingMessage: loadingMessages[0]
        }));

        let jobId: string | null = null;
        let logId: string | null = null;

        try {
            if (props.onDeductCredits) logId = await props.onDeductCredits(cost, `Tạo Video Clip (${activeItem})`);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) { 
                 jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.VideoGeneration, prompt: item.prompt, cost: cost, usage_log_id: logId });
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const result = await externalVideoService.generateVideoExternal(item.prompt, "", item.file, videoState.aspectRatio);
            
            // Keep the same ID for the item but update its URL. Important: Do not automatically add to timeline.
            setVideoState(prev => ({
                ...prev,
                contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, videoUrl: result.videoUrl, isGeneratingVideo: false } : i),
                // removed generatedVideoUrl update to prevent auto-preview
            }));

            if (jobId) await jobService.updateJobStatus(jobId, 'completed', result.videoUrl);
            await historyService.addToHistory({ tool: Tool.VideoGeneration, prompt: item.prompt, sourceImageURL: item.file.objectURL, resultVideoURL: result.videoUrl });

        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyMsg = mapFriendlyErrorMessage(rawMsg);
            
            setVideoState(prev => ({ ...prev, error: friendlyMsg, contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, isGeneratingVideo: false } : i) }));
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) await refundCredits(user.id, cost, `Hoàn tiền: Lỗi tạo video`);
        }
    };

    const handleAddToTimeline = (id: string) => {
        setVideoState(prev => ({
            ...prev,
            contextItems: prev.contextItems.map(i => i.id === id ? { ...i, isInTimeline: true } : i)
        }));
    };

    // --- SINGLE GENERATION LOGIC (Img2Vid, Text2Vid, Transition) ---
    const handleSingleGeneration = async () => {
        const cost = 5;
        if (props.onDeductCredits && (props.userStatus?.credits || 0) < cost) {
             setVideoState(prev => ({ ...prev, error: mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") }));
             return;
        }
        if (!singlePrompt) {
            setVideoState(prev => ({ ...prev, error: 'Vui lòng nhập mô tả.' }));
            return;
        }
        // Validation per mode
        if (activeItem === 'img-to-video' && !singleSourceImage) {
            setVideoState(prev => ({ ...prev, error: 'Vui lòng tải lên ảnh.' }));
            return;
        }
        if (activeItem === 'transition' && !singleSourceImage) {
            setVideoState(prev => ({ ...prev, error: 'Vui lòng tải lên ảnh bắt đầu.' }));
            return;
        }

        setIsSingleGenerating(true);
        setVideoState(prev => ({ ...prev, error: null, generatedVideoUrl: null, loadingMessage: loadingMessages[0] }));

        let jobId: string | null = null;
        let logId: string | null = null;

        try {
            if (props.onDeductCredits) logId = await props.onDeductCredits(cost, `Tạo Video (${activeItem})`);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) { 
                 jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.VideoGeneration, prompt: singlePrompt, cost: cost, usage_log_id: logId });
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            // Handle Image Processing if needed
            let startImageToUse = singleSourceImage;
            if (activeItem === 'text-to-video') {
                startImageToUse = undefined; 
            } else if (singleSourceImage) {
                // Crop
                const croppedBase64 = await externalVideoService.resizeAndCropImage(singleSourceImage, videoState.aspectRatio);
                startImageToUse = { base64: croppedBase64.split(',')[1], mimeType: 'image/jpeg', objectURL: croppedBase64 };
            }

            const result = await externalVideoService.generateVideoExternal(singlePrompt, "", startImageToUse || undefined, videoState.aspectRatio);
            
            // For single modes, we just update the generatedVideoUrl directly
            setVideoState(prev => ({
                ...prev,
                generatedVideoUrl: result.videoUrl
            }));

            if (jobId) await jobService.updateJobStatus(jobId, 'completed', result.videoUrl);
            await historyService.addToHistory({ 
                tool: Tool.VideoGeneration, 
                prompt: singlePrompt, 
                sourceImageURL: startImageToUse?.objectURL, 
                resultVideoURL: result.videoUrl 
            });

        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyMsg = mapFriendlyErrorMessage(rawMsg);
            
            setVideoState(prev => ({ ...prev, error: friendlyMsg }));
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) await refundCredits(user.id, cost, `Hoàn tiền: Lỗi tạo video`);
        } finally {
            setIsSingleGenerating(false);
        }
    };

    // --- MERGE AND EXPORT ---
    const handleMergeAndExport = async () => {
        const playableItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        if (playableItems.length === 0) {
            setVideoState(prev => ({ ...prev, error: "Cần ít nhất một clip video để xuất." }));
            return;
        }
        setIsExporting(true);
        setExportProgress(0);
        setIsPlaying(false);
        setIsPlayingAll(false);

        const canvas = document.createElement('canvas');
        canvas.width = videoState.aspectRatio === '16:9' ? 1920 : 1080;
        canvas.height = videoState.aspectRatio === '16:9' ? 1080 : 1920;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setIsExporting(false); return; }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const videoStream = canvas.captureStream(30);
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const dest = audioContext.createMediaStreamDestination();
        
        // Handle Background Music
        let bgSource: AudioBufferSourceNode | null = null;
        if (audioUrl && !isMusicMuted) {
            try {
                const response = await fetch(audioUrl);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                bgSource = audioContext.createBufferSource();
                bgSource.buffer = audioBuffer;
                bgSource.connect(dest);
                bgSource.start(0);
            } catch (e) { console.error(e); }
        }

        // If either audio is enabled, add track
        if ((!isMusicMuted && audioUrl) || !isVideoMuted) {
             if (dest.stream.getAudioTracks().length > 0) {
                videoStream.addTrack(dest.stream.getAudioTracks()[0]);
            }
        }

        const recorder = new MediaRecorder(videoStream, { mimeType: 'video/webm;codecs=vp9' });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Opzen_Project_${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (bgSource) bgSource.stop();
            audioContext.close();
            setIsExporting(false);
            setExportProgress(0);
        };

        recorder.start();
        const hiddenVideo = document.createElement('video');
        hiddenVideo.crossOrigin = "anonymous";
        hiddenVideo.muted = false; 
        hiddenVideo.volume = isVideoMuted ? 0 : 1; 
        
        // Connect video element audio to destination if video sound is enabled
        if (!isVideoMuted) {
            try {
                const source = audioContext.createMediaElementSource(hiddenVideo);
                source.connect(dest);
            } catch (e) {}
        }

        for (let i = 0; i < playableItems.length; i++) {
            const item = playableItems[i];
            if (!item.videoUrl) continue;
            setExportProgress(((i) / playableItems.length) * 100);
            await new Promise<void>((resolve) => {
                hiddenVideo.src = item.videoUrl!;
                hiddenVideo.onloadedmetadata = () => hiddenVideo.play();
                const drawFrame = () => {
                    if (hiddenVideo.paused || hiddenVideo.ended) return;
                    ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
                    requestAnimationFrame(drawFrame);
                };
                hiddenVideo.onplay = () => drawFrame();
                hiddenVideo.onended = () => resolve();
                hiddenVideo.onerror = () => resolve(); 
            });
        }
        setExportProgress(100);
        recorder.stop();
    };

    // --- COMMON DOWNLOAD/UPLOAD ---
    const handleDownloadSingle = async (url: string, index: number) => {
        const filename = `Canh_${index + 1}.mp4`;
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        } catch (e) {
            console.error("Blob download failed, fallback to direct link", e);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.target = "_blank"; // Force new tab as fallback
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleDownloadAll = async () => {
        const playableItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        if (playableItems.length === 0) return;

        // Simple sequential download trigger
        for (let i = 0; i < playableItems.length; i++) {
            if (playableItems[i].videoUrl) {
                // Short delay to prevent browser blocking excessive downloads
                setTimeout(() => {
                    handleDownloadSingle(playableItems[i].videoUrl!, i);
                }, i * 1000); 
            }
        }
    };
    
    const handleSimpleDownload = async () => {
        if (videoState.generatedVideoUrl) {
            const filename = `opzen-video-${Date.now()}.mp4`;
            try {
                const response = await fetch(videoState.generatedVideoUrl);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
            } catch (e) {
                const link = document.createElement('a');
                link.href = videoState.generatedVideoUrl;
                link.download = filename;
                link.target = "_blank";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }
    };

    const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const objectURL = URL.createObjectURL(file);
        const newItem: VideoContextItem = {
            id: `vid_${Math.random().toString(36).substr(2, 9)}`,
            file: DUMMY_FILE, originalFile: DUMMY_FILE, prompt: `Uploaded Video: ${file.name}`,
            isGeneratingPrompt: false, videoUrl: objectURL, isGeneratingVideo: false, isUploaded: true, isInTimeline: true
        };
        setVideoState(prev => ({ ...prev, contextItems: [...prev.contextItems, newItem] }));
        if (videoInputRef.current) videoInputRef.current.value = '';
    };

    // --- CLIP EXTENSION ---
    const handleExtendClip = (item: VideoContextItem) => {
        setVideoToExtend(item);
        setActiveItem('extend-video');
        setSinglePrompt("Nối tiếp cảnh quay hiện tại, giữ nguyên phong cách và ánh sáng, camera di chuyển mượt mà.");
    };

    // --- DRAG AND DROP HANDLERS ---
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = "move";
        // Ghost image transparency if needed
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === index) return;

        // Find actual indices in contextItems list
        const timelineItems = videoState.contextItems.filter(item => item.videoUrl && item.isInTimeline);
        const draggedItem = timelineItems[draggedItemIndex];
        const targetItem = timelineItems[index];

        const mainDraggedIdx = videoState.contextItems.findIndex(i => i.id === draggedItem.id);
        const mainTargetIdx = videoState.contextItems.findIndex(i => i.id === targetItem.id);

        if (mainDraggedIdx > -1 && mainTargetIdx > -1) {
             const updatedMainList = [...videoState.contextItems];
             const [removed] = updatedMainList.splice(mainDraggedIdx, 1);
             updatedMainList.splice(mainTargetIdx, 0, removed);
             setVideoState(prev => ({...prev, contextItems: updatedMainList}));
        }
        
        setDraggedItemIndex(null);
    };


    const creationItems = videoState.contextItems.filter(item => !item.isUploaded); 
    const timelineItems = videoState.contextItems.filter(item => item.videoUrl && item.isInTimeline);
    const activeMainVideoUrl = isPlayingAll ? timelineItems[currentPlayingIndex]?.videoUrl : (videoState.generatedVideoUrl || timelineItems.find(i => i.videoUrl)?.videoUrl);

    // --- RENDER CONTENT SECTIONS ---
    const renderContentInput = () => {
        switch (activeItem) {
            case 'arch-film': // BATCH MODE
                return (
                    <div className="bg-[#191919]/80 backdrop-blur-md rounded-2xl border border-[#302839] p-5 shadow-lg flex flex-col gap-4 h-full overflow-hidden">
                        <h3 className="text-white font-bold text-base flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#7f13ec]/20 text-[#7f13ec] flex items-center justify-center text-xs">1</span>
                            Tải ảnh bối cảnh (Batch)
                        </h3>
                        <div className="rounded-xl bg-[#121212]/50 hover:border-[#7f13ec]/50 transition-colors h-[400px] flex flex-col">
                            <MultiImageUpload onFilesChange={handleFilesChange} maxFiles={10} className="h-full" />
                        </div>
                        <button
                            onClick={handleGenerateContextPrompts}
                            disabled={creationItems.length === 0 || isGeneratingPrompts}
                            className="w-full py-2.5 bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] hover:from-[#690fca] hover:to-[#8a3dcf] text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isGeneratingPrompts ? <Spinner /> : <span className="material-symbols-outlined">auto_fix_high</span>}
                            {isGeneratingPrompts ? 'Đang phân tích...' : 'Tạo Bối Cảnh (Magic Generate)'}
                        </button>
                    </div>
                );
            case 'img-to-video':
                return (
                    <div className="bg-[#191919]/80 backdrop-blur-md rounded-2xl border border-[#302839] p-5 shadow-lg flex flex-col gap-4 h-full overflow-hidden">
                        <h3 className="text-white font-bold text-base flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#7f13ec]">image</span>
                            Tạo video từ ảnh
                        </h3>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-2">Ảnh bắt đầu</label>
                                <ImageUpload onFileSelect={setSingleSourceImage} previewUrl={singleSourceImage?.objectURL} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-2">Mô tả video</label>
                                <textarea 
                                    value={singlePrompt}
                                    onChange={(e) => setSinglePrompt(e.target.value)}
                                    className="w-full bg-[#121212] border border-[#302839] rounded-lg p-3 text-sm text-gray-200 focus:border-[#7f13ec] focus:outline-none resize-none h-32"
                                    placeholder="Mô tả chuyển động..."
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleSingleGeneration}
                            disabled={!singleSourceImage || !singlePrompt || isSingleGenerating}
                            className="w-full py-3 bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSingleGenerating ? <Spinner /> : <span className="material-symbols-outlined">movie_creation</span>}
                            {isSingleGenerating ? 'Đang tạo...' : 'Tạo Video'}
                        </button>
                    </div>
                );
            case 'text-to-video':
                return <MaintenanceView title="Tạo video từ text" />;
            case 'transition':
                return <MaintenanceView title="Video chuyển cảnh" />;
            case 'extend-video':
                return <MaintenanceView title="Mở rộng video" />;
            default: return null;
        }
    };

    return (
        <div className="h-[100dvh] bg-dark-bg font-sans flex flex-col overflow-hidden text-white">
            <Header 
                onGoHome={props.onGoHome} onThemeToggle={props.onThemeToggle} theme={props.theme} 
                onSignOut={props.onSignOut} onOpenGallery={props.onOpenGallery} onUpgrade={props.onUpgrade} 
                onOpenProfile={props.onOpenProfile} userStatus={props.userStatus} user={props.session?.user || null}
                onToggleNav={props.onToggleNav}
            />

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT SIDEBAR */}
                <aside className="w-[70px] md:w-64 bg-[#191919] border-r border-[#302839] flex flex-col z-10 flex-shrink-0">
                    <div className="p-2 md:p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-1 mb-6 px-2">
                            <button onClick={props.onGoHome} className="text-gray-400 hover:text-white flex items-center gap-2 transition-colors flex-1" title="Trang chủ">
                                <span className="material-symbols-outlined">arrow_back</span>
                                <span className="font-semibold text-sm hidden md:block">Trang chủ</span>
                            </button>
                            <div className="hidden md:flex bg-[#302839] rounded-lg p-0.5">
                                <button onClick={() => handleAspectRatioChange('16:9')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${videoState.aspectRatio === '16:9' ? 'bg-[#7f13ec] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>16:9</button>
                                <button onClick={() => handleAspectRatioChange('9:16')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${videoState.aspectRatio === '9:16' ? 'bg-[#7f13ec] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>9:16</button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            {sidebarItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleSidebarClick(item)}
                                    className={`w-full flex items-center gap-3 px-2 md:px-4 py-3 rounded-xl transition-all duration-200 group relative ${activeItem === item.id ? 'bg-[#7f13ec] text-white shadow-lg shadow-purple-900/20' : 'text-gray-400 hover:bg-[#2A2A2A] hover:text-white'}`}
                                >
                                    <span className={`material-symbols-outlined ${activeItem === item.id ? 'text-white' : 'text-gray-500 group-hover:text-[#7f13ec]'}`}>{item.icon}</span>
                                    <span className="text-sm font-medium hidden md:block">{item.label}</span>
                                    {item.isMaintenance && (
                                        <span className="absolute top-2 right-2 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" title="Bảo trì"></span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT */}
                <main className="flex-1 bg-[#121212] overflow-y-auto p-4 md:p-6 relative scrollbar-hide">
                    <div className="max-w-[1920px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
                        
                        {/* LEFT: INPUT AREA (35%) */}
                        <div className="lg:col-span-4 flex flex-col gap-6">
                            {renderContentInput()}
                        </div>

                        {/* RIGHT: TIMELINE & CLIPS (65%) */}
                        <div className="lg:col-span-8 flex flex-col gap-6 h-full">
                            
                            {activeItem === 'arch-film' ? (
                                // --- ARCH FILM MODE: BATCH TIMELINE ---
                                <>
                                    {/* PANEL 4: GENERATED CLIPS / CONTEXT ITEMS - Always Visible */}
                                    <div className="flex flex-col bg-[#191919] rounded-2xl border border-[#302839] shadow-xl overflow-hidden relative group h-[550px] min-h-[400px]">
                                        <div className="p-4 border-b border-[#302839] flex items-center justify-between bg-[#191919] z-10 flex-shrink-0">
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest bg-black/50 px-2 py-1 rounded backdrop-blur-sm">Danh sách Clips & Context</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-4 bg-[#121212] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {creationItems.map((item, idx) => (
                                                    <div key={item.id} className="bg-[#1E1E1E] border border-[#302839] rounded-xl overflow-hidden shadow-lg flex flex-col h-full">
                                                        {item.videoUrl ? (
                                                            // DISPLAY VIDEO + OPTIONS
                                                            <div className="flex flex-col h-full">
                                                                <div className={`bg-black relative group ${videoState.aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
                                                                    <video src={item.videoUrl} className="w-full h-full object-cover" controls />
                                                                    {item.isGeneratingVideo && (
                                                                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                                                            <Spinner />
                                                                            <span className="text-xs text-gray-300 mt-2 animate-pulse">Đang tạo lại...</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="p-3 bg-[#191919] flex-1 flex flex-col gap-2">
                                                                    {/* Prompt Input for editing before regenerate */}
                                                                    <textarea 
                                                                        value={item.prompt}
                                                                        onChange={(e) => setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(x => x.id === item.id ? { ...x, prompt: e.target.value } : x) }))}
                                                                        className="w-full bg-[#121212] border border-[#302839] rounded-lg p-2 text-xs text-gray-300 focus:border-[#7f13ec] focus:outline-none resize-none h-16 mb-2"
                                                                        placeholder="Prompt..."
                                                                        disabled={item.isGeneratingVideo}
                                                                    />
                                                                    <div className="grid grid-cols-2 gap-2 mt-auto">
                                                                        <button 
                                                                            onClick={() => handleAddToTimeline(item.id)} 
                                                                            disabled={item.isInTimeline}
                                                                            className="flex items-center justify-center gap-1 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-xs font-bold transition-all"
                                                                        >
                                                                            <span className="material-symbols-outlined text-sm">add_to_queue</span>
                                                                            {item.isInTimeline ? 'Đã thêm' : 'Thêm Timeline'}
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleExtendClip(item)} 
                                                                            className="flex items-center justify-center gap-1 py-2 bg-[#2A2A2A] hover:bg-[#353535] text-white rounded-lg text-xs font-bold transition-all border border-[#302839]"
                                                                        >
                                                                            <span className="material-symbols-outlined text-sm">playlist_add</span>
                                                                            Nối tiếp
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleGenerateClip(item)} 
                                                                            disabled={item.isGeneratingVideo}
                                                                            className="flex items-center justify-center gap-1 py-2 bg-[#2A2A2A] hover:bg-[#353535] text-white rounded-lg text-xs font-bold transition-all border border-[#302839]"
                                                                        >
                                                                            <span className="material-symbols-outlined text-sm">refresh</span>
                                                                            Tạo lại
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleDownloadSingle(item.videoUrl!, idx)}
                                                                            className="flex items-center justify-center gap-1 py-2 bg-[#2A2A2A] hover:bg-[#353535] text-white rounded-lg text-xs font-bold transition-all border border-[#302839]"
                                                                        >
                                                                            <span className="material-symbols-outlined text-sm">download</span>
                                                                            Tải về
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            // DISPLAY IMAGE + GENERATE FORM
                                                            <>
                                                                <div className={`bg-black relative group ${videoState.aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
                                                                    <img src={item.file.objectURL} alt="Source" className="w-full h-full object-cover opacity-80" />
                                                                    {item.isGeneratingVideo && (
                                                                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                                                            <Spinner />
                                                                            <span className="text-xs text-gray-300 mt-2 animate-pulse">Đang tạo clip...</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="p-3 flex flex-col gap-2 flex-grow">
                                                                    <textarea 
                                                                        value={item.prompt}
                                                                        onChange={(e) => setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(x => x.id === item.id ? { ...x, prompt: e.target.value } : x) }))}
                                                                        className="w-full bg-[#121212] border border-[#302839] rounded-lg p-3 text-sm text-gray-200 focus:border-[#7f13ec] focus:outline-none resize-none h-20 mb-3"
                                                                        placeholder="Prompt..."
                                                                        disabled={item.isGeneratingVideo}
                                                                    />
                                                                    <div className="mt-auto">
                                                                        <button onClick={() => handleGenerateClip(item)} disabled={item.isGeneratingVideo} className="w-full py-3 bg-[#7f13ec] hover:bg-[#690fca] text-white rounded-lg text-sm font-bold transition-all shadow-md">{item.isGeneratingVideo ? 'Đang tạo...' : 'Tạo Video Clip'}</button>
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                ))}
                                                {creationItems.length === 0 && (
                                                    <div className="col-span-full h-full flex flex-col items-center justify-center opacity-30 text-center p-8">
                                                        <span className="material-symbols-outlined text-6xl mb-2">video_library</span>
                                                        <p className="text-sm">Thêm ảnh bối cảnh ở cột bên trái để bắt đầu tạo clip.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* PANEL 5: TIMELINE & PREVIEW */}
                                    <div className="bg-[#191919] rounded-2xl border border-[#302839] p-0 shadow-lg flex flex-col flex-shrink-0 min-h-[600px] overflow-hidden">
                                        <div className="px-4 py-3 border-b border-[#302839] flex items-center justify-between bg-[#1E1E1E]">
                                            <h3 className="text-white font-bold text-base flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[#7f13ec]">view_timeline</span>
                                                Timeline & Kết quả
                                            </h3>
                                            <div className="flex gap-2 items-center">
                                                <input type="file" ref={videoInputRef} className="hidden" accept="video/mp4,video/quicktime" onChange={(e) => handleVideoUpload(e)} />
                                                <button onClick={() => videoInputRef.current?.click()} className="flex items-center gap-1 bg-[#2A2A2A] hover:bg-[#353535] text-gray-300 text-xs px-3 py-1.5 rounded-lg border border-[#302839] transition-colors"><span className="material-symbols-outlined text-sm">upload</span> Nhập</button>
                                                <button onClick={() => handleDownloadAll()} className="flex items-center gap-1 bg-[#2A2A2A] hover:bg-[#353535] text-gray-300 text-xs px-3 py-1.5 rounded-lg border border-[#302839] transition-colors"><span className="material-symbols-outlined text-sm">download_for_offline</span> Tải tất cả</button>
                                                
                                                <div className="w-[1px] h-6 bg-[#302839] mx-1"></div>
                                                
                                                {/* Audio Controls */}
                                                <button onClick={() => setIsVideoMuted(!isVideoMuted)} className={`p-1.5 rounded-lg border border-[#302839] transition-colors ${isVideoMuted ? 'bg-red-500/20 text-red-400' : 'bg-[#2A2A2A] text-gray-300'}`} title={isVideoMuted ? "Bật âm thanh video" : "Tắt âm thanh video"}>
                                                    <span className="material-symbols-outlined text-sm">{isVideoMuted ? 'videocam_off' : 'videocam'}</span>
                                                </button>
                                                <button onClick={() => setIsMusicMuted(!isMusicMuted)} className={`p-1.5 rounded-lg border border-[#302839] transition-colors ${isMusicMuted ? 'bg-red-500/20 text-red-400' : 'bg-[#2A2A2A] text-gray-300'}`} title={isMusicMuted ? "Bật nhạc nền" : "Tắt nhạc nền"}>
                                                    <span className="material-symbols-outlined text-sm">{isMusicMuted ? 'music_off' : 'music_note'}</span>
                                                </button>

                                                <button onClick={() => setIsPlayingAll(!isPlayingAll)} className={`flex items-center gap-1 text-white text-xs px-3 py-1.5 rounded-lg border border-[#302839] transition-colors ml-2 ${isPlayingAll ? 'bg-green-600' : 'bg-[#2A2A2A]'}`}><span className="material-symbols-outlined text-sm">{isPlayingAll ? 'stop' : 'play_arrow'}</span> {isPlayingAll ? 'Dừng' : 'Phát tất cả'}</button>
                                                <button onClick={handleMergeAndExport} disabled={isExporting} className="flex items-center gap-1 bg-[#7f13ec] hover:bg-[#690fca] text-white text-xs px-3 py-1.5 rounded-lg transition-colors ml-2 shadow-lg disabled:opacity-50">{isExporting ? `Đang xuất ${Math.round(exportProgress)}%` : 'Ghép & Xuất Video'}</button>
                                            </div>
                                        </div>

                                        {/* PREVIEW */}
                                        <div className="flex-1 bg-[#121212] relative flex flex-col items-center justify-center border-b border-[#302839] min-h-[400px]">
                                            <div className="relative w-full h-full flex items-center justify-center bg-black">
                                                {activeMainVideoUrl ? (
                                                    <video 
                                                        ref={mainVideoRef}
                                                        src={activeMainVideoUrl} 
                                                        className="h-full w-auto max-h-[400px] object-contain shadow-2xl"
                                                        onEnded={handleVideoEnded}
                                                        onTimeUpdate={handleTimeUpdate}
                                                        controls
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center opacity-30">
                                                        <span className="material-symbols-outlined text-5xl mb-2">movie</span>
                                                        <span className="text-gray-500 text-xs">Chưa có video nào.</span>
                                                    </div>
                                                )}
                                                {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}
                                            </div>
                                            <div className="w-full bg-[#1A1A1A] p-3 flex items-center gap-4 border-t border-[#302839]">
                                                <button onClick={togglePlayPause} className="text-white hover:text-[#7f13ec]"><span className="material-symbols-outlined">{isPlaying ? 'pause' : 'play_arrow'}</span></button>
                                                <input type="range" min="0" max="100" value={progress} onChange={handleSeek} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[#7f13ec]" />
                                            </div>
                                        </div>

                                        {/* TIMELINE TRACKS */}
                                        <div className="h-[140px] bg-[#161616] flex flex-col relative overflow-hidden">
                                            <div className="flex-1 relative overflow-x-auto overflow-y-hidden p-2 flex flex-col gap-2 scrollbar-thin" ref={timelineContainerRef} onClick={handleTimelineClick}>
                                                <div className="absolute top-0 bottom-0 w-0.5 bg-red-600 z-50 pointer-events-none transition-all duration-100" style={{ left: `${progress}%` }}></div>
                                                
                                                {/* Video Track */}
                                                <div className="flex items-center gap-1 min-w-max h-16 bg-[#1A1A1A] rounded-lg px-2 border border-[#302839]/50">
                                                    <div className="w-8 flex justify-center"><span className="material-symbols-outlined text-gray-500 text-xs">videocam</span></div>
                                                    {timelineItems.length > 0 ? timelineItems.map((item, index) => (
                                                        <div 
                                                            key={item.id}
                                                            draggable
                                                            onDragStart={(e) => handleDragStart(e, index)}
                                                            onDragOver={(e) => handleDragOver(e, index)}
                                                            onDrop={(e) => handleDrop(e, index)}
                                                            onClick={(e) => { e.stopPropagation(); setVideoState(prev => ({ ...prev, generatedVideoUrl: item.videoUrl || null })); setCurrentPlayingIndex(index); setIsPlayingAll(false); }}
                                                            style={{ width: `${100 / timelineItems.length}%` }}
                                                            className={`relative h-14 bg-black rounded cursor-grab active:cursor-grabbing overflow-hidden border-2 transition-all group flex-shrink-0 ${currentPlayingIndex === index && isPlayingAll ? 'border-green-500' : 'border-[#302839] hover:border-gray-500'}`}
                                                        >
                                                            <div className="absolute top-1 left-1 z-10 bg-black/60 px-1.5 py-0.5 rounded text-[8px] text-white">Cảnh {index + 1}</div>
                                                            <video src={item.videoUrl} className="w-full h-full object-cover pointer-events-none" />
                                                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                                <button onClick={(e) => {e.stopPropagation(); handleDownloadSingle(item.videoUrl!, index)}} className="p-1 bg-black/50 text-white rounded hover:bg-black"><span className="material-symbols-outlined text-[10px]">download</span></button>
                                                                <button onClick={(e) => {e.stopPropagation(); handleExtendClip(item)}} className="p-1 bg-black/50 text-white rounded hover:bg-black"><span className="material-symbols-outlined text-[10px]">playlist_add</span></button>
                                                            </div>
                                                        </div>
                                                    )) : <div className="w-full text-gray-600 text-xs italic pl-2">Các clip đã thêm vào timeline sẽ xuất hiện ở đây...</div>}
                                                </div>

                                                {/* Audio Track */}
                                                <div className="flex items-center gap-1 min-w-max h-10 bg-[#1A1A1A] rounded-lg px-2 border border-[#302839]/50">
                                                    <div className="w-8 flex justify-center"><span className="material-symbols-outlined text-gray-500 text-xs">music_note</span></div>
                                                    <div className="flex-1 relative h-full flex items-center">
                                                        {audioFile ? (
                                                            <div className="flex-1 bg-green-900/30 border border-green-700/50 rounded flex items-center px-2 text-[10px] text-green-400 truncate cursor-pointer" onClick={() => setAudioFile(null)}>
                                                                {audioFile.name} (Click to remove)
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 border-2 border-dashed border-gray-700 rounded flex items-center justify-center hover:bg-[#252525] transition-colors relative cursor-pointer">
                                                                <span className="text-[10px] text-gray-500">Kéo thả nhạc</span>
                                                                <input type="file" accept="audio/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {if(e.target.files?.[0]) { setAudioFile(e.target.files[0]); setAudioUrl(URL.createObjectURL(e.target.files[0])); }}} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                // --- SINGLE MODE: SIMPLE RESULT VIEW OR MAINTENANCE ---
                                <div className="bg-[#191919] rounded-2xl border border-[#302839] p-6 shadow-lg h-full flex flex-col">
                                    {(['text-to-video', 'transition', 'extend-video'].includes(activeItem)) ? (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="text-center text-gray-500">
                                                <span className="material-symbols-outlined text-6xl mb-4 text-yellow-500/20">engineering</span>
                                                <p>Tính năng đang được nâng cấp.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[#7f13ec]">movie</span>
                                                Kết quả
                                            </h3>

                                            <div className="flex-1 bg-black rounded-xl border border-[#302839] relative flex items-center justify-center overflow-hidden min-h-[400px]">
                                                {isSingleGenerating ? (
                                                    <div className="flex flex-col items-center justify-center text-gray-400 gap-3">
                                                        <Spinner />
                                                        <span className="animate-pulse text-sm">{videoState.loadingMessage || 'Đang khởi tạo video...'}</span>
                                                    </div>
                                                ) : videoState.generatedVideoUrl ? (
                                                    <video 
                                                        src={videoState.generatedVideoUrl} 
                                                        controls 
                                                        autoPlay 
                                                        loop 
                                                        className="w-full h-full object-contain max-h-[70vh]"
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center opacity-30">
                                                        <span className="material-symbols-outlined text-6xl mb-2">video_file</span>
                                                        <p className="text-gray-500 text-sm">Kết quả sẽ hiển thị ở đây</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* GENERATE & DOWNLOAD BUTTONS (Matching Template) */}
                                            <div className="mt-6 flex flex-col sm:flex-row gap-4">
                                                <button 
                                                    onClick={handleSingleGeneration}
                                                    disabled={isSingleGenerating}
                                                    className="flex-1 py-3 px-6 rounded-xl font-bold transition-all border border-[#302839] text-gray-300 hover:text-white hover:bg-[#2A2A2A] hover:border-gray-500 flex items-center justify-center gap-2 disabled:opacity-50"
                                                >
                                                    <span className="material-symbols-outlined">refresh</span>
                                                    Tạo lại
                                                </button>
                                                <button 
                                                    onClick={handleSimpleDownload}
                                                    disabled={!videoState.generatedVideoUrl || isSingleGenerating}
                                                    className="flex-[2] py-3 px-6 bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] hover:from-[#690fca] hover:to-[#8a3dcf] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <span className="material-symbols-outlined">download</span>
                                                    Tải xuống
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                        </div>
                    </div>
                </main>
            </div>
            {videoState.error && <div className="fixed bottom-4 right-4 bg-red-900/90 border border-red-500/50 text-red-200 p-4 rounded-xl backdrop-blur-md text-sm z-50 shadow-xl max-w-sm animate-bounce font-medium">{videoState.error} <button onClick={() => setVideoState(p => ({...p, error: null}))} className="ml-2 underline text-white/80 hover:text-white">Đóng</button></div>}
        </div>
    );
};

export default VideoPage;
