
import React from 'react';
import { AspectRatio } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';

interface AspectRatioSelectorProps {
  value: AspectRatio;
  onChange: (value: AspectRatio) => void;
  disabled?: boolean;
}

const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({ value, onChange, disabled }) => {
  const { t } = useLanguage();

  const options: { value: AspectRatio; label: string }[] = [
    { value: '1:1', label: t('opt.ar.square') },
    { value: '4:3', label: t('opt.ar.standard') },
    { value: '3:4', label: t('opt.ar.portrait') },
    { value: '16:9', label: t('opt.ar.landscape') },
    { value: '9:16', label: t('opt.ar.story') },
  ];

  return (
    <div className="w-full">
        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('opt.aspect_ratio')}</label>
        {/* Using a 6-column grid to create a 3-item row followed by a 2-item row */}
        <div className="grid grid-cols-6 gap-2 bg-gray-100 dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#302839] p-1.5 rounded-xl shadow-inner">
            {options.map((option, index) => {
                // First 3 items take 2 columns each (3 items in row 1)
                // Next 2 items take 3 columns each (2 items in row 2)
                const colSpan = index < 3 ? 'col-span-2' : 'col-span-3';
                
                return (
                    <button
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        disabled={disabled}
                        className={`${colSpan} flex items-center justify-center py-2.5 px-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                            value === option.value
                                ? 'bg-[#7f13ec] text-white shadow-lg shadow-purple-500/20 scale-[1.02]'
                                : 'bg-transparent text-text-secondary dark:text-gray-400 hover:bg-white dark:hover:bg-[#2A2A2A] hover:text-text-primary dark:hover:text-white hover:shadow-sm'
                        }`}
                        title={option.label}
                    >
                        <span className="whitespace-nowrap overflow-hidden text-ellipsis">{option.label}</span>
                    </button>
                );
            })}
        </div>
    </div>
  );
};

export default AspectRatioSelector;
