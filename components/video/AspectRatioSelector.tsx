
import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../hooks/useLanguage';

interface AspectRatioSelectorProps {
    value: '16:9' | '9:16' | 'default';
    onChange: (val: '16:9' | '9:16' | 'default') => void;
}

const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({ value, onChange }) => {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getIcon = (val: string) => {
        switch(val) {
            case '16:9': return 'crop_landscape';
            case '9:16': return 'crop_portrait';
            default: return 'crop_landscape';
        }
    }

    const getLabel = (val: string) => {
            switch(val) {
            case '16:9': return '16:9';
            case '9:16': return '9:16';
            default: return '16:9';
        }
    }

    return (
        <div className="relative h-full w-full" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="h-full w-full px-2 sm:px-3 bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#353535] border border-gray-300 dark:border-[#302839] rounded-xl flex items-center gap-1.5 sm:gap-2 text-gray-800 dark:text-white text-xs sm:text-sm font-medium transition-all shadow-sm whitespace-nowrap justify-between"
                title={t('opt.aspect_ratio')}
            >
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="material-symbols-outlined text-lg sm:text-xl text-[#7f13ec] notranslate">
                        {getIcon(value === 'default' ? '16:9' : value)}
                    </span>
                    <span>{getLabel(value === 'default' ? '16:9' : value)}</span>
                </div>
                <span className={`material-symbols-outlined text-gray-500 dark:text-gray-400 text-xs sm:text-sm transition-transform duration-200 notranslate ${isOpen ? 'rotate-180' : ''}`}>
                    expand_less
                </span>
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-full min-w-[120px] sm:min-w-[140px] bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#302839] rounded-xl shadow-xl overflow-hidden z-[60] p-1 animate-fade-in">
                    
                    {/* Option: 16:9 */}
                    <button
                        onClick={() => { onChange('16:9'); setIsOpen(false); }}
                        className={`w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm transition-colors ${
                            value === '16:9' ? 'bg-[#7f13ec]/10 text-[#7f13ec]' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2A2A]'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base sm:text-lg notranslate">crop_landscape</span>
                        <div className="flex flex-col items-start text-left">
                            <span className="font-bold">16:9</span>
                            <span className="text-[8px] sm:text-[10px] opacity-70">{t('video.aspect.landscape')}</span>
                        </div>
                        {value === '16:9' && <span className="material-symbols-outlined text-[10px] sm:text-sm ml-auto notranslate">check</span>}
                    </button>

                    {/* Option: 9:16 */}
                    <button
                        onClick={() => { onChange('9:16'); setIsOpen(false); }}
                        className={`w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm transition-colors ${
                            value === '9:16' ? 'bg-[#7f13ec]/10 text-[#7f13ec]' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2A2A]'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base sm:text-lg notranslate">crop_portrait</span>
                        <div className="flex flex-col items-start text-left">
                            <span className="font-bold">9:16</span>
                            <span className="text-[8px] sm:text-[10px] opacity-70">{t('video.aspect.portrait')}</span>
                        </div>
                        {value === '9:16' && <span className="material-symbols-outlined text-[10px] sm:text-sm ml-auto notranslate">check</span>}
                    </button>
                </div>
            )}
        </div>
    );
};

export default AspectRatioSelector;
