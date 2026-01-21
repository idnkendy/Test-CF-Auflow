
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../hooks/useLanguage';

interface SafetyWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SafetyWarningModal: React.FC<SafetyWarningModalProps> = ({ isOpen, onClose }) => {
  const [mounted, setMounted] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  // Tự động cuộn lên đầu trang khi modal mở ra
  useEffect(() => {
    if (isOpen) {
      // Cuộn window (cho body scroll)
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Cuộn main container (nếu đang trong layout App có overflow riêng)
      const mainContainer = document.querySelector('main');
      if (mainContainer) {
        mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in font-sans">
        <style>{`
            @keyframes scale-up {
                0% { transform: scale(0.95); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }
            .animate-scale-up { animation: scale-up 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        `}</style>

      <div 
        className="relative bg-white dark:bg-[#1E1E1E] border border-red-200 dark:border-red-900/50 rounded-2xl p-6 md:p-8 shadow-2xl max-w-[420px] w-full flex flex-col items-center text-center animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
            {/* Close Button */}
            <button 
                onClick={onClose}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/5"
            >
                <span className="material-symbols-outlined text-xl">close</span>
            </button>

            {/* Icon Graphic */}
            <div className="w-20 h-20 mb-5 relative flex items-center justify-center bg-red-100 dark:bg-red-900/20 rounded-full">
                <span className="material-symbols-outlined text-4xl text-red-500 notranslate">
                    policy
                </span>
                <div className="absolute bottom-0 right-0 bg-white dark:bg-[#1E1E1E] rounded-full p-1 border border-red-100 dark:border-red-900/30">
                     <span className="material-symbols-outlined text-sm text-red-500 font-bold notranslate">block</span>
                </div>
            </div>
            
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                {t('safety.title')}
            </h2>
            
            <div className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed space-y-3 text-left bg-gray-50 dark:bg-black/20 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                <p className="font-semibold text-red-500">{t('safety.reason_title')}</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-500 dark:text-gray-400">
                    <li dangerouslySetInnerHTML={{ __html: t('safety.reason_1') }} />
                    <li>{t('safety.reason_2')}</li>
                    <li>{t('safety.reason_3')}</li>
                </ul>
                <p className="text-xs italic mt-2">
                    {t('safety.note')}
                </p>
            </div>

            <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
                <span className="material-symbols-outlined text-lg">image</span>
                <span>{t('safety.btn')}</span>
            </button>
      </div>
    </div>,
    document.body
  );
};

export default SafetyWarningModal;
