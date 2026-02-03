
import React from 'react';
import { VideoGeneratorState, VideoContextItem } from '../../state/toolState';
import { UserStatus } from '../../types';
import Spinner from '../Spinner';
import { useLanguage } from '../../hooks/useLanguage';

interface VideoContextListProps {
    videoState: VideoGeneratorState;
    userStatus: UserStatus | null;
    onGenerateClip: (item: VideoContextItem) => void;
    onDownloadSingle: (url: string, index: number) => void;
    onAddToTimeline: (id: string) => void;
    onExtendClip: (item: VideoContextItem) => void;
    onPromptChange: (id: string, val: string) => void;
    onDeleteItem: (id: string) => void;
}

const VideoContextList: React.FC<VideoContextListProps> = ({
    videoState,
    userStatus,
    onGenerateClip,
    onDownloadSingle,
    onAddToTimeline,
    onExtendClip,
    onPromptChange,
    onDeleteItem
}) => {
    const { t } = useLanguage();
    const creationItems = videoState.contextItems.filter(item => !item.isUploaded);

    return (
        <div className="flex flex-col bg-surface dark:bg-[#191919] border border-border-color dark:border-[#302839] rounded-2xl overflow-hidden relative group h-full shadow-lg">
            <div className="p-4 border-b border-border-color dark:border-[#302839] flex items-center justify-between bg-surface dark:bg-[#191919] z-10 flex-shrink-0 transition-colors duration-300">
                <h3 className="text-sm font-bold text-text-primary dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#7f13ec]">view_list</span>
                    {t('video.list.title')}
                </h3>
                <span className="text-xs text-text-secondary dark:text-gray-500 bg-gray-100 dark:bg-black/50 px-2 py-1 rounded">
                    {creationItems.length}
                </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-[#121212] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent">
                {creationItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-40 text-center p-8">
                        <span className="material-symbols-outlined text-5xl mb-3 text-text-secondary dark:text-gray-500 notranslate">video_library</span>
                        <p className="text-sm text-text-secondary dark:text-gray-400">{t('video.list.empty')}</p>
                        <p className="text-xs text-text-secondary dark:text-gray-500 mt-1">{t('video.list.empty_desc')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {creationItems.map((item, idx) => (
                            <div key={item.id} className="bg-white dark:bg-[#1E1E1E] border border-border-color dark:border-[#302839] rounded-xl overflow-hidden shadow-md flex flex-col h-full relative group hover:border-[#7f13ec]/50 transition-colors">
                                {/* DELETE BUTTON */}
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        e.preventDefault();
                                        onDeleteItem(item.id); 
                                    }}
                                    className="absolute top-2 right-2 z-[20] p-1.5 bg-red-600/80 hover:bg-red-700 text-white rounded-full transition-all hover:scale-110 shadow-lg cursor-pointer flex items-center justify-center"
                                    title={t('video.list.delete')}
                                    type="button"
                                >
                                    <span className="material-symbols-outlined text-xs font-bold notranslate">close</span>
                                </button>

                                {item.videoUrl ? (
                                    // DISPLAY VIDEO + OPTIONS
                                    <div className="flex flex-col h-full">
                                        <div className={`bg-black relative group w-full ${videoState.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                                            <video 
                                                src={item.videoUrl} 
                                                className={`w-full h-full ${videoState.aspectRatio === 'default' ? 'object-contain' : 'object-cover'}`} 
                                                controls 
                                                playsInline
                                                muted
                                            />
                                            {item.isGeneratingVideo && (
                                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                                    <Spinner />
                                                    <span className="text-xs text-gray-300 mt-2 animate-pulse">{t('video.list.regenerating')}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3 bg-white dark:bg-[#191919] flex-1 flex flex-col gap-2">
                                            <textarea 
                                                value={item.prompt}
                                                onChange={(e) => onPromptChange(item.id, e.target.value)}
                                                className="w-full bg-gray-50 dark:bg-[#121212] border border-border-color dark:border-[#302839] rounded-lg p-2 text-xs text-text-primary dark:text-gray-300 focus:border-[#7f13ec] focus:outline-none resize-none h-16 mb-1"
                                                placeholder={t('video.list.prompt_ph')}
                                                disabled={item.isGeneratingVideo}
                                            />
                                            <div className="grid grid-cols-2 gap-2 mt-auto">
                                                <button 
                                                    onClick={() => onAddToTimeline(item.id)} 
                                                    disabled={item.isInTimeline}
                                                    className="flex items-center justify-center gap-1 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-white text-white rounded-md text-[10px] sm:text-xs font-bold transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-xs notranslate">add_to_queue</span>
                                                    <span>{item.isInTimeline ? t('video.list.added') : t('video.list.timeline')}</span>
                                                </button>
                                                <button 
                                                    onClick={() => onDownloadSingle(item.videoUrl!, idx)}
                                                    className="flex items-center justify-center gap-1 py-1.5 bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#353535] text-text-primary dark:text-white rounded-md text-[10px] sm:text-xs font-bold transition-all border border-border-color dark:border-[#302839]"
                                                >
                                                    <span className="material-symbols-outlined text-xs notranslate">download</span>
                                                    <span>{t('video.list.download')}</span>
                                                </button>
                                                <button 
                                                    onClick={() => onGenerateClip(item)} 
                                                    className="flex items-center justify-center gap-1 py-1.5 bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#353535] text-text-primary dark:text-white rounded-md text-[10px] sm:text-xs font-bold transition-all border border-border-color dark:border-[#302839]"
                                                    title="Tạo lại (5 credits)"
                                                >
                                                    <span className="material-symbols-outlined text-xs notranslate">refresh</span>
                                                    <span>{t('video.list.regenerate')}</span>
                                                </button>
                                                <button 
                                                    onClick={() => onExtendClip(item)} 
                                                    className="flex items-center justify-center gap-1 py-1.5 bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#353535] text-text-primary dark:text-white rounded-md text-[10px] sm:text-xs font-bold transition-all border border-border-color dark:border-[#302839]"
                                                >
                                                    <span className="material-symbols-outlined text-xs notranslate">playlist_add</span>
                                                    <span>{t('video.list.extend')}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    // DISPLAY IMAGE + GENERATE FORM
                                    <>
                                        <div className={`bg-black relative group w-full ${videoState.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                                            <img src={item.file.objectURL} alt="Source" className={`w-full h-full ${videoState.aspectRatio === 'default' ? 'object-contain' : 'object-cover'} opacity-90`} />
                                            
                                            {item.useCharacter && (
                                                <div className="absolute top-2 left-2 bg-[#7f13ec]/90 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[10px] notranslate">person</span>
                                                    + Char
                                                </div>
                                            )}

                                            {item.isGeneratingVideo && (
                                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                                    <Spinner />
                                                    <span className="text-xs text-gray-300 mt-2 animate-pulse">{t('video.list.creating')}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3 flex flex-col gap-2 flex-grow bg-white dark:bg-[#1E1E1E]">
                                            <textarea 
                                                value={item.prompt}
                                                onChange={(e) => onPromptChange(item.id, e.target.value)}
                                                className="w-full bg-gray-50 dark:bg-[#121212] border border-border-color dark:border-[#302839] rounded-lg p-2 text-xs text-text-primary dark:text-gray-300 focus:border-[#7f13ec] focus:outline-none resize-none h-16 mb-1"
                                                placeholder={t('video.list.prompt_ph')}
                                                disabled={item.isGeneratingVideo}
                                            />
                                            <div className="mt-auto">
                                                <div className="flex items-center justify-between bg-gray-50 dark:bg-[#121212] p-2.5 rounded-lg border border-border-color dark:border-[#302839] mb-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="material-symbols-outlined text-yellow-500 text-base notranslate">monetization_on</span>
                                                        <span className="font-bold text-gray-700 dark:text-gray-200 text-sm">5 Credits</span>
                                                    </div>
                                                    <div className={`text-xs font-semibold ${(userStatus?.credits || 0) < 5 ? 'text-red-500' : 'text-green-500'}`}>
                                                        {t('common.available')}: {userStatus?.credits || 0}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => onGenerateClip(item)}
                                                    disabled={item.isGeneratingVideo}
                                                    className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 ${
                                                        item.isGeneratingVideo 
                                                            ? 'bg-gray-100 dark:bg-[#2A2A2A] text-gray-400'
                                                            : 'bg-[#7f13ec] hover:bg-[#690fca] text-white hover:shadow-purple-500/20'
                                                    }`}
                                                >
                                                    {item.isGeneratingVideo ? <Spinner /> : <span className="material-symbols-outlined text-xs notranslate">movie_creation</span>}
                                                    <span>{item.isGeneratingVideo ? t('video.list.creating') : t('video.list.create_clip')}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default VideoContextList;
