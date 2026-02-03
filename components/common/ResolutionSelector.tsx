
import React from 'react';
import { ImageResolution } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';

interface ResolutionSelectorProps {
  value: ImageResolution;
  onChange: (value: ImageResolution) => void;
  disabled?: boolean;
  filter?: (option: { value: ImageResolution }) => boolean;
}

const ResolutionSelector: React.FC<ResolutionSelectorProps> = ({ value, onChange, disabled, filter }) => {
  const { t } = useLanguage();

  const options: { value: ImageResolution; label: string; badge?: string; cost: number; desc: string }[] = [
    { value: 'Standard', label: t('opt.res.standard'), badge: t('opt.res.badge.fast'), cost: 5, desc: t('opt.res.desc.flash') },
    { value: '1K', label: t('opt.res.hd'), badge: t('opt.res.badge.detailed'), cost: 10, desc: t('opt.res.desc.pro') },
    { value: '2K', label: t('opt.res.2k'), badge: t('opt.res.badge.sharp'), cost: 20, desc: t('opt.res.desc.pro') },
    { value: '4K', label: t('opt.res.4k'), badge: t('opt.res.badge.realistic'), cost: 30, desc: t('opt.res.desc.pro') },
  ];

  const visibleOptions = filter ? options.filter(filter) : options;

  return (
    <div className="w-full">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {visibleOptions.map(option => (
                <button
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    disabled={disabled}
                    className={`relative flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border transition-all duration-200 text-left ${
                        value === option.value
                            ? 'bg-[#7f13ec]/10 border-[#7f13ec] shadow-md'
                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    {option.badge && (
                        <span className={`absolute -top-2 -right-1 sm:-right-2 text-[8px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full shadow-sm ${
                            value === option.value ? 'bg-[#7f13ec] text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                        }`}>
                            {option.badge}
                        </span>
                    )}
                    
                    <div className="flex flex-col items-center w-full">
                        <span className={`text-xs sm:text-sm font-bold ${value === option.value ? 'text-[#7f13ec]' : 'text-text-primary dark:text-white'}`}>
                            {option.label}
                        </span>
                        <span className="text-[9px] sm:text-[10px] text-text-secondary dark:text-gray-400 mt-0.5 text-center line-clamp-1">
                            {option.desc}
                        </span>
                        <div className="mt-1.5 sm:mt-2 flex items-center gap-1 bg-white dark:bg-black/20 px-1.5 py-0.5 sm:py-1 rounded-md border border-gray-100 dark:border-gray-600/50">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className={`text-[10px] sm:text-xs font-bold ${value === option.value ? 'text-text-primary dark:text-white' : 'text-text-secondary dark:text-gray-400'}`}>
                                {option.cost}
                            </span>
                        </div>
                    </div>
                </button>
            ))}
        </div>
    </div>
  );
};

export default ResolutionSelector;
