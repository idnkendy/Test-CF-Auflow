
import { supabase } from './supabaseClient';
import { GenerationJob } from '../types';
import { refundCredits } from './paymentService';

const BUCKET_NAME = 'assets';

const compressImage = async (blob: Blob): Promise<Blob> => {
    if (!blob.type.startsWith('image/')) return blob;
    if (blob.size < 500 * 1024 && blob.type === 'image/webp') return blob;

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 1920;
            let width = img.width;
            let height = img.height;
            if (width > MAX_SIZE || height > MAX_SIZE) {
                if (width > height) { height = Math.round(height * (MAX_SIZE / width)); width = MAX_SIZE; }
                else { width = Math.round(width * (MAX_SIZE / height)); height = MAX_SIZE; }
            }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(blob); return; }
            ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((compressedBlob) => resolve(compressedBlob || blob), 'image/webp', 1.0);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
        img.src = url;
    });
};

const persistResultToStorage = async (userId: string, data: string): Promise<string | null> => {
    try {
        if (data.includes('supabase.co') && data.includes(BUCKET_NAME)) return data;
        let blob: Blob;
        let extension = 'webp';
        if (data.startsWith('data:')) {
            const arr = data.split(',');
            const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
            const bstr = atob(arr[1]);
            let n = bstr.length; const u8arr = new Uint8Array(n);
            while (n--) { u8arr[n] = bstr.charCodeAt(n); }
            blob = new Blob([u8arr], { type: mime });
        } else if (data.startsWith('blob:') || data.startsWith('http')) {
            const response = await fetch(data);
            blob = await response.blob();
            if (blob.type.startsWith('video')) extension = 'mp4';
        } else return data;

        if (blob.type.startsWith('image/')) { blob = await compressImage(blob); extension = 'webp'; }
        const fileName = `${userId}/jobs/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(fileName, blob, { cacheControl: '31536000', upsert: false, contentType: blob.type });
        if (uploadError) return null;
        const { data: publicData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
        return publicData.publicUrl;
    } catch (e) { return null; }
};

export const createJob = async (jobData: Partial<GenerationJob>): Promise<string> => {
    try {
        const { data, error } = await supabase.from('generation_jobs').insert([{ ...jobData, status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]).select('id').single();
        if (error) throw new Error(`Lỗi tạo Job: ${error.message}`);
        try { localStorage.removeItem('opzen_pending_tx'); } catch (e) {}
        return data.id;
    } catch (e: any) { throw new Error(e.message || "Job Creation Failed"); }
};

export const updateJobStatus = async (jobId: string, status: 'pending' | 'processing' | 'completed' | 'failed', resultUrl?: string, errorMessage?: string) => {
    try {
        const updates: any = { status, updated_at: new Date().toISOString() };
        if (resultUrl) {
            const { data: jobData } = await supabase.from('generation_jobs').select('user_id').eq('id', jobId).single();
            if (jobData?.user_id) {
                const persistentUrl = await persistResultToStorage(jobData.user_id, resultUrl);
                updates.result_url = persistentUrl || resultUrl;
            } else updates.result_url = resultUrl;
        }
        if (errorMessage) updates.error_message = errorMessage;
        await supabase.from('generation_jobs').update(updates).eq('id', jobId);
    } catch (e) {}
};

export const getQueuePosition = async (jobId: string, knownCreatedAt?: string): Promise<number> => {
    try {
        let createdAt = knownCreatedAt;
        if (!createdAt) {
            const { data } = await supabase.from('generation_jobs').select('created_at').eq('id', jobId).single();
            if (!data) return 0;
            createdAt = data.created_at;
        }
        const { count } = await supabase.from('generation_jobs').select('*', { count: 'exact', head: true }).in('status', ['pending', 'processing']).lt('created_at', createdAt!);
        return (count || 0) + 1;
    } catch (e) { return 0; }
};

/**
 * CLEANUP STALE JOBS
 * Tìm các job bị treo > 15 phút, đánh dấu lỗi và hoàn tiền dựa trên usage_log_id.
 */
export const cleanupStaleJobs = async (userId: string) => {
    try {
        const TIMEOUT_MINUTES = 15;
        const threshold = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();
        const { data: stuckJobs } = await supabase.from('generation_jobs').select('id, cost, usage_log_id').eq('user_id', userId).in('status', ['pending', 'processing']).lt('created_at', threshold);
        
        if (stuckJobs && stuckJobs.length > 0) {
            console.log(`[JobService] Phát hiện ${stuckJobs.length} jobs bị treo. Đang xử lý hoàn tiền...`);
            for (const job of stuckJobs) {
                await updateJobStatus(job.id, 'failed', undefined, `Hệ thống tự động hủy do treo quá ${TIMEOUT_MINUTES} phút.`);
                if (job.cost > 0 && job.usage_log_id) {
                    await refundCredits(userId, job.cost, `Hoàn tiền: Job bị treo`, job.usage_log_id);
                }
            }
        }
    } catch (e) {}
};

export const cleanupOrphanedLogs = async () => {
    try { await supabase.rpc('cleanup_orphaned_logs'); } catch (e) {}
};

/**
 * RECOVER ORPHANED TRANSACTIONS
 * Cơ chế cứu hộ cho Client: Kiểm tra localStorage và hoàn tiền nếu sau 1 phút chưa thấy Job.
 */
export const recoverOrphanedTransactions = async (userId: string) => {
    const rawPending = localStorage.getItem('opzen_pending_tx');
    if (rawPending) {
        try {
            const pendingTx = JSON.parse(rawPending);
            const now = Date.now();
            
            // Chờ ít nhất 1 phút để chắc chắn không phải do mạng chậm
            if (pendingTx?.timestamp && (now - pendingTx.timestamp > 60000)) {
                if (pendingTx.amount > 0 && pendingTx.logId) {
                    console.log("[JobService] Đang cứu hộ giao dịch bị bỏ rơi:", pendingTx.logId);
                    
                    const { data: existingJob } = await supabase
                        .from('generation_jobs')
                        .select('id')
                        .eq('usage_log_id', pendingTx.logId)
                        .maybeSingle();

                    if (!existingJob) {
                        // Gọi hàm hoàn tiền an toàn với LOG ID để tránh trùng lặp
                        await refundCredits(userId, pendingTx.amount, `Cứu hộ giao dịch lỗi`, pendingTx.logId);
                    }
                }
                localStorage.removeItem('opzen_pending_tx');
            }
        } catch(e) { 
            console.error("[JobService] Lỗi trong quá trình cứu hộ:", e);
            localStorage.removeItem('opzen_pending_tx'); 
        }
    }
    // Sau khi cứu hộ ở Client, gọi tiếp lệnh quét tổng thể ở Server
    await cleanupOrphanedLogs();
};
