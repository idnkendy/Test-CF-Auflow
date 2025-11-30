
import React, { useState, useEffect, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabaseClient';
import { Tool, FileData, UserStatus, PricingPlan } from './types';
import Header from './components/Header';
import Navigation from './components/Navigation';
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
import UserProfile from './components/UserProfile';
import Checkout from './components/Checkout'; 
import PaymentPage from './components/PaymentPage';
import { initialToolStates, ToolStates } from './state/toolState';
import Homepage from './components/Homepage';
import AuthPage from './components/auth/AuthPage';
import Spinner from './components/Spinner';
import PublicPricing from './components/PublicPricing';
import TermsOfServicePage from './components/TermsOfServicePage'; // Import Terms Page
import { getUserStatus, deductCredits } from './services/paymentService';
import * as jobService from './services/jobService';
import { plans } from './constants/plans';

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
  const [view, setView] = useState<'homepage' | 'auth' | 'app' | 'pricing' | 'payment'>('homepage');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeTool, setActiveTool] = useState<Tool>(Tool.ArchitecturalRendering);
  const [toolStates, setToolStates] = useState<ToolStates>(initialToolStates);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark'); 
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  
  // State to handle checkout flow
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  // State to remember plan if user selects it while logged out
  const [pendingPlan, setPendingPlan] = useState<PricingPlan | null>(null);

  // Check for pending tab focus to auto-login after email verification
  useEffect(() => {
    const handleFocus = async () => {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
            setSession(currentSession);
        }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleFocus);

    return () => {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('visibilitychange', handleFocus);
    };
  }, []);

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
                   // If not logged in but trying to access payment, verify plan exists
                   if (plan) {
                       setPendingPlan(plan);
                       localStorage.setItem('pendingPlanId', plan.id);
                   }
                   setView('homepage'); 
               }
          } else if (path === '/pricing') {
              setView('pricing');
          } else if (path === '/') {
              // Allow homepage even if logged in
              setView('homepage');
          } else if (path === '/feature' && session) {
              setView('app');
          }
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, [session]);

  // 1. INITIAL SESSION CHECK (Runs once on mount)
  useEffect(() => {
    const initSession = async () => {
        setLoadingSession(true);
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        // Check URL for plan param (e.g. returning from OAuth redirect)
        const params = new URLSearchParams(window.location.search);
        const planIdParam = params.get('plan');
        const urlPlan = planIdParam ? plans.find(p => p.id === planIdParam) : null;

        if (initialSession) {
            setSession(initialSession);
            
            // PRIORITY 1: URL Param Plan (OAuth redirect)
            if (urlPlan) {
                setSelectedPlan(urlPlan);
                setView('payment');
                safeHistoryReplace('/'); // Clean URL
            } 
            // PRIORITY 2: Pending Plan from LocalStorage (OAuth/Refresh persistence)
            else {
                const savedPlanId = localStorage.getItem('pendingPlanId');
                const plan = savedPlanId ? plans.find(p => p.id === savedPlanId) : pendingPlan;

                if (plan) {
                    setSelectedPlan(plan);
                    setPendingPlan(null);
                    localStorage.removeItem('pendingPlanId'); // Clear it
                    setView('payment');
                }
                // PRIORITY 3: Check if path is explicitly pricing
                else if (window.location.pathname === '/pricing') {
                    setView('pricing');
                }
                // PRIORITY 4: Default App View on Initial Load if logged in and not on homepage/pricing
                else if (window.location.pathname === '/' || window.location.pathname === '/feature') {
                     setView('app');
                }
            }
        } else {
            // Not logged in
            if (window.location.pathname === '/pricing') {
                setView('pricing');
            }
        }
        setLoadingSession(false);
    };

    initSession();
  }, []);

  // 2. AUTH STATE LISTENER (Runs when auth state or view changes)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      
      if (session) {
          // Check if we have a pending plan waiting (from State or LocalStorage)
          const savedPlanId = localStorage.getItem('pendingPlanId');
          const plan = savedPlanId ? plans.find(p => p.id === savedPlanId) : pendingPlan;

          if (plan) {
              setSelectedPlan(plan);
              setPendingPlan(null);
              localStorage.removeItem('pendingPlanId');
              setView('payment');
          } 
          // Only redirect to app if we are currently on the Auth page (Login/Signup success)
          else if (view === 'auth') {
              setView('app');
              safeHistoryReplace('/feature');
          }
          // Note: We intentionally DO NOT redirect from 'homepage' or 'pricing' here 
          // to allow logged-in users to browse those pages.
      } else {
          // Logged out
          if (view === 'app' || view === 'payment') {
              setView('homepage');
          }
      }
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, [pendingPlan, view]);

  // Define fetchUserStatus using useCallback to be stable
  const fetchUserStatus = useCallback(async () => {
    if (session?.user) {
      await jobService.cleanupStaleJobs(session.user.id);
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
      const logId = await deductCredits(session.user.id, amount, description);
      await fetchUserStatus();
      return logId;
  };

  const handleThemeToggle = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };
  
  const handleAuthNavigate = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setView('auth');
  };

  const handleStartDesigning = () => {
    if (session) {
        setView('app');
        safeHistoryPush('/feature');
    } else {
        handleAuthNavigate('login');
    }
  };

  const handleNavigateToTool = (tool: Tool) => {
      setActiveTool(tool);
      if (session) {
          setView('app');
          safeHistoryPush('/feature');
      } else {
          handleAuthNavigate('login');
      }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setView('homepage');
    setSession(null);
    setSelectedPlan(null);
    localStorage.removeItem('pendingPlanId');
    safeHistoryPush('/');
  };
  
  const handleGoHome = () => {
    // Always go to homepage view regardless of session state
    setView('homepage');
    safeHistoryPush('/');
  }

  const handleOpenGallery = () => {
      if (session) {
          setView('app');
          setActiveTool(Tool.History);
          safeHistoryPush('/feature');
      }
  }

  const handleToolStateChange = <T extends keyof ToolStates>(
    tool: T,
    newState: Partial<ToolStates[T]>
  ) => {
    setToolStates(prev => ({
      ...prev,
      [tool]: {
        ...prev[tool],
        ...newState,
      },
    }));
  };

  // This function now specifically routes to the Public Pricing page /pricing
  const handleNavigateToPricing = () => {
      setView('pricing');
      safeHistoryPush('/pricing');
  }
  
  const handleOpenProfile = () => {
      if (session) {
          setView('app');
          setActiveTool(Tool.Profile);
          handleToolStateChange(Tool.Profile, { activeTab: 'profile' });
          safeHistoryPush('/feature');
      }
  }

  // Logic xử lý khi chọn gói từ trang Bảng giá hoặc Checkout
  const handleSelectPlanForPayment = (plan: PricingPlan) => {
      if (session) {
          // Đã đăng nhập -> Vào thẳng trang thanh toán
          setSelectedPlan(plan);
          setView('payment');
          safeHistoryPush(`/payment?plan=${plan.id}`);
      } else {
          // Chưa đăng nhập -> Lưu gói lại -> Chuyển sang đăng nhập
          setPendingPlan(plan);
          localStorage.setItem('pendingPlanId', plan.id); // Backup to localStorage for OAuth redirects
          setAuthMode('login'); // Mặc định chuyển sang đăng nhập
          setView('auth');
      }
  };

  const handlePaymentBack = () => {
      setView('pricing');
      safeHistoryPush('/pricing');
  }

  const handlePaymentSuccess = () => {
      fetchUserStatus();
      setView('app');
      setActiveTool(Tool.ArchitecturalRendering);
      safeHistoryPush('/feature');
  };

  const handleSendToViewSync = (image: FileData) => {
     handleToolStateChange(Tool.ViewSync, {
        sourceImage: image,
        resultImages: [],
        error: null,
        customPrompt: '',
     });
    setActiveTool(Tool.ViewSync);
  };
  
  const userCredits = userStatus?.credits || 0;

  // --- RENDER LOGIC ---

  // Independent Routing Check for Terms of Service (No Session Required)
  if (window.location.pathname === '/terms-of-service') {
      return <TermsOfServicePage />;
  }

  if (loadingSession) {
    return (
      <div className="min-h-[100dvh] bg-main-bg dark:bg-[#121212] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  
  // Payment Page (Protected but handled by session logic)
  if (view === 'payment' && selectedPlan && session) {
      return (
          <div className="min-h-screen bg-main-bg dark:bg-[#121212] font-sans">
              <Header 
                  onGoHome={handleGoHome} 
                  onThemeToggle={handleThemeToggle} 
                  theme={theme} 
                  onSignOut={handleSignOut} 
                  userStatus={userStatus}
                  user={session.user}
                  onToggleNav={() => {}}
              />
              <PaymentPage 
                  plan={selectedPlan}
                  user={session.user}
                  onBack={handlePaymentBack}
                  onSuccess={handlePaymentSuccess}
              />
          </div>
      );
  }

  // Public Pricing Page (Accessible by both)
  if (view === 'pricing') {
      return (
        <PublicPricing 
            onGoHome={() => { setView('homepage'); safeHistoryPush('/'); }} 
            onAuthNavigate={handleAuthNavigate} 
            onPlanSelect={handleSelectPlanForPayment}
            session={session}
            userStatus={userStatus}
            onDashboardNavigate={() => { setView('app'); safeHistoryPush('/feature'); }}
            onSignOut={handleSignOut}
        />
      );
  }

  // LOGGED IN APP VIEW
  if (session && view === 'app') {
      return (
          <div className="h-[100dvh] bg-main-bg dark:bg-[#121212] font-sans text-text-primary dark:text-[#EAEAEA] flex flex-col transition-colors duration-300 overflow-hidden">
              <Header 
                  onGoHome={handleGoHome} 
                  onThemeToggle={handleThemeToggle} 
                  theme={theme} 
                  onSignOut={handleSignOut} 
                  onOpenGallery={handleOpenGallery} 
                  onUpgrade={handleNavigateToPricing} 
                  onOpenProfile={handleOpenProfile} 
                  userStatus={userStatus}
                  user={session.user}
                  onToggleNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
              />
              <div className="relative flex flex-col md:flex-row flex-grow overflow-hidden">
                  <Navigation 
                      activeTool={activeTool} 
                      setActiveTool={(tool) => {
                          setActiveTool(tool);
                          setIsMobileNavOpen(false);
                      }} 
                      isMobileOpen={isMobileNavOpen}
                      onCloseMobile={() => setIsMobileNavOpen(false)}
                  />
                  <main 
                      className="flex-1 bg-surface/90 dark:bg-[#191919]/90 backdrop-blur-md md:m-6 md:ml-0 md:rounded-2xl shadow-lg border-t md:border border-border-color dark:border-[#302839] overflow-y-auto scrollbar-hide p-3 sm:p-6 lg:p-8 relative z-0 transition-colors duration-300"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                      {activeTool === Tool.Pricing ? (
                          <Checkout onPlanSelect={handleSelectPlanForPayment} />
                      ) : activeTool === Tool.FloorPlan ? (
                          <FloorPlan 
                              state={toolStates.FloorPlan}
                              onStateChange={(newState) => handleToolStateChange(Tool.FloorPlan, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.Renovation ? (
                          <Renovation 
                              state={toolStates.Renovation}
                              onStateChange={(newState) => handleToolStateChange(Tool.Renovation, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.ArchitecturalRendering ? (
                          <ImageGenerator 
                              state={toolStates.ArchitecturalRendering}
                              onStateChange={(newState) => handleToolStateChange(Tool.ArchitecturalRendering, newState)}
                              onSendToViewSync={handleSendToViewSync} 
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.InteriorRendering ? (
                          <InteriorGenerator
                              state={toolStates.InteriorRendering}
                              onStateChange={(newState) => handleToolStateChange(Tool.InteriorRendering, newState)}
                              onSendToViewSync={handleSendToViewSync} 
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.UrbanPlanning ? (
                          <UrbanPlanning
                              state={toolStates.UrbanPlanning}
                              onStateChange={(newState) => handleToolStateChange(Tool.UrbanPlanning, newState)}
                              onSendToViewSync={handleSendToViewSync}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.LandscapeRendering ? (
                          <LandscapeRendering
                              state={toolStates.LandscapeRendering}
                              onStateChange={(newState) => handleToolStateChange(Tool.LandscapeRendering, newState)}
                              onSendToViewSync={handleSendToViewSync}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.AITechnicalDrawings ? (
                          <AITechnicalDrawings
                              state={toolStates.AITechnicalDrawings}
                              onStateChange={(newState) => handleToolStateChange(Tool.AITechnicalDrawings, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.SketchConverter ? (
                          <SketchConverter
                              state={toolStates.SketchConverter}
                              onStateChange={(newState) => handleToolStateChange(Tool.SketchConverter, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.FengShui ? (
                          <FengShui
                              state={toolStates.FengShui}
                              onStateChange={(newState) => handleToolStateChange(Tool.FengShui, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.ViewSync ? (
                          <ViewSync 
                              state={toolStates.ViewSync}
                              onStateChange={(newState) => handleToolStateChange(Tool.ViewSync, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.VirtualTour ? (
                          <VirtualTour
                              state={toolStates.VirtualTour}
                              onStateChange={(newState) => handleToolStateChange(Tool.VirtualTour, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.MaterialSwap ? (
                          <MaterialSwapper 
                              state={toolStates.MaterialSwap}
                              onStateChange={(newState) => handleToolStateChange(Tool.MaterialSwap, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.Staging ? (
                          <Staging 
                              state={toolStates.Staging}
                              onStateChange={(newState) => handleToolStateChange(Tool.Staging, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.Upscale ? (
                          <Upscale 
                              state={toolStates.Upscale}
                              onStateChange={(newState) => handleToolStateChange(Tool.Upscale, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.Moodboard ? (
                          <MoodboardGenerator 
                              state={toolStates.Moodboard}
                              onStateChange={(newState) => handleToolStateChange(Tool.Moodboard, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.VideoGeneration ? (
                          <VideoGenerator 
                              state={toolStates.VideoGeneration}
                              onStateChange={(newState) => handleToolStateChange(Tool.VideoGeneration, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.ImageEditing ? (
                          <ImageEditor 
                              state={toolStates.ImageEditing}
                              onStateChange={(newState) => handleToolStateChange(Tool.ImageEditing, newState)}
                              userCredits={userCredits}
                              onDeductCredits={handleDeductCredits}
                          />
                      ) : activeTool === Tool.History ? (
                          <HistoryPanel />
                      ) : activeTool === Tool.Profile ? (
                          <UserProfile 
                              session={session} 
                              initialTab={toolStates.Profile.activeTab || 'profile'}
                              onTabChange={(tab) => handleToolStateChange(Tool.Profile, { activeTab: tab })}
                              onPurchaseSuccess={fetchUserStatus}
                          /> 
                      ) : null}
                  </main>
              </div>
          </div>
      );
  }

  // PUBLIC VIEW (Homepage or Auth)
  if (view === 'auth') {
    return <AuthPage onGoHome={() => { setView('homepage'); safeHistoryPush('/'); }} initialMode={authMode} />;
  }
  
  // Homepage View
  return (
    <Homepage 
        onStart={handleStartDesigning} 
        onAuthNavigate={handleAuthNavigate} 
        onNavigateToPricing={handleNavigateToPricing} 
        session={session}
        userStatus={userStatus}
        onGoToGallery={handleOpenGallery}
        onOpenProfile={handleOpenProfile}
        onNavigateToTool={handleNavigateToTool}
        onSignOut={handleSignOut}
    />
  );
};

export default App;
