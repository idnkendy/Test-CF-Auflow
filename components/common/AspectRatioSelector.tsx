
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
    <div>
        <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('opt.aspect_ratio')}</label>
        {/* Changed from fixed grid to flexible wrap to prevent text truncation */}
        <div className="flex flex-wrap gap-2 bg-gray-100 dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#302839] p-1.5 rounded-xl shadow-inner">
            {options.map(option => (
                <button
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    disabled={disabled}
                    className={`flex-grow min-w-[80px] sm:min-w-[90px] flex items-center justify-center py-2.5 px-2 rounded-lg text-xs font-bold transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                        value === option.value
                            ? 'bg-[#7f13ec] text-white shadow-lg shadow-purple-500/20 scale-[1.02]'
                            : 'bg-transparent text-text-secondary dark:text-gray-400 hover:bg-white dark:hover:bg-[#2A2A2A] hover:text-text-primary dark:hover:text-white hover:shadow-sm'
                    }`}
                    title={option.label}
                >
                    <span className="whitespace-nowrap">{option.label}</span>
                </button>
            ))}
        </div>
    </div>
  );
};

export default AspectRatioSelector;