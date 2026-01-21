
import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../i18n/translations';

type Language = 'vi' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Helper to fetch IP location using ONLY external APIs (skipping internal worker)
const checkGeoLocation = async (): Promise<Language> => {
    console.log("Checking geolocation via External APIs...");

    // 1. Priority 1: api.country.is (Very fast, simple JSON)
    try {
        const extRes = await fetch('https://api.country.is');
        if (extRes.ok) {
            const extData = await extRes.json();
            // Returns { "ip": "...", "country": "VN" }
            console.log("Geo Result (api.country.is):", extData.country);
            return extData.country === 'VN' ? 'vi' : 'en';
        }
    } catch (e) {
        console.warn("Priority 1 (api.country.is) failed:", e);
    }

    // 2. Priority 2: ipwho.is (Comprehensive free API)
    try {
        console.log("Falling back to ipwho.is...");
        const extRes = await fetch('https://ipwho.is/');
        if (extRes.ok) {
            const extData = await extRes.json();
            // Returns { "success": true, "country_code": "VN", ... }
            if (extData.success) {
                console.log("Geo Result (ipwho.is):", extData.country_code);
                return extData.country_code === 'VN' ? 'vi' : 'en';
            }
        }
    } catch (e) {
        console.warn("Priority 2 (ipwho.is) failed:", e);
    }

    // 3. Absolute Default
    console.log("All Geo checks failed, defaulting to 'vi'");
    return 'vi';
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('vi');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initLanguage = async () => {
        // 1. Check URL first (highest priority for deep links)
        const path = window.location.pathname;
        const matches = path.match(/^\/(vi|en)(\/|$)/);
        
        if (matches) {
            setLanguageState(matches[1] as Language);
            setIsInitialized(true);
            return;
        }

        // 2. Check LocalStorage (User preference)
        const savedLang = localStorage.getItem('opzen_lang') as Language;
        if (savedLang) {
            console.log("Using saved language preference:", savedLang);
            setLanguageState(savedLang);
            // Update URL to match saved preference if currently at root
            if (path === '/' || path === '') {
                window.history.replaceState(
                    {}, 
                    '', 
                    `/${savedLang}${window.location.search}${window.location.hash}`
                );
            }
            setIsInitialized(true);
            return;
        }

        // 3. Check Geo IP (only once if no preference)
        const detectedLang = await checkGeoLocation();
        setLanguageState(detectedLang);
        localStorage.setItem('opzen_lang', detectedLang);
        
        // Redirect to detected language path
        if (path === '/' || path === '') {
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
