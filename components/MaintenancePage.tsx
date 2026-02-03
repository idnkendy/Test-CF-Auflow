
import React from 'react';
import { Logo } from './common/Logo';
import { useLanguage } from '../hooks/useLanguage';

const MaintenancePage: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-main-bg dark:bg-[#121212] flex flex-col items-center justify-center p-4 text-center font-sans transition-colors duration-300">
      <div className="animate-fade-in flex flex-col items-center max-w-2xl mx-auto">
        <div className="mb-8 p-6 bg-surface dark:bg-[#191919] rounded-full shadow-2xl border border-border-color dark:border-[#302839] relative overflow-hidden group">
             <div className="absolute inset-0 bg-[#7f13ec]/20 blur-xl rounded-full group-hover:bg-[#7f13ec]/30 transition-all duration-700"></div>
             <Logo className="w-20 h-20 sm:w-24 sm:h-24 text-[#7f13ec] relative z-10" />
        </div>
        
        <h1 className="text-4xl md:text-5xl font-extrabold text-text-primary dark:text-white mb-4 tracking-tight">
          {t('maint.page.title')}
        </h1>
        
        <p className="text-text-secondary dark:text-gray-400 text-lg md:text-xl mb-8 leading-relaxed">
          {t('maint.page.desc')}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center">
            <button 
                onClick={() => window.location.reload()}
                className="px-8 py-3.5 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-purple-500/30 flex items-center justify-center gap-2 group"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {t('maint.page.reload')}
            </button>
        </div>

        <div className="mt-20 pt-8 border-t border-border-color dark:border-[#302839] w-full max-w-sm">
            <div className="flex justify-center gap-6 text-text-secondary dark:text-gray-500 mb-4">
                <span className="text-sm">{t('maint.page.status')}</span>
                <span className="flex items-center gap-2 text-sm font-medium text-yellow-500">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
                    </span>
                    Maintenance
                </span>
            </div>
            <p className="text-xs text-text-secondary/50 dark:text-gray-600">
                &copy; 2025 OPZEN AI. All rights reserved.
            </p>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;
