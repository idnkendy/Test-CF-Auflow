
import React, { useEffect, useState } from 'react';
import { PricingPlan } from '../types';
import { plansVI, plansEN } from '../constants/plans';
import { useLanguage } from '../hooks/useLanguage';
import { supabase } from '../services/supabaseClient';
import * as paymentService from '../services/paymentService';
import Spinner from './Spinner';

// --- CẤU HÌNH BẢO TRÌ THANH TOÁN ---
const IS_PAYMENT_MAINTENANCE = false;

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

interface CheckoutProps {
    onPlanSelect?: (plan: PricingPlan) => void;
}

const Checkout: React.FC<CheckoutProps> = ({ onPlanSelect }) => {
    const { t, language } = useLanguage();
    const activePlans = language === 'vi' ? plansVI : plansEN;
    const locale = language === 'vi' ? 'vi-VN' : 'en-US';
    
    // Internal state to check status locally in checkout component
    const [canBuyCredits, setCanBuyCredits] = useState(false);
    const [activePlanId, setActivePlanId] = useState<string | undefined>(undefined);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [redirectingPlanId, setRedirectingPlanId] = useState<string | null>(null);

    useEffect(() => {
        const checkStatus = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const status = await paymentService.getUserStatus(user.id);
                // Can only buy booster if they have a valid subscription end date and it's not expired
                setCanBuyCredits(!!(status && status.subscriptionEnd && !status.isExpired));
                
                // Active Plan logic:
                // paymentService returns undefined activePlanId if expired.
                // We double check here to be safe.
                if (status.isExpired) {
                     setActivePlanId(undefined);
                } else {
                     setActivePlanId(status.activePlanId);
                }
            }
            setLoadingStatus(false);
        };
        checkStatus();
    }, []);

    const handleBuyClick = async (plan: PricingPlan) => {
        if (IS_PAYMENT_MAINTENANCE) return;

        // Polar.sh Integration for International Payments
        if (plan.paymentLink) {
            setRedirectingPlanId(plan.id);
            // Get current user email to pre-fill directly from Supabase
            const { data: { user } } = await supabase.auth.getUser();
            
            try {
                const urlObj = new URL(plan.paymentLink);
                if (user && user.email) {
                    const email = user.email;
                    // Add all common variations to ensure one hits the target
                    urlObj.searchParams.set('email', email);
                    urlObj.searchParams.set('customer_email', email);
                    urlObj.searchParams.set('prefilled_email', email);
                    urlObj.searchParams.set('checkout_email', email);
                }
                
                // Using window.open for internal dashboard allows keeping app open
                window.open(urlObj.toString(), '_blank');
                
                // Reset loading state after a delay (since window.open is immediate)
                setTimeout(() => setRedirectingPlanId(null), 2000);
            } catch (e) {
                // Fallback if URL parsing fails
                window.open(plan.paymentLink, '_blank');
                setRedirectingPlanId(null);
            }
            return;
        }

        if (onPlanSelect) {
            onPlanSelect(plan);
        }
    };

    const currentTier = getPlanTier(activePlanId);

    return (
        <div className="pb-6">
            <h2 className="text-xl font-bold text-text-primary dark:text-white mb-2 text-center">{t('pricing.title')}</h2>
            <p className="text-text-secondary dark:text-gray-300 mb-6 text-center text-sm max-w-xl mx-auto">{t('pricing.subtitle')}</p>

            {/* Pricing Cards */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${activePlans.length >= 3 ? 'xl:grid-cols-3' : ''} ${activePlans.length === 4 ? 'xl:grid-cols-4' : ''} gap-4 mb-8 items-stretch`}>
                {activePlans.map((plan) => {
                    const discountPercent = plan.originalPrice 
                        ? Math.round(((plan.originalPrice - plan.price) / plan.originalPrice) * 100) 
                        : 0;
                    
                    const isCreditPlan = plan.type === 'credit';
                    
                    // Logic Logic for Subscription Tiering
                    const targetTier = getPlanTier(plan.id);
                    const isSubscription = plan.type === 'subscription';
                    
                    // Logic to disable/change button text based on tier
                    let isButtonDisabled = false;
                    let buttonText = t('pricing.select_plan');
                    
                    if (isCreditPlan) {
                        // Credit pack logic: Only buyable if has active sub (not expired)
                        if (!loadingStatus && !canBuyCredits) {
                            isButtonDisabled = true;
                            buttonText = language === 'vi' ? 'Cần có Gói d.vụ' : 'Requires Active Plan';
                        }
                    } else if (isSubscription && !loadingStatus && currentTier > 0) {
                        // Subscription logic: Only check upgrades if currentTier > 0 (meaning NOT expired and HAS a plan)
                        if (targetTier === currentTier) {
                            isButtonDisabled = true;
                            buttonText = language === 'vi' ? 'Gói hiện tại' : 'Current Plan';
                        } else if (targetTier < currentTier) {
                            isButtonDisabled = true;
                            buttonText = language === 'vi' ? 'Đã ở gói cao hơn' : 'Already on Higher Plan';
                        } else {
                            // Upgrade available
                            buttonText = language === 'vi' ? 'Nâng cấp' : 'Upgrade';
                        }
                    }

                    const isRedirecting = redirectingPlanId === plan.id;

                    return (
                        <div 
                            key={plan.id}
                            className={`relative flex flex-col h-full p-6 rounded-xl transition-all duration-300 border break-words group ${
                                plan.highlight 
                                    ? 'bg-accent/5 dark:bg-accent/10 border-accent shadow-xl shadow-accent/10 z-10' 
                                    : 'bg-main-bg/50 dark:bg-dark-bg/50 border-border-color dark:border-gray-700 hover:border-accent/50'
                            }`}
                        >
                            {plan.highlight && (
                                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                                    <span className="bg-accent text-white text-[10px] uppercase font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                                        {t('pricing.popular')}
                                    </span>
                                </div>
                            )}
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-text-primary dark:text-white truncate">{plan.name}</h3>
                                <p className="text-text-secondary dark:text-gray-400 text-xs min-h-[2rem] px-2 mt-1">{plan.description}</p>
                                
                                <div className="my-4 flex flex-col justify-center items-center relative">
                                    {plan.originalPrice && (
                                        <div className="absolute -top-2 right-0 sm:right-4 translate-x-2">
                                            <span className="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800/50">
                                                -{discountPercent}%
                                            </span>
                                        </div>
                                    )}
                                    
                                    <div className="flex items-baseline gap-2">
                                        {plan.originalPrice && (
                                            <span className="text-text-secondary/60 dark:text-gray-500 line-through text-sm decoration-gray-400/50">
                                                {new Intl.NumberFormat(locale, { style: 'decimal', minimumFractionDigits: language === 'vi' ? 0 : 2 }).format(plan.originalPrice)}
                                            </span>
                                        )}
                                        <div className="flex items-start">
                                            <span className="text-3xl font-extrabold text-text-primary dark:text-white tracking-tight">
                                                {language === 'vi' ? '' : plan.currency}
                                                {new Intl.NumberFormat(locale, { style: 'decimal', minimumFractionDigits: language === 'vi' ? 0 : 2 }).format(plan.price)}
                                            </span>
                                            {language === 'vi' && <span className="text-sm font-medium text-text-secondary dark:text-gray-400 mt-1.5 ml-0.5">{plan.currency}</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mb-4 bg-gray-100 dark:bg-gray-700/30 p-3 rounded-lg text-center border border-gray-200 dark:border-gray-600">
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{t('pricing.get_now')}</p>
                                <p className="text-lg font-bold text-accent">{new Intl.NumberFormat('en-US').format(plan.credits || 0)} Credits</p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                                    {plan.type === 'subscription' ? t('pricing.subscription') : t('pricing.one_time')}
                                </p>
                            </div>

                            <ul className="space-y-2 text-text-secondary dark:text-gray-300 mb-6 flex-grow text-sm whitespace-normal">
                                {plan.features.map((feature, idx) => (
                                    <li key={idx} className="flex items-start gap-2">
                                        <div className="mt-0.5 text-green-500 dark:text-green-400">
                                            <CheckIcon />
                                        </div>
                                        <span className="text-xs sm:text-sm leading-tight">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                            
                            <button 
                                onClick={() => !isButtonDisabled && handleBuyClick(plan)}
                                disabled={IS_PAYMENT_MAINTENANCE || isButtonDisabled || isRedirecting}
                                className={`w-full font-bold py-2.5 px-4 rounded-lg transition-all duration-200 flex justify-center items-center gap-2 text-sm transform ${
                                    IS_PAYMENT_MAINTENANCE
                                        ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed' 
                                        : isButtonDisabled
                                            ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-600'
                                            : (plan.highlight 
                                                ? 'bg-accent hover:bg-accent-600 text-white shadow-lg shadow-accent/30 hover:-translate-y-0.5' 
                                                : 'bg-gray-600 hover:bg-gray-700 text-white hover:shadow-md hover:-translate-y-0.5')
                                }`}
                            >
                                {isRedirecting ? (
                                    <>
                                        <Spinner /> {t('common.processing')}
                                    </>
                                ) : (
                                    IS_PAYMENT_MAINTENANCE ? (
                                        <>
                                            <span className="material-symbols-outlined text-sm">engineering</span>
                                            <span>{t('pricing.maintenance')}</span>
                                        </>
                                    ) : buttonText
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Checkout;