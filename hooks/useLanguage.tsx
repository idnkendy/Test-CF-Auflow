
import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../i18n/translations';

type Language = 'vi' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Helper to fetch IP location from worker
const checkGeoLocation = async (): Promise<Language> => {
    // @ts-ignore
    const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || "https://twilight-fire-b7d4.truongvohaiaune.workers.dev";
    const baseUrl = BACKEND_URL.replace(/\/$/, "");
    try {
        const res = await fetch(`${baseUrl}/check-geo`);
        if (res.ok) {
            const data = await res.json();
            // Default to EN if country is not Vietnam
            return data.country === 'VN' ? 'vi' : 'en';
        }
    } catch (e) {
        console.warn("Geo check failed, defaulting to VI", e);
    }
    return 'vi';
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('vi');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initLanguage = async () => {
        // 1. Check URL first
        const path = window.location.pathname;
        const matches = path.match(/^\/(vi|en)(\/|$)/);
        
        if (matches) {
            setLanguageState(matches[1] as Language);
            setIsInitialized(true);
            return;
        }

        // 2. Check LocalStorage
        const savedLang = localStorage.getItem('opzen_lang') as Language;
        if (savedLang) {
            setLanguageState(savedLang);
            // Update URL to match saved preference if currently at root
            if (path === '/' || path === '') {
                // IMPORTANT: Preserve hash and search params for Auth Redirects
                window.history.replaceState(
                    {}, 
                    '', 
                    `/${savedLang}${window.location.search}${window.location.hash}`
                );
            }
            setIsInitialized(true);
            return;
        }

        // 3. Check Geo IP (only once)
        const detectedLang = await checkGeoLocation();
        setLanguageState(detectedLang);
        localStorage.setItem('opzen_lang', detectedLang);
        // Redirect to detected language path
        if (path === '/' || path === '') {
            // IMPORTANT: Preserve hash and search params for Auth Redirects
            window.history.replaceState(
                {}, 
                '', 
                `/${detectedLang}${window.location.search}${window.location.hash}`
            );
        }
        setIsInitialized(true);
    };

    initLanguage();
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('opzen_lang', lang);
    
    // Update URL without reloading or triggering popstate
    const path = window.location.pathname;
    const cleanPath = path.replace(/^\/(vi|en)/, '');
    const newPath = `/${lang}${cleanPath || ''}`; // If cleanPath is empty, it becomes /lang
    
    // Use replaceState to keep current history stack clean
    // IMPORTANT: Preserve hash and search params
    window.history.replaceState(
        {}, 
        '', 
        `${newPath}${window.location.search}${window.location.hash}`
    );
  };

  const t = (key: string): string => {
    // @ts-ignore
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
