
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as historyService from '../services/historyService';
import * as externalVideoService from '../services/externalVideoService';
import { HistoryItem, Tool } from '../types';
import Spinner from './Spinner';
import { useLanguage } from '../hooks/useLanguage';

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const XMarkIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

// Helper to use Supabase Image Transformation
const getOptimizedUrl = (url: string) => {
    if (!url) return '';
    // Only optimize Supabase Storage URLs
    if (url.includes('supabase.co') && url.includes('/storage/v1/object/public/')) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}width=500&quality=60&format=webp&resize=contain`;
    }
    return url;
};

const ITEMS_PER_PAGE = 10;

const HistoryPanel: React.FC = () => {
    const { t, language } = useLanguage();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    
    // Pagination State
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const toolDisplayNames: Record<string, string> = useMemo(() => ({
        [Tool.FloorPlan]: t('tool.floorplan'),
        [Tool.Renovation]: t('tool.renovation'),
        [Tool.ArchitecturalRendering]: t('tool.arch'),
        [Tool.InteriorRendering]: t('tool.interior'),
        [Tool.UrbanPlanning]: t('tool.urban'),
        [Tool.LandscapeRendering]: t('tool.landscape'),
        [Tool.AITechnicalDrawings]: t('tool.technical'),
        [Tool.SketchConverter]: t('tool.sketch'),
        [Tool.ViewSync]: t('tool.viewsync'),
        [Tool.MaterialSwap]: t('tool.material'),
        [Tool.VideoGeneration]: t('tool.video'),
        [Tool.ImageEditing]: t('tool.editor'),
        [Tool.Upscale]: t('tool.upscale'),
        [Tool.Moodboard]: t('tool.moodboard'),
        [Tool.History]: t('nav.history'),
        [Tool.LayoutGenerator]: t('tool.layout'),
        [Tool.DrawingGenerator]: t('tool.drawing'),
        [Tool.DiagramGenerator]: t('tool.diagram'),
        [Tool.RealEstatePoster]: t('tool.poster'),
        [Tool.EditByNote]: t('tool.edit_note'),
        [Tool.ReRender]: t('tool.rerender'),
        [Tool.PromptSuggester]: t('tool.prompt'),
        [Tool.Staging]: t('tool.staging'),
    }), [t]);

    const loadHistory = async (isInitial = false) => {
        if (isInitial) {
            setIsLoading(true);
            setOffset(0);
        } else {
            setIsLoadingMore(true);
        }

        try {
            const currentOffset = isInitial ? 0 : offset;
            const items = await historyService.getHistory(ITEMS_PER_PAGE, currentOffset);
            
            if (items.length < ITEMS_PER_PAGE) {
                setHasMore(false);
            } else {
                setHasMore(true);
            }

            if (isInitial) {
                setHistory(items);
                setOffset(ITEMS_PER_PAGE);
            } else {
                setHistory(prev => [...prev, ...items]);
                setOffset(prev => prev + items.length);
            }
        } catch (error) {
            console.error("Failed to load history from Supabase", error);
        } finally {
            if (isInitial) setIsLoading(false);
            else setIsLoadingMore(false);
        }
    };

    useEffect(() => {
        loadHistory(true);
    }, []);

    const handleLoadMore = () => {
        loadHistory(false);
    };

    const handleClearHistory = async () => {
        if (window.confirm(t('history.delete_confirm_all'))) {
            setIsLoading(true);
            try {
                await historyService.clearHistory();
                setHistory([]);
                setOffset(0);
                setHasMore(false);
            } catch (error) {
                alert(t('history.delete_error'));
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault(); 

        if (window.confirm(t('history.delete_confirm_item'))) {
            setIsDeletingId(id);
            try {
                await historyService.deleteHistoryItem(id);
                setHistory(prev => prev.filter(item => item.id !== id));
            } catch (error: any) {
                console.error("Delete error:", error);
                alert(`${t('history.delete_error')}: ${error.message || ""}`);
            } finally {
                setIsDeletingId(null);
            }
        }
    };
    
    const handleModalDelete = async () => {
        if (!selectedItem) return;
        if (window.confirm(t('history.delete_confirm_item'))) {
            setIsDeletingId(selectedItem.id);
            try {
                await historyService.deleteHistoryItem(selectedItem.id);
                setHistory(prev => prev.filter(item => item.id !== selectedItem.id));
                setSelectedItem(null);
            } catch (error: any) {
                 console.error("Delete error:", error);
                 alert(`${t('history.delete_error')}: ${error.message || ""}`);
            } finally {
                setIsDeletingId(null);
            }
        }
    };

    const renderModal = () => {
        if (!selectedItem) return null;

        const handleDownload = async () => {
            if (!selectedItem) return;
            const url = selectedItem.media_url || selectedItem.resultImageURL || selectedItem.resultVideoURL;
            if (!url) return;
            
            const isVideo = selectedItem.media_type === 'video' || !!selectedItem.resultVideoURL;
            const filename = isVideo
                ? `opzen-render-${selectedItem.id}.mp4`
                : `opzen-render-${selectedItem.id}.png`;

            setIsDownloading(true);
            await externalVideoService.forceDownload(url, filename);
            setIsDownloading(false);
        };
        
        const displayUrl = selectedItem.media_url || selectedItem.resultImageURL || selectedItem.resultVideoURL;
        const sourceUrl = selectedItem.source_url || selectedItem.sourceImageURL;
        const isVideo = selectedItem.media_type === 'video' || !!selectedItem.resultVideoURL;
        const dateString = selectedItem.created_at 
            ? new Date(selectedItem.created_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') 
            : (selectedItem.timestamp ? new Date(selectedItem.timestamp).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') : '');

        // Dùng createPortal để gắn modal trực tiếp vào body, đảm bảo hiển thị fixed chính giữa viewport
        return createPortal(
            <div 
                className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-2 sm:p-4 animate-fade-in backdrop-blur-sm"
                onClick={() => setSelectedItem(null)}
            >
                <div 
                    className="relative bg-surface dark:bg-[#121212] p-4 sm:p-6 rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto flex flex-col lg:flex-row gap-6 sm:gap-8 border border-border-color dark:border-[#302839] shadow-2xl animate-scale-up"
                    onClick={(e) => e.stopPropagation()}
                >
                    <style>{`
                        @keyframes scale-up {
                            from { opacity: 0; transform: scale(0.95); }
                            to { opacity: 1; transform: scale(1); }
                        }
                        .animate-scale-up { animation: scale-up 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                    `}</style>

                    <button
                        onClick={() => setSelectedItem(null)}
                        className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors z-20 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                        title={t('common.close')}
                    >
                        <XMarkIcon />
                    </button>

                    <div className="flex-1 flex flex-col min-w-0">
                        <h3 className="text-lg font-bold text-text-primary dark:text-white mb-4 flex items-center gap-2">
                            {t('history.modal.result')}
                            {isVideo && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200 font-bold uppercase tracking-wider">Video</span>}
                        </h3>
                        <div className="flex-grow bg-black/5 dark:bg-black/40 rounded-xl border border-border-color dark:border-[#302839] overflow-hidden flex items-center justify-center min-h-[250px] lg:min-h-[400px]">
                            {isVideo ? (
                                <video controls autoPlay src={displayUrl} className="w-full h-full max-h-[60vh] object-contain" />
                            ) : (
                                displayUrl && <img src={displayUrl} alt="Result" className="w-full h-full max-h-[60vh] object-contain" />
                            )}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col w-full lg:max-w-md space-y-5">
                         {sourceUrl && (
                             <div>
                                <h3 className="text-xs font-bold text-text-secondary dark:text-gray-400 mb-2 uppercase tracking-widest">{t('history.modal.source')}</h3>
                                <div className="w-full rounded-xl overflow-hidden border border-border-color dark:border-[#302839] bg-black/5 dark:bg-black/40 flex justify-center items-center">
                                    <img src={sourceUrl} alt="Original" className="max-h-52 w-auto max-w-full object-contain" />
                                </div>
                            </div>
                         )}
                        
                        <div className="space-y-4 flex-grow overflow-y-auto pr-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h3 className="text-[10px] font-bold text-text-secondary dark:text-gray-400 mb-1 uppercase tracking-widest">{t('history.modal.tool')}</h3>
                                    <p className="text-text-primary dark:text-white font-bold text-sm">{toolDisplayNames[selectedItem.tool] || selectedItem.tool}</p>
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-bold text-text-secondary dark:text-gray-400 mb-1 uppercase tracking-widest">{t('history.modal.time')}</h3>
                                    <p className="text-text-primary dark:text-white font-medium text-sm">{dateString}</p>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-[10px] font-bold text-text-secondary dark:text-gray-400 mb-1 uppercase tracking-widest">{t('history.modal.prompt')}</h3>
                                <div className="bg-gray-50 dark:bg-black/30 p-3 rounded-xl border border-border-color dark:border-[#302839]">
                                    <p className="text-text-primary dark:text-gray-200 text-xs leading-relaxed break-words max-h-32 overflow-y-auto pr-1">
                                        {selectedItem.prompt}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 mt-auto border-t border-border-color dark:border-[#302839] flex flex-col sm:flex-row items-center gap-3">
                            <button
                                onClick={handleModalDelete}
                                disabled={isDeletingId === selectedItem.id}
                                className="w-full sm:w-auto px-4 py-2.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-bold text-xs transition-all flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl"
                            >
                                {isDeletingId === selectedItem.id ? <Spinner /> : <TrashIcon />}
                                <span>{t('common.delete')}</span>
                            </button>
                            
                            <div className="flex-grow hidden sm:block"></div>
                            
                            <button
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="w-full sm:w-auto bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                {isDownloading ? <Spinner /> : <DownloadIcon />}
                                <span>{isDownloading ? t('common.loading') : t('common.download')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <div className="animate-fade-in">
            {renderModal()}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-text-primary dark:text-white">{t('history.title')}</h2>
                    <p className="text-text-secondary dark:text-gray-300 text-sm mt-1">{t('history.desc')}</p>
                </div>
                {history.length > 0 && !isLoading && (
                    <button
                        onClick={handleClearHistory}
                        className="group flex items-center gap-2 px-4 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-sm font-medium self-start sm:self-center border border-transparent hover:border-red-200 dark:hover:border-red-800/50"
                    >
                        <TrashIcon />
                        <span>{t('history.clear_all')}</span>
                    </button>
                )}
            </div>

            {isLoading ? (
                 <div className="text-center py-20 bg-surface dark:bg-gray-800/30 rounded-xl border-2 border-dashed border-border-color dark:border-[#302839]">
                    <div className="flex justify-center items-center mb-4">
                        <Spinner />
                    </div>
                    <p className="text-text-secondary dark:text-gray-400 animate-pulse">{t('history.loading_data')}</p>
                </div>
            ) : history.length === 0 ? (
                <div className="text-center py-20 bg-surface dark:bg-gray-800/30 rounded-xl border-2 border-dashed border-border-color dark:border-[#302839]">
                    <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4 text-gray-400 dark:text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-white mb-1">{t('history.empty_title')}</h3>
                    <p className="text-sm text-text-secondary dark:text-gray-400">{t('history.empty_desc')}</p>
                </div>
            ) : (
                <div className="space-y-8">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {history.map(item => {
                             const displayUrl = item.media_url || item.resultImageURL || item.resultVideoURL;
                             const isVideo = item.media_type === 'video' || !!item.resultVideoURL;
                             const dateString = item.created_at 
                                ? new Date(item.created_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')
                                : (item.timestamp ? new Date(item.timestamp).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') : '');
                             
                             const isDeleting = isDeletingId === item.id;

                             return (
                                <div 
                                    key={item.id} 
                                    className="group relative aspect-square bg-surface dark:bg-gray-800 rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl border border-border-color dark:border-[#302839] hover:border-accent dark:hover:border-accent transition-all duration-300" 
                                    onClick={() => setSelectedItem(item)}
                                >
                                    {isVideo ? (
                                        <>
                                            <video 
                                                src={displayUrl} 
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                                muted 
                                                playsInline
                                            />
                                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
                                                <div className="bg-black/30 p-2 rounded-full backdrop-blur-sm">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        displayUrl && <img 
                                            src={getOptimizedUrl(displayUrl)} 
                                            alt={item.prompt} 
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 bg-gray-200 dark:bg-gray-700" 
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    )}
                                    
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                                        <p className="text-white text-xs font-bold mb-0.5 truncate">{toolDisplayNames[item.tool] || item.tool}</p>
                                        <p className="text-gray-300 text-[10px]">{dateString}</p>
                                    </div>

                                    {isDeleting ? (
                                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 backdrop-blur-sm">
                                            <Spinner />
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => handleDeleteItem(item.id, e)}
                                            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 backdrop-blur-md shadow-sm hover:scale-110"
                                            title={t('common.delete')}
                                        >
                                            <TrashIcon />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    
                    {hasMore && (
                        <div className="flex justify-center pt-6">
                            <button 
                                onClick={handleLoadMore}
                                disabled={isLoadingMore}
                                className="px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-text-secondary dark:text-gray-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-all flex items-center gap-2"
                            >
                                {isLoadingMore && <Spinner />}
                                {isLoadingMore ? t('common.loading') : t('history.load_more')}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default HistoryPanel;
