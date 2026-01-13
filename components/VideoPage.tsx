
import React, { useState, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { UserStatus, Tool, FileData } from '../types';
import Header from './Header';
import { initialToolStates, VideoGeneratorState, VideoContextItem } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as externalVideoService from '../services/externalVideoService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';

// NEW COMPONENTS
import VideoSidebar, { sidebarItems } from './video/VideoSidebar';
import ArchFilmInput from './video/ArchFilmInput';
import VideoContextList from './video/VideoContextList';
import SingleVideoInput from './video/SingleVideoInput';
import SingleVideoResult from './video/SingleVideoResult';
import TimelineEditor from './video/TimelineEditor';
import MaintenanceView from './video/MaintenanceView';
import SafetyWarningModal from './common/SafetyWarningModal'; // NEW

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

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, message }) => {
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
                        <button 
                            onClick={onClose}
                            className="flex-1 py-2.5 px-4 rounded-xl bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 font-medium transition-colors border border-gray-300 dark:border-gray-700"
                        >
                            <span>Hủy bỏ</span>
                        </button>
                        <button 
                            onClick={onConfirm}
                            className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-colors shadow-lg shadow-red-900/20"
                        >
                            <span>Xóa ngay</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

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
    onInsufficientCredits?: () => void;
}

const VideoPage: React.FC<VideoPageProps> = (props) => {
    // --- STATE ---
    const [activeItem, setActiveItem] = useState('arch-film');
    const [videoState, setVideoState] = useState<VideoGeneratorState>({
        ...initialToolStates[Tool.VideoGeneration],
        aspectRatio: '16:9'
    });
    const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
    
    // Single Mode States
    const [singleSourceImage, setSingleSourceImage] = useState<FileData | null>(null);
    const [singleEndImage, setSingleEndImage] = useState<FileData | null>(null);
    const [singlePrompt, setSinglePrompt] = useState('');
    const [isSingleGenerating, setIsSingleGenerating] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false); // NEW

    // Timeline & Player States
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

    // Delete Modal State
    const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; itemId: string | null }>({
        isOpen: false,
        itemId: null
    });

    const mainVideoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const timelineContainerRef = useRef<HTMLDivElement>(null);

    // --- EFFECTS ---
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

    // --- HANDLERS: TIMELINE & PLAYER ---
    const handleTimeUpdate = () => {
        if (!mainVideoRef.current) return;
        
        const timelineItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        const currentClipTime = mainVideoRef.current.currentTime;
        const currentClipDuration = mainVideoRef.current.duration || 1; 

        if (timelineItems.length > 0) {
            // Always calculate global progress if timeline exists, regardless of playing mode
            const segmentSize = 100 / timelineItems.length;
            const currentClipProgressPercent = (currentClipTime / currentClipDuration) * segmentSize;
            const completedSegmentsPercent = currentPlayingIndex * segmentSize;
            const totalProgress = completedSegmentsPercent + currentClipProgressPercent;
            setProgress(Math.min(totalProgress, 100));
        } else {
            // Single video or no timeline
            setProgress((currentClipTime / currentClipDuration) * 100);
        }
    };

    const seekToPercent = (percent: number) => {
        const playableItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        const totalClips = playableItems.length;
        if (totalClips === 0) return;

        // When seeking, force timeline mode logic for calculation
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
        
        setProgress(percent);
    };

    const handleSeek = (val: number) => {
        const timelineItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        if (timelineItems.length > 0) {
             // If seeking on a timeline, ensure we are in 'All' mode context (even if paused) to show correct clip
             if (!isPlayingAll) setIsPlayingAll(true);
             setIsPlaying(false); // Pause while dragging
             seekToPercent(val);
        } else {
             if (mainVideoRef.current) {
                mainVideoRef.current.currentTime = (val / 100) * (mainVideoRef.current.duration || 1);
                setProgress(val);
             }
        }
    };
    
    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineContainerRef.current) return;
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        handleSeek(percent);
    };

    const togglePlayPause = () => {
        // If there are timeline items, togglePlayPause should default to "Play All" if not already playing a specific item
        const items = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        if (items.length > 0 && !isPlaying) {
            handleTogglePlayAll();
        } else {
            setIsPlaying(!isPlaying);
        }
    };

    const handleTogglePlayAll = () => {
        const items = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        if (items.length === 0) return;

        if (isPlayingAll) {
            // Already in Play All mode, toggle pause/play
            if (isPlaying) {
                setIsPlaying(false);
            } else {
                // If reached end, restart
                if (progress >= 99.9) {
                    setCurrentPlayingIndex(0);
                    setProgress(0);
                }
                setIsPlaying(true);
            }
        } else {
            // Start Playing All
            setIsPlayingAll(true);
            setIsPlaying(true);
            if (progress >= 99.9) {
                 setCurrentPlayingIndex(0);
                 setProgress(0);
            }
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

    // --- HANDLERS: SIDEBAR & SETUP ---
    const handleSidebarClick = (item: typeof sidebarItems[0]) => {
        setActiveItem(item.id);
        setSinglePrompt(item.prompt);
        setVideoState(prev => ({ ...prev, error: null }));
        setSingleSourceImage(null);
        setSingleEndImage(null);
        setIsSingleGenerating(false);
    };

    const handleAspectRatioChange = async (newRatio: '16:9' | '9:16' | 'default') => {
        if (videoState.aspectRatio === newRatio) return;
        setVideoState(prev => ({ ...prev, aspectRatio: newRatio }));
        if (videoState.contextItems.length > 0) {
            const updatedItems = await Promise.all(videoState.contextItems.map(async (item) => {
                if (item.isUploaded) return item; 
                // Using 'contain' mode for video context items
                const croppedBase64 = await externalVideoService.resizeAndCropImage(item.originalFile, newRatio, 'pro', 'contain');
                const croppedFile: FileData = { base64: croppedBase64.split(',')[1], mimeType: 'image/jpeg', objectURL: croppedBase64 };
                return { ...item, file: croppedFile };
            }));
            setVideoState(prev => ({ ...prev, contextItems: updatedItems }));
        }
    };

    const handleFilesChange = async (files: FileData[]) => {
        const newItemsPromises = files
            .filter(f => !videoState.contextItems.some(item => item.originalFile.objectURL === f.objectURL))
            .map(async (f) => {
                // Using 'contain' mode for new video context items
                const croppedBase64 = await externalVideoService.resizeAndCropImage(f, videoState.aspectRatio, 'pro', 'contain');
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

    const handleCharacterFileChange = (file: FileData | null) => {
        setVideoState(prev => ({ ...prev, characterImage: file }));
    };

    const handleToggleCharacter = (itemId: string) => {
        setVideoState(prev => ({
            ...prev,
            contextItems: prev.contextItems.map(item => {
                if (item.id === itemId) {
                    const willUseChar = !item.useCharacter;
                    let newPrompt = item.prompt;
                    const charSuffix = ", featuring the character from the reference image, consistent style";
                    if (willUseChar && !newPrompt.includes(charSuffix)) {
                        newPrompt += charSuffix;
                    } else if (!willUseChar && newPrompt.includes(charSuffix)) {
                        newPrompt = newPrompt.replace(charSuffix, "");
                    }
                    return { ...item, useCharacter: willUseChar, prompt: newPrompt };
                }
                return item;
            })
        }));
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

    // --- HANDLERS: GENERATION (CLIP) ---
    const handleGenerateClip = async (item: VideoContextItem) => {
        const cost = 5;
        if ((props.userStatus?.credits || 0) < cost) {
             if (props.onInsufficientCredits) {
                 props.onInsufficientCredits();
             } else {
                 setVideoState(prev => ({ ...prev, error: jobService.mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") }));
             }
             return;
        }
        if (!item.prompt) {
            setVideoState(prev => ({ ...prev, error: 'Vui lòng nhập prompt.' }));
            return;
        }
        if (item.useCharacter && !videoState.characterImage) {
            setVideoState(prev => ({ ...prev, error: 'Vui lòng tải lên ảnh nhân vật trước khi tạo video có nhân vật.' }));
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
            logId = await props.onDeductCredits(cost, `Tạo Video Clip (${activeItem})`);
            if (logId) {
                localStorage.setItem('opzen_pending_tx', JSON.stringify({
                    logId: logId, amount: cost, reason: `Tạo Video Clip - ${item.prompt.substring(0, 20)}...`, timestamp: Date.now()
                }));
            }
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) { 
                 jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.VideoGeneration, prompt: item.prompt, cost: cost, usage_log_id: logId });
                 if (!jobId && logId) throw new Error("Lỗi hệ thống: Không thể tạo bản ghi công việc.");
                 localStorage.removeItem('opzen_pending_tx');
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');
            let result;
            if (item.useCharacter && videoState.characterImage) {
                result = await externalVideoService.generateVideoWithReferences(item.prompt, item.file, videoState.characterImage, videoState.aspectRatio);
            } else {
                result = await externalVideoService.generateVideoExternal(item.prompt, "", item.file, videoState.aspectRatio);
            }
            setVideoState(prev => ({
                ...prev,
                contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, videoUrl: result.videoUrl, isGeneratingVideo: false } : i),
            }));
            if (jobId) await jobService.updateJobStatus(jobId, 'completed', result.videoUrl);
            await historyService.addToHistory({ tool: Tool.VideoGeneration, prompt: item.prompt, sourceImageURL: item.file.objectURL, resultVideoURL: result.videoUrl });
        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            // --- SAFETY MODAL TRIGGER ---
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                friendlyMsg = "Ảnh bị từ chối do vi phạm chính sách an toàn.";
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi tạo video (${rawMsg})`);
                await props.onRefreshCredits(); 
                if (friendlyMsg !== "Ảnh bị từ chối do vi phạm chính sách an toàn.") {
                     friendlyMsg += " (Credits đã được hoàn trả)";
                }
            }
            localStorage.removeItem('opzen_pending_tx');
            setVideoState(prev => ({ ...prev, error: friendlyMsg, contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, isGeneratingVideo: false } : i) }));
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        }
    };

    // --- HANDLERS: TIMELINE & EXPORT ---
    const handleAddToTimeline = (id: string) => {
        setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(i => i.id === id ? { ...i, isInTimeline: true } : i) }));
    };
    const handleDeleteItem = (id: string) => {
        setDeleteModalState({ isOpen: true, itemId: id });
    };
    const executeDelete = () => {
        if (deleteModalState.itemId) {
            setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.filter(i => i.id !== deleteModalState.itemId) }));
        }
        setDeleteModalState({ isOpen: false, itemId: null });
    };
    const handleRemoveFromTimeline = (id: string) => {
        setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(i => i.id === id ? { ...i, isInTimeline: false } : i) }));
    };
    const handleSimpleDownload = (url?: string) => {
        const targetUrl = url || videoState.generatedVideoUrl;
        if (!targetUrl) return;
        window.open(targetUrl, '_blank');
    };
    
    // --- SAFE DOWNLOAD HELPER ---
    const downloadBlob = async (url: string, filename: string) => {
        // FIX: If it is a local uploaded file (blob:...), download directly without proxy
        if (url.startsWith('blob:')) {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return true;
        }

        try {
            const blob = await externalVideoService.proxyDownload(url);
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
            return true;
        } catch (e) {
            console.error("Download failed:", e);
            window.open(url, '_blank'); // Fallback
            return false;
        }
    };

    // New Force Download Handler for Single Video
    const handleForceDownload = async (url?: string) => {
        const targetUrl = url || videoState.generatedVideoUrl;
        if (!targetUrl) return;

        setIsDownloading(true);
        await downloadBlob(targetUrl, `opzen-video-${Date.now()}.mp4`);
        setIsDownloading(false);
    };

    const handleDownloadSingle = async (url: string, index: number) => {
        setIsDownloading(true);
        await downloadBlob(url, `arch-film-scene-${index + 1}-${Date.now()}.mp4`);
        setIsDownloading(false);
    };

    const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const newItem: VideoContextItem = {
            id: Math.random().toString(36).substr(2, 9),
            file: DUMMY_FILE, originalFile: DUMMY_FILE, prompt: 'Uploaded Video',
            isGeneratingPrompt: false, videoUrl: url, isGeneratingVideo: false, isUploaded: true, isInTimeline: true
        };
        setVideoState(prev => ({ ...prev, contextItems: [...prev.contextItems, newItem] }));
    };
    
    const handleDownloadAll = async () => {
        const items = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        if (items.length === 0) return;
        
        setIsDownloading(true);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.videoUrl) {
                await downloadBlob(item.videoUrl, `scene-${i + 1}-export.mp4`);
                await new Promise(r => setTimeout(r, 1000)); // Delay prevents blocking
            }
        }
        setIsDownloading(false);
    };

    const handleExtendClip = async (item: VideoContextItem) => {
        alert("Tính năng nối tiếp (Extend) đang được cập nhật.");
    };
    
    // --- REAL MERGE FUNCTION ---
    const handleMergeAndExport = async () => {
        const items = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        if (items.length < 1) {
            setVideoState(prev => ({ ...prev, error: "Cần ít nhất 1 clip trong timeline để xuất." }));
            return;
        }

        setIsExporting(true);
        setExportProgress(0);

        // Initialize AudioContext
        // @ts-ignore
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();

        try {
            // Ensure context is running (needed for some browsers)
            await audioCtx.resume();

            // 1. PREPARE RESOURCES
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const videoPlayer = document.createElement('video');
            
            // CRITICAL FIX: 
            // 1. videoPlayer.muted MUST be false for createMediaElementSource to capture audio.
            // 2. Creating the MediaElementSource automatically disconnects the video from the speakers, 
            //    so we don't hear double audio during export.
            videoPlayer.muted = false; 
            videoPlayer.playsInline = true;
            videoPlayer.crossOrigin = "anonymous";

            const destination = audioCtx.createMediaStreamDestination();

            // Connect Video Audio (Source) to Destination
            const videoSource = audioCtx.createMediaElementSource(videoPlayer);
            const videoGain = audioCtx.createGain();
            videoGain.gain.value = isVideoMuted ? 0 : 1;
            videoSource.connect(videoGain).connect(destination);

            // Connect Background Music (if any)
            let bgMusicPlayer: HTMLAudioElement | null = null;
            
            if (audioUrl && !isMusicMuted) {
                bgMusicPlayer = document.createElement('audio');
                bgMusicPlayer.src = audioUrl;
                bgMusicPlayer.crossOrigin = "anonymous";
                // Determine loop behavior based on song vs video length if needed, default to loop for safety
                bgMusicPlayer.loop = true; 
                
                const bgMusicSource = audioCtx.createMediaElementSource(bgMusicPlayer);
                const bgGain = audioCtx.createGain();
                bgGain.gain.value = 0.5; // Default lower volume for BG music
                bgMusicSource.connect(bgGain).connect(destination);
            }

            // 2. FETCH CLIPS AS BLOBS (Crucial for CORS & smoothness)
            const clips: string[] = [];
            for (let i = 0; i < items.length; i++) {
                setExportProgress((i / items.length) * 30); // 0-30% progress for loading
                const item = items[i];
                if (!item.videoUrl) continue;
                
                try {
                    let blobUrl = item.videoUrl;
                    // If remote URL, fetch via proxy to get a local blob
                    if (!blobUrl.startsWith('blob:')) {
                        const blob = await externalVideoService.proxyDownload(blobUrl);
                        blobUrl = URL.createObjectURL(blob);
                    }
                    clips.push(blobUrl);
                } catch (e) {
                    console.error("Failed to load clip for merge:", e);
                }
            }

            if (clips.length === 0) throw new Error("Không thể tải video để ghép.");

            // 3. SETUP CANVAS & RECORDER
            // Set canvas size based on first video (default 1080p landscape if fails)
            await new Promise((resolve) => {
                videoPlayer.src = clips[0];
                videoPlayer.onloadedmetadata = () => {
                    canvas.width = videoPlayer.videoWidth || 1920;
                    canvas.height = videoPlayer.videoHeight || 1080;
                    resolve(null);
                };
                videoPlayer.onerror = () => resolve(null);
            });

            // Create Stream: Canvas Video + Mixed Audio
            const stream = canvas.captureStream(30); // 30 FPS
            const audioTrack = destination.stream.getAudioTracks()[0];
            if (audioTrack) {
                stream.addTrack(audioTrack);
            } else {
                console.warn("Audio track missing from destination node.");
            }

            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
                ? 'video/webm;codecs=vp9' 
                : 'video/webm'; // Fallback

            const recorder = new MediaRecorder(stream, { 
                mimeType, 
                videoBitsPerSecond: 8000000 // 8Mbps high quality
            });
            
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

            recorder.start();
            
            // Start BG Music Recording
            if (bgMusicPlayer) {
                // Ensure music starts playing for the recorder
                await bgMusicPlayer.play().catch(e => console.warn("BG Music play fail", e));
            }

            // 4. SEQUENTIAL PLAYBACK & RECORDING
            for (let i = 0; i < clips.length; i++) {
                const src = clips[i];
                await new Promise((resolve) => {
                    videoPlayer.src = src;
                    videoPlayer.onloadedmetadata = () => {
                        videoPlayer.play().catch((e) => {
                            console.error("Play error during export", e);
                            resolve(null);
                        });
                    };
                    
                    const drawFrame = () => {
                        if (videoPlayer.paused || videoPlayer.ended) return;
                        if (ctx) ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
                        requestAnimationFrame(drawFrame);
                    };

                    videoPlayer.onplay = () => {
                        drawFrame();
                    };

                    videoPlayer.onended = () => {
                        resolve(null);
                    };
                    
                    videoPlayer.onerror = () => {
                        console.error("Video error during export");
                        resolve(null); 
                    };
                });
                
                // Update Progress: 30% -> 90%
                setExportProgress(30 + ((i + 1) / clips.length) * 60);
            }

            // 5. FINISH & DOWNLOAD
            recorder.stop();
            if (bgMusicPlayer) bgMusicPlayer.pause();
            
            await new Promise(r => recorder.onstop = r);
            
            const finalBlob = new Blob(chunks, { type: 'video/webm' });
            const finalUrl = URL.createObjectURL(finalBlob);
            
            setExportProgress(100);
            
            // Trigger Download
            const link = document.createElement('a');
            link.href = finalUrl;
            link.download = `opzen-movie-${Date.now()}.webm`; // Using .webm is safer for browser generated files
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Cleanup
            setTimeout(() => {
                URL.revokeObjectURL(finalUrl);
                if (audioCtx.state !== 'closed') audioCtx.close();
            }, 1000);

        } catch (e: any) {
            console.error(e);
            setVideoState(prev => ({ ...prev, error: `Lỗi xuất video: ${e.message}` }));
            if (audioCtx.state !== 'closed') audioCtx.close();
        } finally {
            setIsExporting(false);
            setExportProgress(0);
        }
    };
    
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };
    const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === index) return;
        const timelineItems = videoState.contextItems.filter(i => i.videoUrl && i.isInTimeline);
        const otherItems = videoState.contextItems.filter(i => !(i.videoUrl && i.isInTimeline));
        const newTimelineItems = [...timelineItems];
        const [movedItem] = newTimelineItems.splice(draggedItemIndex, 1);
        newTimelineItems.splice(index, 0, movedItem);
        setVideoState(prev => ({ ...prev, contextItems: [...otherItems, ...newTimelineItems] }));
        setDraggedItemIndex(null);
    };

    // --- HANDLERS: SINGLE GENERATION ---
    const handleSingleGeneration = async () => {
        const cost = 5;
        if ((props.userStatus?.credits || 0) < cost) {
             if (props.onInsufficientCredits) {
                 props.onInsufficientCredits();
             } else {
                 setVideoState(prev => ({ ...prev, error: jobService.mapFriendlyErrorMessage("KHÔNG ĐỦ CREDITS") }));
             }
             return;
        }
        if (!singlePrompt) {
            setVideoState(prev => ({ ...prev, error: 'Vui lòng nhập prompt.' }));
            return;
        }
        if (activeItem === 'img-to-video' && !singleSourceImage) {
            setVideoState(prev => ({ ...prev, error: 'Vui lòng tải lên ảnh bắt đầu.' }));
            return;
        }
        setIsSingleGenerating(true);
        setVideoState(prev => ({ ...prev, error: null, generatedVideoUrl: null, loadingMessage: loadingMessages[0] }));
        let jobId: string | null = null;
        let logId: string | null = null;
        try {
            logId = await props.onDeductCredits(cost, `Tạo Video (${activeItem})`);
            if (logId) {
                localStorage.setItem('opzen_pending_tx', JSON.stringify({
                    logId: logId, amount: cost, reason: `Tạo Single Video - ${activeItem}`, timestamp: Date.now()
                }));
            }
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) { 
                 jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.VideoGeneration, prompt: singlePrompt, cost: cost, usage_log_id: logId });
                 if (!jobId && logId) throw new Error("Lỗi hệ thống: Không thể tạo bản ghi công việc.");
                 localStorage.removeItem('opzen_pending_tx');
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');
            
            let startImageToUse: FileData | null | undefined = singleSourceImage;
            let endImageToUse: FileData | null | undefined = singleEndImage;

            if (activeItem === 'text-to-video') {
                startImageToUse = undefined;
                endImageToUse = undefined;
            } else {
                if (singleSourceImage) {
                    // Force 'contain' mode for single video generation
                    const croppedBase64 = await externalVideoService.resizeAndCropImage(singleSourceImage, videoState.aspectRatio, 'pro', 'contain');
                    startImageToUse = { base64: croppedBase64.split(',')[1], mimeType: 'image/jpeg', objectURL: croppedBase64 };
                }
                if (singleEndImage) {
                    // Force 'contain' mode for end image
                    const croppedBase64End = await externalVideoService.resizeAndCropImage(singleEndImage, videoState.aspectRatio, 'pro', 'contain');
                    endImageToUse = { base64: croppedBase64End.split(',')[1], mimeType: 'image/jpeg', objectURL: croppedBase64End };
                }
            }
            
            // Note: externalVideoService needs update to accept endImage
            const result = await externalVideoService.generateVideoExternal(
                singlePrompt, 
                "", 
                startImageToUse || undefined, 
                videoState.aspectRatio,
                endImageToUse || undefined 
            );
            
            setVideoState(prev => ({ ...prev, generatedVideoUrl: result.videoUrl }));
            if (jobId) await jobService.updateJobStatus(jobId, 'completed', result.videoUrl);
            await historyService.addToHistory({ tool: Tool.VideoGeneration, prompt: singlePrompt, sourceImageURL: startImageToUse?.objectURL, resultVideoURL: result.videoUrl });
        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            // --- SAFETY MODAL TRIGGER ---
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                friendlyMsg = "Ảnh bị từ chối do vi phạm chính sách an toàn.";
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi tạo video (${rawMsg})`);
                await props.onRefreshCredits();
                if (friendlyMsg !== "Ảnh bị từ chối do vi phạm chính sách an toàn.") {
                     friendlyMsg += " (Credits đã được hoàn trả)";
                }
            }
            localStorage.removeItem('opzen_pending_tx');
            setVideoState(prev => ({ ...prev, error: friendlyMsg }));
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
        } finally {
            setIsSingleGenerating(false);
        }
    };

    const timelineItems = videoState.contextItems.filter(item => item.videoUrl && item.isInTimeline);
    // Explicitly fallback to null to ensure strict typing
    const activeMainVideoUrl = ((timelineItems.length > 0 || isPlayingAll) 
        ? timelineItems[currentPlayingIndex]?.videoUrl 
        : (videoState.generatedVideoUrl || timelineItems.find(i => i.videoUrl)?.videoUrl)) || null;

    return (
        <div className="h-[100dvh] bg-main-bg dark:bg-dark-bg font-sans flex flex-col overflow-hidden text-text-primary dark:text-white transition-colors duration-300">
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            <Header 
                onGoHome={props.onGoHome} onThemeToggle={props.onThemeToggle} theme={props.theme} 
                onSignOut={props.onSignOut} onOpenGallery={props.onOpenGallery} onUpgrade={props.onUpgrade} 
                onOpenProfile={props.onOpenProfile} userStatus={props.userStatus} user={props.session?.user || null}
                onToggleNav={props.onToggleNav}
            />

            <div className="flex flex-1 overflow-hidden">
                <VideoSidebar activeItem={activeItem} onItemClick={handleSidebarClick} onGoHome={props.onGoHome} />

                <main className="flex-1 bg-main-bg dark:bg-[#121212] overflow-y-auto p-4 md:p-6 relative scrollbar-hide transition-colors duration-300">
                    <div className="max-w-[1920px] mx-auto h-full pb-20">
                        {activeItem === 'arch-film' ? (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
                                <div className="lg:col-span-4 h-full flex flex-col">
                                    <ArchFilmInput 
                                        videoState={videoState}
                                        userStatus={props.userStatus}
                                        isGeneratingPrompts={isGeneratingPrompts}
                                        onFilesChange={handleFilesChange}
                                        onCharacterFileChange={handleCharacterFileChange}
                                        onToggleCharacter={handleToggleCharacter}
                                        onAspectRatioChange={handleAspectRatioChange}
                                        onGenerateContextPrompts={handleGenerateContextPrompts}
                                    />
                                </div>
                                <div className="lg:col-span-8 h-full flex flex-col gap-6">
                                    <div className="flex-1 min-h-[300px]">
                                        <VideoContextList 
                                            videoState={videoState}
                                            userStatus={props.userStatus}
                                            onGenerateClip={handleGenerateClip}
                                            onDownloadSingle={handleDownloadSingle}
                                            onAddToTimeline={handleAddToTimeline}
                                            onExtendClip={handleExtendClip}
                                            onPromptChange={(id, val) => setVideoState(prev => ({ ...prev, contextItems: prev.contextItems.map(x => x.id === id ? { ...x, prompt: val } : x) }))}
                                            onDeleteItem={handleDeleteItem}
                                        />
                                    </div>
                                    <div className="h-[500px] flex-shrink-0">
                                        <TimelineEditor 
                                            videoState={videoState}
                                            isPlaying={isPlaying}
                                            isPlayingAll={isPlayingAll}
                                            progress={progress}
                                            audioFile={audioFile}
                                            audioUrl={audioUrl}
                                            isVideoMuted={isVideoMuted}
                                            isMusicMuted={isMusicMuted}
                                            isExporting={isExporting}
                                            exportProgress={exportProgress}
                                            currentPlayingIndex={currentPlayingIndex}
                                            activeMainVideoUrl={activeMainVideoUrl}
                                            isSingleGenerating={isSingleGenerating}
                                            mainVideoRef={mainVideoRef}
                                            audioRef={audioRef}
                                            videoInputRef={videoInputRef}
                                            timelineContainerRef={timelineContainerRef}
                                            
                                            onTogglePlayPause={togglePlayPause}
                                            onSeek={handleSeek}
                                            onVideoEnded={handleVideoEnded}
                                            onTimeUpdate={handleTimeUpdate}
                                            onToggleVideoMute={() => setIsVideoMuted(!isVideoMuted)}
                                            onToggleMusicMute={() => setIsMusicMuted(!isMusicMuted)}
                                            onTogglePlayAll={handleTogglePlayAll}
                                            onMergeAndExport={handleMergeAndExport}
                                            onVideoUpload={handleVideoUpload}
                                            onDownloadAll={handleDownloadAll}
                                            onAudioFileSelect={(file) => { setAudioFile(file); setAudioUrl(URL.createObjectURL(file)); }}
                                            onAudioRemove={() => { setAudioFile(null); setAudioUrl(null); }}
                                            onTimelineClick={handleTimelineClick}
                                            
                                            onItemClick={(item, idx) => { setVideoState(prev => ({ ...prev, generatedVideoUrl: item.videoUrl || null })); setCurrentPlayingIndex(idx); setIsPlayingAll(false); }}
                                            onDragStart={handleDragStart}
                                            onDragOver={handleDragOver}
                                            onDrop={handleDrop}
                                            onDownloadSingle={handleDownloadSingle}
                                            onExtendClip={handleExtendClip}
                                            onRemoveFromTimeline={handleRemoveFromTimeline}
                                            onGenerateSingle={handleSingleGeneration}
                                            onDownloadSimple={handleSimpleDownload}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : activeItem === 'img-to-video' ? (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
                                <div className="lg:col-span-4 h-full flex flex-col">
                                    <SingleVideoInput 
                                        videoState={videoState}
                                        userStatus={props.userStatus}
                                        singleSourceImage={singleSourceImage}
                                        singleEndImage={singleEndImage}
                                        singlePrompt={singlePrompt}
                                        isSingleGenerating={isSingleGenerating}
                                        onSourceImageChange={setSingleSourceImage}
                                        onEndImageChange={setSingleEndImage}
                                        onPromptChange={setSinglePrompt}
                                        onAspectRatioChange={handleAspectRatioChange}
                                        onGenerate={handleSingleGeneration}
                                    />
                                </div>
                                <div className="lg:col-span-8 h-full flex flex-col">
                                    <SingleVideoResult
                                        videoUrl={videoState.generatedVideoUrl}
                                        isLoading={isSingleGenerating}
                                        loadingMessage={videoState.loadingMessage}
                                        onDownload={() => handleForceDownload()}
                                        isDownloading={isDownloading}
                                    />
                                </div>
                            </div>
                        ) : (
                            <MaintenanceView title={activeItem === 'text-to-video' ? 'Tạo video từ text' : activeItem === 'transition' ? 'Video chuyển cảnh' : 'Mở rộng video'} />
                        )}
                    </div>
                </main>
            </div>
            
            <ConfirmationModal 
                isOpen={deleteModalState.isOpen}
                onClose={() => setDeleteModalState({ isOpen: false, itemId: null })}
                onConfirm={executeDelete}
                title="Xác nhận xóa"
                message="Bạn có chắc chắn muốn xóa clip này khỏi danh sách không? Hành động này không thể hoàn tác."
            />

            {videoState.error && <div className="fixed bottom-4 right-4 bg-red-900/90 border border-red-500/50 text-red-200 p-4 rounded-xl backdrop-blur-md text-sm z-50 shadow-xl max-w-sm animate-bounce font-medium">{videoState.error} <button onClick={() => setVideoState(p => ({...p, error: null}))} className="ml-2 underline text-white/80 hover:text-white">Đóng</button></div>}
        </div>
    );
};

export default VideoPage;
