
import React from 'react';
import Spinner from '../Spinner';
import { useLanguage } from '../../hooks/useLanguage';

interface SingleVideoResultProps {
    videoUrl: string | null;
    isLoading: boolean;
    loadingMessage?: string;
    onDownload: () => void;
    isDownloading?: boolean;
}

const SingleVideoResult: React.FC<SingleVideoResultProps> = ({ videoUrl, isLoading, loadingMessage, onDownload, isDownloading }) => {
    const { t } = useLanguage();
    
    return (
        <div className="bg-white/80 dark:bg-[#191919]/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-[#302839] p-6 shadow-lg h-full flex flex-col transition-colors duration-300">
            <h3 className="text-gray-900 dark:text-white font-bold text-lg mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#7f13ec] notranslate">movie</span>
                {t('video.result.title')}
            </h3>

            <div className="flex-1 bg-black rounded-xl border border-gray-200 dark:border-[#302839] relative flex items-center justify-center overflow-hidden min-h-[300px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center text-gray-400 gap-3">
                        <Spinner />
                        <span className="animate-pulse text-sm">{loadingMessage || t('video.timeline.initializing')}</span>
                    </div>
                ) : videoUrl ? (
                    <video 
                        src={videoUrl} 
                        controls 
                        autoPlay 
                        loop 
                        className="w-full h-full object-contain"
                        playsInline
                        muted
                    />
                ) : (
                    <div className="flex flex-col items-center opacity-30">
                        <span className="material-symbols-outlined text-6xl mb-2 text-white notranslate">video_file</span>
                        <p className="text-gray-300 text-sm">{t('video.result.placeholder')}</p>
                    </div>
                )}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-4">
                <button 
                    onClick={onDownload}
                    disabled={!videoUrl || isLoading || isDownloading}
                    className="w-full py-3 px-6 bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] hover:from-[#690fca] hover:to-[#8a3dcf] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isDownloading ? <Spinner /> : <span className="material-symbols-outlined notranslate">download</span>}
                    <span>{isDownloading ? t('video.result.downloading') : t('video.result.download')}</span>
                </button>
            </div>
        </div>
    );
};

export default SingleVideoResult;
