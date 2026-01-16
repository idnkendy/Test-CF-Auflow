
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

// --- CONFIGURATION ---
const MAINTENANCE_MODE = false; 
// ---------------------

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

// SEO Mapping Function
const getSeoMetadata = (view: string, activeTool: Tool) => {
    if (view === 'homepage') return { 
        title: "OPZEN AI - Kiến tạo không gian với AI", 
        description: "Nền tảng AI hỗ trợ thiết kế kiến trúc, nội thất và quy hoạch.",
        keywords: "AI kiến trúc, thiết kế nhà AI, render nội thất, quy hoạch đô thị, diễn họa kiến trúc, opzen"
    };
    if (view === 'pricing') return { 
        title: "Bảng giá dịch vụ", 
        description: "Các gói credits linh hoạt cho nhu cầu render và thiết kế của bạn.",
        keywords: "bảng giá render, mua credits ai, chi phí thiết kế ai"
    };
    if (view === 'payment') return { 
        title: "Thanh toán", 
        description: "Hoàn tất giao dịch để nhận credits.",
        keywords: "thanh toán opzen, nạp tiền ai"
    };
    if (view === 'auth') return { 
        title: "Đăng nhập / Đăng ký", 
        description: "Truy cập tài khoản OPZEN AI.",
        keywords: "đăng nhập opzen, đăng ký opzen"
    };
    if (view === 'video') return { 
        title: "AI Tạo Video Kiến Trúc", 
        description: "Biến ảnh tĩnh thành phim kiến trúc sống động.",
        keywords: "tạo video kiến trúc, ai video architecture, diễn họa phim"
    };
    
    // Tool Specific mapping
    switch (activeTool) {
        case Tool.ArchitecturalRendering: return { 
            title: "Render Kiến Trúc AI", 
            description: "Biến phác thảo thành ảnh render kiến trúc thực tế.", 
            keywords: "render ngoại thất, ai render, sketch to real, phối cảnh nhà phố"
        };
        case Tool.InteriorRendering: return { 
            title: "Render Nội Thất AI", 
            description: "Thiết kế và phối cảnh nội thất tự động.", 
            keywords: "thiết kế nội thất ai, render phòng khách, ý tưởng nội thất"
        };
        case Tool.Renovation: return { 
            title: "Cải Tạo Nhà AI", 
            description: "Gợi ý phương án cải tạo mặt tiền và nội thất.", 
            keywords: "cải tạo nhà cũ, sửa nhà ai, renovation ai"
        };
        case Tool.FloorPlan: return { 
            title: "Render Mặt Bằng 3D", 
            description: "Chuyển đổi bản vẽ 2D thành phối cảnh 3D.", 
            keywords: "render mặt bằng, floor plan to 3d, mặt bằng nội thất"
        };
        case Tool.UrbanPlanning: return { 
            title: "Render Quy Hoạch", 
            description: "Phối cảnh quy hoạch đô thị và dự án lớn.", 
            keywords: "quy hoạch đô thị ai, render dự án, phối cảnh tổng thể"
        };
        case Tool.LandscapeRendering: return { 
            title: "Thiết Kế Sân Vườn AI", 
            description: "Phối cảnh cảnh quan và sân vườn.", 
            keywords: "thiết kế sân vườn, landscape ai, render cảnh quan"
        };
        case Tool.ViewSync: return { 
            title: "Đồng Bộ View & Sáng Tạo", 
            description: "Tạo các góc nhìn khác nhau từ một thiết kế gốc.", 
            keywords: "đồng bộ view, tạo góc nhìn khác, consistency style"
        };
        case Tool.VideoGeneration: return { 
            title: "Tạo Video AI", 
            description: "Tạo video kiến trúc từ hình ảnh hoặc văn bản.", 
            keywords: "video kiến trúc, ai video generator, phim diễn họa"
        };
        case Tool.ImageEditing: return { 
            title: "Chỉnh Sửa Ảnh AI", 
            description: "Chỉnh sửa chi tiết ảnh kiến trúc bằng AI.", 
            keywords: "chỉnh sửa ảnh ai, inpainting, xóa vật thể"
        };
        case Tool.Upscale: return { 
            title: "Upscale Ảnh 4K", 
            description: "Nâng cao chất lượng và độ phân giải ảnh.", 
            keywords: "upscale ảnh, làm nét ảnh, render 4k"
        };
        case Tool.MaterialSwap: return { 
            title: "Thay Vật Liệu AI", 
            description: "Thử nghiệm vật liệu mới trên bề mặt có sẵn.", 
            keywords: "thay vật liệu, đổi màu sơn, material swap"
        };
        case Tool.Staging: return { 
            title: "Virtual Staging AI", 
            description: "Dàn dựng nội thất cho phòng trống.", 
            keywords: "virtual staging, dàn dựng nội thất, home staging"
        };
        case Tool.Moodboard: return { 
            title: "Tạo Moodboard", 
            description: "Sắp xếp ý tưởng và vật liệu thiết kế.", 
            keywords: "moodboard kiến trúc, bảng vật liệu, ý tưởng thiết kế"
        };
        case Tool.AITechnicalDrawings: return { 
            title: "Tạo Bản Vẽ Kỹ Thuật", 
            description: "Chuyển ảnh phối cảnh thành bản vẽ kỹ thuật.", 
            keywords: "bản vẽ kỹ thuật ai, mặt đứng, mặt cắt"
        };
        case Tool.SketchConverter: return { 
            title: "Ảnh thành Sketch", 
            description: "Chuyển ảnh thực tế thành tranh vẽ chì/màu nước.", 
            keywords: "ảnh thành tranh vẽ, sketch converter, hiệu ứng chì"
        };
        case Tool.FengShui: return { 
            title: "Phân Tích Phong Thủy", 
            description: "Tra cứu thước Lỗ Ban và phân tích phong thủy nhà ở.", 
            keywords: "phong thủy nhà ở, thước lỗ ban, xem hướng nhà"
        };
        case Tool.ExtendedFeaturesDashboard: return { 
            title: "Kho Tiện Ích Mở Rộng", 
            description: "Khám phá các công cụ AI chuyên sâu khác.", 
            keywords: "công cụ ai, tiện ích kiến trúc"
        };
        case Tool.Profile: return { 
            title: "Hồ Sơ Cá Nhân", 
            description: "Quản lý tài khoản và lịch sử giao dịch.",
            keywords: "tài khoản opzen, lịch sử thanh toán"
        };
        case Tool.Pricing: return { 
            title: "Nâng Cấp Gói", 
            description: "Mua thêm credits để sử dụng.", 
            keywords: "mua credits, nâng cấp tài khoản"
        };
        default: return { 
            title: "Công cụ thiết kế AI", 
            description: "Sử dụng sức mạnh AI cho công việc thiết kế của bạn.",
            keywords: "ai architecture, design tools"
        };
    }
};

const App: React.FC = () => {
  const [view, setView] = useState<'homepage' | 'auth' | 'app' | 'pricing' | 'payment' | 'video'>('homepage');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login'); 
  const [session, setSession] = useState<Session | null>(null);
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

  // Determine SEO Metadata
  const seoData = getSeoMetadata(view, activeTool);

  useEffect(() => {
      if (mainContentRef.current) {
          mainContentRef.current.scrollTo(0, 0);
      }
  }, [activeTool]);

  useEffect(() => {
      localStorage.setItem('activeTool', activeTool);
  }, [activeTool]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
      const handlePopState = () => {
          const path = window.location.pathname;
          const params = new URLSearchParams(window.location.search);
          if (path === '/payment') {
               const planId = params.get('plan');
               const plan = plans.find(p => p.id === planId);
               if (plan && session) { setSelectedPlan(plan); setView('payment'); }
               else if (session) { setView('app'); }
               else { if (plan) { setPendingPlan(plan); localStorage.setItem('pendingPlanId', plan.id); } setView('homepage'); }
          } else if (path === '/pricing') { setView('pricing'); }
          else if (path === '/video') { if (session) setView('video'); else { setAuthMode('login'); setView('auth'); } }
          else if (path === '/') { setView('homepage'); }
          else if (path === '/feature') { if (session) setView('app'); else { safeHistoryReplace('/'); setView('homepage'); } }
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, [session]);

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (window.location.hash && window.location.hash.includes('access_token')) {
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
      }
      setSession(newSession);
      if (event === 'SIGNED_OUT') {
          setSession(null); setUserStatus(null); setSelectedPlan(null);
          if (window.location.pathname === '/feature' || window.location.pathname === '/payment' || window.location.pathname === '/video') {
              setView('homepage'); safeHistoryReplace('/');
          }
          setLoadingSession(false); return;
      }
      if (newSession) {
          const savedPlanId = localStorage.getItem('pendingPlanId');
          const plan = savedPlanId ? plans.find(p => p.id === savedPlanId) : pendingPlan;
          const params = new URLSearchParams(window.location.search);
          const urlPlanId = params.get('plan');
          const urlPlan = urlPlanId ? plans.find(p => p.id === urlPlanId) : null;
          if (urlPlan) { setSelectedPlan(urlPlan); setView('payment'); safeHistoryReplace('/'); }
          else if (plan) { setSelectedPlan(plan); setPendingPlan(null); localStorage.removeItem('pendingPlanId'); setView('payment'); }
          else if (view === 'auth') { if (window.location.pathname === '/video') setView('video'); else { setView('app'); safeHistoryReplace('/feature'); } }
          else if (window.location.pathname === '/feature') setView('app');
          else if (window.location.pathname === '/video') setView('video');
          
          cleanupStuckJobs(newSession.user.id).catch(console.error);
          
      } else { if (view === 'app' || view === 'payment' || view === 'video') { setView('homepage'); safeHistoryPush('/'); } }
      setLoadingSession(false);
    });
    const isRedirectingFromProvider = window.location.hash && window.location.hash.includes('access_token');
    if (!isRedirectingFromProvider) {
        const initSession = async () => {
            const { data: { session: initialSession } } = await supabase.auth.getSession();
            if (mounted) {
                if (initialSession) {
                    setSession(initialSession);
                    cleanupStuckJobs(initialSession.user.id).catch(console.error);

                    if (window.location.pathname === '/pricing') setView('pricing');
                    else if (window.location.pathname === '/feature') setView('app');
                    else if (window.location.pathname === '/video') setView('video');
                    else if (window.location.pathname === '/payment') {
                         const params = new URLSearchParams(window.location.search);
                         const planId = params.get('plan');
                         const plan = plans.find(p => p.id === planId);
                         if (plan) { setSelectedPlan(plan); setView('payment'); } else setView('app');
                    } else setView('homepage');
                } else { if (window.location.pathname === '/pricing') setView('pricing'); else if (window.location.pathname === '/feature' || window.location.pathname === '/video') { setView('homepage'); safeHistoryReplace('/'); } }
                setLoadingSession(false);
            }
        };
        initSession();
    } else { setLoadingSession(true); }
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [pendingPlan]);

  const fetchUserStatus = useCallback(async () => {
    if (session?.user) {
      const status = await getUserStatus(session.user.id, session.user.email);
      setUserStatus(status);
    } else { setUserStatus(null); }
  }, [session]);

  useEffect(() => {
    fetchUserStatus();
  }, [fetchUserStatus, activeTool]); 
  
  // MAINTENANCE MODE CHECK
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
  
  const handleAuthNavigate = (mode: 'login' | 'signup' = 'login') => { 
      setAuthMode(mode);
      setView('auth'); 
  };
  
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

  // -- RENDER LOGIC --
  const renderContent = () => {
      if (window.location.pathname === '/terms-of-service') { return <TermsOfServicePage />; }
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
          const isExtendedTool = utilityToolsGroup.tools.some(t => t.tool === activeTool);
          return (
              <div className="h-[100dvh] bg-main-bg dark:bg-[#121212] font-sans text-text-primary dark:text-[#EAEAEA] flex flex-col transition-colors duration-300 overflow-hidden relative">
                  <Header onGoHome={handleGoHome} onThemeToggle={handleThemeToggle} theme={theme} onSignOut={handleSignOut} onOpenGallery={handleOpenGallery} onUpgrade={handleNavigateToPricing} onOpenProfile={handleOpenProfile} userStatus={userStatus} user={session.user} onToggleNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />
                  <Navigation activeTool={activeTool} setActiveTool={(tool) => { if (tool === Tool.VideoGeneration) { setView('video'); safeHistoryPush('/video'); } else { setActiveTool(tool); } setIsMobileNavOpen(false); }} isMobileOpen={isMobileNavOpen} onCloseMobile={() => setIsMobileNavOpen(false)} onGoHome={handleGoHome} />
                  <div className="relative flex flex-col flex-grow overflow-hidden">
                      <main ref={mainContentRef} className="flex-1 bg-surface/90 dark:bg-[#191919]/90 backdrop-blur-md overflow-y-auto scrollbar-hide p-3 sm:p-6 lg:p-8 relative z-0 transition-colors duration-300" style={{ WebkitOverflowScrolling: 'touch' }} >
                          {isExtendedTool && (
                              <button onClick={() => setActiveTool(Tool.ExtendedFeaturesDashboard)} className="flex items-center gap-2 text-text-secondary dark:text-gray-400 hover:text-[#7f13ec] dark:hover:text-[#7f13ec] mb-6 transition-colors font-medium text-sm group" >
                                  <div className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 group-hover:bg-[#7f13ec]/10 transition-colors"> <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /> </svg> </div> Quay lại tiện ích
                              </button>
                          )}
                          <ErrorBoundary>
                            {activeTool === Tool.ExtendedFeaturesDashboard && (
                                <div className="max-w-7xl mx-auto pb-10">
                                    <div className="mb-10 text-center animate-fade-in-up">
                                        <h2 className="text-3xl font-extrabold text-text-primary dark:text-white mb-3">Kho Tiện Ích Mở Rộng</h2>
                                        <p className="text-text-secondary dark:text-gray-400 max-w-2xl mx-auto text-base">Khám phá các công cụ AI chuyên sâu hỗ trợ mọi giai đoạn thiết kế, quy hoạch và hoàn thiện ý tưởng.</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {utilityToolsGroup.tools.map((item, index) => (
                                            <button key={item.tool} onClick={() => setActiveTool(item.tool)} className={`group relative flex flex-col h-64 rounded-2xl border border-gray-200 dark:border-white/5 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl shadow-lg`} style={{ animationDelay: `${index * 50}ms` }} >
                                                {item.image && <img src={item.image} alt={item.label} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" /> }
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent dark:from-black/90 dark:via-black/60 dark:to-black/20"></div>
                                                <div className="relative z-10 flex flex-col h-full p-6 justify-end text-left">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <div className="p-2 rounded-lg bg-white/10 backdrop-blur-md text-white border border-white/20 group-hover:bg-[#7f13ec] group-hover:border-[#7f13ec] transition-colors duration-300"> {React.cloneElement(item.icon, { className: "h-6 w-6" })} </div>
                                                        <h3 className="text-lg font-bold text-white group-hover:text-[#E0E0E0] transition-colors">{item.label}</h3>
                                                    </div>
                                                    <p className="text-sm text-gray-300 line-clamp-2 leading-relaxed opacity-90 group-hover:opacity-100 transition-opacity"> {item.desc || "Công cụ hỗ trợ thiết kế chuyên nghiệp."} </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {activeTool === Tool.Pricing ? ( <Checkout onPlanSelect={handleSelectPlanForPayment} /> ) : activeTool === Tool.FloorPlan ? ( <FloorPlan state={toolStates.FloorPlan} onStateChange={(newState) => handleToolStateChange(Tool.FloorPlan, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.Renovation ? ( <Renovation state={toolStates.Renovation} onStateChange={(newState) => handleToolStateChange(Tool.Renovation, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.ArchitecturalRendering ? ( <ImageGenerator state={toolStates.ArchitecturalRendering} onStateChange={(newState) => handleToolStateChange(Tool.ArchitecturalRendering, newState)} onSendToViewSync={handleSendToViewSync} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.InteriorRendering ? ( <InteriorGenerator state={toolStates.InteriorRendering} onStateChange={(newState) => handleToolStateChange(Tool.InteriorRendering, newState)} onSendToViewSync={handleSendToViewSync} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.UrbanPlanning ? ( <UrbanPlanning state={toolStates.UrbanPlanning} onStateChange={(newState) => handleToolStateChange(Tool.UrbanPlanning, newState)} onSendToViewSync={handleSendToViewSync} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.LandscapeRendering ? ( <LandscapeRendering state={toolStates.LandscapeRendering} onStateChange={(newState) => handleToolStateChange(Tool.LandscapeRendering, newState)} onSendToViewSync={handleSendToViewSync} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.AITechnicalDrawings ? ( <AITechnicalDrawings state={toolStates.AITechnicalDrawings} onStateChange={(newState) => handleToolStateChange(Tool.AITechnicalDrawings, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.SketchConverter ? ( <SketchConverter state={toolStates.SketchConverter} onStateChange={(newState) => handleToolStateChange(Tool.SketchConverter, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.FengShui ? ( <FengShui state={toolStates.FengShui} onStateChange={(newState) => handleToolStateChange(Tool.FengShui, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.ViewSync ? ( <ViewSync state={toolStates.ViewSync} onStateChange={(newState) => handleToolStateChange(Tool.ViewSync, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.MaterialSwap ? ( <MaterialSwapper state={toolStates.MaterialSwap} onStateChange={(newState) => handleToolStateChange(Tool.MaterialSwap, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.Staging ? ( <Staging state={toolStates.Staging} onStateChange={(newState) => handleToolStateChange(Tool.Staging, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.Upscale ? ( <Upscale state={toolStates.Upscale} onStateChange={(newState) => handleToolStateChange(Tool.Upscale, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.Moodboard ? ( <MoodboardGenerator state={toolStates.Moodboard} onStateChange={(newState) => handleToolStateChange(Tool.Moodboard, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.VideoGeneration ? ( <VideoGenerator state={toolStates.VideoGeneration} onStateChange={(newState) => handleToolStateChange(Tool.VideoGeneration, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.ImageEditing ? ( <ImageEditor state={toolStates.ImageEditing} onStateChange={(newState) => handleToolStateChange(Tool.ImageEditing, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.History ? ( <HistoryPanel /> ) : activeTool === Tool.Profile ? ( <UserProfile session={session} initialTab={toolStates.Profile.activeTab || 'profile'} onTabChange={(tab) => handleToolStateChange(Tool.Profile, { activeTab: tab })} onPurchaseSuccess={fetchUserStatus} /> ) : activeTool === Tool.LayoutGenerator ? ( <LayoutGenerator state={toolStates.LayoutGenerator} onStateChange={(newState) => handleToolStateChange(Tool.LayoutGenerator, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.DrawingGenerator ? ( <DrawingGenerator state={toolStates.DrawingGenerator} onStateChange={(newState) => handleToolStateChange(Tool.DrawingGenerator, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.DiagramGenerator ? ( <DiagramGenerator state={toolStates.DiagramGenerator} onStateChange={(newState) => handleToolStateChange(Tool.DiagramGenerator, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.RealEstatePoster ? ( <RealEstatePoster state={toolStates.RealEstatePoster} onStateChange={(newState) => handleToolStateChange(Tool.RealEstatePoster, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.EditByNote ? ( <EditByNote state={toolStates.EditByNote} onStateChange={(newState) => handleToolStateChange(Tool.EditByNote, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.ReRender ? ( <ReRender state={toolStates.ReRender} onStateChange={(newState) => handleToolStateChange(Tool.ReRender, newState)} userCredits={userCredits} onDeductCredits={handleDeductCredits} onInsufficientCredits={handleInsufficientCredits} /> ) : activeTool === Tool.PromptSuggester ? ( <PromptSuggester state={toolStates.PromptSuggester} onStateChange={(newState) => handleToolStateChange(Tool.PromptSuggester, newState)} onSendToViewSyncWithPrompt={handleSendToViewSyncWithPrompt} /> ) : null}
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

      if (view === 'auth') { return <AuthPage initialMode={authMode} onGoHome={() => { setView('homepage'); safeHistoryPush('/'); }} />; }
      return ( <div className="relative"> <Homepage onStart={handleStartDesigning} onAuthNavigate={handleAuthNavigate} onNavigateToPricing={handleNavigateToPricing} session={session} userStatus={userStatus} onGoToGallery={handleOpenGallery} onOpenProfile={handleOpenProfile} onNavigateToTool={handleNavigateToTool} onSignOut={handleSignOut} /> </div> );
  };

  return (
    <>
        <SEOHead 
            title={seoData.title}
            description={seoData.description}
            keywords={seoData.keywords}
        />
        {renderContent()}
    </>
  );
};

export default App;
