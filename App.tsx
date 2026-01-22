
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './services/supabaseClient';
import { Tool, FileData, UserStatus, PricingPlan } from './types';
import Header from './components/Header';
import Navigation, { useUtilityTools } from './components/Navigation';
import ImageGenerator from './components/ImageGenerator';
import VideoGenerator from './components/VideoGenerator';
import ImageEditor from './components/ImageEditor';
import ViewSync from './components/ViewSync';
import Renovation from './components/Renovation';
import FloorPlan from './components/FloorPlan';
import UrbanPlanning from './components/UrbanPlanning';
import LandscapeRendering from './components/LandscapeRendering';
import MaterialSwapper from './components/MaterialSwapper';
import Staging from './components/Staging';
import Upscale from './components/Upscale';
import HistoryPanel from './components/HistoryPanel';
import InteriorGenerator from './components/InteriorGenerator';
import MoodboardGenerator from './components/MoodboardGenerator';
import AITechnicalDrawings from './components/AITechnicalDrawings';
import SketchConverter from './components/SketchConverter';
import LayoutGenerator from './components/LayoutGenerator';
import DrawingGenerator from './components/DrawingGenerator';
import DiagramGenerator from './components/DiagramGenerator';
import RealEstatePoster from './components/RealEstatePoster';
import EditByNote from './components/EditByNote';
import ReRender from './components/ReRender'; 
import PromptSuggester from './components/PromptSuggester';
import UserProfile from './components/UserProfile';
import Checkout from './components/Checkout'; 
import PaymentPage from './components/PaymentPage';
import { initialToolStates, ToolStates } from './state/toolState';
import Homepage from './components/Homepage';
import AuthPage from './components/auth/AuthPage';
import Spinner from './components/Spinner';
import PublicPricing from './components/PublicPricing';
import TermsOfServicePage from './components/TermsOfServicePage'; 
import VideoPage from './components/VideoPage';
import MaintenancePage from './components/MaintenancePage'; 
import { getUserStatus, deductCredits } from './services/paymentService';
import { cleanupStuckJobs } from './services/jobService'; 
import { plans } from './constants/plans';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import InsufficientCreditsModal from './components/common/InsufficientCreditsModal';
import { SEOHead } from './components/common/SEOHead';
import { LanguageProvider, useLanguage } from './hooks/useLanguage';

// --- CONFIGURATION ---
const MAINTENANCE_MODE = false; 
// ---------------------

// Helper functions for safe navigation history (Updated for i18n)
const getPathWithoutLocale = () => {
    const path = window.location.pathname;
    const clean = path.replace(/^\/(vi|en)/, '');
    return clean || '/';
};

const AppContent: React.FC = () => {
  const { language, t } = useLanguage();
  const utilityTools = useUtilityTools();
  
  const [view, setView] = useState<'homepage' | 'auth' | 'app' | 'pricing' | 'payment' | 'video'>('homepage');
  const [session, setSession] = useState<Session | null>(null);
  
  // Initialize loading to true
  const [loadingSession, setLoadingSession] = useState(true);
  
  const [activeTool, setActiveTool] = useState<Tool>(() => {
      const savedTool = localStorage.getItem('activeTool');
      return (savedTool && Object.values(Tool).includes(savedTool as Tool)) 
        ? (savedTool as Tool) 
        : Tool.ArchitecturalRendering;
  });

  const [toolStates, setToolStates] = useState<ToolStates>(initialToolStates);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark'); 
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PricingPlan | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false); 
  const mainContentRef = useRef<HTMLDivElement>(null);

  const safeHistoryPush = (path: string) => {
      try {
          const fullPath = `/${language}${path === '/' ? '' : path}`;
          window.history.pushState({}, '', fullPath);
      } catch (e) { console.warn("History push ignored:", e); }
  };

  const safeHistoryReplace = (path: string) => {
      try {
          const fullPath = `/${language}${path === '/' ? '' : path}`;
          window.history.replaceState({}, '', fullPath);
      } catch (e) { console.warn("History replace ignored:", e); }
  };

  const getSeoMetadata = (view: string, activeTool: Tool) => {
      // Default / English Metadata
      let meta = {
          title: "OPZEN AI - Create Spaces with AI",
          description: "Leading AI platform supporting Architects and Designers. Render images, generate videos, urban planning, and interior design in seconds.",
          keywords: "ai architecture, ai render, interior design ai, home design software, opzen ai, architectural visualization",
          noindex: false
      };

      // Vietnamese Override
      if (language === 'vi') {
           meta = {
              title: "OPZEN AI - Kiến tạo không gian với AI", 
              description: "Nền tảng AI hàng đầu hỗ trợ Kiến trúc sư và Nhà thiết kế. Render ảnh, tạo video, quy hoạch đô thị và thiết kế nội thất chỉ trong vài giây.",
              keywords: "AI kiến trúc, thiết kế nhà AI, render nội thất, quy hoạch đô thị, diễn họa kiến trúc, opzen",
              noindex: false
          };
      }

      // Homepage Specific Metadata
      if (view === 'homepage') {
          if (language === 'vi') {
              meta = { 
                  title: "OPZEN AI - Nền tảng AI Kiến trúc & Nội thất", 
                  description: "Công cụ AI hỗ trợ KTS render 3D, thiết kế nội thất, quy hoạch đô thị và tạo video kiến trúc chỉ trong vài giây. Dùng thử miễn phí ngay.",
                  keywords: "ai kiến trúc, render ai, thiết kế nội thất ai, phần mềm thiết kế nhà, midjourney kiến trúc, stable diffusion kiến trúc, opzen ai, diễn họa kiến trúc ai, ai architecture generator",
                  noindex: false
              };
          } else {
              meta = {
                  title: "OPZEN AI - AI Software for Architecture & Interior Design",
                  description: "AI tool supporting Architects in 3D rendering, interior design, urban planning, and architectural video creation in seconds. Try for free now.",
                  keywords: "ai architecture, ai render, interior design ai, home design software, midjourney architecture, stable diffusion architecture, opzen ai, architectural visualization",
                  noindex: false
              }
          }
      }
      return meta;
  };

  const seoData = getSeoMetadata(view, activeTool);

  useEffect(() => {
      if (mainContentRef.current) mainContentRef.current.scrollTo(0, 0);
  }, [activeTool]);

  useEffect(() => {
      localStorage.setItem('activeTool', activeTool);
  }, [activeTool]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  // Handle URL changes (PopState)
  useEffect(() => {
      const handlePopState = () => {
          const cleanPath = getPathWithoutLocale();
          const params = new URLSearchParams(window.location.search);
          
          if (cleanPath === '/payment') {
               const planId = params.get('plan');
               const plan = plans.find(p => p.id === planId);
               if (plan && session) { setSelectedPlan(plan); setView('payment'); }
               else if (session) { setView('app'); }
               else { if (plan) { setPendingPlan(plan); localStorage.setItem('pendingPlanId', plan.id); } setView('homepage'); }
          } else if (cleanPath === '/pricing') { setView('pricing'); }
          else if (cleanPath === '/video') { if (session) setView('video'); else { setView('auth'); } }
          else if (cleanPath === '/') { setView('homepage'); }
          else if (cleanPath === '/feature') { if (session) setView('app'); else { safeHistoryReplace('/'); setView('homepage'); } }
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, [session]); 

  // --- CRITICAL AUTH LOGIC FIX ---
  useEffect(() => {
    let mounted = true;
    
    // Check if we are in the middle of a redirect (Hash exists)
    // If hash exists, we force loading to stay TRUE until onAuthStateChange fires
    const isHashRedirect = window.location.hash && window.location.hash.includes('access_token');
    if (isHashRedirect) {
        setLoadingSession(true);
    }

    // Safety timeout: If Supabase takes too long or hash is malformed, stop loading after 5s
    const safetyTimer = setTimeout(() => {
        if (mounted && loadingSession) {
            console.warn("Auth timeout - clearing loader");
            setLoadingSession(false);
        }
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      
      if (newSession) setSession(newSession);

      // Handle Redirect & Login
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || newSession) && newSession) {
          clearTimeout(safetyTimer);
          
          // Clean URL hash if exists
          if (window.location.hash && window.location.hash.includes('access_token')) {
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }

          // Check for pending plans (payment flow)
          const savedPlanId = localStorage.getItem('pendingPlanId');
          const plan = savedPlanId ? plans.find(p => p.id === savedPlanId) : pendingPlan;
          const params = new URLSearchParams(window.location.search);
          const urlPlanId = params.get('plan');
          const urlPlan = urlPlanId ? plans.find(p => p.id === urlPlanId) : null;

          if (urlPlan) { 
              setSelectedPlan(urlPlan); setView('payment'); safeHistoryReplace('/'); 
          } else if (plan) { 
              setSelectedPlan(plan); setPendingPlan(null); localStorage.removeItem('pendingPlanId'); setView('payment'); 
          } else {
              // Standard Login Routing
              const cleanPath = getPathWithoutLocale();
              if (cleanPath === '/video') {
                  setView('video');
              } else if (cleanPath === '/pricing') {
                  setView('pricing');
              } else {
                  // Redirect to HOMEPAGE view by default if on root or auth
                  // User requested to redirect to Homepage not Feature
                  if (cleanPath === '/' || cleanPath === '/auth') {
                      setView('homepage');
                      safeHistoryReplace('/');
                  } else if (cleanPath === '/feature') {
                      setView('app');
                  } else {
                      // Fallback for other logged-in states
                      setView('homepage');
                  }
              }
          }
          
          if (newSession.user) {
             cleanupStuckJobs(newSession.user.id).catch(console.error);
          }
          setLoadingSession(false);
      } 
      
      // Handle Logout
      if (event === 'SIGNED_OUT') {
          clearTimeout(safetyTimer);
          setSession(null); 
          setUserStatus(null); 
          setSelectedPlan(null);
          const cleanPath = getPathWithoutLocale();
          if (cleanPath === '/feature' || cleanPath === '/payment' || cleanPath === '/video') {
              setView('homepage'); 
              safeHistoryReplace('/');
          }
          setLoadingSession(false);
      }
    });

    // Initial Session Check (run once on mount)
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
        if (mounted) {
            if (initialSession) {
                clearTimeout(safetyTimer);
                setSession(initialSession);
                
                if (!isHashRedirect) {
                    const cleanPath = getPathWithoutLocale();
                    if (cleanPath === '/pricing') setView('pricing');
                    else if (cleanPath === '/video') setView('video');
                    else if (cleanPath === '/feature') setView('app');
                    else {
                        // Default to homepage if just visiting root
                        setView('homepage');
                        if (cleanPath === '/auth') safeHistoryReplace('/');
                    }
                }
            }
            
            // Only stop loading if NOT waiting for hash redirect event
            if (!isHashRedirect) {
                clearTimeout(safetyTimer);
                setLoadingSession(false);
            }
        }
    });

    return () => { 
        mounted = false; 
        clearTimeout(safetyTimer);
        subscription.unsubscribe(); 
    };
  }, []); 

  const fetchUserStatus = useCallback(async () => {
    if (session?.user) {
      const fullName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0];
      const status = await getUserStatus(session.user.id, session.user.email, fullName);
      setUserStatus(status);
    } else { setUserStatus(null); }
  }, [session]);

  useEffect(() => {
    fetchUserStatus();
  }, [fetchUserStatus, activeTool]); 
  
  if (MAINTENANCE_MODE) {
      return (
        <>
            <SEOHead title="Bảo trì hệ thống" description="Hệ thống đang được nâng cấp." />
            <MaintenancePage />
        </>
      );
  }

  const handleDeductCredits = async (amount: number, description?: string): Promise<string> => {
      if (!session?.user) throw new Error("Vui lòng đăng nhập để sử dụng.");
      const logId = await deductCredits(session.user.id, amount, description || '');
      await fetchUserStatus();
      return logId;
  };

  const handleThemeToggle = () => { setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light')); };
  const handleAuthNavigate = (_mode: 'login' | 'signup' = 'login') => { setView('auth'); };
  const handleStartDesigning = () => { if (session) { setView('app'); safeHistoryPush('/feature'); } else { handleAuthNavigate('signup'); } };

  const handleNavigateToTool = (tool: Tool) => {
      if (tool === Tool.VideoGeneration) { if (session) { setView('video'); safeHistoryPush('/video'); } else { handleAuthNavigate('login'); } return; }
      setActiveTool(tool); if (session) { setView('app'); safeHistoryPush('/feature'); } else { handleAuthNavigate('signup'); }
  };

  const handleSignOut = async () => {
    try { await supabase.auth.signOut(); } catch (error) { console.error("Sign out error:", error); } finally {
        localStorage.removeItem('activeTool'); localStorage.removeItem('pendingPlanId');
        setSession(null); setUserStatus(null); setSelectedPlan(null); setActiveTool(Tool.ArchitecturalRendering);
        setView('homepage'); safeHistoryReplace('/'); 
    }
  };
  
  const handleGoHome = () => { setView('homepage'); safeHistoryPush('/'); }
  const handleOpenGallery = () => { if (session) { setView('app'); setActiveTool(Tool.History); safeHistoryPush('/feature'); } }

  const handleToolStateChange = <T extends keyof ToolStates>(tool: T, newState: Partial<ToolStates[T]>) => {
    setToolStates(prev => ({ ...prev, [tool]: { ...prev[tool], ...newState } }));
  };

  const handleNavigateToPricing = () => { setView('pricing'); safeHistoryPush('/pricing'); }
  const handleOpenProfile = () => { if (session) { setView('app'); setActiveTool(Tool.Profile); handleToolStateChange(Tool.Profile, { activeTab: 'profile' }); safeHistoryPush('/feature'); } }
  const handleSelectPlanForPayment = (plan: PricingPlan) => { if (session) { setSelectedPlan(plan); setView('payment'); safeHistoryPush(`/payment?plan=${plan.id}`); } else { setPendingPlan(plan); localStorage.setItem('pendingPlanId', plan.id); handleAuthNavigate('signup'); } };
  const handlePaymentBack = () => { setView('pricing'); safeHistoryPush('/pricing'); }
  const handlePaymentSuccess = () => { fetchUserStatus(); setView('app'); setActiveTool(Tool.ArchitecturalRendering); safeHistoryPush('/feature'); };
  const handleSendToViewSync = (image: FileData) => { handleToolStateChange(Tool.ViewSync, { sourceImage: image, resultImages: [], error: null, customPrompt: '', }); setActiveTool(Tool.ViewSync); };
  const handleSendToViewSyncWithPrompt = (image: FileData, prompt: string) => { handleToolStateChange(Tool.ViewSync, { sourceImage: image, resultImages: [], error: null, customPrompt: prompt, directionImage: null }); setActiveTool(Tool.ViewSync); };
  
  const handleInsufficientCredits = () => {
      setShowCreditModal(true);
  };

  const userCredits = userStatus?.credits || 0;
  const isExtendedTool = utilityTools.tools.some(t => t.tool === activeTool);

  // -- RENDER LOGIC --
  const renderContent = () => {
      const cleanPath = getPathWithoutLocale();
      if (cleanPath === '/terms-of-service') { return <TermsOfServicePage />; }
      if (loadingSession) { return ( <div className="min-h-[100dvh] bg-main-bg dark:bg-[#121212] flex items-center justify-center"> <Spinner /> </div> ); }
      
      if (view === 'payment' && selectedPlan && session) {
          return (
              <div className="min-h-screen bg-main-bg dark:bg-[#121212] font-sans">
                  <Header onGoHome={handleGoHome} onThemeToggle={handleThemeToggle} theme={theme} onSignOut={handleSignOut} userStatus={userStatus} user={session.user} onToggleNav={() => {}} />
                  <PaymentPage plan={selectedPlan} user={session.user} onBack={handlePaymentBack} onSuccess={handlePaymentSuccess} />
              </div>
          );
      }

      if (view === 'pricing') {
          return ( <div className="relative"> <PublicPricing onGoHome={() => { setView('homepage'); safeHistoryPush('/'); }} onAuthNavigate={handleAuthNavigate} onPlanSelect={handleSelectPlanForPayment} session={session} userStatus={userStatus} onDashboardNavigate={() => { setView('app'); safeHistoryPush('/feature'); }} onSignOut={handleSignOut} /> </div> );
      }

      if (session && view === 'video') {
          return ( 
            <VideoPage 
                session={session} 
                userStatus={userStatus} 
                onGoHome={handleGoHome} 
                onThemeToggle={handleThemeToggle} 
                theme={theme} 
                onSignOut={handleSignOut} 
                onOpenGallery={handleOpenGallery} 
                onUpgrade={handleNavigateToPricing} 
                onOpenProfile={handleOpenProfile} 
                onToggleNav={() => setIsMobileNavOpen(!isMobileNavOpen)} 
                onDeductCredits={handleDeductCredits} 
                onRefreshCredits={async () => { await fetchUserStatus() }}
                onInsufficientCredits={handleInsufficientCredits}
            /> 
          );
      }

      if (session && view === 'app') {
          return (
              <div className="h-[100dvh] bg-main-bg dark:bg-[#121212] font-sans text-text-primary dark:text-[#EAEAEA] flex flex-col transition-colors duration-300 overflow-hidden relative">
                  <Header onGoHome={handleGoHome} onThemeToggle={handleThemeToggle} theme={theme} onSignOut={handleSignOut} onOpenGallery={handleOpenGallery} onUpgrade={handleNavigateToPricing} onOpenProfile={handleOpenProfile} userStatus={userStatus} user={session.user} onToggleNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />
                  <Navigation activeTool={activeTool} setActiveTool={(tool) => { if (tool === Tool.VideoGeneration) { setView('video'); safeHistoryPush('/video'); } else { setActiveTool(tool); } setIsMobileNavOpen(false); }} isMobileOpen={isMobileNavOpen} onCloseMobile={() => setIsMobileNavOpen(false)} onGoHome={handleGoHome} />
                  <div className="relative flex flex-col flex-grow overflow-hidden">
                      <main ref={mainContentRef} className="flex-1 bg-surface/90 dark:bg-[#191919]/90 backdrop-blur-md overflow-y-auto scrollbar-hide p-3 sm:p-6 lg:p-8 relative z-0 transition-colors duration-300" style={{ WebkitOverflowScrolling: 'touch' }} >
                          {isExtendedTool && (
                              <button onClick={() => setActiveTool(Tool.ExtendedFeaturesDashboard)} className="flex items-center gap-2 text-text-secondary dark:text-gray-400 hover:text-[#7f13ec] dark:hover:text-[#7f13ec] mb-6 transition-colors font-medium text-sm group" >
                                  <div className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 group-hover:bg-[#7f13ec]/10 transition-colors"> <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /> </svg> </div> {t('common.back')}
                              </button>
                          )}
                          <ErrorBoundary>
                            {activeTool === Tool.ExtendedFeaturesDashboard && (
                                <div className="max-w-7xl mx-auto pb-10">
                                    <div className="mb-10 text-center animate-fade-in-up">
                                        <h2 className="text-3xl font-extrabold text-text-primary dark:text-white mb-3">{t('dash.title')}</h2>
                                        <p className="text-text-secondary dark:text-gray-400 max-w-2xl mx-auto text-base">{t('dash.subtitle')}</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {utilityTools.tools.map((item, index) => (
                                            <button key={item.tool} onClick={() => setActiveTool(item.tool)} className={`group relative flex flex-col h-64 rounded-2xl border border-gray-200 dark:border-white/5 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl shadow-lg`} style={{ animationDelay: `${index * 50}ms` }} >
                                                {item.image && <img src={item.image} alt={item.label} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" /> }
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent dark:from-black/90 dark:via-black/60 dark:to-black/20"></div>
                                                <div className="relative z-10 flex flex-col h-full p-6 justify-end text-left">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <div className="p-2 rounded-lg bg-white/10 backdrop-blur-md text-white border border-white/20 group-hover:bg-[#7f13ec] group-hover:border-[#7f13ec] transition-colors duration-300"> {React.cloneElement(item.icon, { className: "h-6 w-6" })} </div>
                                                        <h3 className="text-lg font-bold text-white group-hover:text-[#E0E0E0] transition-colors">{item.label}</h3>
                                                    </div>
                                                    <p className="text-sm text-gray-300 line-clamp-2 leading-relaxed opacity-90 group-hover:opacity-100 transition-opacity"> {item.desc} </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {activeTool === Tool.Pricing ? ( <Checkout onPlanSelect={handleSelectPlanForPayment} /> ) : activeTool === Tool.FloorPlan ? ( <FloorPlan state={toolStates.FloorPlan} onStateChange={(newState) => handleToolStateChange(Tool.FloorPlan, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.Renovation ? ( <Renovation state={toolStates.Renovation} onStateChange={(newState) => handleToolStateChange(Tool.Renovation, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.ArchitecturalRendering ? ( <ImageGenerator state={toolStates.ArchitecturalRendering} onStateChange={(newState) => handleToolStateChange(Tool.ArchitecturalRendering, newState)} onSendToViewSync={handleSendToViewSync} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.InteriorRendering ? ( <InteriorGenerator state={toolStates.InteriorRendering} onStateChange={(newState) => handleToolStateChange(Tool.InteriorRendering, newState)} onSendToViewSync={handleSendToViewSync} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.UrbanPlanning ? ( <UrbanPlanning state={toolStates.UrbanPlanning} onStateChange={(newState) => handleToolStateChange(Tool.UrbanPlanning, newState)} onSendToViewSync={handleSendToViewSync} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.LandscapeRendering ? ( <LandscapeRendering state={toolStates.LandscapeRendering} onStateChange={(newState) => handleToolStateChange(Tool.LandscapeRendering, newState)} onSendToViewSync={handleSendToViewSync} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.AITechnicalDrawings ? ( <AITechnicalDrawings state={toolStates.AITechnicalDrawings} onStateChange={(newState) => handleToolStateChange(Tool.AITechnicalDrawings, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.SketchConverter ? ( <SketchConverter state={toolStates.SketchConverter} onStateChange={(newState) => handleToolStateChange(Tool.SketchConverter, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.ViewSync ? ( <ViewSync state={toolStates.ViewSync} onStateChange={(newState) => handleToolStateChange(Tool.ViewSync, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.MaterialSwap ? ( <MaterialSwapper state={toolStates.MaterialSwap} onStateChange={(newState) => handleToolStateChange(Tool.MaterialSwap, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.Staging ? ( <Staging state={toolStates.Staging} onStateChange={(newState) => handleToolStateChange(Tool.Staging, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.Upscale ? ( <Upscale state={toolStates.Upscale} onStateChange={(newState) => handleToolStateChange(Tool.Upscale, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.Moodboard ? ( <MoodboardGenerator state={toolStates.Moodboard} onStateChange={(newState) => handleToolStateChange(Tool.Moodboard, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.VideoGeneration ? ( <VideoGenerator state={toolStates.VideoGeneration} onStateChange={(newState) => handleToolStateChange(Tool.VideoGeneration, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.ImageEditing ? ( <ImageEditor state={toolStates.ImageEditing} onStateChange={(newState) => handleToolStateChange(Tool.ImageEditing, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.History ? ( <HistoryPanel /> ) : activeTool === Tool.Profile ? ( <UserProfile session={session} initialTab={toolStates.Profile.activeTab || 'profile'} onTabChange={(tab) => handleToolStateChange(Tool.Profile, { activeTab: tab })} onPurchaseSuccess={fetchUserStatus} /> ) : activeTool === Tool.LayoutGenerator ? ( <LayoutGenerator state={toolStates.LayoutGenerator} onStateChange={(newState) => handleToolStateChange(Tool.LayoutGenerator, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.DrawingGenerator ? ( <DrawingGenerator state={toolStates.DrawingGenerator} onStateChange={(newState) => handleToolStateChange(Tool.DrawingGenerator, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.DiagramGenerator ? ( <DiagramGenerator state={toolStates.DiagramGenerator} onStateChange={(newState) => handleToolStateChange(Tool.DiagramGenerator, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.RealEstatePoster ? ( <RealEstatePoster state={toolStates.RealEstatePoster} onStateChange={(newState) => handleToolStateChange(Tool.RealEstatePoster, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.EditByNote ? ( <EditByNote state={toolStates.EditByNote} onStateChange={(newState) => handleToolStateChange(Tool.EditByNote, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.ReRender ? ( <ReRender state={toolStates.ReRender} onStateChange={(newState) => handleToolStateChange(Tool.ReRender, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.PromptSuggester ? ( <PromptSuggester state={toolStates.PromptSuggester} onStateChange={(newState) => handleToolStateChange(Tool.PromptSuggester, newState)} onSendToViewSyncWithPrompt={handleSendToViewSyncWithPrompt} /> ) : null}
                          </ErrorBoundary>
                      </main>
                  </div>
                  <InsufficientCreditsModal 
                      isOpen={showCreditModal} 
                      onClose={() => setShowCreditModal(false)} 
                      onNavigateToPricing={() => { 
                          setShowCreditModal(false); 
                          handleNavigateToPricing(); 
                      }} 
                  />
              </div>
          );
      }

      if (view === 'auth') { return <AuthPage onGoHome={() => { setView('homepage'); safeHistoryPush('/'); }} />; }
      return ( <div className="relative"> <Homepage onStart={handleStartDesigning} onAuthNavigate={handleAuthNavigate} onNavigateToPricing={handleNavigateToPricing} session={session} userStatus={userStatus} onGoToGallery={handleOpenGallery} onOpenProfile={handleOpenProfile} onNavigateToTool={handleNavigateToTool} onSignOut={handleSignOut} /> </div> );
  };

  return (
    <>
        <SEOHead 
            title={seoData.title}
            description={seoData.description}
            keywords={seoData.keywords}
            noindex={seoData.noindex}
        />
        {renderContent()}
    </>
  );
};

const App: React.FC = () => {
    return (
        <LanguageProvider>
            <AppContent />
        </LanguageProvider>
    );
};

export default App;