
import React, { useRef } from 'react';
import { VideoContextItem, VideoGeneratorState } from '../../state/toolState';
import Spinner from '../Spinner';

interface TimelineEditorProps {
    videoState: VideoGeneratorState;
    isPlaying: boolean;
    isPlayingAll: boolean;
    progress: number;
    audioFile: File | null;
    audioUrl: string | null;
    isVideoMuted: boolean;
    isMusicMuted: boolean;
    isExporting: boolean;
    exportProgress: number;
    currentPlayingIndex: number;
    activeMainVideoUrl: string | null;
    isSingleGenerating: boolean;
    mainVideoRef: React.RefObject<HTMLVideoElement | null>;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    videoInputRef: React.RefObject<HTMLInputElement | null>;
    timelineContainerRef: React.RefObject<HTMLDivElement | null>;
    
    // Handlers
    onTogglePlayPause: () => void;
    onSeek: (val: number) => void;
    onVideoEnded: () => void;
    onTimeUpdate: () => void;
    onToggleVideoMute: () => void;
    onToggleMusicMute: () => void;
    onTogglePlayAll: () => void;
    onMergeAndExport: () => void;
    onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onDownloadAll: () => void;
    onAudioFileSelect: (file: File) => void;
    onAudioRemove: () => void;
    onTimelineClick: (e: React.MouseEvent<HTMLDivElement>) => void;
    
    // Item Handlers
    onItemClick: (item: VideoContextItem, index: number) => void;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
    onDragOver: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
    onDownloadSingle: (url: string, index: number) => void;
    onExtendClip: (item: VideoContextItem) => void;
    onRemoveFromTimeline: (id: string) => void;
    
    // Single Mode Props
    onGenerateSingle: () => void; 
    onDownloadSimple: () => void; 
}

// Layout Constants
// The track consists of [Icon(56px)] [Clips(Rest)]
// We remove gaps/padding in the clips area to ensure 0-100% mapping is mathematically perfect.
const ICON_WIDTH = 56; // w-14 = 56px
const LEFT_OFFSET = ICON_WIDTH; 
const RIGHT_OFFSET = 0; 

const TimelineEditor: React.FC<TimelineEditorProps> = ({
    videoState, isPlaying, isPlayingAll, progress, audioFile, audioUrl, isVideoMuted, isMusicMuted,
    isExporting, exportProgress, currentPlayingIndex, activeMainVideoUrl, isSingleGenerating,
    mainVideoRef, audioRef, videoInputRef, timelineContainerRef,
    onTogglePlayPause, onSeek, onVideoEnded, onTimeUpdate, onToggleVideoMute, onToggleMusicMute, onTogglePlayAll,
    onMergeAndExport, onVideoUpload, onDownloadAll, onAudioFileSelect, onAudioRemove, onTimelineClick,
    onItemClick, onDragStart, onDragOver, onDrop, onDownloadSingle, onExtendClip, onRemoveFromTimeline,
    onGenerateSingle, onDownloadSimple
}) => {
    
    const timelineItems = videoState.contextItems.filter(item => item.videoUrl && item.isInTimeline);

    // Determine button label/icon for Play All
    let playAllLabel = 'Phát tất cả';
    let playAllIcon = 'play_arrow';
    let playAllClass = 'bg-gray-500 dark:bg-[#353535] hover:bg-gray-600 dark:hover:bg-[#404040]';

    if (isPlayingAll) {
        if (isPlaying) {
            playAllLabel = 'Tạm dừng';
            playAllIcon = 'pause';
            playAllClass = 'bg-yellow-600 hover:bg-yellow-700';
        } else {
            playAllLabel = 'Phát tiếp';
            playAllIcon = 'play_arrow';
            playAllClass = 'bg-green-600 hover:bg-green-700';
        }
    }

    // Custom click handler to account for the offset layout
    const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineContainerRef.current) return;
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        // Adjust coordinate system to ignore the header (icon) part
        const effectiveX = x - LEFT_OFFSET;
        const effectiveWidth = rect.width - LEFT_OFFSET - RIGHT_OFFSET;
        
        if (effectiveWidth <= 0) return; // Prevent divide by zero
        
        // Clamp percentage between 0 and 100
        const percent = Math.max(0, Math.min(100, (effectiveX / effectiveWidth) * 100));
        onSeek(percent);
    };

    return (
        <div className="bg-surface dark:bg-[#191919] rounded-2xl border border-border-color dark:border-[#302839] p-0 shadow-lg flex flex-col flex-shrink-0 min-h-[600px] overflow-hidden h-full">
            {/* Header / Toolbar */}
            <div className="px-4 py-3 border-b border-border-color dark:border-[#302839] flex items-center justify-between bg-surface dark:bg-[#1E1E1E]">
                <h3 className="text-text-primary dark:text-white font-bold text-base flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#7f13ec] notranslate">
                        view_timeline
                    </span>
                    Timeline & Kết quả
                </h3>
                
                {/* Controls */}
                <div className="flex gap-2 items-center">
                    <input type="file" ref={videoInputRef} className="hidden" accept="video/mp4,video/quicktime" onChange={onVideoUpload} />
                    <button onClick={() => videoInputRef.current?.click()} className="flex items-center gap-1 bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#353535] text-text-primary dark:text-gray-300 text-xs px-3 py-1.5 rounded-lg border border-border-color dark:border-[#302839] transition-colors font-medium">
                        <span className="material-symbols-outlined text-sm notranslate">upload</span> 
                        <span>Nhập</span>
                    </button>
                    <button onClick={onDownloadAll} className="flex items-center gap-1 bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#353535] text-text-primary dark:text-gray-300 text-xs px-3 py-1.5 rounded-lg border border-border-color dark:border-[#302839] transition-colors font-medium">
                        <span className="material-symbols-outlined text-sm notranslate">download_for_offline</span> 
                        <span>Tải tất cả</span>
                    </button>
                    
                    <div className="w-[1px] h-6 bg-gray-300 dark:bg-[#302839] mx-1"></div>
                    
                    <button onClick={onToggleVideoMute} className={`p-1.5 rounded-lg border border-border-color dark:border-[#302839] transition-colors ${isVideoMuted ? 'bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400' : 'bg-gray-100 dark:bg-[#2A2A2A] text-text-secondary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#353535]'}`} title={isVideoMuted ? "Bật âm thanh video" : "Tắt âm thanh video"}>
                        <span className="material-symbols-outlined text-sm notranslate">{isVideoMuted ? 'videocam_off' : 'videocam'}</span>
                    </button>
                    <button onClick={onToggleMusicMute} className={`p-1.5 rounded-lg border border-border-color dark:border-[#302839] transition-colors ${isMusicMuted ? 'bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400' : 'bg-gray-100 dark:bg-[#2A2A2A] text-text-secondary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#353535]'}`} title={isMusicMuted ? "Bật nhạc nền" : "Tắt nhạc nền"}>
                        <span className="material-symbols-outlined text-sm notranslate">{isMusicMuted ? 'music_off' : 'music_note'}</span>
                    </button>

                    <button onClick={onTogglePlayAll} className={`flex items-center gap-1 text-white text-xs px-3 py-1.5 rounded-lg border border-border-color dark:border-[#302839] transition-colors ml-2 font-medium ${playAllClass}`}>
                        <span className="material-symbols-outlined text-sm notranslate">{playAllIcon}</span> 
                        <span>{playAllLabel}</span>
                    </button>
                    <button onClick={onMergeAndExport} disabled={isExporting} className="flex items-center gap-1 bg-[#7f13ec] hover:bg-[#690fca] text-white text-xs px-3 py-1.5 rounded-lg transition-colors ml-2 shadow-lg disabled:opacity-50 font-bold">
                        <span>{isExporting ? `Đang xuất ${Math.round(exportProgress)}%` : 'Ghép & Xuất Video'}</span>
                    </button>
                </div>
            </div>

            {/* PREVIEW AREA */}
            <div className="flex-1 bg-gray-50 dark:bg-[#121212] relative flex flex-col items-center justify-center border-b border-border-color dark:border-[#302839] min-h-[400px]">
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                    {isSingleGenerating ? (
                         <div className="flex flex-col items-center justify-center text-gray-400 gap-3">
                            <Spinner />
                            <span className="animate-pulse text-sm">{videoState.loadingMessage || 'Đang khởi tạo video...'}</span>
                        </div>
                    ) : activeMainVideoUrl ? (
                        <video 
                            ref={mainVideoRef}
                            src={activeMainVideoUrl} 
                            className="w-full h-full object-contain shadow-2xl max-h-[400px]"
                            onEnded={onVideoEnded}
                            onTimeUpdate={onTimeUpdate}
                            controls
                            playsInline
                        />
                    ) : (
                        <div className="flex flex-col items-center opacity-30 select-none">
                            <span className="material-symbols-outlined text-6xl mb-2 text-white/50 notranslate">movie</span>
                            <span className="text-gray-400 text-sm">Chưa có video nào.</span>
                        </div>
                    )}
                    {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}
                </div>
                
                {/* Playback Controls */}
                <div className="w-full bg-white dark:bg-[#1A1A1A] p-3 flex items-center gap-4 border-t border-border-color dark:border-[#302839]">
                    <button 
                        onClick={timelineItems.length > 0 ? onTogglePlayAll : onTogglePlayPause} 
                        className="text-text-primary dark:text-white hover:text-[#7f13ec] transition-colors"
                        title="Phát / Tạm dừng"
                    >
                        <span className="material-symbols-outlined notranslate text-2xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
                    </button>
                    <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={progress} 
                        onChange={(e) => onSeek(Number(e.target.value))} 
                        className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#7f13ec]" 
                    />
                </div>
            </div>

            {/* TIMELINE TRACKS */}
            <div className="h-[160px] bg-gray-100 dark:bg-[#161616] flex flex-col relative overflow-hidden transition-colors duration-300 select-none">
                {/* 
                    Fixed Track Container: 
                    The container uses padding (p-3) which equals 12px.
                    The icons have a fixed width of 56px (w-14).
                    So the content area starts at 56px inside the inner relative container.
                */}
                <div className="flex-1 p-3 w-full">
                    <div className="relative w-full h-full flex flex-col gap-3" ref={timelineContainerRef} onClick={handleContainerClick}>
                        
                        {/* Progress Line */}
                        {/* 
                            Calculation:
                            left = LEFT_OFFSET px + (available_width * progress / 100)
                            available_width = 100% - LEFT_OFFSET - RIGHT_OFFSET
                        */}
                        <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-red-600 z-50 pointer-events-none shadow-[0_0_8px_rgba(220,38,38,0.8)] transition-[left] duration-75 ease-linear" 
                            style={{ 
                                left: `calc(${LEFT_OFFSET}px + (100% - ${LEFT_OFFSET + RIGHT_OFFSET}px) * ${progress} / 100)` 
                            }}
                        >
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-600 rounded-full shadow-sm"></div>
                        </div>
                        
                        {/* Video Track */}
                        <div className="flex w-full h-16 bg-white dark:bg-[#1A1A1A] rounded-lg border border-border-color dark:border-[#302839]/50 transition-colors duration-300 relative overflow-hidden">
                            {/* Icon Column (Fixed Width w-14 = 56px) */}
                            <div className="w-14 flex flex-none items-center justify-center border-r border-gray-100 dark:border-[#302839] bg-gray-50 dark:bg-[#222]">
                                <span className="material-symbols-outlined text-gray-400 dark:text-gray-500 text-xl notranslate">videocam</span>
                            </div>
                            
                            {/* Content Column (Flexible) */}
                            <div className="flex-1 flex h-full items-center overflow-hidden bg-white dark:bg-[#1A1A1A]">
                                {timelineItems.length > 0 ? timelineItems.map((item, index) => (
                                    <div 
                                        key={item.id}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, index)}
                                        onDragOver={(e) => onDragOver(e, index)}
                                        onDrop={(e) => onDrop(e, index)}
                                        onClick={(e) => { e.stopPropagation(); onItemClick(item, index); }}
                                        // Use simple percentage width to guarantee sync with progress bar
                                        style={{ width: `${100 / timelineItems.length}%` }}
                                        className={`relative h-14 my-1 bg-black rounded-md cursor-grab active:cursor-grabbing overflow-hidden border-2 transition-all group flex-shrink-0 ${currentPlayingIndex === index && isPlayingAll ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'border-gray-200 dark:border-[#302839] hover:border-gray-400'}`}
                                    >
                                        <div className="absolute top-1 left-1 z-10 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-white font-mono pointer-events-none backdrop-blur-sm">
                                            {index + 1}
                                        </div>
                                        <video 
                                            src={item.videoUrl} 
                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none" 
                                            muted
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                            <button onClick={(e) => {e.stopPropagation(); onDownloadSingle(item.videoUrl!, index)}} className="p-1.5 bg-black/60 text-white rounded-full hover:bg-[#7f13ec] transition-colors" title="Tải xuống"><span className="material-symbols-outlined text-[14px] notranslate">download</span></button>
                                            <button onClick={(e) => {e.stopPropagation(); onExtendClip(item)}} className="p-1.5 bg-black/60 text-white rounded-full hover:bg-blue-600 transition-colors" title="Mở rộng"><span className="material-symbols-outlined text-[14px] notranslate">playlist_add</span></button>
                                            <button onClick={(e) => {e.stopPropagation(); onRemoveFromTimeline(item.id)}} className="p-1.5 bg-black/60 text-white rounded-full hover:bg-red-600 transition-colors" title="Xóa khỏi Timeline"><span className="material-symbols-outlined text-[14px] notranslate">close</span></button>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="w-full h-full flex items-center justify-start pl-4">
                                        <span className="text-text-secondary dark:text-gray-600 text-xs italic flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm">video_library</span>
                                            Các clip đã thêm vào timeline sẽ xuất hiện ở đây...
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Audio Track */}
                        <div className="flex w-full h-10 bg-white dark:bg-[#1A1A1A] rounded-lg border border-border-color dark:border-[#302839]/50 transition-colors duration-300 relative overflow-hidden">
                            <div className="w-14 flex flex-none items-center justify-center border-r border-gray-100 dark:border-[#302839] bg-gray-50 dark:bg-[#222]">
                                <span className="material-symbols-outlined text-gray-400 dark:text-gray-500 text-lg notranslate">music_note</span>
                            </div>
                            
                            <div className="flex-1 relative h-full flex items-center w-full overflow-hidden bg-white dark:bg-[#1A1A1A]">
                                {audioFile ? (
                                    <div className="flex-1 h-8 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700/50 rounded-md flex items-center px-3 justify-between group cursor-pointer hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors" onClick={onAudioRemove}>
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-xs">audio_file</span>
                                            <span className="text-[11px] text-green-700 dark:text-green-300 truncate font-medium">{audioFile.name}</span>
                                        </div>
                                        <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">close</span>
                                    </div>
                                ) : (
                                    <div className="flex-1 h-8 border-2 border-dashed border-gray-300 dark:border-[#302839] rounded-md flex items-center justify-center hover:bg-gray-50 dark:hover:bg-[#252525] hover:border-[#7f13ec]/50 transition-all relative cursor-pointer group">
                                        <div className="flex items-center gap-2 text-text-secondary dark:text-gray-500 group-hover:text-[#7f13ec] transition-colors">
                                            <span className="text-[10px] font-medium">Kéo thả nhạc (.mp3)</span>
                                        </div>
                                        <input type="file" accept=".mp3,audio/mpeg" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {if(e.target.files?.[0]) onAudioFileSelect(e.target.files[0]); }} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TimelineEditor;
