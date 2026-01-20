
import React from 'react';
import { VideoGeneratorState } from '../../state/toolState';
import { FileData, UserStatus } from '../../types';
import ImageUpload from '../common/ImageUpload';
import Spinner from '../Spinner';
import AspectRatioSelector from './AspectRatioSelector';
import { useLanguage } from '../../hooks/useLanguage';

interface SingleVideoInputProps {
    videoState: VideoGeneratorState;
    userStatus: UserStatus | null;
    singleSourceImage: FileData | null;
    singleEndImage: FileData | null;
    singlePrompt: string;
    isSingleGenerating: boolean;
    onSourceImageChange: (file: FileData | null) => void;
    onEndImageChange: (file: FileData | null) => void;
    onPromptChange: (val: string) => void;
    onAspectRatioChange: (val: '16:9' | '9:16' | 'default') => void;
    onGenerate: () => void;
}

const SingleVideoInput: React.FC<SingleVideoInputProps> = ({
    videoState,
    userStatus,
    singleSourceImage,
    singleEndImage,
    singlePrompt,
    isSingleGenerating,
    onSourceImageChange,
    onEndImageChange,
    onPromptChange,
    onAspectRatioChange,
    onGenerate
}) => {
    const { t } = useLanguage();

    return (
        <div className="bg-white/80 dark:bg-[#191919]/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-[#302839] p-5 shadow-lg flex flex-col gap-4 h-full overflow-hidden">
            <div className="flex justify-between items-center">
                <h3 className="text-gray-900 dark:text-white font-bold text-base flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#7f13ec] notranslate">image</span>
                    {t('video.sidebar.img_to_video')}
                </h3>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('video.input.start_img')}</label>
                        <ImageUpload onFileSelect={onSourceImageChange} previewUrl={singleSourceImage?.objectURL} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('video.input.end_img')}</label>
                        <ImageUpload onFileSelect={onEndImageChange} previewUrl={singleEndImage?.objectURL} />
                    </div>
                </div>
                
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('video.input.desc_label')}</label>
                    <textarea 
                        value={singlePrompt}
                        onChange={(e) => onPromptChange(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-[#121212] border border-border-color dark:border-[#302839] rounded-lg p-3 text-sm text-gray-900 dark:text-gray-200 focus:border-[#7f13ec] focus:outline-none resize-none h-32"
                        placeholder={t('video.input.desc_placeholder')}
                    />
                </div>
            </div>
            
            <div className="flex items-center justify-between bg-gray-50 dark:bg-[#121212] p-3 rounded-xl border border-gray-200 dark:border-[#302839] mb-1">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-yellow-500 text-xl notranslate">monetization_on</span>
                    <span className="font-bold text-gray-700 dark:text-gray-200 text-base">5 Credits</span>
                </div>
                <div className={`text-base font-semibold ${(userStatus?.credits || 0) < 5 ? 'text-red-500' : 'text-green-500'}`}>
                    {t('common.available')}: {userStatus?.credits || 0}
                </div>
            </div>

            <div className="flex gap-3 mt-auto h-12">
                <div className="w-[130px] h-full">
                    <AspectRatioSelector value={videoState.aspectRatio} onChange={onAspectRatioChange} />
                </div>
                <button
                    onClick={onGenerate}
                    disabled={isSingleGenerating || !singleSourceImage} 
                    className="flex-1 py-3 bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 h-full"
                >
                    {isSingleGenerating ? <Spinner /> : <span className="material-symbols-outlined notranslate">movie_creation</span>}
                    <span className="whitespace-nowrap">{isSingleGenerating ? t('video.msg.generating') : t('nav.video')}</span>
                </button>
            </div>
        </div>
    );
};

export default SingleVideoInput;
