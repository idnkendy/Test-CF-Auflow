
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabaseClient';
import { Tool, FileData, UserStatus, PricingPlan } from './types';
import Header from './components/Header';
import Navigation, { utilityToolsGroup } from './components/Navigation';
import ImageGenerator from './components/ImageGenerator';
import VideoGenerator from './components/VideoGenerator';
import ImageEditor from './components/ImageEditor';
import ViewSync from './components/ViewSync';
import VirtualTour from './components/VirtualTour';
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
import FengShui from './components/FengShui';
import LayoutGenerator from './components/LayoutGenerator';
import DrawingGenerator from './components/DrawingGenerator';
import DiagramGenerator from './components/DiagramGenerator';
import RealEstatePoster from './components/RealEstatePoster';
import EditByNote from './components/EditByNote';
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
import LuBanRuler from './components/LuBanRuler';
import PromptEnhancer from './components/PromptEnhancer';
import { getUserStatus, deductCredits } from './services/paymentService';
import { cleanupStaleJobs, recoverOrphanedTransactions } from './services/jobService';
import { plans } from './constants/plans';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Helper functions for safe navigation history
const safeHistoryPush = (path: string) => {
    try {
        window.history.pushState({}, '', path);
    } catch (e) {
        console.warn("History push ignored (environment restriction):", e);
    }
};

const safeHistoryReplace = (path: string) => {
    try {
        window.history.replaceState({}, '', path);
    } catch (e) {
        console.warn("History replace ignored (environment restriction):", e);
    }
};

const App: React.FC = () => {
  const [view, setView] = useState<'homepage' | 'auth' | 'app' | 'pricing' | 'payment' | 'video'>('homepage');
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  
  // FIX: Initialize activeTool from localStorage to persist state on reload
  const [activeTool, setActiveTool] = useState<Tool>(() => {
      const savedTool = localStorage.getItem('activeTool');
      // Validate if saved tool exists in enum to prevent errors
      return (savedTool && Object.values(Tool).includes(savedTool as Tool)) 
        ? (savedTool as Tool) 
        : Tool.ArchitecturalRendering;
  });

  const [toolStates, setToolStates] = useState<ToolStates>(initialToolStates);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark'); 
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  
  // State to handle checkout flow
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  // State to remember plan if user selects it while logged out
  const [pendingPlan, setPendingPlan] = useState<PricingPlan | null>(null);
  
  // Ref to the main content area for scroll resetting
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Scroll to top whenever activeTool changes
  useEffect(() => {
      if (mainContentRef.current) {
          mainContentRef.current.scrollTo(0, 0);
      }
  }, [activeTool]);

  // FIX: Persist activeTool whenever it changes
  useEffect(() => {
      localStorage.setItem('activeTool', activeTool);
  }, [activeTool]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  // Routing: Handle browser back/forward buttons and URL Params
  useEffect(() => {
      const handlePopState = () => {
          const path = window.location.pathname;
          const params = new URLSearchParams(window.location.search);
          
          if (path === '/payment') {
               const planId = params.get('plan');
               const plan = plans.find(p => p.id === planId);
               if (plan && session) {
                   setSelectedPlan(plan);
                   setView('payment');
               } else if (session) {
                   setView('app');
               } else {
                   if (plan) {
                       setPendingPlan(plan);
                       localStorage.setItem('pendingPlanId', plan.id);
                   }
                   setView('homepage'); 
               }
          } else if (path === '/pricing') {
              setView('pricing');
          } else if (path === '/video') {
              if (session) {
                  setView('video');
              } else {
                  // If accessing /video directly while logged out, redirect to login then back to video
                  setView('auth');
              }
          } else if (path === '/') {
              setView('homepage');
          } else if (path === '/feature') {
              if (session) {
                  setView('app');
              } else {
                  safeHistoryReplace('/');
                  setView('homepage');
              }
          }
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, [session]);

  // AUTH LOGIC - OPTIMIZED FOR GOOGLE REDIRECT
  useEffect(() => {
    let mounted = true;

    // 1. Setup Auth Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      // === CRITICAL FIX: Clean URL immediately upon SIGNED_IN ===
      // This prevents the "slow load" feel by removing the giant token string instantly
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (window.location.hash && window.location.hash.includes('access_token')) {
              // Clean the URL hash without reloading the page
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
      }

      setSession(newSession);

      if (event === 'SIGNED_OUT') {
          setSession(null);
          setUserStatus(null);
          setSelectedPlan(null);
          if (window.location.pathname === '/feature' || window.location.pathname === '/payment' || window.location.pathname === '/video') {
              setView('homepage');
              safeHistoryReplace('/');
          }
          setLoadingSession(false);
          return;
      }
      
      if (newSession) {
          // Handle Pending Plans (e.g. user clicked "Buy" then logged in)
          const savedPlanId = localStorage.getItem('pendingPlanId');
          const plan = savedPlanId ? plans.find(p => p.id === savedPlanId) : pendingPlan;

          // Check URL for plan param (OAuth redirect scenario)
          const params = new URLSearchParams(window.location.search);
          const urlPlanId = params.get('plan');
          const urlPlan = urlPlanId ? plans.find(p => p.id === urlPlanId) : null;

          if (urlPlan) {
              setSelectedPlan(urlPlan);
              setView('payment');
              safeHistoryReplace('/'); // Clean URL
          } else if (plan) {
              setSelectedPlan(plan);
              setPendingPlan(null);
              localStorage.removeItem('pendingPlanId');
              setView('payment');
          } else if (view === 'auth') {
              // Redirect to app if logging in from Auth page
              // Check if we came from /video
              if (window.location.pathname === '/video') {
                  setView('video');
              } else {
                  setView('app');
                  safeHistoryReplace('/feature');
              }
          } else if (window.location.pathname === '/feature') {
              setView('app');
          } else if (window.location.pathname === '/video') {
              setView('video');
          }
      } else {
          // No session
          if (view === 'app' || view === 'payment' || view === 'video') {
              setView('homepage');
              safeHistoryPush('/');
          }
      }
      
      // Stop loading spinner immediately when Auth state resolves
      setLoadingSession(false);
    });

    // 2. Initial Session Check
    // Optimization: If we have an access_token in the URL, DO NOT call getSession manually.
    // Let onAuthStateChange handle it. Calling getSession here causes a race condition and double-processing.
    const isRedirectingFromProvider = window.location.hash && window.location.hash.includes('access_token');
    
    if (!isRedirectingFromProvider) {
        const initSession = async () => {
            const { data: { session: initialSession } } = await supabase.auth.getSession();
            if (mounted) {
                if (initialSession) {
                    setSession(initialSession);
                    // Routing Logic for Initial Load
                    if (window.location.pathname === '/pricing') setView('pricing');
                    else if (window.location.pathname === '/feature') setView('app');
                    else if (window.location.pathname === '/video') setView('video');
                    else if (window.location.pathname === '/payment') {
                         const params = new URLSearchParams(window.location.search);
                         const planId = params.get('plan');
                         const plan = plans.find(p => p.id === planId);
                         if (plan) { setSelectedPlan(plan); setView('payment'); }
                         else setView('app');
                    }
                    else setView('homepage'); // Default to homepage
                } else {
                    // Not logged in routing
                    if (window.location.pathname === '/pricing') setView('pricing');
                    else if (window.location.pathname === '/feature' || window.location.pathname === '/video') {
                        setView('homepage');
                        safeHistoryReplace('/');
                    }
                }
                setLoadingSession(false);
            }
        };
        initSession();
    } else {
        // If redirecting, we are essentially "loading" until the event listener fires
        setLoadingSession(true);
    }

    return () => {
        mounted = false;
        subscription.unsubscribe();
    };
  }, [pendingPlan]); // Removed 'view' dependency to prevent loops

  // Define fetchUserStatus using useCallback to be stable
  const fetchUserStatus = useCallback(async () => {
    if (session?.user) {
      // 1. Recover any orphaned transactions from browser crash (localStorage check)
      await recoverOrphanedTransactions(session.user.id);
      
      // 2. Clean up zombie jobs (> 8 mins) to free queue and return credits
      await cleanupStaleJobs(session.user.id);
      
      const status = await getUserStatus(session.user.id, session.user.email);
      setUserStatus(status);
    } else {
      setUserStatus(null);
    }
  }, [session]);

  useEffect(() => {
    fetchUserStatus();
  }, [fetchUserStatus, activeTool]); 
  
  const handleDeductCredits = async (amount: number, description?: string): Promise<string> => {
      if (!session?.user) throw new Error("Vui lòng đăng nhập để sử dụng.");
      const logId = await deductCredits(session.user.id, amount, description || '');
      await fetchUserStatus();
      return logId;
  };

  const renderToolContent = () => {
    switch (activeTool) {
      case Tool.ArchitecturalRendering:
        return <ImageGenerator state={toolStates[Tool.ArchitecturalRendering]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.ArchitecturalRendering]: {...prev[Tool.ArchitecturalRendering], ...s}}))} onSendToViewSync={(img) => { setToolStates(prev => ({...prev, [Tool.ViewSync]: {...prev[Tool.ViewSync], sourceImage: img}})); setActiveTool(Tool.ViewSync); }} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.InteriorRendering:
        return <InteriorGenerator state={toolStates[Tool.InteriorRendering]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.InteriorRendering]: {...prev[Tool.InteriorRendering], ...s}}))} onSendToViewSync={(img) => { setToolStates(prev => ({...prev, [Tool.ViewSync]: {...prev[Tool.ViewSync], sourceImage: img}})); setActiveTool(Tool.ViewSync); }} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.Renovation:
        return <Renovation state={toolStates[Tool.Renovation]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.Renovation]: {...prev[Tool.Renovation], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.ViewSync:
        return <ViewSync state={toolStates[Tool.ViewSync]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.ViewSync]: {...prev[Tool.ViewSync], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.ImageEditing:
        return <ImageEditor state={toolStates[Tool.ImageEditing]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.ImageEditing]: {...prev[Tool.ImageEditing], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.UrbanPlanning:
        return <UrbanPlanning state={toolStates[Tool.UrbanPlanning]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.UrbanPlanning]: {...prev[Tool.UrbanPlanning], ...s}}))} onSendToViewSync={(img) => { setToolStates(prev => ({...prev, [Tool.ViewSync]: {...prev[Tool.ViewSync], sourceImage: img}})); setActiveTool(Tool.ViewSync); }} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.LandscapeRendering:
        return <LandscapeRendering state={toolStates[Tool.LandscapeRendering]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.LandscapeRendering]: {...prev[Tool.LandscapeRendering], ...s}}))} onSendToViewSync={(img) => { setToolStates(prev => ({...prev, [Tool.ViewSync]: {...prev[Tool.ViewSync], sourceImage: img}})); setActiveTool(Tool.ViewSync); }} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.FloorPlan:
        return <FloorPlan state={toolStates[Tool.FloorPlan]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.FloorPlan]: {...prev[Tool.FloorPlan], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.VirtualTour:
        return <VirtualTour state={toolStates[Tool.VirtualTour]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.VirtualTour]: {...prev[Tool.VirtualTour], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.PromptSuggester:
        return <PromptSuggester state={toolStates[Tool.PromptSuggester]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.PromptSuggester]: {...prev[Tool.PromptSuggester], ...s}}))} onSendToViewSyncWithPrompt={(img, prompt) => { setToolStates(prev => ({...prev, [Tool.ViewSync]: {...prev[Tool.ViewSync], sourceImage: img, customPrompt: prompt}})); setActiveTool(Tool.ViewSync); }} />;
      case Tool.PromptEnhancer:
        return <PromptEnhancer state={toolStates[Tool.PromptEnhancer]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.PromptEnhancer]: {...prev[Tool.PromptEnhancer], ...s}}))} />;
      case Tool.MaterialSwap:
        return <MaterialSwapper state={toolStates[Tool.MaterialSwap]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.MaterialSwap]: {...prev[Tool.MaterialSwap], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.VideoGeneration:
        return <VideoGenerator state={toolStates[Tool.VideoGeneration]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.VideoGeneration]: {...prev[Tool.VideoGeneration], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.Upscale:
        return <Upscale state={toolStates[Tool.Upscale]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.Upscale]: {...prev[Tool.Upscale], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.Moodboard:
        return <MoodboardGenerator state={toolStates[Tool.Moodboard]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.Moodboard]: {...prev[Tool.Moodboard], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.Staging:
        return <Staging state={toolStates[Tool.Staging]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.Staging]: {...prev[Tool.Staging], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.AITechnicalDrawings:
        return <AITechnicalDrawings state={toolStates[Tool.AITechnicalDrawings]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.AITechnicalDrawings]: {...prev[Tool.AITechnicalDrawings], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.SketchConverter:
        return <SketchConverter state={toolStates[Tool.SketchConverter]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.SketchConverter]: {...prev[Tool.SketchConverter], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.FengShui:
        return <FengShui state={toolStates[Tool.FengShui]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.FengShui]: {...prev[Tool.FengShui], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.LuBanRuler:
        return <LuBanRuler state={toolStates[Tool.LuBanRuler]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.LuBanRuler]: {...prev[Tool.LuBanRuler], ...s}}))} />;
      case Tool.LayoutGenerator:
        return <LayoutGenerator state={toolStates[Tool.LayoutGenerator]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.LayoutGenerator]: {...prev[Tool.LayoutGenerator], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.DrawingGenerator:
        return <DrawingGenerator state={toolStates[Tool.DrawingGenerator]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.DrawingGenerator]: {...prev[Tool.DrawingGenerator], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.DiagramGenerator:
        return <DiagramGenerator state={toolStates[Tool.DiagramGenerator]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.DiagramGenerator]: {...prev[Tool.DiagramGenerator], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.RealEstatePoster:
        return <RealEstatePoster state={toolStates[Tool.RealEstatePoster]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.RealEstatePoster]: {...prev[Tool.RealEstatePoster], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.EditByNote:
        return <EditByNote state={toolStates[Tool.EditByNote]} onStateChange={(s) => setToolStates(prev => ({...prev, [Tool.EditByNote]: {...prev[Tool.EditByNote], ...s}}))} userCredits={userStatus?.credits} onDeductCredits={handleDeductCredits} />;
      case Tool.History:
        return <HistoryPanel />;
      case Tool.Pricing:
        return <Checkout onPlanSelect={(plan) => { setSelectedPlan(plan); setView('payment'); }} />;
      case Tool.Profile:
        return <UserProfile session={session!} onTabChange={() => {}} onPurchaseSuccess={fetchUserStatus} />;
      case Tool.ExtendedFeaturesDashboard:
         return (
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                 {utilityToolsGroup.tools.map(t => (
                     <div key={t.tool} onClick={() => setActiveTool(t.tool)} className="cursor-pointer bg-surface dark:bg-dark-bg p-4 rounded-xl border border-border-color dark:border-gray-700 hover:border-accent transition-all flex flex-col items-center text-center gap-3 shadow-sm hover:shadow-md">
                         <div className={`p-3 rounded-full bg-gradient-to-br ${t.gradient || 'from-gray-500 to-gray-600'} text-white shadow-inner`}>
                             {t.icon}
                         </div>
                         <div>
                             <h3 className="font-bold text-text-primary dark:text-white text-sm">{t.label}</h3>
                             <p className="text-xs text-text-secondary dark:text-gray-400 mt-1 line-clamp-2">{t.desc}</p>
                         </div>
                     </div>
                 ))}
             </div>
         );
      default:
        return null;
    }
  };

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-main-bg dark:bg-[#121212]">
        <Spinner />
      </div>
    );
  }

  // Routing render logic
  if (view === 'homepage') {
    return (
      <Homepage 
        onStart={() => {
            if (session) setView('app');
            else setView('auth');
        }}
        onAuthNavigate={(mode) => setView('auth')}
        session={session}
        onGoToGallery={() => { setActiveTool(Tool.History); setView('app'); }}
        onUpgrade={() => setView('pricing')}
        onOpenProfile={() => { setActiveTool(Tool.Profile); setView('app'); }}
        userStatus={userStatus}
        onNavigateToTool={(tool) => { setActiveTool(tool); setView('app'); }}
        onNavigateToPricing={() => setView('pricing')}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  }

  if (view === 'auth') {
    return <AuthPage onGoHome={() => setView('homepage')} />;
  }

  if (view === 'pricing') {
    return (
        <PublicPricing 
            onGoHome={() => setView('homepage')}
            onAuthNavigate={() => setView('auth')}
            onPlanSelect={(plan) => {
                setSelectedPlan(plan);
                if (session) setView('payment');
                else {
                    setPendingPlan(plan);
                    localStorage.setItem('pendingPlanId', plan.id);
                    setView('auth');
                }
            }}
            session={session}
            userStatus={userStatus}
            onDashboardNavigate={() => setView('app')}
            onSignOut={() => supabase.auth.signOut()}
        />
    );
  }

  if (view === 'payment' && selectedPlan && session) {
      return (
          <div className="min-h-screen bg-main-bg dark:bg-[#121212] text-text-primary dark:text-white">
              <Header 
                  onGoHome={() => setView('homepage')} 
                  onThemeToggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} 
                  theme={theme}
                  onSignOut={() => supabase.auth.signOut()}
                  userStatus={userStatus}
                  user={session.user}
              />
              <div className="container mx-auto py-8">
                  <PaymentPage 
                      plan={selectedPlan} 
                      user={session.user} 
                      onBack={() => setView('app')} 
                      onSuccess={() => {
                          fetchUserStatus(); // Refresh credits
                          setView('app');
                      }} 
                  />
              </div>
          </div>
      );
  }

  if (view === 'video') {
      return (
          <VideoPage 
              session={session ? { user: session.user } : null}
              userStatus={userStatus}
              onGoHome={() => setView('homepage')}
              onThemeToggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              theme={theme}
              onSignOut={() => supabase.auth.signOut()}
              onOpenGallery={() => { setActiveTool(Tool.History); setView('app'); }}
              onUpgrade={() => setView('pricing')}
              onOpenProfile={() => { setActiveTool(Tool.Profile); setView('app'); }}
              onToggleNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
              onDeductCredits={handleDeductCredits}
              onRefreshCredits={async () => { await fetchUserStatus(); }}
          />
      );
  }

  // Default: App View (Dashboard)
  return (
    <div className="min-h-screen bg-main-bg dark:bg-[#121212] text-text-primary dark:text-white font-sans transition-colors duration-300 flex flex-col">
      <Header 
        onGoHome={() => setView('homepage')} 
        onThemeToggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} 
        theme={theme}
        onSignOut={() => supabase.auth.signOut()}
        onOpenGallery={() => setActiveTool(Tool.History)}
        onUpgrade={() => setView('pricing')}
        onOpenProfile={() => setActiveTool(Tool.Profile)}
        userStatus={userStatus}
        user={session?.user || null}
        onToggleNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
      />
      
      <Navigation 
        activeTool={activeTool} 
        setActiveTool={setActiveTool} 
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        onGoHome={() => setView('homepage')}
      />

      <main 
        ref={mainContentRef}
        className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 overflow-y-auto scrollbar-hide"
      >
        <ErrorBoundary>
            {renderToolContent()} 
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default App;
