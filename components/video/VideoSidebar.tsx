
import React, { useMemo } from 'react';
import { useLanguage } from '../../hooks/useLanguage';

export const useSidebarItems = () => {
    const { t } = useLanguage();
    
    return useMemo(() => [
        { 
            id: 'arch-film', 
            label: t('video.sidebar.arch_film'), 
            icon: <span className="material-symbols-outlined notranslate">movie_filter</span>,
            prompt: 'Cinematic architectural film, establishing shot, photorealistic, 4k, slow camera movement capturing the building details and atmosphere.',
            isMaintenance: false
        },
        { 
            id: 'img-to-video', 
            label: t('video.sidebar.img_to_video'), 
            icon: <span className="material-symbols-outlined notranslate">image</span>,
            prompt: 'High quality video generated from image, smooth motion, 4k, cinematic lighting.',
            isMaintenance: false
        },
        { 
            id: 'text-to-video', 
            label: t('video.sidebar.text_to_video'), 
            icon: <span className="material-symbols-outlined notranslate">description</span>,
            prompt: 'A high quality video of modern architecture, cinematic view, 4k.',
            isMaintenance: true
        },
        { 
            id: 'transition', 
            label: t('video.sidebar.transition'), 
            icon: <span className="material-symbols-outlined notranslate">transition_push</span>,
            prompt: 'Smooth morphing transition, changing lighting from day to night, timelapse effect.',
            isMaintenance: true
        },
        {
            id: 'extend-video', 
            label: t('video.sidebar.extend'),
            icon: <span className="material-symbols-outlined notranslate">playlist_add</span>,
            prompt: 'Nối tiếp cảnh quay hiện tại, giữ nguyên phong cách và ánh sáng, camera di chuyển mượt mà.',
            isMaintenance: true
        }
    ], [t]);
};

// Deprecated export for type compatibility if used elsewhere (though VideoPage uses hook now)
export const sidebarItems = [
    { id: 'arch-film', label: 'Phim kiến trúc', icon: null, prompt: '', isMaintenance: false },
    { id: 'img-to-video', label: 'Tạo video từ ảnh', icon: null, prompt: '', isMaintenance: false }
];

interface VideoSidebarProps {
    activeItem: string;
    onItemClick: (item: any) => void;
    onGoHome: () => void;
}

const VideoSidebar: React.FC<VideoSidebarProps> = ({ activeItem, onItemClick, onGoHome }) => {
    const { t } = useLanguage();
    const items = useSidebarItems();

    return (
        <aside className="w-[70px] md:w-64 bg-surface dark:bg-[#191919] border-r border-border-color dark:border-[#302839] flex flex-col z-10 flex-shrink-0 transition-colors duration-300">
            <div className="p-2 md:p-4 flex flex-col gap-2">
                <div className="flex items-center gap-1 mb-6 px-2">
                    <button onClick={onGoHome} className="text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white flex items-center gap-2 transition-colors flex-1" title={t('nav.home')}>
                        <span className="material-symbols-outlined notranslate">arrow_back</span>
                        <span className="font-semibold text-sm hidden md:block">{t('nav.home')}</span>
                    </button>
                </div>
                <div className="space-y-1">
                    {items.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onItemClick(item)}
                            className={`w-full flex items-center gap-3 px-2 md:px-4 py-3 rounded-xl transition-all duration-200 group relative ${activeItem === item.id ? 'bg-[#7f13ec] text-white shadow-lg shadow-purple-900/20' : 'text-text-secondary dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] hover:text-text-primary dark:hover:text-white'}`}
                        >
                            <span className={`material-symbols-outlined notranslate ${activeItem === item.id ? 'text-white' : 'text-gray-500 group-hover:text-[#7f13ec]'}`}>{item.icon}</span>
                            <span className="text-sm font-medium hidden md:block">{item.label}</span>
                            {item.isMaintenance && (
                                <span className="absolute top-2 right-2 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" title={t('video.maintenance.status')}></span>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    );
};

export default VideoSidebar;
