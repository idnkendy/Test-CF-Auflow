
import React, { useState } from 'react';
import { FileData } from '../types';
import { PromptSuggesterState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import ImageUpload from './common/ImageUpload';
import Spinner from './Spinner';
import OptionSelector from './common/OptionSelector';
import { useLanguage } from '../hooks/useLanguage';

interface SuggestionCardProps {
    title: string;
    prompts: string[];
    onSelectPrompt: (prompt: string) => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ title, prompts, onSelectPrompt }) => {
    const { t } = useLanguage();
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    if (!prompts || prompts.length === 0) {
        return null;
    }

    // Mapping title to icons/colors for visual distinction
    const getCategoryStyle = (title: string) => {
        const t = title.toLowerCase();
        if (t.includes('toàn cảnh') || t.includes('wide')) return { icon: 'landscape', color: 'text-blue-500', bg: 'bg-blue-500/10' };
        if (t.includes('trung cảnh') || t.includes('medium')) return { icon: 'photo_camera', color: 'text-green-500', bg: 'bg-green-500/10' };
        if (t.includes('lấy nét') || t.includes('cận') || t.includes('focus')) return { icon: 'center_focus_strong', color: 'text-orange-500', bg: 'bg-orange-500/10' };
        if (t.includes('chi tiết') || t.includes('detail')) return { icon: 'texture', color: 'text-purple-500', bg: 'bg-purple-500/10' };
        return { icon: 'lightbulb', color: 'text-gray-500', bg: 'bg-gray-500/10' };
    };

    const style = getCategoryStyle(title);

    return (
        <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-gray-200 dark:border-[#302839] overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-[#302839] flex items-center gap-2 bg-gray-50/50 dark:bg-[#252525]">
                <div className={`p-1.5 rounded-lg ${style.bg} ${style.color}`}>
                    <span className="material-symbols-outlined text-lg">{style.icon}</span>
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white capitalize tracking-wide">{title}</h3>
            </div>
            
            <div className="p-2 space-y-2">
                {prompts.map((prompt, index) => (
                    <div 
                        key={`${index}-${prompt.substring(0, 10)}`}
                        className="group relative p-3 rounded-lg border border-transparent hover:border-purple-500/30 bg-gray-50 dark:bg-black/20 hover:bg-white dark:hover:bg-[#2A2A2A] transition-all duration-200 flex flex-col gap-2"
                    >
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                            {prompt}
                        </p>
                        
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity pt-1 border-t border-gray-200/50 dark:border-gray-700/50 mt-1">
                            <button 
                                onClick={() => handleCopy(prompt, index)}
                                className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 bg-white dark:bg-[#333] hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded border border-gray-200 dark:border-gray-600 transition-colors"
                                title={t('prompt_suggester.copy')}
                            >
                                {copiedIndex === index ? (
                                    <>
                                        <span className="material-symbols-outlined text-[14px] text-green-500">check</span>
                                        <span className="text-green-500">{t('prompt_suggester.copied')}</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                        <span>{t('prompt_suggester.copy')}</span>
                                    </>
                                )}
                            </button>
                            
                            <button 
                                onClick={() => onSelectPrompt(prompt)}
                                className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded shadow-sm transition-colors"
                                title={t('prompt_suggester.use')}
                            >
                                <span className="material-symbols-outlined text-[14px]">send</span>
                                <span>{t('prompt_suggester.use')}</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface PromptSuggesterProps {
    state: PromptSuggesterState;
    onStateChange: (newState: Partial<PromptSuggesterState>) => void;
    onSendToViewSyncWithPrompt: (image: FileData, prompt: string) => void;
}

const PromptSuggester: React.FC<PromptSuggesterProps> = ({ state, onStateChange, onSendToViewSyncWithPrompt }) => {
    const { t, language } = useLanguage();
    const { sourceImage, isLoading, error, suggestions, selectedSubject, numberOfSuggestions, customInstruction } = state;

    const suggestionSubjects = [
        { value: 'all', label: t('prompt_suggester.topic.all') },
        { value: 'Góc toàn cảnh', label: t('prompt_suggester.topic.wide') },
        { value: 'Góc trung cảnh', label: t('prompt_suggester.topic.medium') },
        { value: 'Góc lấy nét', label: t('prompt_suggester.topic.focus') },
        { value: 'Chi tiết kiến trúc', label: t('prompt_suggester.topic.detail') },
    ];

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({
            sourceImage: fileData,
            suggestions: null, // Clear only on new file to avoid confusion
            error: null,
        });
    };

    const handleGenerate = async () => {
        if (!sourceImage) {
            onStateChange({ error: t('common.error') });
            return;
        }

        // FIX FLICKERING: Không set suggestions: null ở đây.
        // Giữ kết quả cũ hiển thị bên dưới lớp loading cho đến khi có kết quả mới.
        onStateChange({ isLoading: true, error: null });

        try {
            const result = await geminiService.generatePromptSuggestions(
                sourceImage, 
                selectedSubject, 
                numberOfSuggestions, 
                customInstruction,
                language // Pass current language
            );
            onStateChange({ suggestions: result });
        } catch (err: any) {
            onStateChange({ error: err.message || t('common.error') });
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleSelectPrompt = (prompt: string) => {
        if (sourceImage) {
            onSendToViewSyncWithPrompt(sourceImage, prompt);
        } else {
            onStateChange({ error: t('common.error') });
        }
    };

    // Helper for number input
    const handleNumberChange = (val: number) => {
        let newVal = val;
        if (newVal < 1) newVal = 1;
        if (newVal > 10) newVal = 10;
        onStateChange({ numberOfSuggestions: newVal });
    };

    return (
        <div className="flex flex-col gap-8 max-w-[1600px] mx-auto animate-fade-in">
            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up { animation: fade-in-up 0.4s ease-out forwards; }
            `}</style>
            
            {/* Header Section */}
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500 dark:from-purple-400 dark:to-pink-400 w-fit">
                    {t('prompt_suggester.title')}
                </h2>
                <p className="text-text-secondary dark:text-gray-300 max-w-2xl text-base leading-relaxed">
                    {t('prompt_suggester.desc')}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* --- LEFT COLUMN: INPUTS (4 cols) --- */}
                <div className="lg:col-span-5 xl:col-span-4 space-y-6">
                    {/* Upload Card */}
                    <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-2xl border border-gray-200 dark:border-[#302839] shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-4">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-200">
                                {t('prompt_suggester.step1')}
                            </label>
                            {sourceImage && (
                                <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    {t('prompt_suggester.uploaded')}
                                </span>
                            )}
                        </div>
                        <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                    </div>

                    {/* Settings Card */}
                    <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-2xl border border-gray-200 dark:border-[#302839] shadow-sm hover:shadow-md transition-shadow">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-4">
                            {t('prompt_suggester.step2')}
                        </label>
                        
                        <div className="space-y-5">
                            <OptionSelector 
                                id="suggestion-subject"
                                label={t('prompt_suggester.focus_topic')}
                                options={suggestionSubjects}
                                value={selectedSubject}
                                onChange={(val) => onStateChange({ selectedSubject: val })}
                                disabled={isLoading}
                            />
                            
                            <div>
                                <label htmlFor="suggestion-count" className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">
                                    {t('prompt_suggester.count')}
                                </label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        id="suggestion-count"
                                        value={numberOfSuggestions}
                                        onChange={(e) => handleNumberChange(parseInt(e.target.value) || 5)}
                                        min="1"
                                        max="10"
                                        step="1"
                                        className="w-full bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#302839] rounded-xl p-3 text-sm text-text-primary dark:text-gray-200 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all pl-4"
                                        disabled={isLoading}
                                    />
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-50">
                                        <button 
                                            onClick={() => handleNumberChange(numberOfSuggestions + 1)}
                                            className="text-gray-500 hover:text-purple-500 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                            disabled={isLoading}
                                            type="button"
                                        >
                                            <span className="material-symbols-outlined text-[14px] leading-none">expand_less</span>
                                        </button>
                                        <button 
                                            onClick={() => handleNumberChange(numberOfSuggestions - 1)}
                                            className="text-gray-500 hover:text-purple-500 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                            disabled={isLoading}
                                            type="button"
                                        >
                                            <span className="material-symbols-outlined text-[14px] leading-none">expand_more</span>
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1.5 px-1">{t('prompt_suggester.count_hint')}</p>
                            </div>

                            <div>
                                <label htmlFor="custom-instruction" className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">
                                    {t('prompt_suggester.custom_req')}
                                </label>
                                <textarea 
                                    id="custom-instruction"
                                    rows={3}
                                    className="w-full bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#302839] rounded-xl p-3 text-sm text-text-primary dark:text-gray-200 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all resize-none placeholder-gray-400 dark:placeholder-gray-600"
                                    placeholder={t('prompt_suggester.custom_req_ph')}
                                    value={customInstruction}
                                    onChange={(e) => onStateChange({ customInstruction: e.target.value })}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !sourceImage}
                        className="w-full py-4 bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] hover:from-[#690fca] hover:to-[#8a3dcf] disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg hover:shadow-purple-500/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-3 text-lg"
                    >
                        {isLoading ? <Spinner /> : <span className="material-symbols-outlined">auto_fix_high</span>}
                        {isLoading ? t('prompt_suggester.analyzing') : t('prompt_suggester.btn_analyze')}
                    </button>
                    
                    {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl flex items-start gap-3 animate-fade-in">
                            <span className="material-symbols-outlined text-red-500 mt-0.5">error</span>
                            <div>
                                <h4 className="text-sm font-bold text-red-700 dark:text-red-400">{t('common.error')}</h4>
                                <p className="text-sm text-red-600 dark:text-red-300 mt-1">{error}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* --- RIGHT COLUMN: RESULTS (8 cols) --- */}
                <div className="lg:col-span-7 xl:col-span-8 flex flex-col h-full min-h-[500px]">
                     <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-purple-500">lightbulb</span>
                            {t('prompt_suggester.results')}
                        </h3>
                        {suggestions && !isLoading && (
                            <button 
                                onClick={() => onStateChange({ suggestions: null })} 
                                className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1 transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">delete</span>
                                {t('prompt_suggester.clear')}
                            </button>
                        )}
                     </div>

                     <div className={`flex-1 bg-gray-50 dark:bg-[#121212] rounded-2xl border-2 border-dashed border-gray-200 dark:border-[#302839] relative overflow-hidden ${!suggestions ? 'flex items-center justify-center' : 'p-4 sm:p-6'}`}>
                        
                        {isLoading && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 dark:bg-[#121212]/90 backdrop-blur-sm transition-opacity duration-300">
                                <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mb-4 animate-pulse">
                                    <span className="material-symbols-outlined text-4xl text-purple-500 animate-spin">smart_toy</span>
                                </div>
                                <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-2">{t('prompt_suggester.thinking')}</h4>
                                <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs text-center">
                                    {t('prompt_suggester.thinking_desc')}
                                </p>
                            </div>
                        )}

                        {!isLoading && !suggestions && (
                             <div className="text-center max-w-md p-6">
                                <div className="w-20 h-20 bg-gray-100 dark:bg-[#1E1E1E] rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                                    <span className="material-symbols-outlined text-5xl text-gray-300 dark:text-gray-600">image_search</span>
                                </div>
                                <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-2">{t('prompt_suggester.no_results')}</h3>
                                <p className="text-gray-500 dark:text-gray-500 text-sm leading-relaxed">
                                    {t('prompt_suggester.no_results_desc')}
                                </p>
                             </div>
                        )}

                        {/* FIX FLICKERING: Removed "!isLoading &&" check here. 
                            Results stay visible under the overlay until new data arrives. */}
                        {suggestions && (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 h-full content-start overflow-y-auto pr-1 pb-10 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
                                {Object.entries(suggestions as Record<string, string[]>).map(([title, prompts], idx) => (
                                    <div key={title} className="animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                                        <SuggestionCard 
                                            title={title} 
                                            prompts={prompts}
                                            onSelectPrompt={handleSelectPrompt}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PromptSuggester;
