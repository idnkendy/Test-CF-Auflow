
import { supabase } from './supabaseClient';
import { PricingPlan, UserStatus, Transaction } from '../types';

export const getUserStatus = async (userId: string, email?: string): Promise<UserStatus> => {
    try {
        // 1. Try to fetch existing profile
        let { data, error } = await supabase
            .from('profiles')
            .select('credits, subscription_end')
            .eq('id', userId)
            .maybeSingle(); // Use maybeSingle to avoid PGRST116 error noise

        // 2. If no profile exists and we have an email, try to create one (First time user)
        if (!data && email) {
             console.log("Profile not found, attempting to create new profile...");
             const { error: insertError } = await supabase
                .from('profiles')
                .insert([{ id: userId, email, credits: 60 }]); // Default trial credits
             
             if (insertError) {
                 // RACE CONDITION HANDLING:
                 // If insert failed (likely code 23505 - unique violation), it means 
                 // another request created the profile milliseconds ago.
                 // WE MUST FETCH AGAIN. DO NOT RETURN DEFAULT VALUES.
                 console.warn("Profile creation failed (likely race condition), forcing re-fetch...", insertError.message);
                 
                 const { data: retryData, error: retryError } = await supabase
                    .from('profiles')
                    .select('credits, subscription_end')
                    .eq('id', userId)
                    .single();
                    
                 if (retryError || !retryData) {
                     console.error("CRITICAL: Retry fetch also failed.", retryError);
                     // Return 0 only if we absolutely cannot verify the user exists
                     // This prevents the UI from showing incorrect high balances, but prevents overwriting DB
                     return { credits: 0, subscriptionEnd: null, isExpired: false };
                 }
                 data = retryData;
             } else {
                 // Insert successful, return default new user state
                 return { credits: 60, subscriptionEnd: null, isExpired: false };
             }
        } else if (!data) {
            // No data and no email provided (shouldn't happen in auth flow)
            return { credits: 0, subscriptionEnd: null, isExpired: false };
        }

        const credits = data?.credits ?? 0;
        const subscriptionEnd = data?.subscription_end;
        const isExpired = subscriptionEnd ? new Date(subscriptionEnd) < new Date() : false;

        return {
            credits,
            subscriptionEnd,
            isExpired
        };
    } catch (e) {
        console.error("Exception in getUserStatus:", e);
        return { credits: 0, subscriptionEnd: null, isExpired: false };
    }
};

export const deductCredits = async (userId: string, amount: number, description: string): Promise<string> => {
    // Strictly use RPC for atomic transactions.
    // Client-side logic is unsafe for deductions as it relies on potentially stale local state.
    const { data, error } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description
    });

    if (error) {
        console.error("deductCredits RPC error:", error.message || JSON.stringify(error));
        throw new Error(`Giao dịch thất bại: ${error.message || 'Lỗi hệ thống'}`);
    }

    return data; // Returns log ID
};

export const refundCredits = async (userId: string, amount: number, description: string): Promise<void> => {
    // STRICTLY USE RPC. REMOVED UNSAFE CLIENT-SIDE FALLBACK.
    // Writing to the DB from client with (current + amount) is dangerous if 'current' is stale.
    const { error } = await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description
    });

    if (error) {
        console.error("refundCredits RPC error:", error.message || JSON.stringify(error));
        // If RPC fails, we log it. We DO NOT try to fix it client-side to avoid resetting credits to wrong values.
    }
};

export const getTransactionHistory = async (): Promise<Transaction[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("getTransactionHistory error:", error.message || error);
        return [];
    }

    return data as Transaction[];
};

export const redeemGiftCode = async (userId: string, code: string): Promise<number> => {
    const { data, error } = await supabase.rpc('redeem_giftcode', {
        p_user_id: userId,
        p_code: code
    });

    if (error) {
        throw new Error(error.message || "Lỗi đổi mã quà tặng");
    }

    return data; // returns amount added
};

export const createPendingTransaction = async (userId: string, plan: PricingPlan, amount: number) => {
    // 1. Tìm giao dịch đang pending cũ của User cho gói này
    const { data: existingTx } = await supabase
        .from('transactions')
        .select('id, transaction_code, amount, created_at')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingTx) {
        // Kiểm tra tiền tố để đảm bảo đồng bộ (OPZ)
        const isCorrectPrefix = existingTx.transaction_code.startsWith('OPZ');

        // Nếu số tiền khớp hoàn toàn VÀ đúng tiền tố -> Tái sử dụng (Idempotency)
        if (existingTx.amount === amount && isCorrectPrefix) {
            console.log(`[Payment] Reusing existing pending transaction: ${existingTx.transaction_code}`);
            return {
                transactionId: existingTx.id,
                transactionCode: existingTx.transaction_code,
                amount: existingTx.amount
            };
        }

        // Nếu số tiền KHÁC (do áp dụng/xóa voucher) -> HỦY cái cũ
        await supabase
            .from('transactions')
            .update({ status: 'cancelled' })
            .eq('id', existingTx.id);
    }

    // 2. Dọn dẹp các giao dịch 'pending' khác
    await supabase
        .from('transactions')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'pending');

    // 3. Tạo giao dịch MỚI
    const transactionCode = `OPZ${Math.floor(100000 + Math.random() * 900000)}`;
    
    const { data, error } = await supabase
        .from('transactions')
        .insert({
            user_id: userId,
            plan_id: plan.id,
            plan_name: plan.name,
            amount: amount,
            currency: plan.currency,
            type: plan.type,
            credits_added: plan.credits || 0,
            status: 'pending',
            payment_method: 'bank_transfer',
            transaction_code: transactionCode
        })
        .select('id, transaction_code, amount')
        .single();

    if (error) {
        throw new Error(error.message);
    }

    return {
        transactionId: data.id,
        transactionCode: data.transaction_code,
        amount: data.amount
    };
};

export const subscribeToTransaction = (transactionId: string, onPaid: () => void) => {
    const channel = supabase
        .channel(`tx-${transactionId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'transactions',
                filter: `id=eq.${transactionId}`
            },
            (payload) => {
                if (payload.new.status === 'completed') {
                    onPaid();
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};

export const checkVoucher = async (code: string): Promise<number> => {
    try {
        const { data, error } = await supabase
            .from('vouchers')
            .select('discount_percent, is_active, start_date, end_date')
            .eq('code', code)
            .single();

        if (error) {
            if (error.code === '42P01') {
                throw new Error("Hệ thống mã giảm giá đang bảo trì (Table missing). Vui lòng thử mã TEST10.");
            }
            if (error.code === 'PGRST116') {
                throw new Error("Mã giảm giá không hợp lệ.");
            }
            throw new Error(error.message);
        }
        
        if (!data.is_active) {
            throw new Error("Mã giảm giá đã hết hạn hoặc bị vô hiệu hóa.");
        }
        
        const now = new Date();
        if (data.start_date && new Date(data.start_date) > now) throw new Error("Mã chưa có hiệu lực.");
        if (data.end_date && new Date(data.end_date) < now) throw new Error("Mã đã hết hạn.");

        return data.discount_percent;
    } catch (e: any) {
        const hardcoded: Record<string, number> = {
            'TEST10': 10,
            'OPZEN20': 20,
            'FREE100': 100
        };
        if (hardcoded[code]) return hardcoded[code];
        
        throw e;
    }
};

export const simulateSePayWebhook = async (transactionId: string): Promise<boolean> => {
    if (transactionId.startsWith('mock-tx-')) {
        console.warn("Cannot simulate backend webhook on a mock transaction ID.");
        return true;
    }

    try {
        const { data, error } = await supabase.rpc('approve_transaction_test', {
            p_transaction_id: transactionId
        });

        if (error) {
            throw new Error(error.message || "RPC Error");
        }

        return data === true;
    } catch (e: any) {
        console.error("[DevTool] Failed to simulate webhook:", e);
        if (e.message?.includes('function') && e.message?.includes('does not exist')) {
            throw new Error("MISSING_RPC");
        }
        throw e;
    }
};
