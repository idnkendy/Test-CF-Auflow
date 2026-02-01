
import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../hooks/useLanguage';

interface Option {
  value: string;
  label: string;
}

interface OptionSelectorProps {
  label?: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id: string;
  variant?: 'select' | 'grid';
}

const OptionSelector: React.FC<OptionSelectorProps> = ({ 
  label, 
  options, 
  value, 
  onChange, 
  disabled, 
  id, 
  variant = 'select' 
}) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${isOpen ? 'z-[60]' : 'z-10'} w-full`} ref={containerRef}>
      {label && (
        <label htmlFor={id} className="block text-[11px] sm:text-sm font-extrabold text-text-primary dark:text-white mb-1.5 sm:mb-2">
          {label}
        </label>
      )}
      
      <button
        type="button"
        id={id}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between 
          bg-white dark:bg-[#1E1E1E] 
          border transition-all duration-300
          rounded-xl px-3 sm:px-4 py-2.5 sm:py-3.5
          text-text-primary dark:text-white 
          ${disabled 
            ? 'opacity-60 cursor-not-allowed border-gray-200 dark:border-gray-700' 
            : isOpen 
                ? 'border-primary ring-2 ring-primary/20 shadow-lg' 
                : 'border-gray-200 dark:border-gray-700 hover:border-primary/50 hover:shadow-md'
          }
        `}
      >
        <div className="flex items-center gap-2 overflow-hidden">
            <span className={`truncate text-xs sm:text-sm font-semibold ${selectedOption ? 'text-text-primary dark:text-white' : 'text-gray-400'}`}>
            {selectedOption ? selectedOption.label : t('common.select_option')}
            </span>
        </div>
        
        <span className={`
            flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full 
            transition-transform duration-300 
            ${isOpen ? 'rotate-180 bg-gray-100 dark:bg-gray-800' : 'bg-transparent'}
        `}>
            <svg 
            className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-500`} 
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div 
          className={`
            absolute left-0 right-0 mt-2 
            bg-white dark:bg-[#1E1E1E] 
            border border-gray-100 dark:border-gray-700 
            rounded-2xl shadow-2xl 
            overflow-hidden origin-top animate-dropdown-fade-in
            z-[100]
          `}
        >
          <style>{`
            @keyframes dropdown-fade-in {
              from { opacity: 0; transform: scale(0.98) translateY(-8px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .animate-dropdown-fade-in { animation: dropdown-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          `}</style>
          
          <div className="max-h-60 sm:max-h-72 overflow-y-auto p-1.5 sm:p-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
            {variant === 'grid' ? (
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => handleSelect(option.value)}
                            className={`
                            relative flex items-center justify-center px-1.5 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-sm font-medium transition-all duration-200 border
                            ${value === option.value 
                                ? 'bg-primary text-white border-primary shadow-md shadow-primary/30' 
                                : 'bg-gray-50 dark:bg-[#252525] text-text-secondary dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-[#303030]'
                            }
                            `}
                        >
                            <span className="truncate">{option.label}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col gap-1">
                    {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => handleSelect(option.value)}
                        className={`
                        flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm transition-all duration-200 group
                        ${value === option.value 
                            ? 'bg-primary/5 text-primary font-bold dark:bg-primary/20' 
                            : 'text-text-secondary dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }
                        `}
                    >
                        <span className="truncate">{option.label}</span>
                        {value === option.value && (
                        <span className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center bg-primary text-white rounded-full text-[10px]">
                            <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </span>
                        )}
                    </button>
                    ))}
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OptionSelector;
