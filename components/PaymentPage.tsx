
import React, { useState, useEffect } from 'react';
import { PricingPlan } from '../types';
import { User } from '@supabase/supabase-js';
import * as paymentService from '../services/paymentService';
import Spinner from './Spinner';

interface PaymentPageProps {
    plan: PricingPlan;
    user: User;
    onBack: () => void;
    onSuccess: () => void;
}

// --- CẤU HÌNH TÀI KHOẢN NGÂN HÀNG SEPAY ---
const BANK_ID = "MB";
const ACCOUNT_NO = "3039798899"; 
const ACCOUNT_NAME = "CONG TY TNHH AUFLOW AI";

// --- CẤU HÌNH BẢO TRÌ THANH TOÁN ---
const IS_PAYMENT_MAINTENANCE = false;

// --- ICONS ---
const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
);

const ArrowLeftIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
);

const TicketIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
);

const ShieldCheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
);

const PaymentPage: React.FC<PaymentPageProps> = ({ plan, user, onBack, onSuccess }) => {
    // Flow State: 'checking_profile' -> 'ready'
    const [step, setStep] = useState<'checking_profile' | 'creating_tx' | 'ready'>('checking_profile');
    
    // User Info State
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');

    // Payment State
    const [voucherCode, setVoucherCode] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
    const [voucherError, setVoucherError] = useState<string | null>(null);
    const [isCheckingVoucher, setIsCheckingVoucher] = useState(false);
    
    const [initError, setInitError] = useState<string | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    
    // Transaction Data
    const [transactionData, setTransactionData] = useState<{id: string, code: string, amount: number} | null>(null);
    const [isPaid, setIsPaid] = useState(false);

    const originalPrice = plan.price;
    const finalPrice = Math.round(originalPrice * (1 - appliedDiscount / 100));

    // 1. Check Profile on Mount
    useEffect(() => {
        if (IS_PAYMENT_MAINTENANCE) return; // Skip if maintenance
        const checkProfile = async () => {
            setStep('checking_profile');
            try {
                const profile = await paymentService.getUserProfile(user.id);
                setFullName(profile?.full_name || user.user_metadata?.full_name || '');
                setPhoneNumber(profile?.phone || '');
            } catch (e) {
                console.warn("Could not fetch profile", e);
            }
            // Always proceed to transaction creation, making info optional
            setStep('creating_tx');
        };
        checkProfile();
    }, [user.id, user.user_metadata]);

    // 2. Create Transaction when Step is 'creating_tx'
    useEffect(() => {
        if (IS_PAYMENT_MAINTENANCE) return; // Skip if maintenance
        if (step === 'creating_tx') {
            const createTx = async () => {
                setTransactionData(null);
                setInitError(null);
                try {
                    const codeToSend = appliedDiscount > 0 ? voucherCode.trim().toUpperCase() : undefined;
                    const result = await paymentService.createPendingTransaction(
                        user.id, 
                        plan, 
                        finalPrice,
                        { name: fullName || 'Customer', phone: phoneNumber || 'N/A', email: user.email || '' },
                        codeToSend
                    );
                    
                    setTransactionData({
                        id: result.transactionId,
                        code: result.transactionCode,
                        amount: result.amount
                    });
                    setStep('ready');
                } catch (error: any) {
                    console.error("Failed to create pending transaction", error);
                    setInitError(error.message || "Không thể khởi tạo giao dịch. Vui lòng thử lại sau.");
                    if (error.message.includes("Giá dịch vụ không đồng bộ")) {
                        setTimeout(() => window.location.reload(), 2000);
                    }
                }
            };
            createTx();
        }
    }, [step, plan, finalPrice, user.id, fullName, phoneNumber, user.email, voucherCode, appliedDiscount]);

    // 3. Listen for Payment Success
    useEffect(() => {
        if (!transactionData) return;
        const unsubscribe = paymentService.subscribeToTransaction(transactionData.id, () => setIsPaid(true));
        return () => { unsubscribe(); };
    }, [transactionData]);

    // --- HANDLERS ---

    const handleApplyVoucher = async () => {
        const code = voucherCode.trim().toUpperCase();
        if (!code) {
            setVoucherError('Vui lòng nhập mã.');
            return;
        }
        setIsCheckingVoucher(true);
        setVoucherError(null);
        
        try {
            const percent = await paymentService.checkVoucher(code);
            setAppliedDiscount(percent);
            if (step === 'ready') {
                setStep('creating_tx');
            }
        } catch (err: any) {
            setVoucherError(err.message || 'Mã giảm giá không hợp lệ.');
            setAppliedDiscount(0);
        } finally {
            setIsCheckingVoucher(false);
        }
    };

    const handleRemoveVoucher = () => {
        setAppliedDiscount(0);
        setVoucherCode('');
        if (step === 'ready') {
            setStep('creating_tx');
        }
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const qrUrl = transactionData 
        ? `https://qr.sepay.vn/img?bank=${BANK_ID}&acc=${ACCOUNT_NO}&template=compact&amount=${transactionData.amount}&des=${transactionData.code}`
        : '';

    // --- MAINTENANCE VIEW ---
    if (IS_PAYMENT_MAINTENANCE) {
        return (
            <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in font-sans">
                <div className="flex items-center justify-between mb-8">
                    <button onClick={onBack} className="group flex items-center gap-2 text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white transition-colors">
                        <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                            <ArrowLeftIcon />
                        </div>
                        <span className="font-medium">Quay lại</span>
                    </button>
                </div>
                <div className="flex flex-col items-center justify-center min-h-[400px] bg-surface dark:bg-[#1A1A1A] rounded-3xl p-8 border border-border-color dark:border-gray-700 shadow-xl text-center">
                    <div className="w-24 h-24 bg-yellow-500/10 rounded-full flex items-center justify-center mb-6 shadow-inner border border-yellow-500/20">
                        <span className="material-symbols-outlined text-yellow-500 text-5xl">engineering</span>
                    </div>
                    <h2 className="text-3xl font-bold text-text-primary dark:text-white mb-4">Hệ thống thanh toán đang bảo trì</h2>
                    <p className="text-text-secondary dark:text-gray-400 max-w-lg text-lg leading-relaxed mb-6">Chúng tôi đang thực hiện nâng cấp cổng thanh toán để mang lại trải nghiệm tốt hơn và an toàn hơn cho bạn.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in font-sans">
            <div className="flex items-center justify-between mb-8">
                <button 
                    onClick={onBack} 
                    className="group flex items-center gap-2 text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white transition-colors"
                >
                    <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                        <ArrowLeftIcon />
                    </div>
                    <span className="font-medium">Quay lại</span>
                </button>
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-full border border-green-200 dark:border-green-800">
                    <ShieldCheckIcon />
                    <span className="font-semibold">Thanh toán bảo mật</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-surface dark:bg-[#1A1A1A] rounded-3xl p-1 border border-border-color dark:border-gray-700 shadow-xl relative overflow-hidden min-h-[500px] flex flex-col">
                        {isPaid && (
                            <div className="absolute inset-0 bg-surface/95 dark:bg-[#1A1A1A]/95 backdrop-blur-md z-30 flex flex-col items-center justify-center text-center p-8 animate-fade-in">
                                <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
                                    <svg className="w-12 h-12 text-green-500 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h2 className="text-3xl font-bold text-text-primary dark:text-white mb-3">Thanh toán thành công!</h2>
                                <p className="text-text-secondary dark:text-gray-300 mb-8 text-lg">Credits đã được cộng vào tài khoản. Chúc bạn sáng tạo vui vẻ!</p>
                                <button onClick={onSuccess} className="px-8 py-4 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold rounded-xl transition-all shadow-lg transform hover:-translate-y-1">Bắt đầu sử dụng ngay</button>
                            </div>
                        )}

                        <div className="p-6 md:p-8 bg-main-bg dark:bg-[#121212] rounded-[20px] flex-grow flex flex-col">
                            {step === 'checking_profile' || step === 'creating_tx' ? (
                                <div className="flex-grow flex flex-col items-center justify-center text-gray-400">
                                    <Spinner />
                                    <p className="mt-4 text-sm animate-pulse">{step === 'checking_profile' ? 'Đang kiểm tra...' : 'Đang tạo giao dịch...'}</p>
                                </div>
                            ) : (
                                <div className="animate-fade-in">
                                    <h1 className="text-2xl font-bold text-text-primary dark:text-white mb-6">Thông tin chuyển khoản</h1>
                                    <div className="flex flex-col md:flex-row gap-8">
                                        <div className="flex flex-col items-center justify-center space-y-4">
                                            <div className="bg-white p-4 rounded-2xl shadow-md border border-gray-200 w-60 h-60 flex items-center justify-center relative overflow-hidden">
                                                {initError ? (
                                                    <div className="flex flex-col items-center text-red-500 text-center px-4">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        <span className="text-xs font-medium">Lỗi tạo mã.</span>
                                                    </div>
                                                ) : !qrUrl ? (
                                                    <Spinner />
                                                ) : (
                                                    <img src={qrUrl} alt="QR Code" className="w-full h-full object-contain" />
                                                )}
                                            </div>
                                            <p className="text-sm text-text-secondary dark:text-gray-400 text-center">Mở App Ngân hàng để quét mã</p>
                                        </div>
                                        <div className="flex-1 space-y-5">
                                            <div className="bg-gradient-to-br from-[#2c1f4a] to-[#1a1025] rounded-2xl p-6 border border-[#7f13ec]/20 shadow-inner relative overflow-hidden">
                                                <div className="relative z-10">
                                                    <p className="text-purple-200 text-xs uppercase font-semibold mb-1">Ngân hàng</p>
                                                    <p className="text-white text-xl font-bold mb-4">{BANK_ID}</p>
                                                    <p className="text-purple-200 text-xs uppercase font-semibold mb-1">Số tài khoản</p>
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <p className="text-white text-2xl font-mono font-bold">{ACCOUNT_NO}</p>
                                                        <button onClick={() => copyToClipboard(ACCOUNT_NO, 'acc')} className="text-purple-300 hover:text-white p-1.5 hover:bg-white/10 rounded-lg">{copiedField === 'acc' ? <CheckIcon /> : <CopyIcon />}</button>
                                                    </div>
                                                    <p className="text-purple-200 text-xs uppercase font-semibold mb-1">Chủ tài khoản</p>
                                                    <p className="text-white font-medium uppercase">{ACCOUNT_NAME}</p>
                                                </div>
                                            </div>
                                            <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 rounded-xl p-4">
                                                <p className="text-xs text-yellow-800 dark:text-yellow-500 font-bold uppercase mb-1">Nội dung chuyển khoản</p>
                                                <div className="flex items-center justify-between bg-white dark:bg-black/20 p-3 rounded-lg border border-yellow-100">
                                                    <span className="text-lg font-mono font-bold text-yellow-900 dark:text-yellow-400">{transactionData?.code}</span>
                                                    <button onClick={() => transactionData && copyToClipboard(transactionData.code, 'code')} className="text-yellow-600 font-bold text-xs">{copiedField === 'code' ? 'Đã chép' : 'Sao chép'}</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-8 pt-6 border-t border-border-color dark:border-gray-800 flex flex-col items-center gap-3">
                                         <div className="flex items-center gap-3 text-sm text-text-secondary dark:text-gray-400 bg-surface dark:bg-gray-800 px-5 py-2.5 rounded-full border border-border-color shadow-sm animate-pulse">
                                            <Spinner /> <span>Đang chờ ngân hàng xác nhận...</span>
                                         </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-surface dark:bg-[#1A1A1A] rounded-3xl p-6 md:p-8 border border-border-color dark:border-gray-700 shadow-lg sticky top-24">
                        <h2 className="text-xl font-bold text-text-primary dark:text-white mb-6">Chi tiết đơn hàng</h2>
                        <div className="flex items-start gap-4 mb-6 pb-6 border-b border-border-color dark:border-gray-700">
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#7f13ec] to-[#a855f7] flex items-center justify-center text-white shadow-lg flex-shrink-0"><span className="material-symbols-outlined">diamond</span></div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-lg text-text-primary dark:text-white">{plan.name}</h3>
                                        <p className="text-sm text-text-secondary dark:text-gray-400">{(plan.credits || 0).toLocaleString()} Credits</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-text-primary dark:text-white">{new Intl.NumberFormat('vi-VN').format(originalPrice)} ₫</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="text-sm font-medium text-text-secondary dark:text-gray-400 mb-2 block flex items-center gap-1"><TicketIcon /> Mã giảm giá</label>
                            <div className="relative flex items-center">
                                <input type="text" placeholder="Nhập mã..." value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} className="w-full bg-main-bg dark:bg-gray-800 border border-border-color rounded-xl pl-4 pr-24 py-3 text-sm focus:ring-2 focus:ring-[#7f13ec] outline-none uppercase text-text-primary dark:text-white font-medium" disabled={appliedDiscount > 0} />
                                <div className="absolute right-1.5">
                                    {appliedDiscount > 0 ? (
                                        <button onClick={handleRemoveVoucher} className="bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold">Xóa</button>
                                    ) : (
                                        <button onClick={handleApplyVoucher} disabled={isCheckingVoucher || !voucherCode.trim()} className="bg-[#7f13ec] text-white px-4 py-1.5 rounded-lg text-xs font-bold">{isCheckingVoucher ? <Spinner /> : 'Áp dụng'}</button>
                                    )}
                                </div>
                            </div>
                            {appliedDiscount > 0 && <div className="mt-2 text-xs text-green-600 font-medium">✓ Đã giảm {appliedDiscount}%</div>}
                            {voucherError && <p className="text-xs text-red-500 mt-2">{voucherError}</p>}
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between text-sm text-text-secondary dark:text-gray-400"><span>Tạm tính</span><span>{new Intl.NumberFormat('vi-VN').format(originalPrice)} ₫</span></div>
                            {appliedDiscount > 0 && <div className="flex justify-between text-sm text-green-600 font-medium"><span>Giảm giá</span><span>- {new Intl.NumberFormat('vi-VN').format(Math.round(originalPrice * appliedDiscount / 100))} ₫</span></div>}
                            <div className="border-t border-border-color dark:border-gray-700 my-4"></div>
                            <div className="flex justify-between items-center"><span className="font-bold text-lg text-text-primary dark:text-white">Tổng thanh toán</span><span className="font-bold text-2xl text-[#7f13ec]">{new Intl.NumberFormat('vi-VN').format(finalPrice)} ₫</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentPage;
