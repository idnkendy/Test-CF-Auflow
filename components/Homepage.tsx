
import React, { useState, useEffect, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { UserStatus, Tool } from '../types';
import { Logo } from './common/Logo';
import { useLanguage } from '../hooks/useLanguage';

interface HomepageProps {
  onStart: () => void;
  onAuthNavigate: (mode: 'login' | 'signup') => void;
  session?: Session | null;
  onGoToGallery?: () => void;
  onUpgrade?: () => void;
  onOpenProfile?: () => void;
  userStatus?: UserStatus | null;
  onNavigateToTool?: (tool: Tool) => void;
  onNavigateToPricing?: () => void;
  onSignOut?: () => void;
}

const LazyVideo = ({ src, poster }: { src: string, poster?: string }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [shouldLoad, setShouldLoad] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setShouldLoad(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' } 
        );

        if (videoRef.current) {
            observer.observe(videoRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <video 
            ref={videoRef}
            autoPlay={shouldLoad} 
            loop 
            muted 
            playsInline
            className="w-full h-full object-cover" 
            poster={poster}
            preload={shouldLoad ? "metadata" : "none"}
        >
            {shouldLoad && <source src={src} type="video/mp4" />}
            Your browser does not support the video tag.
        </video>
    );
};

// --- HERO CAROUSEL COMPONENT ---
const HeroCarousel: React.FC = () => {
    const images = [
        "https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/homepage5.png",
        "https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/homepage1.png",
        "https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/render%204k%20img.jpg",
        "https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/homepage3.png",
        "https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/homepage4.png"
    ];

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);

    useEffect(() => {
        if (!isAutoPlaying) return;
        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % images.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [isAutoPlaying, images.length]);

    const handleNext = () => {
        setIsAutoPlaying(false);
        setCurrentIndex((prev) => (prev + 1) % images.length);
    };

    const handlePrev = () => {
        setIsAutoPlaying(false);
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    const getPosition = (index: number) => {
        const diff = (index - currentIndex + images.length) % images.length;
        if (diff === 0) return 'center';
        if (diff === 1 || (diff === -(images.length - 1))) return 'right';
        if (diff === images.length - 1 || diff === -1) return 'left';
        return 'hidden';
    };

    return (
        <div className="relative w-full max-w-5xl mx-auto h-[300px] sm:h-[400px] md:h-[500px] mt-12 mb-12 flex items-center justify-center perspective-[1500px]">
            <div className="relative w-full h-full flex items-center justify-center">
                {images.map((img, idx) => {
                    const pos = getPosition(idx);
                    let style = "absolute w-[60%] sm:w-[70%] aspect-video rounded-2xl overflow-hidden transition-all duration-700 ease-in-out border border-white/20 shadow-2xl";
                    
                    if (pos === 'center') {
                        style += " z-30 opacity-100 scale-100 transform translate-x-0 cursor-default";
                    } else if (pos === 'left') {
                        style += " z-20 opacity-40 scale-75 transform -translate-x-[40%] sm:-translate-x-[30%] rotate-y-[25deg] blur-sm cursor-pointer";
                    } else if (pos === 'right') {
                        style += " z-20 opacity-40 scale-75 transform translate-x-[40%] sm:translate-x-[30%] rotate-y-[-25deg] blur-sm cursor-pointer";
                    } else {
                        style += " z-10 opacity-0 scale-50 pointer-events-none";
                    }

                    return (
                        <div 
                            key={idx} 
                            className={style}
                            onClick={() => {
                                if (pos === 'left') handlePrev();
                                if (pos === 'right') handleNext();
                            }}
                        >
                            <img src={img} alt={`Slide ${idx}`} className="w-full h-full object-cover" />
                            {pos === 'center' && (
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none"></div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Controls */}
            <button 
                onClick={handlePrev}
                className="absolute left-0 sm:-left-4 md:-left-8 z-40 p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white backdrop-blur-md transition-all group"
                aria-label="Previous image"
            >
                <span className="material-symbols-outlined notranslate text-2xl group-hover:-translate-x-1 transition-transform">arrow_back_ios_new</span>
            </button>
            <button 
                onClick={handleNext}
                className="absolute right-0 sm:-right-4 md:-right-8 z-40 p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white backdrop-blur-md transition-all group"
                aria-label="Next image"
            >
                <span className="material-symbols-outlined notranslate text-2xl group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
            </button>

            {/* Pagination Dots */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex gap-2">
                {images.map((_, idx) => (
                    <button 
                        key={idx}
                        onClick={() => {
                            setIsAutoPlaying(false);
                            setCurrentIndex(idx);
                        }}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${currentIndex === idx ? 'w-8 bg-[#7f13ec]' : 'bg-gray-600 hover:bg-gray-400'}`}
                    />
                ))}
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
const Homepage: React.FC<HomepageProps> = (props) => {
    return (
        <div className="bg-[#121212] font-sans text-[#EAEAEA] min-h-screen flex flex-col selection:bg-[#7f13ec] selection:text-white">
            <style>{`
                .gradient-text {
                    background: linear-gradient(to right, #a855f7, #ec4899);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .gradient-bg {
                    background: linear-gradient(135deg, #1a1a1a 0%, #2d1b4e 100%);
                }
                .glass-card {
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }
                .hero-glow {
                    background: radial-gradient(circle, rgba(127, 19, 236, 0.15) 0%, rgba(0, 0, 0, 0) 70%);
                }
                .perspective-container {
                    perspective: 1500px;
                }
                .rotate-y-left {
                    transform: rotateY(25deg);
                }
                .rotate-y-right {
                    transform: rotateY(-25deg);
                }
            `}</style>
            
            <Header {...props} />
            
            <main className="flex-1">
                <Hero onStart={props.onStart} />
                <StatsSection />
                <ServiceHighlights onNavigateToTool={props.onNavigateToTool} onStart={props.onStart} />
                <FeatureDetailed onStart={props.onStart} onNavigateToTool={props.onNavigateToTool} />
                <UseCasesSection />
                <AboutSection />
                <FAQSection />
                <CTA onStart={props.onStart} />
            </main>

            <Footer onStart={props.onStart} onNavigateToPricing={props.onNavigateToPricing} onNavigateToTool={props.onNavigateToTool} />
        </div>
    );
};

// --- HEADER ---
const Header: React.FC<HomepageProps> = ({ onStart, onAuthNavigate, session, onGoToGallery, onOpenProfile, userStatus, onNavigateToTool, onNavigateToPricing, onSignOut }) => {
    const { t, language, setLanguage } = useLanguage();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('scroll', handleScroll);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (isMobileMenuOpen) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = 'unset';
        return () => { document.body.style.overflow = 'unset'; };
    }, [isMobileMenuOpen]);

    const handleNavClick = (tool?: Tool) => {
        if (tool && onNavigateToTool) onNavigateToTool(tool);
        else onStart();
        setIsMobileMenuOpen(false);
    };

    const handleGiftcodeClick = () => {
        if (session) {
            onOpenProfile?.();
        } else {
            onAuthNavigate('login');
        }
        setIsMobileMenuOpen(false);
    };

    const toggleLanguage = () => {
        setLanguage(language === 'vi' ? 'en' : 'vi');
    };

    // Component for the Toggle Switch
    const LanguageToggle = () => (
        <button
            onClick={toggleLanguage}
            className="relative bg-[#1E1E1E] rounded-full border border-[#333] h-10 w-24 cursor-pointer hover:border-[#7f13ec]/50 transition-all duration-300 group focus:outline-none shadow-inner p-1"
            aria-label="Switch Language"
        >
            {/* Active Pill Background */}
            <div
                className={`absolute top-1 bottom-1 left-1 w-10 bg-[#7f13ec] rounded-full shadow-md shadow-purple-500/30 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                    language === 'en' ? 'translate-x-[3rem]' : 'translate-x-0'
                }`}
            ></div>
            
            {/* Text Labels - Using Grid for Perfect Centering */}
            <div className="absolute inset-0 grid grid-cols-2 z-10 select-none pointer-events-none">
                <div className="flex items-center justify-center">
                    <span className={`text-sm font-bold transition-colors duration-300 ${language === 'vi' ? 'text-white' : 'text-gray-500 group-hover:text-gray-400'}`}>VN</span>
                </div>
                <div className="flex items-center justify-center">
                    <span className={`text-sm font-bold transition-colors duration-300 ${language === 'en' ? 'text-white' : 'text-gray-500 group-hover:text-gray-400'}`}>EN</span>
                </div>
            </div>
        </button>
    );

    return (
        <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#121212]/90 backdrop-blur-md border-b border-[#302839]' : 'bg-transparent'}`}>
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-24">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <Logo className="w-14 h-14 text-[#7f13ec]" />
                        <span className="text-3xl font-bold tracking-tight text-white">{t('app.name')}</span>
                    </div>

                    {/* Desktop Nav */}
                    <nav className="hidden lg:flex items-center gap-8">
                        <button onClick={() => handleNavClick(Tool.ArchitecturalRendering)} className="text-lg font-medium text-gray-300 hover:text-white transition-colors">{t('nav.render')}</button>
                        <button onClick={() => handleNavClick(Tool.VideoGeneration)} className="text-lg font-medium text-gray-300 hover:text-white transition-colors">{t('nav.video')}</button>
                        <button onClick={onNavigateToPricing} className="text-lg font-medium text-gray-300 hover:text-white transition-colors">{t('nav.pricing')}</button>
                        <button onClick={handleGiftcodeClick} className="text-lg font-medium text-gray-300 hover:text-white transition-colors">{t('nav.giftcode')}</button>
                    </nav>

                    {/* Auth Buttons & Lang */}
                    <div className="hidden lg:flex items-center gap-4">
                        <LanguageToggle />

                        {session ? (
                            <div className="relative" ref={dropdownRef}>
                                <button 
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="flex items-center gap-3 px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
                                >
                                    {userStatus && (
                                        <div className="flex flex-col items-end mr-1">
                                            <span className="text-xs font-bold text-[#a855f7]">{userStatus.credits} Credits</span>
                                        </div>
                                    )}
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#7f13ec] to-[#a855f7] flex items-center justify-center text-white font-bold shadow-lg">
                                        {session.user.email?.[0].toUpperCase()}
                                    </div>
                                </button>

                                {isDropdownOpen && (
                                    <div className="absolute right-0 mt-2 w-64 bg-[#1E1E1E] rounded-xl shadow-2xl border border-[#302839] py-2 overflow-hidden animate-fade-in">
                                        <div className="px-4 py-3 border-b border-[#302839] bg-[#252525]">
                                            <p className="text-sm font-bold text-white truncate">{session.user.user_metadata?.full_name || 'Người dùng'}</p>
                                            <p className="text-xs text-gray-400 truncate">{session.user.email}</p>
                                        </div>
                                        <button onClick={() => { onOpenProfile?.(); setIsDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-[#302839] hover:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-lg">person</span> {t('nav.profile')}
                                        </button>
                                        <button onClick={() => { onGoToGallery?.(); setIsDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-[#302839] hover:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-lg">imagesmode</span> {t('nav.gallery')}
                                        </button>
                                        <div className="border-t border-[#302839] my-1"></div>
                                        <button onClick={() => { onSignOut?.(); setIsDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-[#302839] flex items-center gap-2">
                                            <span className="material-symbols-outlined text-lg">logout</span> {t('nav.logout')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <button onClick={() => onAuthNavigate('login')} className="text-white/80 hover:text-white text-sm font-medium">{t('nav.login')}</button>
                                <button 
                                    onClick={() => onAuthNavigate('signup')}
                                    className="px-7 py-3 bg-white text-black text-lg font-bold rounded-full hover:bg-gray-200 transition-colors shadow-lg shadow-white/10"
                                >
                                    {t('nav.signup')}
                                </button>
                            </>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <button className="lg:hidden text-white p-2" onClick={() => setIsMobileMenuOpen(true)}>
                        <span className="material-symbols-outlined text-3xl">menu</span>
                    </button>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 bg-[#121212] z-50 p-6 flex flex-col animate-fade-in lg:hidden">
                    <div className="flex justify-between items-center mb-8">
                        <div className="flex items-center gap-2">
                            <Logo className="w-10 h-10 text-[#7f13ec]" />
                            <span className="text-xl font-bold text-white">OPZEN AI</span>
                        </div>
                        <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-gray-400 hover:text-white">
                            <span className="material-symbols-outlined text-3xl">close</span>
                        </button>
                    </div>
                    <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
                        <button onClick={() => handleNavClick(Tool.ArchitecturalRendering)} className="flex items-center gap-3 p-4 rounded-xl bg-[#1E1E1E] text-white font-medium">
                            <span className="material-symbols-outlined text-[#7f13ec]">imagesmode</span> {t('nav.render')}
                        </button>
                        <button onClick={() => handleNavClick(Tool.VideoGeneration)} className="flex items-center gap-3 p-4 rounded-xl bg-[#1E1E1E] text-white font-medium">
                            <span className="material-symbols-outlined text-[#7f13ec]">videocam</span> {t('nav.video')}
                        </button>
                        <button onClick={() => { onNavigateToPricing?.(); setIsMobileMenuOpen(false); }} className="flex items-center gap-3 p-4 rounded-xl bg-[#1E1E1E] text-white font-medium">
                            <span className="material-symbols-outlined text-[#7f13ec]">payments</span> {t('nav.pricing')}
                        </button>
                        <button onClick={handleGiftcodeClick} className="flex items-center gap-3 p-4 rounded-xl bg-[#1E1E1E] text-white font-medium">
                            <span className="material-symbols-outlined text-[#7f13ec]">redeem</span> {t('nav.giftcode')}
                        </button>
                    </div>
                    
                    <div className="mt-4 flex justify-center pb-6">
                         <LanguageToggle />
                    </div>

                    {!session && (
                        <div className="mt-2 flex flex-col gap-3">
                            <button onClick={() => { onAuthNavigate('login'); setIsMobileMenuOpen(false); }} className="w-full py-3 rounded-xl border border-[#302839] text-white font-medium">{t('nav.login')}</button>
                            <button onClick={() => { onAuthNavigate('signup'); setIsMobileMenuOpen(false); }} className="w-full py-3 rounded-xl bg-[#7f13ec] text-white font-bold">{t('nav.signup')}</button>
                        </div>
                    )}
                </div>
            )}
        </header>
    );
};

// --- HERO SECTION ---
const Hero: React.FC<{onStart: () => void}> = ({ onStart }) => {
    const { t } = useLanguage();

    return (
        <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden hero-glow">
            <div className="absolute inset-0 z-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-[#7f13ec]/20 rounded-full blur-[120px] opacity-30"></div>
                <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-blue-600/10 rounded-full blur-[100px] opacity-20"></div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-gray-300 mb-6 backdrop-blur-sm animate-fade-in-up">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    {t('hero.tag')}
                </div>
                
                <h1 className="w-full max-w-[1400px] mx-auto font-extrabold text-white tracking-tight mb-6 animate-fade-in-up delay-100 uppercase text-center">
                    <span className="block text-4xl sm:text-5xl md:text-6xl gradient-text mb-2 md:mb-4 leading-normal py-2 md:whitespace-nowrap">
                        {t('hero.title_1')}
                    </span>
                    <span className="block text-xl sm:text-3xl md:text-4xl lg:text-5xl text-white leading-tight md:whitespace-nowrap px-4">
                        {t('hero.title_2')}
                    </span>
                </h1>
                
                <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed animate-fade-in-up delay-200">
                    {t('hero.desc')}
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-300">
                    <button 
                        onClick={onStart}
                        className="w-full sm:w-auto px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] transform hover:-translate-y-1 text-lg flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined">rocket_launch</span>
                        {t('hero.start')}
                    </button>
                    <button 
                        onClick={() => {
                            window.open('https://www.youtube.com/watch?v=0kktb_GH4gY', '_blank');
                        }}
                        className="w-full sm:w-auto px-8 py-4 bg-[#1E1E1E] text-white font-semibold rounded-full border border-[#302839] hover:bg-[#252525] transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined">play_circle</span>
                        {t('hero.demo')}
                    </button>
                </div>

                {/* HERO CAROUSEL 3D */}
                <HeroCarousel />
            </div>
        </section>
    );
};

const StatsSection = () => {
    const { t } = useLanguage();
    const stats = [
        { label: t('stats.users'), value: "100,000+" },
        { label: t('stats.images'), value: "10,000,000+" },
        { label: t('stats.time'), value: "90%" },
    ];

    return (
        <section className="py-10 border-y border-[#302839] bg-[#1a1a1a]/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {stats.map((stat, idx) => (
                        <div key={idx} className="text-center">
                            <p className="text-3xl md:text-4xl font-bold text-white mb-1">{stat.value}</p>
                            <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const ServiceHighlights: React.FC<{onNavigateToTool?: (tool: Tool) => void, onStart: () => void}> = ({ onNavigateToTool, onStart }) => {
    const { t } = useLanguage();
    const handleNav = (tool: Tool) => {
        if (onNavigateToTool) onNavigateToTool(tool);
        else onStart();
    };

    const services = [
        { title: t('services.arch'), tool: Tool.ArchitecturalRendering, icon: "apartment", desc: t('services.arch_desc') },
        { title: t('services.interior'), tool: Tool.InteriorRendering, icon: "chair", desc: t('services.interior_desc') },
        { title: t('services.urban'), tool: Tool.UrbanPlanning, icon: "map", desc: t('services.urban_desc') },
        { title: t('services.floorplan'), tool: Tool.FloorPlan, icon: "dashboard", desc: t('services.floorplan_desc') },
        { title: t('services.renovation'), tool: Tool.Renovation, icon: "home_work", desc: t('services.renovation_desc') },
        { title: t('services.landscape'), tool: Tool.LandscapeRendering, icon: "park", desc: t('services.landscape_desc') },
        { title: t('services.video'), tool: Tool.VideoGeneration, icon: "videocam", desc: t('services.video_desc') },
        { title: t('services.poster'), tool: Tool.RealEstatePoster, icon: "campaign", desc: t('services.poster_desc') }
    ];

    return (
        <section className="py-16 bg-[#121212] border-b border-[#302839]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-2xl md:text-3xl font-bold text-white">{t('services.section_title')}</h2>
                    <p className="text-gray-400 mt-2">{t('services.section_desc')}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {services.map((service, index) => (
                        <div 
                            key={index} 
                            onClick={() => handleNav(service.tool)}
                            className="bg-[#1E1E1E] p-6 rounded-2xl border border-[#302839] hover:border-[#7f13ec] transition-all cursor-pointer group hover:-translate-y-1"
                        >
                            <div className="w-12 h-12 bg-[#252525] rounded-full flex items-center justify-center mb-4 group-hover:bg-[#7f13ec] transition-colors">
                                <span className="material-symbols-outlined text-[#7f13ec] text-2xl group-hover:text-white transition-colors">{service.icon}</span>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">{service.title}</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">{service.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const FeatureDetailed: React.FC<{onStart: () => void, onNavigateToTool?: (tool: Tool) => void}> = ({ onStart, onNavigateToTool }) => {
    const { t } = useLanguage();
    const handleNav = (tool: Tool) => {
        if (onNavigateToTool) onNavigateToTool(tool);
        else onStart();
    };

    return (
        <section id="features" className="py-24 relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-32">
                
                {/* Feature 1: Render */}
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <div className="order-2 lg:order-1 relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
                        <div className="relative rounded-2xl overflow-hidden border border-[#302839] bg-[#1E1E1E] aspect-[4/3] group shadow-2xl">
                            <img 
                                src="https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/render%204k%20img.jpg"
                                alt="AI Render Result" 
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent opacity-60"></div>
                            <div className="absolute bottom-6 left-6 right-6">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-bold text-white mb-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                    {t('feat.render.tag')}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="order-1 lg:order-2 space-y-6">
                        <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                            <span className="material-symbols-outlined text-3xl">edit_square</span>
                        </div>
                        <h2 className="text-3xl md:text-4xl font-bold text-white">{t('feat.render.title')}</h2>
                        <p className="text-lg text-gray-400 leading-relaxed">
                            {t('feat.render.desc')}
                        </p>
                        <ul className="space-y-3">
                            {[t('feat.render.li1'), t('feat.render.li2'), t('feat.render.li3')].map((item, i) => (
                                <li key={i} className="flex items-center gap-3 text-gray-300">
                                    <span className="material-symbols-outlined text-green-500">check_circle</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => handleNav(Tool.ArchitecturalRendering)} className="mt-4 px-6 py-3 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors">
                            {t('feat.render.btn')}
                        </button>
                    </div>
                </div>

                {/* Feature 2: Renovation */}
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6">
                        <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-500 border border-pink-500/20">
                            <span className="material-symbols-outlined text-3xl">home_work</span>
                        </div>
                        <h2 className="text-3xl md:text-4xl font-bold text-white">{t('feat.reno.title')}</h2>
                        <p className="text-lg text-gray-400 leading-relaxed">
                            {t('feat.reno.desc')}
                        </p>
                        <ul className="space-y-3">
                            {[t('feat.reno.li1'), t('feat.reno.li2'), t('feat.reno.li3')].map((item, i) => (
                                <li key={i} className="flex items-center gap-3 text-gray-300">
                                    <span className="material-symbols-outlined text-green-500">check_circle</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => handleNav(Tool.Renovation)} className="mt-4 px-6 py-3 bg-[#1E1E1E] border border-[#302839] text-white font-bold rounded-lg hover:bg-[#252525] transition-colors">
                            {t('feat.reno.btn')}
                        </button>
                    </div>
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-pink-600 to-orange-600 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
                        <div className="relative rounded-2xl overflow-hidden border border-[#302839] bg-[#1E1E1E] aspect-[4/3] group shadow-2xl">
                            <img 
                                src="https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/Anh%20Cai%20Tao%20Khong%20Gian%20Noi%20That%20HomePage.jpg"
                                alt="AI Renovation Result" 
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent opacity-60"></div>
                            <div className="absolute bottom-6 left-6 right-6">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-bold text-white mb-2">
                                    <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span>
                                    {t('feat.reno.tag')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Feature 3: Video */}
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <div className="order-2 lg:order-1 relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
                        <div className="relative rounded-2xl overflow-hidden border border-[#302839] bg-[#1E1E1E]">
                            <LazyVideo 
                                src="https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/7375974190439_Precise_Proteus%20(1).mp4"
                                poster="https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/video-poster-placeholder.jpg" 
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            </div>
                        </div>
                    </div>
                    <div className="order-1 lg:order-2 space-y-6">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                            <span className="material-symbols-outlined text-3xl">videocam</span>
                        </div>
                        <h2 className="text-3xl md:text-4xl font-bold text-white">{t('feat.video.title')}</h2>
                        <p className="text-lg text-gray-400 leading-relaxed">
                            {t('feat.video.desc')}
                        </p>
                        <ul className="space-y-3">
                            {[t('feat.video.li1'), t('feat.video.li2'), t('feat.video.li3')].map((item, i) => (
                                <li key={i} className="flex items-center gap-3 text-gray-300">
                                    <span className="material-symbols-outlined text-green-500">check_circle</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => handleNav(Tool.VideoGeneration)} className="mt-4 px-6 py-3 bg-[#1E1E1E] border border-[#302839] text-white font-bold rounded-lg hover:bg-[#252525] transition-colors">
                            {t('feat.video.btn')}
                        </button>
                    </div>
                </div>

            </div>
        </section>
    );
};

const UseCasesSection = () => {
    const { t } = useLanguage();
    const cases = [
        {
            icon: "architecture",
            title: t('usecase.1.title'),
            desc: t('usecase.1.desc')
        },
        {
            icon: "real_estate_agent",
            title: t('usecase.2.title'),
            desc: t('usecase.2.desc')
        },
        {
            icon: "cottage",
            title: t('usecase.3.title'),
            desc: t('usecase.3.desc')
        }
    ];

    return (
        <section className="py-20 bg-[#1a1a1a]/30 border-y border-[#302839]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{t('usecase.title')}</h2>
                    <p className="text-gray-400">{t('usecase.desc')}</p>
                </div>
                <div className="grid md:grid-cols-3 gap-8">
                    {cases.map((c, i) => (
                        <div key={i} className="p-8 rounded-2xl bg-[#1E1E1E] border border-[#302839] hover:border-[#7f13ec]/50 transition-colors text-center group">
                            <div className="w-16 h-16 mx-auto mb-6 bg-[#121212] rounded-full flex items-center justify-center text-gray-400 group-hover:text-[#7f13ec] group-hover:bg-[#7f13ec]/10 transition-all">
                                <span className="material-symbols-outlined text-3xl">{c.icon}</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{c.title}</h3>
                            <p className="text-gray-400 leading-relaxed">{c.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const FAQSection = () => {
    const { t } = useLanguage();
    const faqs = [
        { q: t('faq.q1'), a: t('faq.a1') },
        { q: t('faq.q2'), a: t('faq.a2') },
        { q: t('faq.q3'), a: t('faq.a3') },
        { q: t('faq.q4'), a: t('faq.a4') },
    ];

    return (
        <section className="py-20">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <h2 className="text-3xl font-bold text-white mb-12 text-center">{t('faq.title')}</h2>
                <div className="grid gap-6">
                    {faqs.map((faq, i) => (
                        <div key={i} className="p-6 bg-[#1E1E1E] rounded-xl border border-[#302839]">
                            <h3 className="text-lg font-bold text-white mb-2">{faq.q}</h3>
                            <p className="text-gray-400">{faq.a}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const AboutSection = () => {
    const { t } = useLanguage();
    return (
        <section className="py-24 bg-[#0a0a0a] border-t border-[#302839] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-[100px]"></div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid lg:grid-cols-2 gap-16 items-start">
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-6 leading-tight">
                                {t('about.title_1')} <br/>
                                <span className="gradient-text">{t('about.title_2')}</span>
                            </h2>
                            <div className="space-y-6 text-gray-400 text-lg leading-relaxed">
                                <p>{t('about.p1')}</p>
                                <p>{t('about.p2')}</p>
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-6 pt-4">
                            <div className="p-4 rounded-xl bg-[#1E1E1E] border border-[#302839] hover:border-[#7f13ec]/50 transition-colors">
                                <h4 className="text-white font-bold text-lg mb-2 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#7f13ec]">psychology</span>
                                    {t('about.feat1.title')}
                                </h4>
                                <p className="text-sm text-gray-500">{t('about.feat1.desc')}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-[#1E1E1E] border border-[#302839] hover:border-[#7f13ec]/50 transition-colors">
                                <h4 className="text-white font-bold text-lg mb-2 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#7f13ec]">speed</span>
                                    {t('about.feat2.title')}
                                </h4>
                                <p className="text-sm text-gray-500">{t('about.feat2.desc')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-[#151515] p-8 rounded-3xl border border-[#302839]">
                            <h3 className="text-xl font-bold text-white mb-6 border-b border-[#302839] pb-4">{t('about.why.title')}</h3>
                            <ul className="space-y-4">
                                {[
                                    { title: t('about.why.li1.t'), desc: t('about.why.li1.d') },
                                    { title: t('about.why.li2.t'), desc: t('about.why.li2.d') },
                                    { title: t('about.why.li3.t'), desc: t('about.why.li3.d') },
                                    { title: t('about.why.li4.t'), desc: t('about.why.li4.d') }
                                ].map((item, i) => (
                                    <li key={i} className="flex gap-4">
                                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center mt-1">
                                            <span className="material-symbols-outlined text-green-500 text-sm font-bold">check</span>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-medium">{item.title}</h4>
                                            <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="bg-[#151515] p-6 rounded-3xl border border-[#302839]">
                            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">{t('about.keywords')}</h4>
                            <div className="flex flex-wrap gap-2">
                                {['AI Render', 'Thiết kế nội thất', 'Quy hoạch đô thị', 'Cải tạo nhà', 'Sketch to Image', 'Virtual Staging', 'Render 4K', 'Kiến trúc xanh', 'Nội thất Indochine'].map((tag, i) => (
                                    <span key={i} className="px-3 py-1 bg-[#1E1E1E] rounded-full text-xs text-gray-400 border border-[#302839] hover:text-white hover:border-[#7f13ec] transition-colors cursor-default">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

const CTA: React.FC<{onStart: () => void}> = ({ onStart }) => {
    const { t } = useLanguage();
    return (
        <section className="py-20 px-4">
            <div className="max-w-5xl mx-auto bg-gradient-to-r from-[#7f13ec] to-[#a855f7] rounded-3xl p-10 md:p-16 text-center relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="relative z-10">
                    <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">{t('cta.title')}</h2>
                    <p className="text-white/90 text-lg md:text-xl mb-10 max-w-2xl mx-auto">
                        {t('cta.desc')}
                    </p>
                    <button 
                        onClick={onStart}
                        className="px-10 py-4 bg-white text-[#7f13ec] font-bold rounded-full text-lg shadow-xl hover:bg-gray-100 hover:scale-105 transition-all"
                    >
                        {t('cta.button')}
                    </button>
                    <p className="mt-4 text-white/70 text-sm">{t('cta.note')}</p>
                </div>
            </div>
        </section>
    );
};

// --- FOOTER ---
const Footer: React.FC<{onStart: () => void, onNavigateToPricing?: () => void, onNavigateToTool?: (tool: Tool) => void}> = ({ onStart, onNavigateToPricing, onNavigateToTool }) => {
    const { t } = useLanguage();
    const handleNav = (tool: Tool) => {
        if (onNavigateToTool) onNavigateToTool(tool);
        else onStart();
    };

    return (
        <footer className="bg-[#050505] border-t border-[#302839] pt-16 pb-8 px-4">
            <div className="max-w-7xl auto">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
                    <div className="col-span-2 lg:col-span-2 space-y-4">
                        <div className="flex items-center gap-2">
                            <Logo className="w-8 h-8 text-[#7f13ec]" />
                            <span className="text-xl font-bold text-white">{t('app.name')}</span>
                        </div>
                        <p className="text-gray-400 text-sm max-w-xs">
                            {t('footer.desc')}
                        </p>
                        <div className="flex gap-4">
                            <a 
                                href="https://www.youtube.com/@opzenaicom" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="w-10 h-10 bg-[#1E1E1E] rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#FF0000] transition-all border border-[#302839] group"
                                aria-label="Opzen AI Youtube"
                            >
                                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                </svg>
                            </a>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-4">
                        <h3 className="font-bold text-white">{t('footer.products')}</h3>
                        <button onClick={() => handleNav(Tool.ArchitecturalRendering)} className="text-gray-400 hover:text-[#7f13ec] text-left text-sm transition-colors">{t('footer.prod_arch')}</button>
                        <button onClick={() => handleNav(Tool.InteriorRendering)} className="text-gray-400 hover:text-[#7f13ec] text-left text-sm transition-colors">{t('footer.prod_interior')}</button>
                        <button onClick={() => handleNav(Tool.Renovation)} className="text-gray-400 hover:text-[#7f13ec] text-left text-sm transition-colors">{t('footer.prod_reno')}</button>
                        <button onClick={() => handleNav(Tool.VideoGeneration)} className="text-gray-400 hover:text-[#7f13ec] text-left text-sm transition-colors">{t('footer.prod_video')}</button>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h3 className="font-bold text-white">{t('footer.resources')}</h3>
                        <button onClick={onNavigateToPricing} className="text-gray-400 hover:text-[#7f13ec] text-left text-sm transition-colors">{t('nav.pricing')}</button>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h3 className="font-bold text-white">{t('footer.legal')}</h3>
                        <a href="/terms-of-service" className="text-gray-400 hover:text-[#7f13ec] text-left text-sm transition-colors">{t('footer.terms')}</a>
                        <a href="#" className="text-gray-400 hover:text-[#7f13ec] text-left text-sm transition-colors">{t('footer.privacy')}</a>
                    </div>
                </div>
                
                <div className="pt-8 border-t border-[#302839] flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-gray-500 text-sm">{t('footer.copyright')}</p>
                </div>
            </div>
        </footer>
    );
};

export default Homepage;
