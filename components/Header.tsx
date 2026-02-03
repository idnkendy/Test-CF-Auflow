
import React, { useState, useRef, useEffect } from 'react';
import { UserStatus } from '../types';
import { User } from '@supabase/supabase-js';
import { Logo } from './common/Logo';
import { useLanguage } from '../hooks/useLanguage';

const SunIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M12 12a5 5 0 100-10 5 5 0 000 10z" />
    </svg>
);
const MoonIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
);
const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
);
const GalleryIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);
const ProfileIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const CoinIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const CalendarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);
const GiftIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
);
const ChevronDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);

interface HeaderProps {
  onGoHome: () => void;
  onThemeToggle: () => void;
  theme: 'light' | 'dark';
  onSignOut: () => void;
  onOpenGallery?: () => void;
  onUpgrade?: () => void;
  onOpenProfile?: () => void;
  userStatus?: UserStatus | null;
  user?: User | null;
  onToggleNav?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onGoHome, onThemeToggle, theme, onSignOut, onOpenGallery, onUpgrade, onOpenProfile, userStatus, user, onToggleNav }) => {
  const { language, setLanguage, t } = useLanguage();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleLanguage = () => {
    const newLang = language === 'vi' ? 'en' : 'vi';
    setLanguage(newLang);
  };

  const expirationDate = userStatus?.subscriptionEnd 
    ? new Date(userStatus.subscriptionEnd).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') 
    : t('header.forever');

  return (
     <header className="bg-surface dark:bg-[#121212] sticky top-0 z-40 transition-colors duration-300 px-3 sm:px-6 lg:px-8 border-b border-border-color dark:border-[#302839] h-[60px]">
        <nav className="flex justify-between items-center h-full max-w-[1920px] mx-auto">
            <div className="flex items-center gap-2 sm:gap-4">
                <button 
                    onClick={onToggleNav} 
                    className="md:hidden text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white focus:outline-none p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#302839]"
                >
                    <span className="material-symbols-outlined text-2xl">menu</span>
                </button>

                <div className="flex items-center cursor-pointer group" onClick={onGoHome} title={t('nav.home')}>
                    <Logo className="w-8 h-8 sm:w-10 sm:h-10 text-[#7f13ec]" />
                    <span className="text-text-primary dark:text-white text-sm sm:text-lg font-bold tracking-tight ml-1.5 sm:ml-3 inline-block">{t('app.name')}</span>
                </div>
            </div>
            
            <div className="flex items-center space-x-1.5 sm:space-x-4">
                {/* Language Toggle - Slightly smaller for mobile */}
                <button 
                    onClick={toggleLanguage}
                    className="relative bg-gray-100 dark:bg-[#252525] rounded-full border border-gray-200 dark:border-[#3a3a3a] h-7 w-16 sm:h-8 sm:w-20 cursor-pointer focus:outline-none hover:border-[#7f13ec]/50 transition-all duration-300 group shadow-inner p-1"
                    aria-label="Switch Language"
                >
                    <div 
                        className={`absolute top-0.5 bottom-0.5 left-0.5 w-6 sm:w-8 bg-[#7f13ec] rounded-full shadow-md shadow-purple-500/30 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                            language === 'en' ? 'translate-x-[2.25rem] sm:translate-x-[2.75rem]' : 'translate-x-0'
                        }`}
                    ></div>
                    <div className="absolute inset-0 grid grid-cols-2 z-10 select-none pointer-events-none">
                        <div className="flex items-center justify-center">
                            <span className={`text-[9px] sm:text-[10px] font-bold transition-colors duration-300 ${language === 'vi' ? 'text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-400 dark:group-hover:text-gray-300'}`}>VN</span>
                        </div>
                        <div className="flex items-center justify-center">
                            <span className={`text-[9px] sm:text-[10px] font-bold transition-colors duration-300 ${language === 'en' ? 'text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-400 dark:group-hover:text-gray-300'}`}>EN</span>
                        </div>
                    </div>
                </button>

                {userStatus && (
                    <button
                        onClick={onUpgrade}
                        className="flex items-center gap-1 sm:gap-1.5 pl-2 pr-1 py-0.5 rounded-full bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333] shadow-sm hover:border-purple-500/40 transition-all duration-300 group"
                        title={t('header.topup_tooltip')}
                    >
                        <div className="flex items-center gap-1 sm:gap-1.5 px-0.5 sm:px-1.5">
                            <div className="text-yellow-500 scale-75 sm:scale-90"><CoinIcon /></div>
                            <span className="font-bold text-[10px] sm:text-xs text-gray-700 dark:text-gray-200 tabular-nums tracking-tight">
                                {new Intl.NumberFormat('en-US').format(userStatus.credits)}
                            </span>
                        </div>
                        <div className="relative overflow-hidden rounded-full bg-gradient-to-r from-[#7f13ec] to-[#a855f7] text-white shadow-md group-hover:scale-105 transition-all duration-300 hidden sm:block">
                            <div className="relative flex items-center gap-1 px-2 py-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                                <span className="text-[10px] font-bold uppercase tracking-wide">{t('header.topup')}</span>
                            </div>
                        </div>
                    </button>
                )}

                <button 
                    onClick={onThemeToggle} 
                    className="p-1.5 rounded-full text-text-secondary dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#302839] hover:text-text-primary dark:hover:text-white transition-all" 
                    aria-label="Toggle theme"
                >
                    {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                </button>
                
                <div className="relative" ref={dropdownRef}>
                    <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="flex items-center gap-1 sm:gap-2 focus:outline-none">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-[#8A2BE2] to-[#DA70D6] flex items-center justify-center text-white shadow-md ring-2 ring-white dark:ring-[#191919]">
                            <span className="text-[10px] font-bold">{user?.email?.[0].toUpperCase()}</span>
                        </div>
                        <div className="hidden sm:block">
                           <ChevronDownIcon />
                        </div>
                    </button>

                    {isDropdownOpen && (
                        <div className="absolute right-0 mt-2 w-72 bg-surface dark:bg-[#191919] rounded-xl shadow-2xl border border-border-color dark:border-[#302839] py-1 z-50 animate-fade-in origin-top-right">
                            <div className="px-5 py-4 border-b border-border-color dark:border-[#302839] bg-gray-50 dark:bg-[#202020]">
                                {user && (
                                    <div className="mb-3">
                                        <p className="text-sm font-bold text-text-primary dark:text-white truncate">{user.user_metadata?.full_name || user.email?.split('@')[0]}</p>
                                        <p className="text-xs text-text-secondary dark:text-gray-400 truncate">{user.email}</p>
                                    </div>
                                )}
                                {userStatus && (
                                    <div className="space-y-2 mt-3">
                                        <div className="flex items-center justify-between text-sm bg-surface dark:bg-[#1A1A1A] px-3 py-2 rounded-lg border border-border-color dark:border-[#333] cursor-pointer hover:border-purple-500/50 transition-colors" onClick={() => { onUpgrade && onUpgrade(); setIsDropdownOpen(false); }}>
                                             <div className="flex items-center gap-2 text-text-primary dark:text-gray-200">
                                                 <div className="text-yellow-500"><CoinIcon /></div>
                                                 <span className="font-semibold">{new Intl.NumberFormat('en-US').format(userStatus.credits)} Credits</span>
                                             </div>
                                             <span className="text-[10px] bg-[#7f13ec] text-white px-2 py-0.5 rounded-full font-bold">+ {t('header.topup')}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-text-secondary dark:text-gray-400 px-1">
                                             <div className="flex items-center gap-2"><CalendarIcon /><span>{t('header.expired')}</span></div>
                                             <span className="font-medium text-text-primary dark:text-white">{expirationDate}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="py-1">
                                {onOpenProfile && (
                                    <>
                                        <button onClick={() => { onOpenProfile(); setIsDropdownOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-text-secondary dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#302839] flex items-center gap-3"><GiftIcon /> {t('nav.giftcode')}</button>
                                        <button onClick={() => { onOpenProfile(); setIsDropdownOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-text-secondary dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#302839] flex items-center gap-3"><ProfileIcon /> {t('nav.profile')}</button>
                                    </>
                                )}
                                {onOpenGallery && <button onClick={() => { onOpenGallery(); setIsDropdownOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-text-secondary dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#302839] flex items-center gap-3"><GalleryIcon /> {t('nav.gallery')}</button>}
                            </div>
                            <div className="border-t border-border-color dark:border-[#302839] my-1"></div>
                            <button onClick={onSignOut} className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-[#302839] flex items-center gap-3 rounded-b-lg"><LogoutIcon /> {t('nav.logout')}</button>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    </header>
  );
};

export default Header;
