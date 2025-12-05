
import React, { useState, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { UserStatus, Tool, FileData } from '../types';
import Header from './Header';
import { initialToolStates, VideoGeneratorState, VideoContextItem } from '../state/toolState';
import MultiImageUpload from './common/MultiImageUpload';
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
        prompt: 'Cinematic architectural film, establishing shot, photorealistic, 4k, slow camera movement capturing the building details and atmosphere.' 
    },
    { 
        id: 'img-to-video', 
        label: 'Tạo video từ ảnh', 
        icon: <span className="material-symbols-outlined">image</span>,
        prompt: 'High quality video generated from image, smooth motion, 4k, cinematic lighting.'
    },
    { 
        id: 'text-to-video', 
        label: 'Tạo video từ text', 
        icon: <span className="material-symbols-outlined">description</span>,
        prompt: 'A high quality video of modern architecture, cinematic view, 4k.'
    },
    { 
        id: 'transition', 
        label: 'Video chuyển cảnh', 
        icon: <span className="material-symbols-outlined">transition_push</span>,
        prompt: 'Smooth morphing transition, changing lighting from day to night, timelapse effect.'
    }
];

const VideoPage: React.FC<VideoPageProps> = (props) => {
    const [activeItem, setActiveItem] = useState('arch-film');
    const [videoState, setVideoState] = useState<VideoGeneratorState>(initialToolStates[Tool.VideoGeneration]);
    const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
    
    // Timeline & Player States
    const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number>(0);
    const [isPlayingAll, setIsPlayingAll] = useState(false);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
    
    // Player Controls State
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0); // 0 to 100
    
    // Separate Mute States
    const [isVideoMuted, setIsVideoMuted] = useState(false);
    const [isMusicMuted, setIsMusicMuted] = useState(false);
    
    // Export State
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0); // 0-100
    
    // Audio Trimming Visualization (Relative ratio for UI)
    const [audioDuration, setAudioDuration] = useState(0);

    const mainVideoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const timelineContainerRef = useRef<HTMLDivElement>(null);

    // Initialize prompt based on default active item
    useEffect(() => {
        const defaultItem = sidebarItems.find(item => item.id === activeItem);
        if (defaultItem) {
            setVideoState(prev => ({ ...prev, prompt: defaultItem.prompt }));
        }
    }, []);

    // --- PLAYBACK SYNCHRONIZATION LOGIC ---

    // 1. Sync Play/Pause State
    useEffect(() => {
        const videoEl = mainVideoRef.current;
        const audioEl = audioRef.current;

        if (isPlaying) {
            videoEl?.play().catch(() => {});
            if (isPlayingAll) {
                // If in playlist mode, audio plays along
                audioEl?.play().catch(() => {});
            } else {
                // Single clip mode, audio usually paused unless user wants preview
                // For now, we enforce audio sync only in 'Play All' mode
                audioEl?.pause(); 
            }
        } else {
            videoEl?.pause();
            audioEl?.pause();
        }
    }, [isPlaying, isPlayingAll]);

    // 2. Sync Mute State
    useEffect(() => {
        if (mainVideoRef.current) mainVideoRef.current.muted = isVideoMuted;
        if (audioRef.current) audioRef.current.muted = isMusicMuted;
    }, [isVideoMuted, isMusicMuted]);

    // 3. Handle Clip Switching (Auto Advance)
    useEffect(() => {
        if (isPlayingAll && isPlaying) {
            const videoEl = mainVideoRef.current;
            if (videoEl) {
                videoEl.currentTime = 0;
                videoEl.play().catch(() => {});
            }
        }
    }, [currentPlayingIndex]);

    // --- HANDLERS ---

    const handleTimeUpdate = () => {
        if (!mainVideoRef.current) return;
        
        const currentClipTime = mainVideoRef.current.currentTime;
        const currentClipDuration = mainVideoRef.current.duration || 1; // Avoid divide by zero
        
        // Items that actually have a video
        const playableItems = videoState.contextItems.filter(i => i.videoUrl);
        const totalClips = playableItems.length;

        if (totalClips === 0) {
            setProgress(0);
            return;
        }

        if (isPlayingAll) {
            // Calculate Global Progress
            // Each clip represents (100 / totalClips) percent of the timeline
            const segmentSize = 100 / totalClips;
            const currentClipProgressPercent = (currentClipTime / currentClipDuration) * segmentSize;
            const completedSegmentsPercent = currentPlayingIndex * segmentSize;
            
            const totalProgress = completedSegmentsPercent + currentClipProgressPercent;
            setProgress(Math.min(totalProgress, 100));
        } else {
            // Single clip progress
            setProgress((currentClipTime / currentClipDuration) * 100);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value);
        seekToPercent(val);
    };
    
    const seekToPercent = (percent: number) => {
        const playableItems = videoState.contextItems.filter(i => i.videoUrl);
        const totalClips = playableItems.length;
        
        if (totalClips === 0) return;

        if (isPlayingAll) {
            const segmentSize = 100 / totalClips;
            // Determine which clip index corresponds to this percentage
            let targetIndex = Math.floor(percent / segmentSize);
            if (targetIndex >= totalClips) targetIndex = totalClips - 1; // Clamp

            // Calculate time within that clip
            const percentWithinSegment = (percent % segmentSize) / segmentSize;
            
            // Logic to switch clip if needed
            if (targetIndex !== currentPlayingIndex) {
                setCurrentPlayingIndex(targetIndex);
                // Note: Changing index triggers re-render of <video src>, so we can't set currentTime immediately on the OLD video.
                // We set a flag or rely on onLoadedMetadata to seek, but for simplicity here we assume fast switching.
            }

            // Sync Video Time (Best effort immediately, assumes metadata loaded)
            if (mainVideoRef.current) {
                // If we switched clips, duration might be old, but React updates fast.
                // We use a small timeout to allow src prop to propagate if index changed
                setTimeout(() => {
                    if (mainVideoRef.current) {
                        const dur = mainVideoRef.current.duration || 1;
                        mainVideoRef.current.currentTime = percentWithinSegment * dur;
                    }
                }, 50);
            }

            // Sync Audio Time (Map global percent to audio duration)
            if (audioRef.current && audioDuration > 0) {
                audioRef.current.currentTime = (percent / 100) * audioDuration;
            }

        } else {
            // Single Clip Seek
            if (mainVideoRef.current) {
                const dur = mainVideoRef.current.duration || 1;
                mainVideoRef.current.currentTime = (percent / 100) * dur;
            }
        }
        
        setProgress(percent);
    };

    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineContainerRef.current) return;
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        seekToPercent(percent);
    };

    const togglePlayPause = () => {
        setIsPlaying(!isPlaying);
        if (!isPlaying && videoState.contextItems.length > 1 && !isPlayingAll) {
            // If starting play from a stopped state and we have multiple clips, default to Play All
            setIsPlayingAll(true);
        }
    };

    const handleVideoEnded = () => {
        if (!isPlayingAll) {
            setIsPlaying(false);
            return;
        }

        const playableItems = videoState.contextItems.filter(i => i.videoUrl);
        if (currentPlayingIndex < playableItems.length - 1) {
            // Move to next clip
            setCurrentPlayingIndex(prev => prev + 1);
            // Audio keeps playing...
        } else {
            // End of playlist
            setIsPlaying(false);
            setCurrentPlayingIndex(0); // Reset to start
            setProgress(0);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        }
    };

    const toggleVideoMute = () => setIsVideoMuted(!isVideoMuted);
    const toggleMusicMute = () => setIsMusicMuted(!isMusicMuted);

    const handleSidebarClick = (item: typeof sidebarItems[0]) => {
        setActiveItem(item.id);
        setVideoState(prev => ({ ...prev, prompt: item.prompt, error: null }));
    };

    const handleAspectRatioChange = async (ratio: '16:9' | '9:16') => {
        setVideoState(prev => ({ ...prev, aspectRatio: ratio }));
        if (videoState.contextItems.length > 0) {
            const updatedItems = await Promise.all(videoState.contextItems.map(async (item) => {
                if (item.videoUrl && !item.isGeneratingVideo && item.isUploaded) {
                     return item; 
                }
                const croppedBase64 = await externalVideoService.resizeAndCropImage(item.originalFile, ratio);
                const croppedFile: FileData = {
                    base64: croppedBase64.split(',')[1],
                    mimeType: 'image/jpeg',
                    objectURL: croppedBase64
                };
                return { ...item, file: croppedFile };
            }));
            setVideoState(prev => ({ ...prev, contextItems: updatedItems }));
        }
    };

    const handleFilesChange = async (files: FileData[]) => {
        const newItemsPromises = files
            .filter(f => !videoState.contextItems.some(item => item.originalFile.objectURL === f.objectURL))
            .map(async (f) => {
                const croppedBase64 = await externalVideoService.resizeAndCropImage(f, videoState.aspectRatio);
                const croppedFile: FileData = {
                    base64: croppedBase64.split(',')[1],
                    mimeType: 'image/jpeg',
                    objectURL: croppedBase64
                };

                return {
                    id: Math.random().toString(36).substr(2, 9),
                    file: croppedFile,
                    originalFile: f,
                    prompt: '',
                    isGeneratingPrompt: false,
                    isUploaded: false
                } as VideoContextItem;
            });
        
        const newItems = await Promise.all(newItemsPromises);
        if (newItems.length > 0) {
            setVideoState(prev => ({
                ...prev,
                contextItems: [...prev.contextItems, ...newItems]
            }));
        }
    };

    const handleGenerateContextPrompts = async () => {
        setIsGeneratingPrompts(true);
        const itemsToProcess = videoState.contextItems.filter(item => !item.isUploaded && !item.prompt && !item.videoUrl);
        
        setVideoState(prev => ({
            ...prev,
            contextItems: prev.contextItems.map(item => 
                !item.isUploaded && !item.prompt && !item.videoUrl ? { ...item, isGeneratingPrompt: true } : item
            )
        }));

        try {
            const updatedItems = await Promise.all(itemsToProcess.map(async (item) => {
                try {
                    const generatedPrompt = await geminiService.generateVideoPromptFromImage(item.file);
                    return { ...item, prompt: generatedPrompt, isGeneratingPrompt: false };
                } catch (error) {
                    console.error("Error generating prompt for item", item.id, error);
                    return { ...item, isGeneratingPrompt: false, prompt: "Cinematic architectural shot." };
                }
            }));

            setVideoState(prev => ({
                ...prev,
                contextItems: prev.contextItems.map(item => {
                    const updated = updatedItems.find(u => u.id === item.id);
                    return updated || item;
                })
            }));
        } finally {
            setIsGeneratingPrompts(false);
        }
    };

    const handleContextPromptChange = (id: string, newPrompt: string) => {
        setVideoState(prev => ({
            ...prev,
            contextItems: prev.contextItems.map(item => 
                item.id === id ? { ...item, prompt: newPrompt } : item
            )
        }));
    };

    const handleGenerateClip = async (item: VideoContextItem) => {
        const cost = 5;
        if (props.onDeductCredits && (props.userStatus?.credits || 0) < cost) {
             setVideoState(prev => ({ ...prev, error: `Bạn không đủ credits. Cần ${cost} credits.` }));
             return;
        }
        if (!item.prompt) {
            setVideoState(prev => ({ ...prev, error: 'Vui lòng chờ AI tạo prompt hoặc tự nhập.' }));
            return;
        }

        setVideoState(prev => ({
            ...prev,
            contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, isGeneratingVideo: true } : i),
            error: null
        }));

        let jobId: string | null = null;
        let logId: string | null = null;

        try {
            if (props.onDeductCredits) {
                logId = await props.onDeductCredits(cost, `Tạo Video Clip (${activeItem})`);
            }
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) { 
                 jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.VideoGeneration,
                    prompt: item.prompt,
                    cost: cost,
                    usage_log_id: logId
                });
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const result = await externalVideoService.generateVideoExternal(
                item.prompt, 
                "", 
                item.file,
                videoState.aspectRatio
            );
            
            setVideoState(prev => ({
                ...prev,
                contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, videoUrl: result.videoUrl, isGeneratingVideo: false } : i),
                generatedVideoUrl: result.videoUrl
            }));

            if (jobId) await jobService.updateJobStatus(jobId, 'completed', result.videoUrl);
            await historyService.addToHistory({
                tool: Tool.VideoGeneration,
                prompt: item.prompt,
                sourceImageURL: item.file.objectURL,
                resultVideoURL: result.videoUrl,
            });

        } catch (err: any) {
            console.error(err);
            const msg = err.message || "Lỗi tạo video clip.";
            setVideoState(prev => ({ 
                ...prev, 
                error: msg,
                contextItems: prev.contextItems.map(i => i.id === item.id ? { ...i, isGeneratingVideo: false } : i)
            }));
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, msg);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) await refundCredits(user.id, cost, `Hoàn tiền: Lỗi tạo video (${msg})`);
        }
    };

    // --- VIDEO UPLOAD HELPERS ---
    const generateVideoThumbnail = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;
            video.currentTime = 1;
            video.onloadeddata = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg'));
                } else {
                    resolve('');
                }
                URL.revokeObjectURL(video.src);
            };
            video.onerror = () => {
                resolve('');
                URL.revokeObjectURL(video.src);
            };
        });
    };

    const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
            setVideoState(prev => ({ ...prev, error: "File video quá lớn (Max 50MB)" }));
            return;
        }
        const objectURL = URL.createObjectURL(file);
        const thumbnailBase64 = await generateVideoThumbnail(file);
        const thumbFile: FileData = {
            base64: thumbnailBase64.split(',')[1],
            mimeType: 'image/jpeg',
            objectURL: thumbnailBase64
        };
        const newItem: VideoContextItem = {
            id: `vid_${Math.random().toString(36).substr(2, 9)}`,
            file: thumbFile,
            originalFile: thumbFile,
            prompt: `Uploaded Video: ${file.name}`,
            isGeneratingPrompt: false,
            videoUrl: objectURL,
            isGeneratingVideo: false,
            isUploaded: true
        };
        setVideoState(prev => ({
            ...prev,
            contextItems: [...prev.contextItems, newItem]
        }));
        if (videoInputRef.current) videoInputRef.current.value = '';
    };

    // --- TIMELINE LOGIC ---
    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedItemId(id);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedItemId || draggedItemId === targetId) return;

        const allItems = [...videoState.contextItems];
        const draggedIndex = allItems.findIndex(i => i.id === draggedItemId);
        const targetIndex = allItems.findIndex(i => i.id === targetId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            const [draggedItem] = allItems.splice(draggedIndex, 1);
            allItems.splice(targetIndex, 0, draggedItem);
            setVideoState(prev => ({ ...prev, contextItems: allItems }));
        }
        setDraggedItemId(null);
    };

    const handleAudioFileSelect = (file: File) => {
        if (file.type.startsWith('audio/')) {
            setAudioFile(file);
            setAudioUrl(URL.createObjectURL(file));
            const audio = new Audio(URL.createObjectURL(file));
            audio.onloadedmetadata = () => {
                setAudioDuration(audio.duration);
            };
        } else {
            setVideoState(prev => ({ ...prev, error: "Vui lòng chọn file âm thanh hợp lệ." }));
        }
    };

    const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleAudioFileSelect(file);
    };

    const handleAudioDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files && files.length > 0) handleAudioFileSelect(files[0]);
    };

    const handleAudioDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handlePlayAll = () => {
        const playableIndex = videoState.contextItems.findIndex(i => i.videoUrl);
        if (playableIndex === -1) {
            setVideoState(prev => ({ ...prev, error: "Chưa có video clip nào được tạo." }));
            return;
        }
        
        setIsPlaying(true);
        setIsPlayingAll(true);
        setCurrentPlayingIndex(playableIndex);
        
        // Ensure audio restarts if at beginning
        if (audioRef.current && playableIndex === 0) {
            audioRef.current.currentTime = 0;
        }
    };

    const handleDownloadAll = async () => {
        const playableItems = videoState.contextItems.filter(i => i.videoUrl);
        if (playableItems.length === 0) return;

        for (let i = 0; i < playableItems.length; i++) {
            const item = playableItems[i];
            const link = document.createElement('a');
            link.href = item.videoUrl!;
            link.download = `Canh ${i + 1} - clip.mp4`; 
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            await new Promise(r => setTimeout(r, 800));
        }
    };

    // --- MERGE AND EXPORT LOGIC ---
    const handleMergeAndExport = async () => {
        const playableItems = videoState.contextItems.filter(i => i.videoUrl);
        if (playableItems.length === 0) {
            setVideoState(prev => ({ ...prev, error: "Cần ít nhất một clip video để xuất." }));
            return;
        }

        setIsExporting(true);
        setExportProgress(0);
        setIsPlaying(false);
        setIsPlayingAll(false);

        // 1. Setup Canvas and AudioContext
        const canvas = document.createElement('canvas');
        canvas.width = videoState.aspectRatio === '16:9' ? 1920 : 1080;
        canvas.height = videoState.aspectRatio === '16:9' ? 1080 : 1920;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setVideoState(prev => ({ ...prev, error: "Không thể khởi tạo Canvas." }));
            setIsExporting(false);
            return;
        }

        // Fill black initially
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Setup Recording Stream
        const videoStream = canvas.captureStream(30); // 30 FPS
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const dest = audioContext.createMediaStreamDestination();
        
        // 3. Add Background Music (If not muted)
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
            } catch (e) {
                console.error("Error loading background audio for export:", e);
            }
        }

        // 4. Combine Tracks
        if (dest.stream.getAudioTracks().length > 0) {
            videoStream.addTrack(dest.stream.getAudioTracks()[0]);
        }

        const recorder = new MediaRecorder(videoStream, {
            mimeType: 'video/webm;codecs=vp9'
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

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
            
            // Cleanup
            if (bgSource) bgSource.stop();
            audioContext.close();
            setIsExporting(false);
            setExportProgress(0);
        };

        recorder.start();

        // 5. Playback and Record Loop
        const hiddenVideo = document.createElement('video');
        hiddenVideo.crossOrigin = "anonymous";
        hiddenVideo.muted = false; // We need audio if not muted
        hiddenVideo.volume = isVideoMuted ? 0 : 1; 

        // Connect hidden video audio to destination if not muted
        if (!isVideoMuted) {
            try {
                const source = audioContext.createMediaElementSource(hiddenVideo);
                source.connect(dest);
            } catch (e) {
                // Ignore if already connected or context issue
            }
        }

        for (let i = 0; i < playableItems.length; i++) {
            const item = playableItems[i];
            if (!item.videoUrl) continue;

            setExportProgress(((i) / playableItems.length) * 100);

            await new Promise<void>((resolve) => {
                hiddenVideo.src = item.videoUrl!;
                
                hiddenVideo.onloadedmetadata = () => {
                    hiddenVideo.play();
                };

                const drawFrame = () => {
                    if (hiddenVideo.paused || hiddenVideo.ended) return;
                    ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
                    requestAnimationFrame(drawFrame);
                };

                hiddenVideo.onplay = () => {
                    drawFrame();
                };

                hiddenVideo.onended = () => {
                    resolve();
                };
                
                hiddenVideo.onerror = () => {
                    console.error("Error playing video for export:", item.id);
                    resolve(); // Skip
                };
            });
        }

        setExportProgress(100);
        recorder.stop();
    };

    const activeMainVideoUrl = isPlayingAll 
        ? videoState.contextItems[currentPlayingIndex]?.videoUrl 
        : (videoState.generatedVideoUrl || videoState.contextItems.find(i => i.videoUrl)?.videoUrl);

    // Filter items for Panel 4 (Context creation)
    const creationItems = videoState.contextItems.filter(item => !item.isUploaded);

    // Items for timeline (All items with a videoUrl)
    const timelineItems = videoState.contextItems.filter(item => item.videoUrl);

    return (
        <div className="h-[100dvh] bg-dark-bg font-sans flex flex-col overflow-hidden text-white">
            <Header 
                onGoHome={props.onGoHome} 
                onThemeToggle={props.onThemeToggle} 
                theme={props.theme} 
                onSignOut={props.onSignOut} 
                onOpenGallery={props.onOpenGallery} 
                onUpgrade={props.onUpgrade} 
                onOpenProfile={props.onOpenProfile} 
                userStatus={props.userStatus}
                user={props.session?.user || null}
                onToggleNav={props.onToggleNav}
            />

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT TOOLBAR */}
                <aside className="w-[70px] md:w-64 bg-[#191919] border-r border-[#302839] flex flex-col z-10 flex-shrink-0">
                    <div className="p-2 md:p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-1 mb-6 px-2">
                            <button onClick={props.onGoHome} className="text-gray-400 hover:text-white flex items-center gap-2 transition-colors flex-1" title="Trang chủ">
                                <span className="material-symbols-outlined">arrow_back</span>
                                <span className="font-semibold text-sm hidden md:block">Trang chủ</span>
                            </button>
                            <div className="hidden md:flex bg-[#302839] rounded-lg p-0.5">
                                <button 
                                    onClick={() => handleAspectRatioChange('16:9')}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                                        videoState.aspectRatio === '16:9' ? 'bg-[#7f13ec] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    16:9
                                </button>
                                <button 
                                    onClick={() => handleAspectRatioChange('9:16')}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                                        videoState.aspectRatio === '9:16' ? 'bg-[#7f13ec] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    9:16
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            {sidebarItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleSidebarClick(item)}
                                    className={`w-full flex items-center gap-3 px-2 md:px-4 py-3 rounded-xl transition-all duration-200 group relative ${
                                        activeItem === item.id 
                                            ? 'bg-[#7f13ec] text-white shadow-lg shadow-purple-900/20' 
                                            : 'text-gray-400 hover:bg-[#2A2A2A] hover:text-white'
                                    }`}
                                >
                                    <span className={`material-symbols-outlined ${activeItem === item.id ? 'text-white' : 'text-gray-500 group-hover:text-[#7f13ec]'}`}>{item.icon.props.children}</span>
                                    <span className="text-sm font-medium hidden md:block">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* MAIN STUDIO AREA */}
                <main className="flex-1 bg-[#121212] overflow-y-auto p-4 md:p-6 relative scrollbar-hide">
                    <div className="max-w-[1920px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
                        
                        {/* --- LEFT COLUMN: INPUTS (35%) --- */}
                        <div className="lg:col-span-4 flex flex-col gap-6">
                            {/* Panel 1: Context Images */}
                            <div className="bg-[#191919]/80 backdrop-blur-md rounded-2xl border border-[#302839] p-5 shadow-lg flex flex-col gap-4 h-full overflow-hidden">
                                <h3 className="text-white font-bold text-base flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-[#7f13ec]/20 text-[#7f13ec] flex items-center justify-center text-xs">1</span>
                                    Tải ảnh bối cảnh
                                </h3>
                                <div className="border-2 border-dashed border-[#302839] rounded-xl bg-[#121212]/50 hover:border-[#7f13ec]/50 transition-colors p-6 min-h-[160px] flex flex-col justify-center">
                                    <MultiImageUpload onFilesChange={handleFilesChange} maxFiles={10} />
                                </div>
                                <button
                                    onClick={handleGenerateContextPrompts}
                                    disabled={creationItems.length === 0 || isGeneratingPrompts}
                                    className="w-full py-2.5 bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] hover:from-[#690fca] hover:to-[#8a3dcf] text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isGeneratingPrompts ? <Spinner /> : <span className="material-symbols-outlined">auto_fix_high</span>}
                                    {isGeneratingPrompts ? 'Đang phân tích...' : 'Tạo Bối Cảnh (Magic Generate)'}
                                </button>
                                <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-3 gap-2 content-start max-h-[300px]">
                                    {creationItems.map((item) => (
                                        <div key={item.id} className="aspect-square bg-black rounded-lg overflow-hidden border border-[#302839] relative">
                                            <img src={item.file.objectURL} alt="thumbnail" className="w-full h-full object-cover opacity-70" />
                                            {item.isGeneratingPrompt && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                    <Spinner />
                                                </div>
                                            )}
                                            {item.prompt && <div className="absolute bottom-1 right-1"><span className="material-symbols-outlined text-green-500 text-sm bg-black rounded-full">check_circle</span></div>}
                                            {item.videoUrl && <div className="absolute top-1 right-1"><span className="material-symbols-outlined text-white text-sm bg-purple-600 rounded-full p-0.5">videocam</span></div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* --- RIGHT COLUMN: CLIPS & TIMELINE (65%) --- */}
                        <div className="lg:col-span-8 flex flex-col gap-6">
                            
                            {/* Panel 4: Video Clips Creation */}
                            <div className="flex flex-col bg-[#191919] rounded-2xl border border-[#302839] shadow-xl overflow-hidden relative group h-[550px] min-h-[400px]">
                                <div className="p-4 border-b border-[#302839] flex items-center justify-between bg-[#191919] z-10 flex-shrink-0">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest bg-black/50 px-2 py-1 rounded backdrop-blur-sm">2. Tạo Video Clips ({videoState.aspectRatio})</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 bg-[#121212] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                                    {creationItems.filter(i => i.prompt || i.videoUrl).length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {creationItems.filter(i => i.prompt || i.videoUrl).map((item) => (
                                                <div key={item.id} className="bg-[#1E1E1E] border border-[#302839] rounded-xl overflow-hidden shadow-lg flex flex-col h-full">
                                                    <div className={`bg-black relative group ${videoState.aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
                                                        {item.videoUrl ? (
                                                            <video controls src={item.videoUrl} className="w-full h-full object-contain" />
                                                        ) : (
                                                            <img src={item.file.objectURL} alt="Source" className="w-full h-full object-cover opacity-80" />
                                                        )}
                                                        {item.isGeneratingVideo && (
                                                            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                                                <Spinner />
                                                                <span className="text-xs text-gray-300 mt-2 animate-pulse">Đang tạo clip...</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-3 flex flex-col gap-2 flex-grow">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[10px] text-gray-500 uppercase font-bold">Prompt (Tiếng Việt):</span>
                                                        </div>
                                                        <textarea 
                                                            value={item.prompt}
                                                            onChange={(e) => handleContextPromptChange(item.id, e.target.value)}
                                                            className="w-full bg-[#121212] border border-[#302839] rounded-lg p-3 text-sm text-gray-200 focus:border-[#7f13ec] focus:outline-none resize-none h-28 mb-3"
                                                            disabled={item.isGeneratingVideo}
                                                        />
                                                        <div className="mt-auto space-y-2">
                                                            {item.videoUrl ? (
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <button onClick={() => handleGenerateClip(item)} disabled={item.isGeneratingVideo} className="py-2 bg-[#00bcd4] hover:bg-[#00acc1] text-white text-xs font-bold rounded-lg transition-colors">Tạo lại</button>
                                                                    <button className="py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"><span className="material-symbols-outlined text-sm">check</span> Xong</button>
                                                                </div>
                                                            ) : (
                                                                <button onClick={() => handleGenerateClip(item)} disabled={item.isGeneratingVideo} className="w-full py-3 bg-[#7f13ec] hover:bg-[#690fca] text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-[#7f13ec]/20 hover:shadow-[#7f13ec]/40">{item.isGeneratingVideo ? 'Đang tạo...' : 'Tạo Video Clip'}</button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center opacity-30 text-center p-8">
                                            <span className="material-symbols-outlined text-6xl mb-2">video_library</span>
                                            <p className="text-sm">Tạo kịch bản (bước 1) hoặc tải video lên để bắt đầu.</p>
                                        </div>
                                    )}
                                </div>
                                {videoState.error && <div className="absolute bottom-4 left-4 right-4 bg-red-900/90 border border-red-500/50 text-red-200 p-3 rounded-xl backdrop-blur-md text-sm z-50 shadow-xl">Lỗi: {videoState.error}</div>}
                            </div>

                            {/* Panel 5: Timeline & Editing (REDESIGNED) */}
                            <div className="bg-[#191919] rounded-2xl border border-[#302839] p-0 shadow-lg flex flex-col flex-shrink-0 min-h-[600px] overflow-hidden">
                                <div className="px-4 py-3 border-b border-[#302839] flex items-center justify-between bg-[#1E1E1E]">
                                    <h3 className="text-white font-bold text-base flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-gray-700 text-gray-300 flex items-center justify-center text-xs">3</span>
                                        Timeline & Chỉnh sửa
                                    </h3>
                                    <div className="flex gap-2">
                                        <input type="file" ref={videoInputRef} className="hidden" accept="video/mp4,video/quicktime" onChange={handleVideoUpload} />
                                        <button onClick={() => videoInputRef.current?.click()} className="flex items-center gap-1 bg-[#2A2A2A] hover:bg-[#353535] text-gray-300 text-xs px-3 py-1.5 rounded-lg border border-[#302839] transition-colors"><span className="material-symbols-outlined text-sm">upload</span> Nhập Video</button>
                                        <button onClick={handleDownloadAll} className="flex items-center gap-1 bg-[#00bcd4]/10 hover:bg-[#00bcd4]/20 text-[#00bcd4] text-xs px-3 py-1.5 rounded-lg border border-[#00bcd4]/30 transition-colors"><span className="material-symbols-outlined text-sm">download</span> Tải tất cả clips</button>
                                        <button onClick={handlePlayAll} className={`flex items-center gap-1 text-white text-xs px-3 py-1.5 rounded-lg border border-[#302839] transition-colors ${isPlayingAll ? 'bg-green-600 hover:bg-green-700' : 'bg-[#2A2A2A] hover:bg-[#353535]'}`}><span className="material-symbols-outlined text-sm">{isPlayingAll ? 'stop' : 'play_arrow'}</span> {isPlayingAll ? 'Đang phát...' : 'Phát tất cả'}</button>
                                        <button 
                                            onClick={handleMergeAndExport} 
                                            disabled={isExporting}
                                            className="flex items-center gap-1 bg-[#7f13ec] hover:bg-[#690fca] text-white text-xs px-3 py-1.5 rounded-lg transition-colors ml-2 shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isExporting ? `Đang xuất ${Math.round(exportProgress)}%` : 'Ghép & Xuất Video'}
                                        </button>
                                    </div>
                                </div>

                                {/* Main Preview Area (Expanded) */}
                                <div className="flex-1 bg-[#121212] relative flex flex-col items-center justify-center border-b border-[#302839] min-h-[400px]">
                                    <div className="relative w-full h-full flex items-center justify-center bg-black">
                                        {activeMainVideoUrl ? (
                                            <video 
                                                ref={mainVideoRef}
                                                src={activeMainVideoUrl} 
                                                className="h-full w-auto max-h-[400px] object-contain shadow-2xl"
                                                onEnded={handleVideoEnded}
                                                onTimeUpdate={handleTimeUpdate}
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center opacity-30">
                                                <span className="material-symbols-outlined text-5xl mb-2">movie</span>
                                                <span className="text-gray-500 text-xs">Chưa có video nào được chọn.</span>
                                            </div>
                                        )}
                                        {/* Audio Element (Hidden) */}
                                        {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}
                                    </div>
                                    
                                    {/* Custom Controls Bar */}
                                    <div className="w-full bg-[#1A1A1A] p-3 flex items-center gap-4 border-t border-[#302839]">
                                        <button onClick={togglePlayPause} className="text-white hover:text-[#7f13ec]">
                                            <span className="material-symbols-outlined">{isPlaying ? 'pause' : 'play_arrow'}</span>
                                        </button>
                                        
                                        <div className="flex-1 flex items-center gap-2">
                                            <input 
                                                type="range" 
                                                min="0" 
                                                max="100" 
                                                value={progress} 
                                                onChange={handleSeek}
                                                className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[#7f13ec]"
                                            />
                                        </div>

                                        <div className="flex items-center gap-2 bg-[#252525] rounded-full px-2 py-1">
                                            {/* Video Audio Toggle */}
                                            <button 
                                                onClick={toggleVideoMute} 
                                                className={`p-1.5 rounded-full hover:bg-gray-600 transition-colors ${isVideoMuted ? 'text-red-400' : 'text-gray-300'}`}
                                                title={isVideoMuted ? "Đã tắt tiếng Video (Bật lại)" : "Tắt tiếng Video (Chỉ dùng nhạc nền khi xuất)"}
                                            >
                                                <span className="material-symbols-outlined text-sm">{isVideoMuted ? 'videocam_off' : 'videocam'}</span>
                                            </button>
                                            
                                            <div className="w-px h-4 bg-gray-600"></div>

                                            {/* Music Toggle */}
                                            <button 
                                                onClick={toggleMusicMute} 
                                                className={`p-1.5 rounded-full hover:bg-gray-600 transition-colors ${isMusicMuted ? 'text-red-400' : 'text-gray-300'}`}
                                                title={isMusicMuted ? "Đã tắt Nhạc nền (Bật lại)" : "Tắt Nhạc nền (Chỉ dùng tiếng Video khi xuất)"}
                                            >
                                                <span className="material-symbols-outlined text-sm">{isMusicMuted ? 'music_off' : 'music_note'}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Timeline Tracks Area */}
                                <div className="h-[140px] bg-[#161616] flex flex-col relative overflow-hidden">
                                    <div className="h-6 border-b border-[#302839] flex items-center px-4 bg-[#1E1E1E]">
                                        <span className="text-[10px] text-gray-500 font-mono">00:00</span>
                                        <div className="flex-1 flex justify-between px-4 opacity-30">{Array.from({length: 10}).map((_,i) => <div key={i} className="h-1 w-px bg-gray-500"></div>)}</div>
                                        <span className="text-[10px] text-gray-500 font-mono">END</span>
                                    </div>

                                    <div className="flex-1 relative overflow-x-auto overflow-y-hidden p-2 flex flex-col gap-2 scrollbar-thin scrollbar-thumb-gray-700" ref={timelineContainerRef} onClick={handleTimelineClick}>
                                        
                                        {/* SCRUBBER (Thanh trượt dọc) */}
                                        <div 
                                            className="absolute top-0 bottom-0 w-0.5 bg-red-600 z-50 pointer-events-none transition-all duration-100"
                                            style={{ left: `${progress}%` }} 
                                        >
                                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-600 rounded-full shadow border border-white"></div>
                                        </div>

                                        {/* Video Track */}
                                        <div className="flex items-center gap-1 min-w-max h-16 bg-[#1A1A1A] rounded-lg px-2 border border-[#302839]/50 relative">
                                            <div className="absolute left-0 top-0 bottom-0 w-8 bg-[#252525] flex items-center justify-center border-r border-[#302839] z-10"><span className="material-symbols-outlined text-gray-500 text-xs">videocam</span></div>
                                            <div className="pl-8 flex gap-1 w-full">
                                                {timelineItems.length > 0 ? timelineItems.map((item, index) => (
                                                    <div 
                                                        key={item.id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, item.id)}
                                                        onDragOver={(e) => handleDragOver(e)}
                                                        onDrop={(e) => handleDrop(e, item.id)}
                                                        onClick={(e) => {
                                                            e.stopPropagation(); // Prevent timeline seek
                                                            setVideoState(prev => ({ ...prev, generatedVideoUrl: item.videoUrl || null }));
                                                            setCurrentPlayingIndex(index);
                                                            setIsPlayingAll(false);
                                                        }}
                                                        // Distribute width evenly
                                                        style={{ width: `${100 / timelineItems.length}%` }}
                                                        className={`relative h-14 bg-black rounded cursor-pointer overflow-hidden border-2 transition-all group flex-shrink-0 ${currentPlayingIndex === index && isPlayingAll ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'border-[#302839] hover:border-gray-500'} ${draggedItemId === item.id ? 'opacity-50' : 'opacity-100'}`}
                                                    >
                                                        <video src={item.videoUrl} className="w-full h-full object-cover pointer-events-none" />
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-white px-1 truncate">Cảnh {index + 1}</div>
                                                        {isVideoMuted && <div className="absolute top-1 right-1 bg-red-600/80 rounded-full p-0.5"><span className="material-symbols-outlined text-[10px] text-white block">volume_off</span></div>}
                                                    </div>
                                                )) : (
                                                    <div className="w-full text-gray-600 text-xs italic flex items-center pl-2">Kéo thả clip hoặc tạo video ở trên để xuất hiện tại đây...</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Audio Track */}
                                        <div className="flex items-center gap-1 min-w-max h-10 bg-[#1A1A1A] rounded-lg px-2 border border-[#302839]/50 relative" onDragOver={handleAudioDragOver} onDrop={handleAudioDrop}>
                                            <div className="absolute left-0 top-0 bottom-0 w-8 bg-[#252525] flex items-center justify-center border-r border-[#302839] z-10"><span className="material-symbols-outlined text-gray-500 text-xs">music_note</span></div>
                                            <div className="pl-8 flex w-full relative">
                                                {audioFile ? (
                                                    <div 
                                                        className={`flex-1 bg-green-900/30 border border-green-700/50 rounded flex items-center px-2 relative group cursor-pointer ${isMusicMuted ? 'opacity-50 grayscale' : ''}`}
                                                        style={{ 
                                                            width: '100%', // Full timeline width
                                                            overflow: 'hidden'
                                                        }}
                                                    >
                                                        <span className="text-[10px] text-green-400 truncate w-32">{audioFile.name} {isMusicMuted ? '(Muted)' : ''}</span>
                                                        <button onClick={(e) => { e.stopPropagation(); setAudioFile(null); setAudioUrl(null); }} className="ml-auto text-red-400 hover:text-red-300 hidden group-hover:block"><span className="material-symbols-outlined text-sm">close</span></button>
                                                        <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none gap-0.5">{Array.from({length: 40}).map((_, i) => <div key={i} className="w-0.5 bg-green-500" style={{height: `${Math.random() * 80}%`}}></div>)}</div>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 border-2 border-dashed border-gray-700 rounded flex items-center justify-center hover:bg-[#252525] transition-colors relative"><span className="text-[10px] text-gray-500">Kéo thả nhạc hoặc click để chọn</span><input type="file" accept="audio/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleAudioUpload}/></div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default VideoPage;
