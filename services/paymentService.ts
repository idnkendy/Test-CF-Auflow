
import { supabase } from './supabaseClient';
import { PricingPlan, UserStatus, Transaction } from '../types';
import { plans } from '../constants/plans'; // Source of Truth for pricing
import { BACKEND_URL } from './config';

// Helper để lấy quốc gia từ IP
const detectCountry = async (): Promise<string> => {
    try {
        // Sử dụng api.country.is (miễn phí, nhanh)
        const res = await fetch('https://api.country.is');
        if (res.ok) {
            const data = await res.json();
            return data.country || 'VN'; // Mặc định VN nếu không xác định được
        }
    } catch (e) {
        console.warn("Geo detect failed, falling back to ipwho.is");
        try {
            // Fallback
            const res = await fetch('https://ipwho.is/');
            if (res.ok) {
                const data = await res.json();
                return data.country_code || 'VN';
            }
        } catch (err) {
            console.error("All geo checks failed");
        }
    }
    return 'VN'; // Fallback an toàn
};

export const getUserStatus = async (userId: string, email?: string, fullName?: string): Promise<UserStatus> => {
    try {
        // 1. Lấy thông tin cơ bản (Credits, Hạn dùng) từ Profiles
        // Sử dụng maybeSingle để tránh lỗi nếu không tìm thấy (trả về null thay vì error)
        let { data, error } = await supabase
            .from('profiles')
            .select('credits, subscription_end, country') 
            .eq('id', userId)
            .maybeSingle();

        // --- QUAN TRỌNG: CHẶN VÒNG LẶP LỖI ---
        // Nếu có lỗi hệ thống (401, 429, Network Error), DỪNG NGAY.
        // Không được phép chạy xuống logic tạo user mới vì sẽ gây xung đột RLS và spam request.
        if (error) {
            console.warn("[Auth] Error fetching profile (skipping creation logic):", error.message);
            // Trả về object an toàn để UI không bị crash, nhưng không retry ngay lập tức
            return { credits: 0, subscriptionEnd: null, isExpired: false };
        }
        // -------------------------------------

        // NẾU KHÔNG CÓ LỖI VÀ KHÔNG TÌM THẤY DATA -> ĐÂY LÀ USER MỚI (SIGN UP)
        if (!data && email) {
             console.log("[Auth] New user detected, creating profile...");
             
             // 1. Xác định quốc gia
             const userCountry = await detectCountry();

             // 2. Gửi Webhook sang LadiFlow
             try {
                 const baseUrl = BACKEND_URL.replace(/\/$/, "");
                 fetch(`${baseUrl}/sync-ladipage`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ 
                         email, 
                         full_name: fullName || email.split('@')[0], 
                         is_new_user: true,
                         country: userCountry 
                     })
                 }).catch(err => console.error("[Sync] Network failed:", err));
             } catch (e) {
                 console.error("[Sync] Exception:", e);
             }

             // 3. Tạo hồ sơ mới trong DB
             const { error: insertError } = await supabase
                .from('profiles')
                .insert([{ 
                    id: userId, 
                    email, 
                    credits: 60, 
                    full_name: fullName,
                    subscription_end: null, // Vĩnh viễn (cho đến khi hết credits)
                    country: userCountry // Lưu cột country
                }]);
             
             if (insertError) {
                 // Nếu Insert lỗi (có thể do Race Condition - tab khác đã tạo rồi),
                 // Thử fetch lại một lần cuối cùng.
                 console.warn(`[Auth] Profile insert failed (${insertError.code}), retrying fetch...`);
                 
                 const { data: retryData, error: retryError } = await supabase
                    .from('profiles')
                    .select('credits, subscription_end, country')
                    .eq('id', userId)
                    .single();
                    
                 if (!retryError && retryData) {
                     data = retryData;
                 } else {
                     // Nếu vẫn lỗi, trả về default
                     return { credits: 0, subscriptionEnd: null, isExpired: false };
                 }
             } else {
                 // Trả về ngay trạng thái mới tạo nếu insert thành công
                 return { credits: 60, subscriptionEnd: null, isExpired: false };
             }
        } 
        
        // Nếu data vẫn null (trường hợp hiếm), return default
        if (!data) {
            return { credits: 0, subscriptionEnd: null, isExpired: false };
        }

        // --- LOGIC KIỂM TRA HẾT HẠN ---
        const now = new Date();
        const subEnd = data?.subscription_end ? new Date(data.subscription_end) : null;
        // Logic cũ: Hết hạn nếu có ngày hết hạn và ngày đó < hiện tại
        const isExpired = subEnd ? subEnd < now : false;

        // Nếu đã hết hạn, trả về 0 credits để chặn UI/UX
        const effectiveCredits = isExpired ? 0 : (data?.credits ?? 0);

        // --- LOGIC MỚI: LẤY GÓI HIỆN TẠI TỪ BẢNG TRANSACTIONS ---
        // Chỉ lấy nếu chưa hết hạn. Nếu hết hạn thì coi như không có gói active (undefined).
        let activePlanId = undefined;
        
        if (!isExpired) {
            // Truy vấn bảng transactions để tìm giao dịch mua gói gần nhất
            const { data: lastTx } = await supabase
                .from('transactions')
                .select('plan_id')
                .eq('user_id', userId)
                .eq('status', 'completed')
                .eq('type', 'subscription') // Chỉ lấy giao dịch mua gói
                .order('created_at', { ascending: false }) // Lấy cái mới nhất
                .limit(1)
                .maybeSingle();
            
            if (lastTx) {
                activePlanId = lastTx.plan_id;
            }
        }

        return { 
            credits: effectiveCredits, 
            subscriptionEnd: data?.subscription_end, 
            isExpired: isExpired,
            activePlanId: activePlanId // Trả về undefined nếu hết hạn
        };
    } catch (e) {
        console.error("[Auth] getUserStatus Critical Exception:", e);
        return { credits: 0, subscriptionEnd: null, isExpired: false };
    }
};

export const getUserProfile = async (userId: string) => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('full_name, phone, country')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    } catch (e) {
        return null;
    }
};

export const updateUserProfile = async (userId: string, fullName: string, phone: string) => {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ full_name: fullName, phone: phone })
            .eq('id', userId);
        if (error) throw error;
        return true;
    } catch (e: any) {
        throw new Error(e.message || "Lỗi cập nhật thông tin.");
    }
};

export const deductCredits = async (userId: string, amount: number, description: string): Promise<string> => {
    const { data: logId, error } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description
    });

    if (error) throw new Error(`Giao dịch thất bại: ${error.message}`);
    
    if (logId) {
        localStorage.setItem('opzen_last_log_id', logId);
    }
    return logId;
};

export const refundCredits = async (userId: string, amount: number, description: string, originalLogId?: string): Promise<void> => {
    if (amount <= 0) return;

    const finalLogId = originalLogId || localStorage.getItem('opzen_last_log_id');

    if (!finalLogId) {
        console.warn("[PaymentService] Không tìm thấy Log ID để hoàn tiền chính xác.");
    }

    const { error } = await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description,
        p_usage_log_id: finalLogId
    });

    if (!error) {
        localStorage.removeItem('opzen_last_log_id');
        console.log(`[PaymentService] Đã hoàn tiền thành công (${amount} credits)`);
    } else {
        console.error("[PaymentService] Lỗi hoàn tiền nghiêm trọng:", error.message);
    }
};

export const getTransactionHistory = async (): Promise<Transaction[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    return (data || []) as Transaction[];
};

export const redeemGiftCode = async (userId: string, code: string): Promise<number> => {
    const { data, error } = await supabase.rpc('redeem_giftcode', { p_user_id: userId, p_code: code });
    if (error) throw new Error(error.message || "Lỗi đổi mã quà tặng");
    return data;
};

export const checkVoucher = async (code: string): Promise<number> => {
    try {
        const { data, error } = await supabase.from('vouchers').select('discount_percent, is_active').eq('code', code).single();
        if (error) throw new Error(error.message);
        if (!data.is_active) throw new Error("Mã giảm giá đã hết hạn.");
        return data.discount_percent;
    } catch (e: any) {
        throw new Error("Mã giảm giá không hợp lệ.");
    }
};

// --- SECURE TRANSACTION CREATION ---
export const createPendingTransaction = async (
    userId: string, 
    plan: PricingPlan, 
    clientAmount: number, 
    customerInfo?: { name: string, phone: string, email: string },
    voucherCode?: string
) => {
    // 1. VALIDATION: Get Official Price from Source of Truth (Prevent Client Tampering)
    const officialPlan = plans.find(p => p.id === plan.id);
    if (!officialPlan) {
        throw new Error("Gói dịch vụ không hợp lệ (ID không tồn tại).");
    }

    let calculatedPrice = officialPlan.price;

    // 2. VALIDATION: Re-verify Voucher on Server Side
    if (voucherCode && voucherCode.trim() !== '') {
        try {
            // Ensure uppercase for DB check consistency
            const normalizedCode = voucherCode.trim().toUpperCase();
            const discountPercent = await checkVoucher(normalizedCode);
            // Apply discount
            calculatedPrice = Math.round(calculatedPrice * (1 - discountPercent / 100));
        } catch (e) {
            console.warn("Invalid voucher sent during transaction creation, ignoring discount.");
            // Fallback to original price if voucher check fails to prevent 0-price exploits
            calculatedPrice = officialPlan.price; 
        }
    }

    // 3. SECURITY CHECK: Compare Client Price vs Calculated Price
    // Allow small margin (<= 1000 VND) for potential rounding differences
    if (Math.abs(calculatedPrice - clientAmount) > 1000) {
        console.error(`Price Mismatch: Server calculated ${calculatedPrice} vs Client sent ${clientAmount}. Voucher Used: ${voucherCode}`);
        throw new Error("Giá dịch vụ không đồng bộ. Vui lòng tải lại trang để cập nhật giá mới nhất.");
    }

    // 4. SAFETY NET: Prevent 0 or Negative Amounts
    if (calculatedPrice <= 1000) {
        throw new Error("Lỗi hệ thống: Số tiền thanh toán không hợp lệ (Quá thấp). Vui lòng liên hệ hỗ trợ.");
    }

    // 5. Use the SECURE calculated price for DB insertion
    const finalSafeAmount = calculatedPrice;

    // Check for existing pending transaction to reuse
    const { data: existingTx } = await supabase.from('transactions')
        .select('id, transaction_code, amount, created_at')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingTx) {
        const isCorrectPrefix = existingTx.transaction_code.startsWith('OPZ');
        // Reuse ONLY if the amount matches our secure calculation
        if (Math.round(existingTx.amount) === finalSafeAmount && isCorrectPrefix) {
            if (customerInfo) {
                await supabase.from('transactions').update({ 
                    customer_name: customerInfo.name, 
                    customer_phone: customerInfo.phone, 
                    customer_email: customerInfo.email 
                }).eq('id', existingTx.id);
            }
            return { transactionId: existingTx.id, transactionCode: existingTx.transaction_code, amount: existingTx.amount };
        }
        // If amount mismatch (user changed voucher or plan?), cancel old one
        await supabase.from('transactions').update({ status: 'cancelled' }).eq('id', existingTx.id);
    }

    // Clean up other pending transactions
    await supabase.from('transactions').update({ status: 'cancelled' }).eq('user_id', userId).eq('status', 'pending');
    
    const transactionCode = `OPZ${Math.floor(100000 + Math.random() * 900000)}`;
    
    const { data, error } = await supabase.from('transactions').insert({
        user_id: userId, 
        plan_id: plan.id, 
        plan_name: plan.name, 
        amount: finalSafeAmount, // ALWAYS USE SECURE AMOUNT
        currency: plan.currency, 
        type: plan.type, 
        credits_added: plan.credits || 0,
        status: 'pending', 
        payment_method: 'bank_transfer', 
        transaction_code: transactionCode, 
        customer_name: customerInfo?.name, 
        customer_phone: customerInfo?.phone, 
        customer_email: customerInfo?.email
    }).select('id, transaction_code, amount').single();

    if (error) throw new Error(error.message);
    return { transactionId: data.id, transactionCode: data.transaction_code, amount: data.amount };
};

export const subscribeToTransaction = (transactionId: string, onPaid: () => void) => {
    const channel = supabase.channel(`tx-${transactionId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions', filter: `id=eq.${transactionId}` }, (payload) => {
        if (payload.new.status === 'completed') onPaid();
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
};
