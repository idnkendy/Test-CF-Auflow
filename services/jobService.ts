
import { supabase } from './supabaseClient';
import { GenerationJob } from '../types';
import { refundCredits } from './paymentService';

const BUCKET_NAME = 'assets';

// Helper: Compress image to WEBP at 100% quality
const compressImage = async (blob: Blob): Promise<Blob> => {
    // If it's not an image, return as is
    if (!blob.type.startsWith('image/')) return blob;
    
    // If it's already small enough (< 500KB) and already webp, return as is.
    // If it's not webp, we convert it regardless of size to standardize.
    if (blob.size < 500 * 1024 && blob.type === 'image/webp') return blob;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Resize if too big (max 1920px width/height) to ensure performant loading
            const MAX_SIZE = 1920;
            if (width > MAX_SIZE || height > MAX_SIZE) {
                if (width > height) {
                    height = Math.round(height * (MAX_SIZE / width));
                    width = MAX_SIZE;
                } else {
                    width = Math.round(width * (MAX_SIZE / height));
                    height = MAX_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(blob);
                return;
            }

            // Draw white background (for transparent PNGs)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to WEBP at 100% quality
            canvas.toBlob((compressedBlob) => {
                if (compressedBlob) {
                    resolve(compressedBlob);
                } else {
                    resolve(blob); // If compression fails, return original
                }
            }, 'image/webp', 1.0);
        };

        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            console.warn("Image compression failed, using original", err);
            resolve(blob);
        };

        img.src = url;
    });
};

// Helper: Smartly persist any data (Base64 or Remote URL) to Supabase Storage
const persistResultToStorage = async (userId: string, data: string): Promise<string | null> => {
    try {
        if (data.includes('supabase.co') && data.includes(BUCKET_NAME)) {
            return data;
        }

        let blob: Blob;
        let extension = 'webp';

        if (data.startsWith('data:')) {
            const arr = data.split(',');
            const mimeMatch = arr[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : 'image/png';
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            blob = new Blob([u8arr], { type: mime });
        } 
        else if (data.startsWith('blob:')) {
            try {
                const response = await fetch(data);
                blob = await response.blob();
                if (blob.type === 'image/jpeg') extension = 'jpg';
                else if (blob.type === 'image/png') extension = 'png';
                else if (blob.type === 'image/webp') extension = 'webp';
            } catch (e) {
                console.error("Failed to fetch blob data:", e);
                return null;
            }
        }
        else if (data.startsWith('http')) {
            try {
                const response = await fetch(data);
                if (!response.ok) throw new Error('Failed to fetch remote URL');
                blob = await response.blob();
                if (blob.type.startsWith('video')) {
                    extension = 'mp4';
                }
            } catch (fetchError) {
                console.warn("Could not fetch remote URL for persistence (keeping original):", fetchError);
                return data;
            }
        } 
        else {
            return data;
        }

        if (blob.type.startsWith('image/')) {
            blob = await compressImage(blob);
            extension = 'webp';
        }

        const fileName = `${userId}/jobs/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${extension}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, blob, {
                cacheControl: '31536000',
                upsert: false,
                contentType: blob.type
            });

        if (uploadError) {
            console.error("Error uploading job result to storage:", uploadError);
            return null;
        }

        const { data: publicData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
        return publicData.publicUrl;

    } catch (e) {
        console.error("Exception in persistResultToStorage:", e);
        return null;
    }
};

export const createJob = async (jobData: Partial<GenerationJob>): Promise<string> => {
    try {
        const { data, error } = await supabase
            .from('generation_jobs')
            .insert([{
                ...jobData,
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select('id')
            .single();

        if (error) {
            console.error("Error creating generation job:", error.message || JSON.stringify(error));
            throw new Error(`Lỗi tạo Job: ${error.message}`);
        }
        return data.id;
    } catch (e: any) {
        console.error("Exception creating job:", e.message || e);
        throw new Error(e.message || "Không thể tạo bản ghi công việc (Job Creation Failed)");
    }
};

export const updateJobStatus = async (jobId: string, status: 'pending' | 'processing' | 'completed' | 'failed', resultUrl?: string, errorMessage?: string) => {
    try {
        const updates: any = {
            status,
            updated_at: new Date().toISOString()
        };

        if (resultUrl) {
            const { data: jobData } = await supabase
                .from('generation_jobs')
                .select('user_id')
                .eq('id', jobId)
                .single();
            
            if (jobData && jobData.user_id) {
                const persistentUrl = await persistResultToStorage(jobData.user_id, resultUrl);
                updates.result_url = persistentUrl || resultUrl;
            } else {
                 updates.result_url = resultUrl;
            }
        }

        if (errorMessage) updates.error_message = errorMessage;

        const { error } = await supabase
            .from('generation_jobs')
            .update(updates)
            .eq('id', jobId);

        if (error) {
            console.error(`Error updating job ${jobId}:`, error.message || JSON.stringify(error));
        }
    } catch (e: any) {
        console.error(`Exception updating job ${jobId}:`, e.message || e);
    }
};

export const getQueuePosition = async (jobId: string, knownCreatedAt?: string): Promise<number> => {
    try {
        let createdAt = knownCreatedAt;
        if (!createdAt) {
            const { data: currentJob, error: fetchError } = await supabase
                .from('generation_jobs')
                .select('created_at')
                .eq('id', jobId)
                .single();

            if (fetchError || !currentJob) return 0;
            createdAt = currentJob.created_at;
        }

        const { count, error } = await supabase
            .from('generation_jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pending', 'processing'])
            .lt('created_at', createdAt!);

        if (error) return 0;
        return (count || 0) + 1;
    } catch (e) {
        return 0;
    }
};

/**
 * Checks for "zombie" jobs (stuck in pending/processing for > 8 mins) for the current user.
 * Marks them as failed and refunds credits.
 */
export const cleanupStaleJobs = async (userId: string) => {
    try {
        const timeoutThreshold = new Date(Date.now() - 8 * 60 * 1000).toISOString();

        const { data: stuckJobs, error } = await supabase
            .from('generation_jobs')
            .select('id, cost, tool_id')
            .eq('user_id', userId)
            .in('status', ['pending', 'processing'])
            .lt('updated_at', timeoutThreshold);

        if (error) {
            console.error("Error finding stale jobs:", error);
            return;
        }

        if (stuckJobs && stuckJobs.length > 0) {
            console.log(`[JobService] Found ${stuckJobs.length} stuck jobs. Cleaning up...`);
            for (const job of stuckJobs) {
                await updateJobStatus(job.id, 'failed', undefined, 'Timeout: Hệ thống tự động hủy do quá thời gian chờ (8 phút).');
                if (job.cost > 0) {
                    await refundCredits(userId, job.cost, `Hoàn tiền: Job ${job.id} bị treo quá 8 phút`);
                }
            }
            console.log(`[JobService] Cleanup complete. Refunded credits for stuck jobs.`);
        }
    } catch (e) {
        console.error("Exception in cleanupStaleJobs:", e);
    }
};

/**
 * NEW: Checks localStorage for transaction markers that were paid but never created a job (Crashed).
 * This fixes "Usage log exists but no Job exists".
 */
export const recoverOrphanedTransactions = async (userId: string) => {
    try {
        const rawPending = localStorage.getItem('opzen_pending_tx');
        if (!rawPending) return;

        const pendingTx = JSON.parse(rawPending);
        const now = Date.now();
        
        // If the pending transaction is older than 60 seconds, assume the app crashed/closed
        if (pendingTx && pendingTx.timestamp && (now - pendingTx.timestamp > 60000)) {
            console.log("[JobService] Found orphaned transaction (Crash Recovery). Refunding...", pendingTx);
            
            // Refund
            if (pendingTx.amount > 0) {
                await refundCredits(userId, pendingTx.amount, `Hoàn tiền: Lỗi hệ thống (Crash Recovery) - ${pendingTx.reason || 'Unknown'}`);
            }
            
            // Clean up
            localStorage.removeItem('opzen_pending_tx');
            console.log("[JobService] Recovery complete.");
            
            // Optional: You could show a toast here to notify user
        }
    } catch (e) {
        console.error("Error in recoverOrphanedTransactions:", e);
        // Clean up corrupt data
        localStorage.removeItem('opzen_pending_tx');
    }
};
