
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
    // Flow State: 'checking_profile' -> 'input_info' -> 'creating_tx' -> 'ready'
    const [step, setStep] = useState<'checking_profile' | 'input_info' | 'creating_tx' | 'ready'>('checking_profile');
    
    // User Info State
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [infoError, setInfoError] = useState<string | null>(null);
    const [isUpdatingInfo, setIsUpdatingInfo] = useState(false);

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
        const checkProfile = async () => {
            setStep('checking_profile');
            const profile = await paymentService.getUserProfile(user.id);
            if (profile && profile.full_name && profile.phone) {
                setFullName(profile.full_name);
                setPhoneNumber(profile.phone);
                setStep('creating_tx'); // Profile OK, proceed to create TX
            } else {
                setStep('input_info'); // Profile incomplete, show form
            }
        };
        checkProfile();
    }, [user.id]);

    // 2. Create Transaction when Step is 'creating_tx'
    useEffect(() => {
        if (step === 'creating_tx') {
            const createTx = async () => {
                setTransactionData(null);
                setInitError(null);
                try {
                    // Pass current user info AND EMAIL to save snapshot in transaction record
                    const result = await paymentService.createPendingTransaction(
                        user.id, 
                        plan, 
                        finalPrice,
                        { name: fullName, phone: phoneNumber, email: user.email || '' }
                    );
                    
                    setTransactionData({
                        id: result.transactionId,
                        code: result.transactionCode,
                        amount: result.amount
                    });
                    setStep('ready');
                } catch (error) {
                    console.error("Failed to create pending transaction", error);
                    setInitError("Không thể khởi tạo giao dịch. Vui lòng thử lại sau.");
                    // Keep step as creating_tx so retry might be possible or show error
                }
            };
            createTx();
        }
    }, [step, plan, finalPrice, user.id, fullName, phoneNumber, user.email]);

    // 3. Listen for Payment Success
    useEffect(() => {
        if (!transactionData) return;
        const unsubscribe = paymentService.subscribeToTransaction(transactionData.id, () => setIsPaid(true));
        return () => { unsubscribe(); };
    }, [transactionData]);

    // --- HANDLERS ---

    const handleUpdateInfo = async () => {
        if (!fullName.trim() || !phoneNumber.trim()) {
            setInfoError('Vui lòng điền đầy đủ Họ tên và Số điện thoại.');
            return;
        }
        // Simple phone regex
        if (!/^\d{9,11}$/.test(phoneNumber.trim())) {
            setInfoError('Số điện thoại không hợp lệ.');
            return;
        }

        setInfoError(null);
        setIsUpdatingInfo(true);

        try {
            await paymentService.updateUserProfile(user.id, fullName, phoneNumber);
            setStep('creating_tx'); // Profile updated, retry TX creation
        } catch (e: any) {
            setInfoError(e.message || "Lỗi cập nhật thông tin.");
        } finally {
            setIsUpdatingInfo(false);
        }
    };

    const handleApplyVoucher = async () => {
        if (!voucherCode.trim()) return;
        setVoucherError(null);
        setIsCheckingVoucher(true);
        try {
            const discount = await paymentService.checkVoucher(voucherCode.trim().toUpperCase());
            setAppliedDiscount(discount);
            // Re-create transaction with new price
            setStep('creating_tx');
        } catch (e: any) {
            setVoucherError(e.message || "Mã không hợp lệ.");
            setAppliedDiscount(0);
        } finally {
            setIsCheckingVoucher(false);
        }
    };

    const handleCopy = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    if (isPaid) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center animate-fade-in">
                <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h2 className="text-3xl font-bold text-text-primary dark:text-white mb-2">Thanh toán thành công!</h2>
                <p className="text-text-secondary dark:text-gray-400 mb-8 max-w-md">
                    Cảm ơn bạn đã đăng ký gói <strong>{plan.name}</strong>. Credits đã được cộng vào tài khoản của bạn.
                </p>
                <button 
                    onClick={onSuccess}
                    className="px-8 py-3 bg-[#7f13ec] hover:bg-[#690fca] text-white rounded-xl font-bold shadow-lg shadow-purple-500/30 transition-all transform hover:scale-105"
                >
                    Bắt đầu sử dụng
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 animate-fade-in">
            <button 
                onClick={onBack}
                className="mb-6 flex items-center gap-2 text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white transition-colors"
            >
                <ArrowLeftIcon />
                <span>Quay lại bảng giá</span>
            </button>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* LEFT COLUMN: Main Payment Area */}
                <div className="md:col-span-2 space-y-6">
                    
                    {/* Step 1: User Info Input */}
                    {step === 'input_info' && (
                        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl border border-border-color dark:border-[#302839] p-6 shadow-sm">
                            <h3 className="text-xl font-bold text-text-primary dark:text-white mb-4">Thông tin khách hàng</h3>
                            <p className="text-sm text-text-secondary dark:text-gray-400 mb-6">Vui lòng cung cấp thông tin để chúng tôi hỗ trợ tốt hơn khi cần thiết.</p>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-1">Họ và tên</label>
                                    <input 
                                        type="text" 
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-[#2A2A2A] border border-gray-300 dark:border-[#404040] rounded-lg p-3 text-text-primary dark:text-white focus:ring-2 focus:ring-[#7f13ec] outline-none"
                                        placeholder="Nguyễn Văn A"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-1">Số điện thoại (có Zalo)</label>
                                    <input 
                                        type="tel" 
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-[#2A2A2A] border border-gray-300 dark:border-[#404040] rounded-lg p-3 text-text-primary dark:text-white focus:ring-2 focus:ring-[#7f13ec] outline-none"
                                        placeholder="0912xxxxxx"
                                    />
                                </div>
                                {infoError && <p className="text-red-500 text-sm">{infoError}</p>}
                                <button 
                                    onClick={handleUpdateInfo}
                                    disabled={isUpdatingInfo}
                                    className="w-full bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
                                >
                                    {isUpdatingInfo ? <Spinner /> : 'Tiếp tục thanh toán'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Loading State */}
                    {(step === 'checking_profile' || step === 'creating_tx') && (
                        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl border border-border-color dark:border-[#302839] p-12 shadow-sm flex flex-col items-center justify-center text-center h-64">
                            <Spinner />
                            <p className="mt-4 text-text-secondary dark:text-gray-400">Đang khởi tạo giao dịch...</p>
                            {initError && (
                                <div className="mt-4">
                                    <p className="text-red-500 text-sm mb-2">{initError}</p>
                                    <button onClick={() => setStep('input_info')} className="text-blue-500 underline text-sm">Thử lại</button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Payment Info (QR Code) */}
                    {step === 'ready' && transactionData && (
                        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl border border-border-color dark:border-[#302839] p-6 shadow-sm animate-fade-in">
                            <h3 className="text-xl font-bold text-text-primary dark:text-white mb-6 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm">1</span>
                                Chuyển khoản ngân hàng
                            </h3>

                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                {/* QR Code */}
                                <div className="flex-shrink-0 mx-auto md:mx-0">
                                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                                        <img 
                                            src={`https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.jpg?amount=${transactionData.amount}&addInfo=${transactionData.code}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`}
                                            alt="VietQR Payment" 
                                            className="w-48 h-48 object-contain"
                                        />
                                    </div>
                                    <p className="text-center text-xs text-gray-500 mt-2">Quét mã để thanh toán nhanh</p>
                                </div>

                                {/* Bank Details */}
                                <div className="flex-grow w-full space-y-4">
                                    <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
                                        <p className="text-blue-800 dark:text-blue-200 text-sm font-medium mb-1">Nội dung chuyển khoản (Bắt buộc):</p>
                                        <div className="flex items-center gap-2">
                                            <code className="text-xl font-bold text-blue-700 dark:text-blue-300 font-mono tracking-wider">{transactionData.code}</code>
                                            <button onClick={() => handleCopy(transactionData.code, 'code')} className="text-blue-500 hover:text-blue-700 p-1">
                                                {copiedField === 'code' ? <CheckIcon /> : <CopyIcon />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                                            <span className="text-text-secondary dark:text-gray-400">Ngân hàng:</span>
                                            <span className="font-bold text-text-primary dark:text-white">MB Bank (Quân Đội)</span>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                                            <span className="text-text-secondary dark:text-gray-400">Số tài khoản:</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-text-primary dark:text-white font-mono text-lg">{ACCOUNT_NO}</span>
                                                <button onClick={() => handleCopy(ACCOUNT_NO, 'acc')} className="text-gray-400 hover:text-white">
                                                    {copiedField === 'acc' ? <CheckIcon /> : <CopyIcon />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                                            <span className="text-text-secondary dark:text-gray-400">Chủ tài khoản:</span>
                                            <span className="font-bold text-text-primary dark:text-white uppercase">{ACCOUNT_NAME}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-2">
                                            <span className="text-text-secondary dark:text-gray-400">Số tiền:</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-[#7f13ec] text-lg">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(transactionData.amount)}</span>
                                                <button onClick={() => handleCopy(transactionData.amount.toString(), 'amt')} className="text-gray-400 hover:text-white">
                                                    {copiedField === 'amt' ? <CheckIcon /> : <CopyIcon />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-border-color dark:border-[#302839]">
                                <div className="flex items-start gap-3">
                                    <div className="mt-1"><Spinner /></div>
                                    <div>
                                        <p className="text-text-primary dark:text-white font-bold text-sm">Đang chờ thanh toán...</p>
                                        <p className="text-text-secondary dark:text-gray-400 text-xs mt-1">Hệ thống sẽ tự động kích hoạt gói ngay khi nhận được tiền (thường trong 1-3 phút).</p>
                                        <p className="text-text-secondary dark:text-gray-400 text-xs">Vui lòng không tắt trình duyệt.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: Order Summary */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl border border-border-color dark:border-[#302839] p-6 shadow-sm sticky top-24">
                        <h3 className="text-lg font-bold text-text-primary dark:text-white mb-4">Đơn hàng</h3>
                        
                        <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                            <div>
                                <p className="font-bold text-text-primary dark:text-white">{plan.name} Plan</p>
                                <p className="text-xs text-text-secondary dark:text-gray-400">{plan.durationMonths} tháng</p>
                            </div>
                            <p className="font-bold text-text-primary dark:text-white">{new Intl.NumberFormat('vi-VN').format(plan.price)}đ</p>
                        </div>

                        {appliedDiscount > 0 && (
                            <div className="flex justify-between items-center mb-2 text-green-600 dark:text-green-400 text-sm">
                                <span>Mã giảm giá ({voucherCode})</span>
                                <span>-{appliedDiscount}%</span>
                            </div>
                        )}

                        <div className="flex justify-between items-center mb-6 pt-2">
                            <span className="font-bold text-text-primary dark:text-white">Tổng thanh toán</span>
                            <span className="text-2xl font-bold text-[#7f13ec]">{new Intl.NumberFormat('vi-VN').format(finalPrice)}đ</span>
                        </div>

                        {/* Voucher Input */}
                        {step !== 'ready' && (
                            <div className="mb-4">
                                <label className="block text-xs font-medium text-text-secondary dark:text-gray-400 mb-1">Mã giảm giá</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-grow">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                            <TicketIcon />
                                        </div>
                                        <input 
                                            type="text" 
                                            value={voucherCode}
                                            onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                                            className="w-full bg-gray-50 dark:bg-[#2A2A2A] border border-gray-300 dark:border-[#404040] rounded-lg pl-9 pr-3 py-2 text-sm uppercase text-text-primary dark:text-white focus:ring-2 focus:ring-[#7f13ec] outline-none"
                                            placeholder="NHAPMA"
                                            disabled={appliedDiscount > 0}
                                        />
                                    </div>
                                    <button 
                                        onClick={handleApplyVoucher}
                                        disabled={!voucherCode || isCheckingVoucher || appliedDiscount > 0}
                                        className="bg-gray-200 dark:bg-[#353535] hover:bg-gray-300 dark:hover:bg-[#404040] text-text-primary dark:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        {isCheckingVoucher ? <Spinner /> : (appliedDiscount > 0 ? 'Đã dùng' : 'Áp dụng')}
                                    </button>
                                </div>
                                {voucherError && <p className="text-red-500 text-xs mt-1">{voucherError}</p>}
                            </div>
                        )}

                        <div className="bg-green-50 dark:bg-green-900/10 p-3 rounded-lg flex items-start gap-2">
                            <ShieldCheckIcon />
                            <p className="text-xs text-green-800 dark:text-green-300 leading-relaxed">
                                <strong>Bảo mật 100%:</strong> Thông tin thanh toán được mã hóa và xử lý trực tiếp qua hệ thống ngân hàng.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentPage;
