
import React from 'react';
import { useLanguage } from '../../hooks/useLanguage';

interface MaintenanceViewProps {
    title: string;
}

const MaintenanceView: React.FC<MaintenanceViewProps> = ({ title }) => {
    const { t } = useLanguage();
    
    return (
        <div className="bg-white/80 dark:bg-[#191919]/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-[#302839] p-5 shadow-lg flex flex-col gap-6 h-full overflow-hidden items-center justify-center text-center animate-fade-in">
            <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mb-2 shadow-inner border border-yellow-500/20">
                <span className="material-symbols-outlined notranslate text-yellow-500 text-4xl">engineering</span>
            </div>
            <div>
                <h3 className="text-gray-900 dark:text-white font-bold text-2xl mb-3">{title}</h3>
                <div className="w-16 h-1 bg-yellow-500/50 mx-auto rounded-full mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400 text-sm max-w-sm leading-relaxed mx-auto">
                    {t('video.maintenance.desc')}
                </p>
            </div>
            <div className="bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500/30 px-4 py-2 rounded-lg mt-2">
                <span className="text-yellow-600 dark:text-yellow-500 text-xs font-bold uppercase tracking-wider">{t('video.maintenance.status')}</span>
            </div>
        </div>
    );
};

export default MaintenanceView;
