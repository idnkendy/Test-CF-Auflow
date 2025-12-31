
import React, { useState } from 'react';
import { VideoGeneratorState } from '../../state/toolState';
import { FileData, UserStatus } from '../../types';
import ImageUpload from '../common/ImageUpload';
import Spinner from '../Spinner';
import AspectRatioSelector from './AspectRatioSelector';

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
    const [showEndImage, setShowEndImage] = useState(false);

    return (
        <div className="bg-[#1E1E1E] border border-[#302839] rounded-2xl p-5 shadow-xl flex flex-col gap-4 h-full font-sans">
            
            {/* Image Section */}
            <div className="relative w-full bg-[#121212] rounded-xl border border-[#302839] overflow-hidden min-h-[220px] flex flex-col justify-center group/main">
                {singleSourceImage ? (
                    <>
                        <img 
                            src={singleSourceImage.objectURL} 
                            alt="Start Frame" 
                            className="w-full h-full object-contain absolute inset-0 bg-black/50" 
                        />
                        {/* Close Button */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); onSourceImageChange(null); }}
                            className="absolute top-3 right-3 bg-red-600 hover:bg-red-700 text-white w-7 h-7 rounded-full shadow-lg transition-transform hover:scale-110 z-20 flex items-center justify-center"
                            title="Xóa ảnh"
                        >
                            <span className="material-symbols-outlined text-sm font-bold">close</span>
                        </button>
                        
                        {/* End Frame Toggle/Preview */}
                        <div className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2">
                            {singleEndImage ? (
                                <div className="relative w-20 h-20 rounded-lg border-2 border-white/20 overflow-hidden shadow-lg bg-black/80 group/end">
                                    <img src={singleEndImage.objectURL} className="w-full h-full object-cover" alt="End Frame" />
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onEndImageChange(null); }}
                                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/end:opacity-100 transition-opacity text-white"
                                    >
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white text-center py-0.5">Kết thúc</div>
                                </div>
                            ) : (
                                showEndImage ? (
                                    <div className="w-20 h-20 bg-[#1E1E1E] rounded-lg border border-dashed border-gray-500 flex items-center justify-center relative">
                                        <ImageUpload onFileSelect={(f) => { onEndImageChange(f); setShowEndImage(false); }} />
                                        <button onClick={() => setShowEndImage(false)} className="absolute -top-2 -right-2 bg-gray-700 text-white rounded-full p-0.5"><span className="material-symbols-outlined text-[10px]">close</span></button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setShowEndImage(true)}
                                        className="bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm border border-white/10 flex items-center gap-1 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-xs">add_photo_alternate</span>
                                        + Ảnh kết
                                    </button>
                                )
                            )}
                        </div>
                    </>
                ) : (
                    <div className="p-4 h-full flex flex-col">
                        <ImageUpload onFileSelect={onSourceImageChange} />
                    </div>
                )}
            </div>

            {/* Toolbar (Aspect Ratio) */}
            <div className="flex justify-start">
                <div className="h-9 w-[130px]">
                    <AspectRatioSelector value={videoState.aspectRatio} onChange={onAspectRatioChange} />
                </div>
            </div>

            {/* Prompt Section */}
            <div className="relative flex-1">
                <textarea 
                    value={singlePrompt}
                    onChange={(e) => onPromptChange(e.target.value)}
                    className="w-full h-full bg-[#121212] border border-[#302839] rounded-xl p-4 text-sm text-gray-200 placeholder-gray-600 focus:border-[#7f13ec] focus:ring-1 focus:ring-[#7f13ec] focus:outline-none resize-none transition-all min-h-[100px]"
                    placeholder="Mô tả video bạn muốn tạo..."
                />
            </div>
            
            {/* Info Row (Updated per request) */}
            <div className="flex flex-wrap items-center justify-between gap-3 mt-auto pt-2">
                {/* Cost Badge */}
                <div className="flex items-center gap-2 bg-[#252525] border border-[#302839] px-3 py-2 rounded-lg shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-yellow-500/10 flex items-center justify-center border border-yellow-500/30">
                        <span className="material-symbols-outlined text-yellow-500 text-[14px] font-bold">currency_bitcoin</span>
                    </div>
                    <span className="text-white text-sm font-bold">Chi phí: 5 credits</span>
                </div>
                
                {/* Available Credits */}
                <div className="flex items-center">
                    <span className={`text-sm font-bold ${
                        (userStatus?.credits || 0) >= 5 ? 'text-[#4ADE80]' : 'text-red-500'
                    }`}>
                        Khả dụng: {userStatus?.credits || 0}
                    </span>
                </div>
            </div>

            {/* Generate Button */}
            <button
                onClick={onGenerate}
                disabled={isSingleGenerating || !singleSourceImage || (userStatus?.credits || 0) < 5} 
                className="w-full py-3.5 bg-[#7f13ec] hover:bg-[#690fca] disabled:bg-[#302839] disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-purple-900/20 transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 text-base"
            >
                {isSingleGenerating ? (
                    <Spinner />
                ) : (
                    <span className="material-symbols-outlined fill-current text-xl">movie</span>
                )}
                <span>Tạo Video Clip</span>
            </button>
        </div>
    );
};

export default SingleVideoInput;
