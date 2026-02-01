
import React, { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { Transaction } from '../types';
import * as paymentService from '../services/paymentService';
import Spinner from './Spinner';
import { useLanguage } from '../hooks/useLanguage';

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 md:h-20 md:w-20 text-gray-400 bg-gray-200 rounded-full p-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const GiftIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 5a3 3 0 015-2.236A3 3 0 0114.83 6H16a2 2 0 110 4h-5V9a1 1 0 10-2 0v1H4a2 2 0 110-4h1.17C5.06 5.687 5 5.35 5 5zm4 1V5a1 1 0 10-1 1h1zm3 0a1 1 0 10-1-1v1h1z" clipRule="evenodd" />
        <path d="M9 11H3v5a2 2 0 002 2h4v-7zM11 18h4a2 2 0 002-2v-5h-6v7z" />
    </svg>
);

const CoinIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

interface UserProfileProps {
    session: Session;
    initialTab?: 'profile' | 'history';
    onTabChange: (tab: 'profile' | 'history') => void;
    onPurchaseSuccess?: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ session, initialTab = 'profile', onTabChange, onPurchaseSuccess }) => {
    const { t, language } = useLanguage();
    const [activeTab, setActiveTab] = useState<'profile' | 'history'>(initialTab);
    
    // History State
    const [transactionHistory, setTransactionHistory] = useState<Transaction[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Giftcode State
    const [giftCode, setGiftCode] = useState('');
    const [isRedeeming, setIsRedeeming] = useState(false);
    const [redeemStatus, setRedeemStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
    
    // Additional User Info State
    const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        if (activeTab === 'history') {
            loadHistory();
        }
    }, [activeTab]);
    
    useEffect(() => {
        const loadUserStatus = async () => {
            const status = await paymentService.getUserStatus(session.user.id);
            setSubscriptionEnd(status.subscriptionEnd);
        };
        loadUserStatus();
    }, [session.user.id]);

    const loadHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const history = await paymentService.getTransactionHistory();
            setTransactionHistory(history);
        } catch (error) {
            console.error("Failed to load transactions", error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleTabClick = (tab: 'profile' | 'history') => {
        setActiveTab(tab);
        onTabChange(tab);
    };

    const handleRedeemCode = async () => {
        if (!giftCode.trim()) return;
        
        setIsRedeeming(true);
        setRedeemStatus(null);

        try {
            const creditsAdded = await paymentService.redeemGiftCode(session.user.id, giftCode);
            setRedeemStatus({
                type: 'success',
                msg: language === 'vi' 
                    ? `Thành công! Bạn đã nhận được ${creditsAdded} credits.`
                    : `Success! You received ${creditsAdded} credits.`
            });
            setGiftCode('');
            // Update expiration date locally if giftcode extended it
            const status = await paymentService.getUserStatus(session.user.id);
            setSubscriptionEnd(status.subscriptionEnd);
            
            if (onPurchaseSuccess) onPurchaseSuccess(); // Refresh credits in header
        } catch (err: any) {
            setRedeemStatus({
                type: 'error',
                msg: err.message || (language === 'vi' ? "Mã không hợp lệ hoặc lỗi hệ thống." : "Invalid code or system error.")
            });
        } finally {
            setIsRedeeming(false);
        }
    };

    // Profile Data
    const userEmail = session.user.email;
    const userName = session.user.user_metadata?.full_name || t('header.account');
    
    let joinDate = 'N/A';
    try {
        joinDate = new Date(session.user.created_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US');
    } catch (e) {
        console.error("Invalid join date", e);
    }

    const expirationDateString = subscriptionEnd 
        ? new Date(subscriptionEnd).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') 
        : t('header.forever');

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full lg:max-h-[calc(100vh-100px)]">
            {/* Sidebar */}
            <div className="w-full lg:w-1/4 bg-surface dark:bg-[#1A1A1A] rounded-2xl shadow-sm border border-border-color dark:border-[#302839] p-6 flex flex-col items-center text-center h-fit flex-shrink-0">
                <div className="mb-4">
                    <UserIcon />
                </div>
                <h2 className="text-xl font-bold text-text-primary dark:text-white truncate w-full">{userName}</h2>
                <p className="text-sm text-text-secondary dark:text-gray-400 mb-6 truncate w-full">{userEmail}</p>
                
                {/* Mobile: Horizontal Scroll, Desktop: Vertical Stack */}
                <div className="w-full flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-hide">
                    <button 
                        onClick={() => handleTabClick('profile')}
                        className={`flex-1 lg:w-full text-center lg:text-left px-4 py-2.5 rounded-xl transition-all whitespace-nowrap text-sm font-bold ${activeTab === 'profile' ? 'bg-[#7f13ec] text-white shadow-lg' : 'text-text-secondary dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                        {t('profile.tab_info')}
                    </button>
                    
                    <button 
                        onClick={() => handleTabClick('history')}
                        className={`flex-1 lg:w-full text-center lg:text-left px-4 py-2.5 rounded-xl transition-all whitespace-nowrap text-sm font-bold ${activeTab === 'history' ? 'bg-[#7f13ec] text-white shadow-lg' : 'text-text-secondary dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                        {t('profile.tab_history')}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="w-full lg:w-3/4 bg-surface dark:bg-[#1A1A1A] rounded-2xl shadow-sm border border-border-color dark:border-[#302839] p-4 sm:p-6 lg:p-8 flex-grow h-full lg:overflow-y-auto custom-sidebar-scroll">
                
                {/* === TAB: PROFILE === */}
                {activeTab === 'profile' && (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h3 className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white mb-4">{t('profile.tab_info')}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 px-1">{t('profile.label.name')}</label>
                                    <input type="text" value={userName} disabled className="w-full bg-main-bg dark:bg-[#121212] border border-border-color dark:border-[#302839] rounded-xl p-3 text-sm text-text-primary dark:text-gray-300 opacity-70 font-semibold" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 px-1">{t('profile.label.email')}</label>
                                    <input type="email" value={userEmail} disabled className="w-full bg-main-bg dark:bg-[#121212] border border-border-color dark:border-[#302839] rounded-xl p-3 text-sm text-text-primary dark:text-gray-300 opacity-70 font-semibold" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 px-1">{t('profile.label.joined')}</label>
                                    <input type="text" value={joinDate} disabled className="w-full bg-main-bg dark:bg-[#121212] border border-border-color dark:border-[#302839] rounded-xl p-3 text-sm text-text-primary dark:text-gray-300 opacity-70 font-semibold" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 px-1">{t('profile.label.expired')}</label>
                                    <input type="text" value={expirationDateString} disabled className="w-full bg-main-bg dark:bg-[#121212] border border-border-color dark:border-[#302839] rounded-xl p-3 text-sm text-text-primary dark:text-gray-300 opacity-70 font-bold text-[#7f13ec]" />
                                </div>
                            </div>
                        </div>

                        {/* GIFT CODE SECTION */}
                        <div className="pt-6 border-t border-border-color dark:border-[#302839]">
                            <div className="bg-[#7f13ec]/5 dark:bg-[#7f13ec]/10 p-5 sm:p-6 rounded-2xl border border-[#7f13ec]/20">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="bg-white dark:bg-black/20 p-2 rounded-xl shadow-sm border border-[#7f13ec]/20">
                                        <div className="text-[#7f13ec]"><GiftIcon /></div>
                                    </div>
                                    <h4 className="font-extrabold text-lg text-text-primary dark:text-white">{t('profile.gift.title')}</h4>
                                </div>
                                
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <input 
                                        type="text" 
                                        value={giftCode}
                                        onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
                                        placeholder={t('profile.gift.placeholder')}
                                        className="flex-grow bg-white dark:bg-[#121212] border border-border-color dark:border-[#302839] rounded-xl p-3 text-sm text-text-primary dark:text-white focus:ring-2 focus:ring-[#7f13ec]/50 outline-none uppercase placeholder:normal-case font-bold"
                                        disabled={isRedeeming}
                                    />
                                    <button 
                                        onClick={handleRedeemCode}
                                        disabled={!giftCode.trim() || isRedeeming}
                                        className="bg-[#7f13ec] hover:bg-[#690fca] disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                                    >
                                        {isRedeeming ? <Spinner /> : t('profile.gift.apply')}
                                    </button>
                                </div>
                                
                                {redeemStatus && (
                                    <div className={`mt-4 text-xs sm:text-sm font-bold flex items-center gap-2 p-3 rounded-lg border ${redeemStatus.type === 'success' ? 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
                                        <span className="material-symbols-outlined text-base">info</span>
                                        {redeemStatus.msg}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-6 border-t border-border-color dark:border-[#302839]">
                            <h4 className="font-bold text-text-primary dark:text-white mb-3">{t('profile.security.title')}</h4>
                            <button className="px-5 py-2.5 bg-gray-100 dark:bg-[#252525] hover:bg-gray-200 dark:hover:bg-[#333] text-text-primary dark:text-gray-300 rounded-xl transition-all text-sm font-bold border border-border-color dark:border-[#302839]">
                                {t('profile.security.change_pass')}
                            </button>
                        </div>
                    </div>
                )}

                {/* === TAB: HISTORY === */}
                {activeTab === 'history' && (
                    <div className="space-y-6 animate-fade-in">
                        <h3 className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white mb-4">{t('profile.tab_history')}</h3>
                        
                        {isLoadingHistory ? (
                             <div className="flex justify-center py-10"><Spinner /></div>
                        ) : transactionHistory.length === 0 ? (
                             <div className="text-center py-12 bg-gray-50 dark:bg-black/20 rounded-2xl border-2 border-dashed border-border-color dark:border-[#302839]">
                                <span className="material-symbols-outlined text-4xl text-gray-400 mb-2">history</span>
                                <p className="text-text-secondary dark:text-gray-400 text-sm font-medium">{t('profile.history.empty')}</p>
                             </div>
                        ) : (
                            <div className="overflow-x-auto rounded-2xl border border-border-color dark:border-[#302839]">
                                <table className="w-full text-xs sm:text-sm text-left text-text-secondary dark:text-gray-400">
                                    <thead className="text-[10px] sm:text-xs text-text-primary uppercase bg-gray-100 dark:bg-[#252525] dark:text-gray-300 font-bold border-b border-border-color dark:border-[#302839]">
                                        <tr>
                                            <th scope="col" className="px-4 sm:px-6 py-4 whitespace-nowrap">{t('profile.table.code')}</th>
                                            <th scope="col" className="px-4 sm:px-6 py-4 whitespace-nowrap">{t('profile.table.service')}</th>
                                            <th scope="col" className="px-4 sm:px-6 py-4 whitespace-nowrap">{t('profile.table.amount')}</th>
                                            <th scope="col" className="px-4 sm:px-6 py-4 whitespace-nowrap">{t('profile.table.date')}</th>
                                            <th scope="col" className="px-4 sm:px-6 py-4 whitespace-nowrap">{t('profile.table.status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color dark:divide-[#302839]">
                                        {transactionHistory.map((tx) => (
                                            <tr key={tx.id} className="bg-white dark:bg-[#1A1A1A] hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors">
                                                <td className="px-4 sm:px-6 py-4 font-mono text-[10px] sm:text-xs font-bold whitespace-nowrap text-text-primary dark:text-gray-300">{tx.transaction_code || tx.id.substring(0, 8)}</td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap font-medium text-text-primary dark:text-gray-200">
                                                    {tx.plan_name}
                                                    {tx.payment_method === 'giftcode' && (
                                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                                                            Giftcode
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap font-bold text-text-primary dark:text-white">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}</td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">{new Date(tx.created_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')}</td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                                    <span className={`text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full border ${
                                                        tx.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' :
                                                        tx.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800' :
                                                        'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                                                    }`}>
                                                        {tx.status === 'completed' ? t('profile.status.success') : tx.status === 'pending' ? t('profile.status.pending') : t('profile.status.failed')}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserProfile;
