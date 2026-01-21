
import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../i18n/translations';

type Language = 'vi' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Helper to fetch IP location from worker with robust fallbacks
const checkGeoLocation = async (): Promise<Language> => {
    // @ts-ignore
    const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || "https://twilight-fire-b7d4.truongvohaiaune.workers.dev";
    const baseUrl = BACKEND_URL.replace(/\/$/, "");
    
    console.log("Checking geolocation...");

    // 1. Try Internal Worker (Fastest & Most Accurate for Real Users)
    try {
        const res = await fetch(`${baseUrl}/check-geo`);
        if (res.ok) {
            const data = await res.json();
            
            // If country is explicitly returned, rely on it
            if (data.country) {
                console.log("Internal Geo Check Result:", data.country);
                return data.country === 'VN' ? 'vi' : 'en';
            }
            // If data.country is null (dev environment or missing header), proceed to fallback
        }
    } catch (e) {
        console.warn("Internal Geo check failed, switching to external services:", e);
    }

    // 2. Fallback A: api.country.is (Very fast, simple JSON)
    try {
        console.log("Fallback A: Checking api.country.is...");
        const extRes = await fetch('https://api.country.is');
        if (extRes.ok) {
            const extData = await extRes.json();
            // Returns { "ip": "...", "country": "VN" }
            console.log("Fallback A Result:", extData.country);
            return extData.country === 'VN' ? 'vi' : 'en';
        }
    } catch (e) {
        console.warn("Fallback A failed:", e);
    }

    // 3. Fallback B: ipwho.is (Comprehensive free API)
    try {
        console.log("Fallback B: Checking ipwho.is...");
        const extRes = await fetch('https://ipwho.is/');
        if (extRes.ok) {
            const extData = await extRes.json();
            // Returns { "success": true, "country_code": "VN", ... }
            if (extData.success) {
                console.log("Fallback B Result:", extData.country_code);
                return extData.country_code === 'VN' ? 'vi' : 'en';
            }
        }
    } catch (e) {
        console.warn("Fallback B failed:", e);
    }

    // 4. Absolute Default
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
