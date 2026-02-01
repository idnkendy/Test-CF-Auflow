
import { supabase } from './supabaseClient';
import { GenerationJob } from '../types';
import { refundCredits } from './paymentService';
import { BACKEND_URL } from './config';

const BUCKET_NAME = 'assets';
// Proxy URL to bypass CORS for Google Storage URLs
const PROXY_BASE_URL = BACKEND_URL;

// --- ERROR HANDLING HELPER (NEW) ---
export const mapFriendlyErrorMessage = (errorMsg: string): string => {
    // Log lỗi gốc ra console để lập trình viên debug
    console.error("Technical Error Detail:", errorMsg);

    if (!errorMsg) return "err.sys.google_generic";

    const msg = errorMsg.toUpperCase();

    // 1. Nhóm lỗi do người dùng (Vẫn giữ thông báo cụ thể nếu là lỗi credits)
    if (msg.includes("KHÔNG ĐỦ CREDITS")) {
        return "err.credit.insufficient_system";
    }
    
    // Safety / Upload Failed / Validation specific mapping
    // UPDATED: Aggressively catch 400/Invalid errors as they are almost always safety rejections during upload
    if (
        msg.includes("SAFETY_ERROR") || 
        msg.includes("SAFETY") || 
        msg.includes("BLOCK") || 
        msg.includes("PROHIBITED") ||
        msg.includes("UPLOAD FAILED") || 
        msg.includes("INVALID_ARGUMENT") ||
        msg.includes("400") || // Catch generic 400 Bad Request
        msg.includes("IMAGE_ASPECT_RATIO") // Specific validation errors
    ) {
        return "SAFETY_POLICY_VIOLATION"; // Return a specific code for UI to catch
    }
    
    // 2. Nhóm lỗi kỹ thuật (Server, Network, Timeout, Queue, 503, v.v...) -> Trả về thông báo mặc định
    return "err.sys.google_generic";
};

const compressImage = async (blob: Blob): Promise<Blob> => {
    if (!blob.type.startsWith('image/')) return blob;
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 1500;
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
        } else if (data.startsWith('blob:')) {
             const response = await fetch(data);
             blob = await response.blob();
             if (blob.type.startsWith('video')) extension = 'mp4';
        } else if (data.startsWith('http')) {
            // REMOTE URL HANDLING WITH PROXY FALLBACK
            try {
                // Attempt 1: Direct Fetch (works for CORS-enabled URLs)
                const response = await fetch(data);
                if (!response.ok) throw new Error("Direct fetch failed");
                blob = await response.blob();
            } catch (directErr) {
                // Attempt 2: Proxy Fetch (for Google Storage / Signed URLs)
                try {
                    const proxyUrl = `${PROXY_BASE_URL}/proxy-download?url=${encodeURIComponent(data)}`;
                    const proxyResponse = await fetch(proxyUrl);
                    if (!proxyResponse.ok) throw new Error("Proxy download failed");
                    blob = await proxyResponse.blob();
                } catch (proxyErr) {
                    console.warn("[JobService] Failed to fetch remote URL via proxy:", proxyErr);
                    return null; // Return null so we fall back to the original URL in updateJobStatus
                }
            }
            
            // Determine extension from blob type if it's a video
            if (blob.type.includes('video') || data.includes('.mp4')) {
                extension = 'mp4';
            } else if (blob.type.includes('quicktime')) {
                extension = 'mov';
            }
        } else {
            return data;
        }

        // Compress if it's an image
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
            console.error("[JobService] Upload error:", uploadError);
            return null;
        }

        const { data: publicData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
        return publicData.publicUrl;

    } catch (e) { 
        console.error("[JobService] Persist error:", e);
        return null; 
    }
};

/**
 * TẠO JOB VỚI CƠ CHẾ RETRY
 */
export const createJob = async (jobData: Partial<GenerationJob>, retries = 2): Promise<string> => {
    try {
        // Dùng .select() thay vì .single() để tránh lỗi RLS False Positive
        const { data, error } = await supabase
            .from('generation_jobs')
            .insert([{ 
                ...jobData, 
                status: 'pending', 
                created_at: new Date().toISOString(), 
                updated_at: new Date().toISOString() 
            }])
            .select('id');
        
        if (error) {
            // Nếu lỗi do trễ khóa ngoại (Foreign Key), thử lại sau 1s
            if (retries > 0 && (error.code === '23503' || error.message.includes('foreign key'))) {
                console.warn("[JobService] FK Error, retrying...", error.message);
                await new Promise(r => setTimeout(r, 1000));
                return createJob(jobData, retries - 1);
            }
            throw error;
        }

        if (!data || data.length === 0) {
            throw new Error("Insert succeeded but no ID returned (RLS Issue)");
        }
        
        // Thành công: Xóa các marker giao dịch tạm thời
        localStorage.removeItem('opzen_last_charge_id');
        localStorage.removeItem('opzen_pending_tx');
        localStorage.removeItem('opzen_last_log_id');

        return data[0].id;
    } catch (e: any) { 
        console.error("[JobService] Critical Create Job Error:", e);
        throw new Error(e.message || "Không thể khởi tạo bản ghi công việc."); 
    }
};

export const updateJobStatus = async (jobId: string, status: 'pending' | 'processing' | 'completed' | 'failed', resultUrl?: string, errorMessage?: string) => {
    try {
        const updates: any = { status, updated_at: new Date().toISOString() };
        
        if (status === 'completed') {
            // Explicitly clear error message if successful to avoid confusing "Completed + Error" state
            // This handles cases where a job was previously marked failed/refunded by cleanup race condition but then completed successfully
            updates.error_message = null;
        }

        if (resultUrl) {
            const { data: jobData } = await supabase.from('generation_jobs').select('user_id').eq('id', jobId).single();
            if (jobData?.user_id) {
                // Try to upload to Supabase
                const persistentUrl = await persistResultToStorage(jobData.user_id, resultUrl);
                
                // If upload succeeded, use new URL. If failed (null), use original Google URL.
                updates.result_url = persistentUrl || resultUrl;
            } else {
                updates.result_url = resultUrl;
            }
        }
        
        if (errorMessage) updates.error_message = errorMessage;
        
        await supabase.from('generation_jobs').update(updates).eq('id', jobId);
    } catch (e) {
        console.error("[JobService] Update status error:", e);
    }
};

export const getQueuePosition = async (jobId: string): Promise<number> => {
    try {
        const { data } = await supabase.from('generation_jobs').select('created_at').eq('id', jobId).single();
        if (!data) return 0;
        const { count } = await supabase.from('generation_jobs').select('*', { count: 'exact', head: true }).in('status', ['pending', 'processing']).lt('created_at', data.created_at);
        return (count || 0) + 1;
    } catch (e) { return 0; }
};

/**
 * Tự động tìm các job bị treo quá 15 phút (hoặc 60 phút cho video) và hoàn tiền
 */
export const cleanupStuckJobs = async (userId: string) => {
    try {
        // Tìm các job đang processing nhưng tạo cách đây hơn 15 phút (Base threshold)
        const baseThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString(); 
        
        const { data: stuckJobs, error } = await supabase
            .from('generation_jobs')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'processing')
            .lt('created_at', baseThreshold);

        if (error) {
            console.error("[JobService] Error fetching stuck jobs:", error);
            return;
        }

        if (stuckJobs && stuckJobs.length > 0) {
            console.log(`[JobService] Found ${stuckJobs.length} potentially stuck jobs...`);
            const now = Date.now();
            
            for (const job of stuckJobs) {
                // Special handling for Video Generation which takes longer
                // Assuming tool_id for video is 'VideoGeneration'
                const isVideo = job.tool_id === 'VideoGeneration';
                const jobTime = new Date(job.created_at).getTime();
                const minutesElapsed = (now - jobTime) / (1000 * 60);

                // If Video, allow up to 60 minutes before killing
                if (isVideo && minutesElapsed < 60) {
                    continue; 
                }

                console.log(`[JobService] Refunding stuck job ${job.id} (Elapsed: ${Math.round(minutesElapsed)}m)`);

                // 1. Hoàn tiền nếu có usage_log_id
                if (job.usage_log_id && job.cost > 0) {
                    await refundCredits(userId, job.cost, 'Hoàn tiền tự động: Quá thời gian xử lý (Timeout)', job.usage_log_id);
                }
                
                // 2. Cập nhật trạng thái job thành failed
                await updateJobStatus(job.id, 'failed', undefined, 'System Timeout: Auto-refunded due to inactivity');
            }
        }
    } catch (e) {
        console.error("[JobService] Critical error in cleanupStuckJobs:", e);
    }
};
