
import React, { useRef } from 'react';
import { VideoContextItem, VideoGeneratorState } from '../../state/toolState';
import Spinner from '../Spinner';
import { useLanguage } from '../../hooks/useLanguage';

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
const ICON_WIDTH = 48; // Smaller for mobile
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
    const { t } = useLanguage();
    const timelineItems = videoState.contextItems.filter(item => item.videoUrl && item.isInTimeline);

    // Determine button label/icon for Play All
    let playAllLabel = t('video.timeline.play_all');
    let playAllIcon = 'play_arrow';
    let playAllClass = 'bg-gray-500 dark:bg-[#353535] hover:bg-gray-600 dark:hover:bg-[#404040]';

    if (isPlayingAll) {
        if (isPlaying) {
            playAllLabel = t('video.timeline.pause');
            playAllIcon = 'pause';
            playAllClass = 'bg-yellow-600 hover:bg-yellow-700';
        } else {
            playAllLabel = t('video.timeline.resume');
            playAllIcon = 'play_arrow';
            playAllClass = 'bg-green-600 hover:bg-green-700';
        }
    }

    const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineContainerRef.current) return;
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        const effectiveX = x - LEFT_OFFSET;
        const effectiveWidth = rect.width - LEFT_OFFSET - RIGHT_OFFSET;
        
        if (effectiveWidth <= 0) return; 
        
        const percent = Math.max(0, Math.min(100, (effectiveX / effectiveWidth) * 100));
        onSeek(percent);
    };

    return (
        <div className="bg-surface dark:bg-[#191919] rounded-2xl border border-border-color dark:border-[#302839] p-0 shadow-lg flex flex-col flex-shrink-0 h-full overflow-hidden transition-all duration-300">
            {/* Header / Toolbar - Scrollable for mobile */}
            <div className="px-3 sm:px-4 py-2 border-b border-border-color dark:border-[#302839] flex items-center justify-between bg-surface dark:bg-[#1E1E1E] flex-shrink-0">
                <h3 className="text-text-primary dark:text-white font-bold text-sm sm:text-base flex items-center gap-2 whitespace-nowrap mr-2">
                    <span className="material-symbols-outlined text-[#7f13ec] text-lg sm:text-xl notranslate">
                        view_timeline
                    </span>
                    <span className="hidden sm:inline">{t('video.timeline.title')}</span>
                </h3>
                
                {/* Controls - Horizontal scroll on mobile */}
                <div className="flex gap-1.5 sm:gap-2 items-center overflow-x-auto scrollbar-hide py-1 max-w-[70vw] sm:max-w-none">
                    <input type="file" ref={videoInputRef} className="hidden" accept="video/mp4,video/quicktime" onChange={onVideoUpload} />
                    <button onClick={() => videoInputRef.current?.click()} className="flex-shrink-0 flex items-center gap-1 bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#353535] text-text-primary dark:text-gray-300 text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-border-color dark:border-[#302839] transition-colors font-medium">
                        <span className="material-symbols-outlined text-sm notranslate">upload</span> 
                        <span className="hidden md:inline">{t('video.timeline.import')}</span>
                    </button>
                    <button onClick={onDownloadAll} className="flex-shrink-0 flex items-center gap-1 bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#353535] text-text-primary dark:text-gray-300 text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-border-color dark:border-[#302839] transition-colors font-medium">
                        <span className="material-symbols-outlined text-sm notranslate">download_for_offline</span> 
                        <span className="hidden md:inline">{t('video.timeline.download_all')}</span>
                    </button>
                    
                    <div className="w-[1px] h-5 bg-gray-300 dark:bg-[#302839] mx-1 flex-shrink-0"></div>
                    
                    <button onClick={onToggleVideoMute} className={`flex-shrink-0 p-1 rounded-lg border border-border-color dark:border-[#302839] transition-colors ${isVideoMuted ? 'bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400' : 'bg-gray-100 dark:bg-[#2A2A2A] text-text-secondary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#353535]'}`} title={isVideoMuted ? t('video.timeline.unmute_video') : t('video.timeline.mute_video')}>
                        <span className="material-symbols-outlined text-sm notranslate">{isVideoMuted ? 'videocam_off' : 'videocam'}</span>
                    </button>
                    <button onClick={onToggleMusicMute} className={`flex-shrink-0 p-1 rounded-lg border border-border-color dark:border-[#302839] transition-colors ${isMusicMuted ? 'bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400' : 'bg-gray-100 dark:bg-[#2A2A2A] text-text-secondary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#353535]'}`} title={isMusicMuted ? t('video.timeline.unmute_music') : t('video.timeline.mute_music')}>
                        <span className="material-symbols-outlined text-sm notranslate">{isMusicMuted ? 'music_off' : 'music_note'}</span>
                    </button>

                    <button onClick={onTogglePlayAll} className={`flex-shrink-0 flex items-center gap-1 text-white text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-border-color dark:border-[#302839] transition-colors ml-1 sm:ml-2 font-medium ${playAllClass}`}>
                        <span className="material-symbols-outlined text-sm notranslate">{playAllIcon}</span> 
                        <span className="whitespace-nowrap">{playAllLabel}</span>
                    </button>
                    <button onClick={onMergeAndExport} disabled={isExporting} className="flex-shrink-0 flex items-center gap-1 bg-[#7f13ec] hover:bg-[#690fca] text-white text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-colors ml-1 sm:ml-2 shadow-lg disabled:opacity-50 font-bold">
                        <span className="whitespace-nowrap">{isExporting ? `${t('video.timeline.exporting')} ${Math.round(exportProgress)}%` : t('video.timeline.merge_export')}</span>
                    </button>
                </div>
            </div>

            {/* PREVIEW AREA */}
            <div className="flex-1 bg-gray-50 dark:bg-[#121212] relative flex flex-col items-center justify-center border-b border-border-color dark:border-[#302839] min-h-[150px] overflow-hidden">
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                    {isSingleGenerating ? (
                         <div className="flex flex-col items-center justify-center text-gray-400 gap-2 p-4 text-center">
                            <Spinner />
                            <span className="animate-pulse text-xs sm:text-sm">{videoState.loadingMessage || t('video.timeline.initializing')}</span>
                        </div>
                    ) : activeMainVideoUrl ? (
                        <video 
                            ref={mainVideoRef}
                            src={activeMainVideoUrl} 
                            className="w-full h-full object-contain shadow-2xl max-h-full"
                            onEnded={onVideoEnded}
                            onTimeUpdate={onTimeUpdate}
                            controls
                            playsInline
                        />
                    ) : (
                        <div className="flex flex-col items-center opacity-30 select-none p-4 text-center">
                            <span className="material-symbols-outlined text-4xl sm:text-6xl mb-2 text-white/50 notranslate">movie</span>
                            <span className="text-gray-400 text-xs sm:text-sm">{t('video.timeline.no_video')}</span>
                        </div>
                    )}
                    {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}
                </div>
                
                {/* Playback Controls - Minimal for mobile */}
                <div className="w-full bg-white dark:bg-[#1A1A1A] p-1.5 sm:p-2 flex items-center gap-2 sm:gap-4 border-t border-border-color dark:border-[#302839] flex-shrink-0 z-10">
                    <button 
                        onClick={timelineItems.length > 0 ? onTogglePlayAll : onTogglePlayPause} 
                        className="text-text-primary dark:text-white hover:text-[#7f13ec] transition-colors"
                        title={isPlaying ? t('video.timeline.pause') : t('video.timeline.play_all')}
                    >
                        <span className="material-symbols-outlined notranslate text-xl sm:text-2xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
                    </button>
                    <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={progress} 
                        onChange={(e) => onSeek(Number(e.target.value))} 
                        className="w-full h-1 sm:h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#7f13ec]" 
                    />
                </div>
            </div>

            {/* TIMELINE TRACKS */}
            <div className="h-[100px] sm:h-[120px] md:h-[140px] bg-gray-100 dark:bg-[#161616] flex flex-col relative overflow-hidden transition-colors duration-300 select-none flex-shrink-0 border-t border-[#302839]">
                <div className="flex-1 p-1.5 sm:p-2 w-full">
                    <div className="relative w-full h-full flex flex-col gap-1.5 sm:gap-2" ref={timelineContainerRef} onClick={handleContainerClick}>
                        
                        {/* Progress Line */}
                        <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-red-600 z-50 pointer-events-none shadow-[0_0_8px_rgba(220,38,38,0.8)] transition-[left] duration-75 ease-linear" 
                            style={{ 
                                left: `calc(${LEFT_OFFSET}px + (100% - ${LEFT_OFFSET + RIGHT_OFFSET}px) * ${progress} / 100)` 
                            }}
                        >
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 sm:w-3 sm:h-3 bg-red-600 rounded-full shadow-sm"></div>
                        </div>
                        
                        {/* Video Track */}
                        <div className="flex w-full h-10 sm:h-12 md:h-14 bg-white dark:bg-[#1A1A1A] rounded-lg border border-border-color dark:border-[#302839]/50 transition-colors duration-300 relative overflow-hidden">
                            <div className="w-10 sm:w-12 md:w-14 flex flex-none items-center justify-center border-r border-gray-100 dark:border-[#302839] bg-gray-50 dark:bg-[#222]">
                                <span className="material-symbols-outlined text-gray-400 dark:text-gray-500 text-lg sm:text-xl notranslate">videocam</span>
                            </div>
                            
                            <div className="flex-1 flex h-full items-center overflow-hidden bg-white dark:bg-[#1A1A1A]">
                                {timelineItems.length > 0 ? timelineItems.map((item, index) => (
                                    <div 
                                        key={item.id}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, index)}
                                        onDragOver={(e) => onDragOver(e, index)}
                                        onDrop={(e) => onDrop(e, index)}
                                        onClick={(e) => { e.stopPropagation(); onItemClick(item, index); }}
                                        style={{ width: `${100 / timelineItems.length}%` }}
                                        className={`relative h-8 sm:h-10 md:h-12 my-1 bg-black rounded-md cursor-grab active:cursor-grabbing overflow-hidden border transition-all group flex-shrink-0 ${currentPlayingIndex === index && isPlayingAll ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'border-gray-200 dark:border-[#302839] hover:border-gray-400'}`}
                                    >
                                        <div className="absolute top-0.5 left-0.5 z-10 bg-black/70 px-1 py-0 rounded text-[7px] sm:text-[9px] text-white font-mono pointer-events-none backdrop-blur-sm">
                                            {index + 1}
                                        </div>
                                        <video 
                                            src={item.videoUrl} 
                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none" 
                                            muted
                                        />
                                        {/* Simplified Actions for Mobile Overlay */}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-0.5 sm:gap-1">
                                            <button onClick={(e) => {e.stopPropagation(); onDownloadSingle(item.videoUrl!, index)}} className="p-1 sm:p-1.5 bg-black/60 text-white rounded-full hover:bg-[#7f13ec] transition-colors" title={t('video.list.download')}><span className="material-symbols-outlined text-[12px] sm:text-[14px] notranslate">download</span></button>
                                            <button onClick={(e) => {e.stopPropagation(); onRemoveFromTimeline(item.id)}} className="p-1 sm:p-1.5 bg-black/60 text-white rounded-full hover:bg-red-600 transition-colors" title={t('video.timeline.remove_timeline')}><span className="material-symbols-outlined text-[12px] sm:text-[14px] notranslate">close</span></button>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="w-full h-full flex items-center justify-start pl-2 sm:pl-4">
                                        <span className="text-text-secondary dark:text-gray-600 text-[10px] sm:text-xs italic flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-xs sm:text-sm">video_library</span>
                                            {t('video.timeline.drag_hint')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Audio Track */}
                        <div className="flex w-full h-8 sm:h-9 md:h-10 bg-white dark:bg-[#1A1A1A] rounded-lg border border-border-color dark:border-[#302839]/50 transition-colors duration-300 relative overflow-hidden">
                            <div className="w-10 sm:w-12 md:w-14 flex flex-none items-center justify-center border-r border-gray-100 dark:border-[#302839] bg-gray-50 dark:bg-[#222]">
                                <span className="material-symbols-outlined text-gray-400 dark:text-gray-500 text-base sm:text-lg notranslate">music_note</span>
                            </div>
                            
                            <div className="flex-1 relative h-full flex items-center w-full overflow-hidden bg-white dark:bg-[#1A1A1A]">
                                {audioFile ? (
                                    <div className="flex-1 h-6 sm:h-7 md:h-8 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700/50 rounded-md flex items-center px-2 sm:px-3 justify-between group cursor-pointer hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors" onClick={onAudioRemove}>
                                        <div className="flex items-center gap-1 sm:gap-2 overflow-hidden">
                                            <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-[10px] sm:text-xs">audio_file</span>
                                            <span className="text-[9px] sm:text-[11px] text-green-700 dark:text-green-300 truncate font-medium">{audioFile.name}</span>
                                        </div>
                                        <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">close</span>
                                    </div>
                                ) : (
                                    <div className="flex-1 h-6 sm:h-7 md:h-8 border border-dashed border-gray-300 dark:border-[#302839] rounded-md flex items-center justify-center hover:bg-gray-50 dark:hover:bg-[#252525] hover:border-[#7f13ec]/50 transition-all relative cursor-pointer group">
                                        <div className="flex items-center gap-1 sm:gap-2 text-text-secondary dark:text-gray-500 group-hover:text-[#7f13ec] transition-colors">
                                            <span className="text-[9px] sm:text-[10px] font-medium">{t('video.timeline.drag_music')}</span>
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
