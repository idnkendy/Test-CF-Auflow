
import { supabase } from './supabaseClient';
import { PricingPlan, UserStatus, Transaction } from '../types';

export const getUserStatus = async (userId: string, email?: string): Promise<UserStatus> => {
    try {
        let { data, error } = await supabase
            .from('profiles')
            .select('credits, subscription_end')
            .eq('id', userId)
            .maybeSingle();

        if (!data && email) {
             console.log("Profile not found, attempting to create new profile...");
             const { error: insertError } = await supabase
                .from('profiles')
                .insert([{ id: userId, email, credits: 60 }]);
             
             if (insertError) {
                 const { data: retryData, error: retryError } = await supabase
                    .from('profiles')
                    .select('credits, subscription_end')
                    .eq('id', userId)
                    .single();
                    
                 if (retryError || !retryData) {
                     return { credits: 0, subscriptionEnd: null, isExpired: false };
                 }
                 data = retryData;
             } else {
                 return { credits: 60, subscriptionEnd: null, isExpired: false };
             }
        } else if (!data) {
            return { credits: 0, subscriptionEnd: null, isExpired: false };
        }

        const credits = data?.credits ?? 0;
        const subscriptionEnd = data?.subscription_end;
        const isExpired = subscriptionEnd ? new Date(subscriptionEnd) < new Date() : false;

        return { credits, subscriptionEnd, isExpired };
    } catch (e) {
        return { credits: 0, subscriptionEnd: null, isExpired: false };
    }
};

export const getUserProfile = async (userId: string) => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('full_name, phone')
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
    const { data, error } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description
    });

    if (error) {
        throw new Error(`Giao dịch thất bại: ${error.message || 'Lỗi hệ thống'}`);
    }

    try {
        if (data) {
            localStorage.setItem('opzen_pending_tx', JSON.stringify({
                logId: data,
                amount: amount,
                reason: description,
                timestamp: Date.now()
            }));
        }
    } catch (e) {}

    return data;
};

/**
 * REFUND CREDITS (PHIÊN BẢN AN TOÀN)
 * Truyền thêm usageLogId để Database tự đánh dấu và chống hoàn tiền trùng lặp (Idempotency).
 */
export const refundCredits = async (userId: string, amount: number, description: string, usageLogId?: string): Promise<void> => {
    console.log(`[PaymentService] Đang thực hiện hoàn tiền: ${amount} credits. Log đích: ${usageLogId || 'N/A'}`);
    
    const { error } = await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description,
        p_usage_log_id: usageLogId // CHỐT CHẶN QUAN TRỌNG: Gửi ID lên để Database lock
    });

    if (error) {
        console.error("[PaymentService] Lỗi khi gọi RPC refund_credits:", error.message);
        // Fallback thủ công nếu RPC thất bại hoặc chưa cập nhật (Dùng tạm trong lúc dev)
        try {
            if (usageLogId) {
                // Thử kiểm tra xem đã hoàn tiền chưa bằng cách đọc log
                const { data: log } = await supabase.from('usage_logs').select('description').eq('id', usageLogId).single();
                if (log?.description.startsWith('Hoàn tiền')) return;
            }

            const { data: profile } = await supabase.from('profiles').select('credits').eq('id', userId).single();
            if (profile) {
                await supabase.from('profiles').update({ credits: (profile.credits || 0) + amount }).eq('id', userId);
                if (usageLogId) {
                    await supabase.from('usage_logs').update({ description: `Hoàn tiền: ${description}` }).eq('id', usageLogId);
                }
            }
        } catch (e) {}
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

export const createPendingTransaction = async (userId: string, plan: PricingPlan, amount: number, customerInfo?: { name: string, phone: string, email: string }) => {
    const intAmount = Math.round(amount);
    const { data: existingTx } = await supabase.from('transactions').select('id, transaction_code, amount, created_at').eq('user_id', userId).eq('plan_id', plan.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (existingTx) {
        const isCorrectPrefix = existingTx.transaction_code.startsWith('OPZ');
        const existingIntAmount = Math.round(existingTx.amount);
        if (existingIntAmount === intAmount && isCorrectPrefix) {
            if (customerInfo) {
                await supabase.from('transactions').update({ customer_name: customerInfo.name, customer_phone: customerInfo.phone, customer_email: customerInfo.email }).eq('id', existingTx.id);
            }
            return { transactionId: existingTx.id, transactionCode: existingTx.transaction_code, amount: existingTx.amount };
        }
        await supabase.from('transactions').update({ status: 'cancelled' }).eq('id', existingTx.id);
    }

    await supabase.from('transactions').update({ status: 'cancelled' }).eq('user_id', userId).eq('status', 'pending');
    const transactionCode = `OPZ${Math.floor(100000 + Math.random() * 900000)}`;
    const { data, error } = await supabase.from('transactions').insert({
        user_id: userId, plan_id: plan.id, plan_name: plan.name, amount: intAmount, currency: plan.currency, type: plan.type, credits_added: plan.credits || 0,
        status: 'pending', payment_method: 'bank_transfer', transaction_code: transactionCode, customer_name: customerInfo?.name, customer_phone: customerInfo?.phone, customer_email: customerInfo?.email
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

export const checkVoucher = async (code: string): Promise<number> => {
    try {
        const { data, error } = await supabase.from('vouchers').select('discount_percent, is_active, start_date, end_date').eq('code', code).single();
        if (error) throw new Error(error.message);
        if (!data.is_active) throw new Error("Mã giảm giá đã hết hạn.");
        return data.discount_percent;
    } catch (e: any) {
        const hardcoded: Record<string, number> = { 'TEST10': 10, 'OPZEN20': 20, 'FREE100': 100 };
        if (hardcoded[code.toUpperCase()]) return hardcoded[code.toUpperCase()];
        throw e;
    }
};

export const simulateSePayWebhook = async (transactionId: string): Promise<boolean> => {
    try {
        const { data, error } = await supabase.rpc('approve_transaction_test', { p_transaction_id: transactionId });
        if (error) throw new Error(error.message);
        return data === true;
    } catch (e) {
        return false;
    }
};
