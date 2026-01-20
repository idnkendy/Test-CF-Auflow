
import React from 'react';
import { VideoGeneratorState, VideoContextItem } from '../../state/toolState';
import { FileData, UserStatus } from '../../types';
import MultiImageUpload from '../common/MultiImageUpload';
import ImageUpload from '../common/ImageUpload';
import Spinner from '../Spinner';
import AspectRatioSelector from './AspectRatioSelector';
import { useLanguage } from '../../hooks/useLanguage';

interface ArchFilmInputProps {
    videoState: VideoGeneratorState;
    userStatus: UserStatus | null;
    isGeneratingPrompts: boolean;
    onFilesChange: (files: FileData[]) => void;
    onCharacterFileChange: (file: FileData | null) => void;
    onToggleCharacter: (itemId: string) => void;
    onAspectRatioChange: (val: '16:9' | '9:16' | 'default') => void;
    onGenerateContextPrompts: () => void;
    // Props below are unused in this reduced component but kept in interface for compatibility if needed or removed
    onGenerateClip?: (item: VideoContextItem) => void;
    onDownloadSingle?: (url: string, index: number) => void;
    onAddToTimeline?: (id: string) => void;
    onExtendClip?: (item: VideoContextItem) => void;
    onPromptChange?: (id: string, val: string) => void;
    onDeleteItem?: (id: string) => void;
}

const ArchFilmInput: React.FC<ArchFilmInputProps> = ({
    videoState,
    isGeneratingPrompts,
    onFilesChange,
    onCharacterFileChange,
    onToggleCharacter,
    onAspectRatioChange,
    onGenerateContextPrompts,
}) => {
    const { t } = useLanguage();
    const creationItems = videoState.contextItems.filter(item => !item.isUploaded);

    return (
        <div className="bg-white/80 dark:bg-[#191919]/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-[#302839] flex flex-col h-full overflow-hidden shadow-lg">
            <div className="p-4 border-b border-border-color dark:border-[#302839] bg-surface dark:bg-[#191919]">
                <h3 className="text-lg font-bold text-text-primary dark:text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#7f13ec]">movie_filter</span>
                    {t('video.title')}
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
                
                {/* STEP 1: CONTEXT IMAGES */}
                <div className="flex flex-col gap-2 bg-gray-50 dark:bg-[#121212]/50 p-4 rounded-xl border border-border-color dark:border-[#302839]">
                    <div className="flex justify-between items-center mb-1">
                        <h3 className="text-gray-900 dark:text-white font-bold text-sm flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#7f13ec] text-white flex items-center justify-center text-xs">1</span>
                            {t('video.input.upload_context')}
                        </h3>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-[#1E1E1E] transition-colors min-h-[180px] flex flex-col overflow-hidden">
                        <MultiImageUpload 
                            onFilesChange={onFilesChange} 
                            maxFiles={10} 
                            className="h-full" 
                            gridClassName="grid-cols-2 md:grid-cols-2 lg:grid-cols-3" // Force larger items
                        />
                    </div>
                </div>

                {/* STEP 2: CHARACTER UPLOAD & SELECTION */}
                <div className="flex flex-col gap-4 bg-gray-50 dark:bg-[#121212]/50 p-4 rounded-xl border border-border-color dark:border-[#302839]">
                    <div className="flex justify-between items-center mb-1">
                        <h3 className="text-gray-900 dark:text-white font-bold text-sm flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#7f13ec] text-white flex items-center justify-center text-xs">2</span>
                            {t('video.input.add_char')}
                        </h3>
                    </div>
                    
                    <div className="flex flex-col gap-4">
                        {/* Upload Character */}
                        <div>
                            <ImageUpload 
                                onFileSelect={onCharacterFileChange} 
                                previewUrl={videoState.characterImage?.objectURL} 
                                id="character-upload" 
                            />
                            <p className="text-[10px] text-gray-500 text-center mt-2">{t('video.input.char_hint')}</p>
                        </div>
                        
                        {/* Scene Selection */}
                        {videoState.characterImage && creationItems.length > 0 && (
                            <div className="flex flex-col bg-white dark:bg-[#1E1E1E] rounded-xl border border-border-color dark:border-[#302839] p-3">
                                <p className="text-xs text-text-secondary dark:text-gray-400 mb-2 font-semibold">
                                    {t('video.input.select_scene')}
                                </p>
                                <div className="space-y-2 max-h-[150px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 pr-1">
                                    {creationItems.map((item, idx) => (
                                        <div 
                                            key={item.id} 
                                            className={`flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer relative z-0 hover:shadow-sm ${
                                                item.useCharacter 
                                                    ? 'bg-[#7f13ec]/10 border-[#7f13ec] dark:bg-[#7f13ec]/20' 
                                                    : 'bg-gray-50 dark:bg-[#252525] border-border-color dark:border-[#302839] hover:border-gray-400'
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                onToggleCharacter(item.id);
                                            }}
                                        >
                                            <div className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
                                                item.useCharacter 
                                                    ? 'bg-[#7f13ec] border-[#7f13ec]' 
                                                    : 'border-gray-400 dark:border-gray-600'
                                            }`}>
                                                {item.useCharacter && <span className="material-symbols-outlined text-white text-[10px] font-bold notranslate">check</span>}
                                            </div>
                                            <div className="w-8 h-8 flex-shrink-0 rounded overflow-hidden bg-gray-200">
                                                <img src={item.file.objectURL} className="w-full h-full object-cover" alt={`Scene ${idx+1}`} />
                                            </div>
                                            <span className="text-xs text-text-primary dark:text-gray-300 truncate flex-1 font-medium">
                                                {t('video.input.scene')} {idx + 1}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* FOOTER ACTIONS */}
            <div className="p-5 border-t border-gray-200 dark:border-[#302839] flex-shrink-0 bg-white dark:bg-[#191919]">
                <div className="flex gap-3 h-12">
                    <div className="w-[120px] h-full">
                        <AspectRatioSelector value={videoState.aspectRatio} onChange={onAspectRatioChange} />
                    </div>
                    <button
                        onClick={onGenerateContextPrompts}
                        disabled={creationItems.length === 0 || isGeneratingPrompts}
                        className="flex-1 py-3 bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] hover:from-[#690fca] hover:to-[#8a3dcf] text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 h-full"
                    >
                        {isGeneratingPrompts ? <Spinner /> : <span className="material-symbols-outlined notranslate">auto_fix_high</span>}
                        <span className="whitespace-nowrap">{isGeneratingPrompts ? t('video.input.generating_prompts') : t('video.input.generate_context')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ArchFilmInput;
