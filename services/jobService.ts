
import { supabase } from './supabaseClient';
import { GenerationJob } from '../types';
import { refundCredits } from './paymentService';

const BUCKET_NAME = 'assets';

// Helper: Compress image to JPEG to save storage space
const compressImage = async (blob: Blob): Promise<Blob> => {
    // If it's not an image, return as is
    if (!blob.type.startsWith('image/')) return blob;
    
    // If it's already small enough (< 500KB), return as is
    if (blob.size < 500 * 1024) return blob;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Resize if too big (max 1920px width/height)
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

            // Draw white background (for transparent PNGs converting to JPEG)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG at 80% quality
            canvas.toBlob((compressedBlob) => {
                if (compressedBlob && compressedBlob.size < blob.size) {
                    resolve(compressedBlob);
                } else {
                    resolve(blob); // If compression didn't help, return original
                }
            }, 'image/jpeg', 0.8);
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
// This prevents saving massive Base64 strings to the DB and handles temporary external URLs
const persistResultToStorage = async (userId: string, data: string): Promise<string | null> => {
    try {
        // 1. Check if it's already a Supabase URL (Don't re-upload)
        if (data.includes('supabase.co') && data.includes(BUCKET_NAME)) {
            return data;
        }

        let blob: Blob;
        let extension = 'jpg'; // Default to jpg due to compression

        // 2. Handle Base64 String
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
        // 3. Handle Remote URL (Google/Veo Temporary URLs)
        else if (data.startsWith('http')) {
            try {
                const response = await fetch(data);
                if (!response.ok) throw new Error('Failed to fetch remote URL');
                blob = await response.blob();
                // We will convert everything to jpg for consistency and size, unless it's video
                if (blob.type.startsWith('video')) {
                    extension = 'mp4';
                }
            } catch (fetchError) {
                console.warn("Could not fetch remote URL for persistence (keeping original):", fetchError);
                return data; // Fallback to original URL if fetch fails
            }
        } 
        else {
            return data;
        }

        // 4. Compress Image (Optimize storage usage)
        if (blob.type.startsWith('image/')) {
            blob = await compressImage(blob);
            extension = 'jpg';
        }

        // 5. Generate Path
        // Format: userId/jobs/timestamp_random.ext
        const fileName = `${userId}/jobs/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${extension}`;

        // 6. Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, blob, {
                cacheControl: '31536000', // Cache for 1 year
                upsert: false,
                contentType: blob.type
            });

        if (uploadError) {
            console.error("Error uploading job result to storage:", uploadError);
            return null;
        }

        // 7. Get Public URL
        const { data: publicData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
        return publicData.publicUrl;

    } catch (e) {
        console.error("Exception in persistResultToStorage:", e);
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

        // --- OPTIMIZATION: Persist Media ---
        if (resultUrl) {
            // We need userId to organize folder structure. Fetch it first.
            const { data: jobData } = await supabase
                .from('generation_jobs')
                .select('user_id')
                .eq('id', jobId)
                .single();
            
            if (jobData && jobData.user_id) {
                // Automatically upload Base64 or External URLs to Supabase Storage
                // This ensures DB stays light and links don't expire
                const persistentUrl = await persistResultToStorage(jobData.user_id, resultUrl);
                updates.result_url = persistentUrl || resultUrl; // Fallback to original if upload fails
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
    // This function is deliberately empty on the client side.
    // Cleanup tasks are handled by Supabase pg_cron to prevent client-side DB load spikes.
    return; 
};
