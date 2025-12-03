
import { supabase } from './supabaseClient';
import { GenerationJob } from '../types';
import { refundCredits } from './paymentService';

const BUCKET_NAME = 'assets';

// Helper: Upload Base64 to Supabase Storage
const uploadBase64ToStorage = async (userId: string, base64Data: string): Promise<string | null> => {
    try {
        // 1. Convert Base64 to Blob
        const arr = base64Data.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });

        // 2. Generate path
        const fileExt = mime.split('/')[1] || 'png';
        const fileName = `${userId}/jobs/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

        // 3. Upload
        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, blob, {
                cacheControl: '31536000',
                upsert: false
            });

        if (uploadError) {
            console.error("Error uploading job result to storage:", uploadError);
            return null;
        }

        // 4. Get Public URL
        const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
        return data.publicUrl;

    } catch (e) {
        console.error("Exception uploading job result:", e);
        return null;
    }
};

export const createJob = async (jobData: Partial<GenerationJob>): Promise<string | null> => {
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
            return null;
        }
        return data.id;
    } catch (e: any) {
        console.error("Exception creating job:", e.message || e);
        return null;
    }
};

export const updateJobStatus = async (jobId: string, status: 'pending' | 'processing' | 'completed' | 'failed', resultUrl?: string, errorMessage?: string) => {
    try {
        const updates: any = {
            status,
            updated_at: new Date().toISOString()
        };

        // --- OPTIMIZATION START: Handle Base64 ---
        if (resultUrl) {
            // Check if it's a Base64 string (starts with data:image...)
            if (resultUrl.startsWith('data:')) {
                // We need userId to organize folder structure. Fetch it first.
                const { data: jobData } = await supabase
                    .from('generation_jobs')
                    .select('user_id')
                    .eq('id', jobId)
                    .single();
                
                if (jobData && jobData.user_id) {
                    // Upload to Storage and swap Base64 for a clean URL
                    const publicUrl = await uploadBase64ToStorage(jobData.user_id, resultUrl);
                    if (publicUrl) {
                        updates.result_url = publicUrl;
                    } else {
                        // Fallback: Save Base64 if upload fails (not recommended but preserves data)
                        updates.result_url = resultUrl; 
                    }
                } else {
                     updates.result_url = resultUrl;
                }
            } else {
                // Usually already a URL (e.g. from video service)
                updates.result_url = resultUrl;
            }
        }
        // --- OPTIMIZATION END ---

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

// Deprecated: Client no longer has access to API Keys.
export const updateJobApiKey = async (jobId: string, apiKey: string) => {
    return;
};

export const getQueuePosition = async (jobId: string, knownCreatedAt?: string): Promise<number> => {
    try {
        let createdAt = knownCreatedAt;

        // Step 1: If we don't know the created_at, fetch it (Costs 1 DB call)
        if (!createdAt) {
            const { data: currentJob, error: fetchError } = await supabase
                .from('generation_jobs')
                .select('created_at')
                .eq('id', jobId)
                .single();

            if (fetchError || !currentJob) return 0;
            createdAt = currentJob.created_at;
        }

        // Step 2: Count jobs ahead (Costs 1 DB call - optimized with index)
        const { count, error } = await supabase
            .from('generation_jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pending', 'processing'])
            .lt('created_at', createdAt!); // '!' asserted because we handled null above

        if (error) return 0;
        
        return (count || 0) + 1;
    } catch (e) {
        return 0;
    }
};

export const cleanupStaleJobs = async (userId: string) => {
    // This function should ideally be removed from client-side usage 
    // and handled by Supabase pg_cron or Edge Functions.
    return; 
};
