
import React, { useState } from 'react';
import { PricingPlan, UserStatus } from '../types';
import { Logo } from './common/Logo';
import { plansVI, plansEN } from '../constants/plans';
import { Session } from '@supabase/supabase-js';
import { useLanguage } from '../hooks/useLanguage';
import { supabase } from '../services/supabaseClient';
import * as paymentService from '../services/paymentService';
import Spinner from './Spinner';

// --- CẤU HÌNH BẢO TRÌ THANH TOÁN ---
const IS_PAYMENT_MAINTENANCE = false;

// --- ICONS ---
const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 dark:text-green-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
);

// Helper to determine plan tier level
const getPlanTier = (planId?: string) => {
    if (!planId) return 0;
    
    // Tier 1: Starter / Weekly
    if (planId === 'plan_starter' || planId === 'plan_global_weekly') return 1;
    
    // Tier 2: Pro / Monthly
    if (planId === 'plan_pro' || planId === 'plan_global_monthly') return 2;
    
    // Tier 3: Ultra / Yearly
    if (planId === 'plan_ultra' || planId === 'plan_global_yearly') return 3;
    
    return 0; // Unknown or Credit pack
};

interface PublicPricingProps {
    onGoHome: () => void;
    onAuthNavigate: (mode: 'login' | 'signup') => void;
    onPlanSelect?: (plan: PricingPlan) => void;
    session?: Session | null;
    userStatus?: UserStatus | null;
    onDashboardNavigate?: () => void;
    onSignOut?: () => void;
}

const PublicPricing: React.FC<PublicPricingProps> = ({ onGoHome, onAuthNavigate, onPlanSelect, session, userStatus, onDashboardNavigate, onSignOut }) => {
    const { t, language } = useLanguage();
    const [redirectingPlanId, setRedirectingPlanId] = useState<string | null>(null);
    
    // Select plan list based on language
    const activePlans = language === 'vi' ? plansVI : plansEN;
    
    const processPlanSelection = async (plan: PricingPlan) => {
        // Polar.sh Integration for International Payments
        if (plan.paymentLink) {
            setRedirectingPlanId(plan.id);
            
            // 1. Try to get user from prop first (fastest)
            let currentUser = session?.user ?? null;

            // 2. If not found, fetch from Supabase (fallback)
            if (!currentUser) {
                const { data } = await supabase.auth.getUser();
                currentUser = data.user;
            }

            // Require Login for Polar to ensure email tracking
            if (!currentUser || !currentUser.email) {
                setRedirectingPlanId(null);
                onAuthNavigate('signup');
                return;
            }

            // 3. Construct URL robustly with MULTIPLE email parameters to guarantee pre-fill
            try {
                const urlObj = new URL(plan.paymentLink);
                const email = currentUser.email;
                
                // Add all common variations to ensure one hits the target
                urlObj.searchParams.set('email', email);
                urlObj.searchParams.set('customer_email', email);
                urlObj.searchParams.set('prefilled_email', email);
                urlObj.searchParams.set('checkout_email', email);
                
                console.log("Redirecting to Polar:", urlObj.toString());
                window.location.href = urlObj.toString();
            } catch (e) {
                // Fallback for invalid URLs in config
                console.error("Invalid Payment URL", e);
                window.location.href = plan.paymentLink;
            }
            return;
        }
        
        // Banking flow (Vietnam)
        if (onPlanSelect) {
            onPlanSelect(plan);
        } else {
            onAuthNavigate('signup');
        }
    };

    const handlePlanClick = async (plan: PricingPlan) => {
        if (IS_PAYMENT_MAINTENANCE) return;
        await processPlanSelection(plan);
    };

    // Calculate tiers
    const currentTier = getPlanTier(userStatus?.activePlanId);

    return (
        <div className="bg-[#121212] font-display text-[#EAEAEA] min-h-screen flex flex-col relative">
            <style>{`
                .gradient-button {
                    background-image: linear-gradient(to right, #8A2BE2, #DA70D6);
                }
                .gradient-button:hover {
                    opacity: 0.9;
                }
                @keyframes scale-up {
                    0% { transform: scale(0.95); opacity: 0; }
                    100% { transform: scale(1); opacity: 1; }
                }
                .animate-scale-up { animation: scale-up 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            `}</style>

            {/* HEADER */}
            <header className="flex items-center justify-between px-4 sm:px-10 md:px-20 py-4 sticky top-0 bg-[#121212]/80 backdrop-blur-sm z-50 border-b border-[#302839]">
                <div className="flex items-center gap-2 cursor-pointer" onClick={onGoHome}>
                    <Logo className="w-12 h-12 text-[#7f13ec]" />
                    <h2 className="text-white text-2xl font-bold">OPZEN AI</h2>
                </div>
                <div className="flex items-center gap-6">
                    {session ? (
                        <>
                            <div className="hidden sm:flex items-center gap-3">
                                {userStatus && (
                                    <span className="text-xs font-bold text-[#DA70D6] bg-[#2a1a35] px-3 py-1.5 rounded-full border border-[#DA70D6]/30">
                                        {userStatus.credits} Credits
                                    </span>
                                )}
                                <span className="text-white text-sm font-medium truncate max-w-[150px]">
                                    {session.user.user_metadata?.full_name || session.user.email}
                                </span>
                            </div>
                            <button 
                                onClick={onDashboardNavigate} 
                                className="bg-white text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
                            >
                                Dashboard
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => onAuthNavigate('login')} className="text-white/80 hover:text-white text-sm font-medium">{t('nav.login')}</button>
                            <button 
                                onClick={() => onAuthNavigate('signup')}
                                className="hidden sm:flex bg-white text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
                            >
                                {t('nav.signup')}
                            </button>
                        </>
                    )}
                </div>
            </header>

            <main className="flex-grow px-4 sm:px-10 py-16 max-w-[1200px] mx-auto w-full">
                <div className="text-center mb-16">
                    <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">{t('pricing.title')}</h1>
                    <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                        {t('pricing.subtitle')}
                    </p>
                </div>

                {/* PRICING GRID */}
                <div className={`grid grid-cols-1 md:grid-cols-2 ${activePlans.length >= 3 ? 'lg:grid-cols-3' : ''} ${activePlans.length === 4 ? 'xl:grid-cols-4' : ''} gap-4 lg:gap-6 items-stretch mb-20`}>
                    {activePlans.map((plan) => {
                        const discountPercent = plan.originalPrice 
                            ? Math.round(((plan.originalPrice - plan.price) / plan.originalPrice) * 100) 
                            : 0;
                        
                        // Locale for currency formatting
                        const locale = language === 'vi' ? 'vi-VN' : 'en-US';

                        // Logic for Credit Booster: Only active if user has an active subscription date
                        const isCreditPlan = plan.type === 'credit';
                        // Check if subscriptionEnd exists and is not expired. Null means no sub (new user/forever free).
                        const hasValidSubscription = userStatus && userStatus.subscriptionEnd && !userStatus.isExpired;
                        
                        // Logic for Subscription Tiering
                        const targetTier = getPlanTier(plan.id);
                        const isSubscription = plan.type === 'subscription';
                        
                        let isButtonDisabled = false;
                        let buttonText = t('pricing.select_plan');

                        // 1. Credit Plan Rules
                        if (isCreditPlan) {
                            if (!session) {
                                // Guest needs to login first, but technically we allow clicking to trigger auth
                                buttonText = t('pricing.select_plan');
                            } else if (!hasValidSubscription) {
                                isButtonDisabled = true;
                                buttonText = language === 'vi' ? 'Cần có Gói d.vụ' : 'Requires Active Plan';
                            }
                        } 
                        // 2. Subscription Plan Rules (Only if logged in and has active sub)
                        else if (isSubscription && session && currentTier > 0) {
                            if (targetTier === currentTier) {
                                isButtonDisabled = true;
                                buttonText = language === 'vi' ? 'Gói hiện tại' : 'Current Plan';
                            } else if (targetTier < currentTier) {
                                isButtonDisabled = true;
                                buttonText = language === 'vi' ? 'Đã ở gói cao hơn' : 'Already on Higher Plan';
                            } else {
                                // Upgrade
                                buttonText = language === 'vi' ? 'Nâng cấp' : 'Upgrade';
                            }
                        }

                        const isRedirecting = redirectingPlanId === plan.id;

                        return (
                            <div 
                                key={plan.id}
                                className={`relative flex flex-col h-full p-6 md:p-4 lg:p-6 rounded-2xl transition-all duration-300 border group ${
                                    plan.highlight 
                                        ? 'bg-[#191919] border-[#7f13ec] shadow-2xl shadow-[#7f13ec]/20 z-10' 
                                        : 'bg-[#191919]/50 border-[#302839] hover:border-[#7f13ec]/50'
                                }`}
                            >
                                {plan.highlight && (
                                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                                        <span className="bg-gradient-to-r from-[#8A2BE2] to-[#DA70D6] text-white text-xs uppercase font-bold px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">
                                            {t('pricing.popular')}
                                        </span>
                                    </div>
                                )}
                                
                                <div className="text-center mb-4 md:mb-6">
                                    <h3 className="text-xl md:text-lg lg:text-2xl font-bold text-white mb-2">{plan.name}</h3>
                                    <p className="text-gray-400 text-sm md:text-xs lg:text-sm min-h-[60px] flex items-center justify-center px-2">{plan.description}</p>
                                </div>

                                <div className="text-center mb-6 md:mb-8 relative">
                                    <div className="flex flex-col items-center justify-end min-h-[110px] pb-2">
                                        {plan.originalPrice ? (
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="text-gray-500 line-through text-xl md:text-lg lg:text-xl decoration-gray-500/50 font-semibold">
                                                    {new Intl.NumberFormat(locale, { style: 'decimal', minimumFractionDigits: language === 'vi' ? 0 : 2 }).format(plan.originalPrice)} {plan.currency}
                                                </span>
                                                <span className="bg-red-500/10 text-red-400 text-sm md:text-xs lg:text-sm font-extrabold px-3 py-1 rounded-full border border-red-500/20 shadow-sm">
                                                    -{discountPercent}%
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="h-[36px] md:h-[32px] lg:h-[36px] mb-1.5"></div> 
                                        )}
                                        <div className="flex justify-center items-start">
                                            <span className="text-4xl md:text-3xl lg:text-5xl font-extrabold text-white tracking-tight">
                                                {language === 'vi' ? '' : plan.currency}
                                                {new Intl.NumberFormat(locale, { style: 'decimal', minimumFractionDigits: language === 'vi' ? 0 : 2 }).format(plan.price)}
                                            </span>
                                            {language === 'vi' && <span className="text-base md:text-sm lg:text-lg text-gray-400 font-medium mt-2 ml-1.5">{plan.currency}</span>}
                                        </div>
                                        <p className="text-gray-500 text-xs font-medium mt-2">
                                            {plan.type === 'subscription' ? t('pricing.subscription') : t('pricing.one_time')}
                                        </p>
                                    </div>
                                    
                                    <div className="mt-4 md:mt-6 border-t border-[#302839] pt-4 md:pt-6">
                                        <div className="inline-flex items-center justify-center gap-1.5 md:gap-1 lg:gap-1.5 xl:gap-2 bg-[#2a1a35] text-[#DA70D6] px-2 py-2.5 md:px-1.5 md:py-2 lg:px-3 lg:py-2.5 rounded-xl border border-[#DA70D6]/30 w-full whitespace-nowrap overflow-hidden">
                                            <span className="text-[10px] md:text-[9px] lg:text-[10px] xl:text-[11px] uppercase tracking-wide font-semibold opacity-90 flex-shrink-0">{t('pricing.get_now')}</span>
                                            <span className="text-lg md:text-sm lg:text-base xl:text-lg font-bold truncate">{new Intl.NumberFormat('en-US').format(plan.credits || 0)} Credits</span>
                                        </div>
                                    </div>
                                </div>

                                <ul className="space-y-4 md:space-y-2 lg:space-y-4 mb-8 flex-grow">
                                    {plan.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-start gap-3 md:gap-2 lg:gap-3 text-gray-300 text-sm md:text-xs lg:text-sm">
                                            <div className="mt-0.5 p-0.5 rounded-full bg-green-500/10 text-green-400">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 md:h-3 md:w-3 lg:h-3.5 lg:w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <span className="leading-tight">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <button 
                                    onClick={() => !isButtonDisabled && handlePlanClick(plan)}
                                    disabled={IS_PAYMENT_MAINTENANCE || isButtonDisabled || isRedirecting}
                                    className={`w-full font-bold py-3.5 px-6 md:py-2.5 md:px-4 lg:py-3.5 lg:px-6 rounded-xl transition-all duration-300 shadow-lg text-sm md:text-xs lg:text-sm flex justify-center items-center gap-2 ${
                                        IS_PAYMENT_MAINTENANCE
                                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed' 
                                            : isButtonDisabled 
                                                ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-600'
                                                : (plan.highlight 
                                                    ? 'gradient-button text-white hover:shadow-purple-500/25 hover:-translate-y-0.5' 
                                                    : 'bg-white text-black hover:bg-gray-200 hover:-translate-y-0.5')
                                    }`}
                                >
                                    {isRedirecting ? (
                                        <>
                                            <Spinner /> {t('common.processing')}
                                        </>
                                    ) : (
                                        IS_PAYMENT_MAINTENANCE 
                                            ? t('pricing.maintenance') 
                                            : buttonText
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* FAQ SECTION */}
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 text-center">{t('pricing.faq_title')}</h2>
                    <div className="space-y-4">
                        <div className="bg-[#191919] p-6 rounded-xl border border-[#302839]">
                            <h3 className="font-bold text-white mb-2">{t('faq.q1')}</h3>
                            <p className="text-gray-400 text-sm">{t('faq.a1')}</p>
                        </div>
                        <div className="bg-[#191919] p-6 rounded-xl border border-[#302839]">
                            <h3 className="font-bold text-white mb-2">{t('faq.q2')}</h3>
                            <p className="text-gray-400 text-sm">{t('faq.a2')}</p>
                        </div>
                    </div>
                </div>
            </main>

            {/* FOOTER */}
            <footer className="mt-16 border-t border-[#302839] py-12 px-4 bg-[#121212]">
                <div className="max-w-[1200px] mx-auto text-center">
                    <div className="flex items-center justify-center gap-2 mb-4">
                        <Logo className="w-10 h-10 text-[#7f13ec]" />
                        <h2 className="text-white text-xl font-bold">OPZEN AI</h2>
                    </div>
                    <p className="text-gray-500 text-sm">{t('footer.copyright')}</p>
                </div>
            </footer>
        </div>
    );
};

export default PublicPricing;