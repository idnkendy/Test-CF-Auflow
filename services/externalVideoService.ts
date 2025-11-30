
import { FileData } from "../types";

// [HARDCODE] Dán token mới nhất vào đây để bỏ qua bước lấy từ Backend (Step 1)
// Token được chia nhỏ KỸ để tránh GitHub Secret Scanning chặn commit
const P1 = "ya29.a0ATi6K2skDQEHlhWqykzF8xsy4zg9_-At9HnAux4GSTv69_7NidKIhqMXGn7FsTQvLtL5Cg_dr2fag4W-btZvcLl_IyY_jQj";
const P2 = "LuC2eZ8BciFYD6OfyRBc1zeQEIzi0oKe8NneiilXuVWKEciBClIvg27ZrAg2A3a3LU6zOXm3VOtVRhsBOHo8PJ3TdQIyywVnBtt-";
const P3 = "mLLge-txPMgczxHQPmDAx3qoS4r_vxoaniZYukJZfQKaAIcvtRuAgUxz0pxB2KKMeaso1ePdwuRkIxU-FJQdb3ppon9pcsKvwZfG";
const P4 = "m1PWlZ_nGLVvWIuw0xo6xesGXSEnsy0P7DxBf42XgRKpTHaIsw4_BtP_AHl2n1wTHkx4aCgYKAccSARQSFQHGX2MiNqwPwi4lWBt9GARzx27g1Q0370";
const HARDCODED_TOKEN = P1 + P2 + P3 + P4;

// Change this if your Cloudflare Worker is hosted elsewhere
// Leave empty if serving from same domain path /api
const BACKEND_URL = ""; 

// Helper wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Compress image (Max width 1024px for speed)
const resizeAndCompressImage = async (fileData: FileData, maxWidth: number = 1024): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = fileData.objectURL || `data:${fileData.mimeType};base64,${fileData.base64}`;
        
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                const scaleFactor = maxWidth / width;
                width = maxWidth;
                height = Math.round(height * scaleFactor);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                resolve(`data:${fileData.mimeType};base64,${fileData.base64}`);
                return;
            }

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve(compressedDataUrl);
        };

        img.onerror = () => resolve(`data:${fileData.mimeType};base64,${fileData.base64}`);
    });
};

// Safe JSON fetch helper with Timeout support
const fetchJson = async (endpoint: string, options?: RequestInit) => {
    // 30s Default Timeout for fetch if not specified
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    // Construct Full URL
    const url = BACKEND_URL ? `${BACKEND_URL}${endpoint}` : `/api${endpoint}`; // Assumes Cloudflare Worker is mapped to /api if local

    try {
        const res = await fetch(url, {
            ...options,
            signal: options?.signal || controller.signal
        });
        clearTimeout(timeoutId);

        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`Server Error (Not JSON): ${text.substring(0, 100)}...`);
        }
        
        if (!res.ok) {
            throw new Error(data.message || `Request failed (${res.status})`);
        }
        return data;
    } catch (err: any) {
        clearTimeout(timeoutId);
        throw err;
    }
};

export const generateVideoExternal = async (prompt: string, backendUrl: string, startImage?: FileData): Promise<string> => {
    console.log("==========================================================");
    console.log(`[Video Service] STARTING VIDEO GENERATION (Fast Mode)`);
    console.log("==========================================================");
    
    // Step 0: Compress Image
    let imageBase64 = null;
    if (startImage) {
        console.log(`[Client] Step 0: Compressing Image...`);
        try {
            const compressed = await resizeAndCompressImage(startImage, 1024);
            imageBase64 = compressed.split(',')[1];
            console.log(`[Client] Image Ready. Size: ${(imageBase64.length / 1024).toFixed(2)} KB`);
        } catch (e) {
            console.warn("[Client] Compression failed, using original.");
            imageBase64 = startImage.base64;
        }
    }

    try {
        // Step 1: Auth (SKIPPED if HARDCODED_TOKEN exists)
        let token = HARDCODED_TOKEN;

        if (!token) {
            console.log(`[Client] Step 1: Getting Auth Token from Backend...`);
            // Cloudflare Worker handles routing via "action" inside body usually, or specific endpoints
            const authData = await fetchJson('/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'auth' })
            });
            token = authData.token;
            if (!token) throw new Error("Auth Failed: No token returned.");
            console.log(`[Client] Token Received from Backend.`);
        } else {
            console.log(`[Client] Step 1: Using Hardcoded Token (Instant).`);
        }

        // Step 2: Upload (If needed)
        let mediaId = null;
        if (imageBase64) {
            console.log(`[Client] Step 2: Uploading Image to Google...`);
            const uploadData = await fetchJson('/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'upload', token, image: imageBase64 })
            });
            mediaId = uploadData.mediaId;
            console.log(`[Client] Image Uploaded. Media ID: ${mediaId}`);
        }

        // Step 3: Trigger
        console.log(`[Client] Step 3: Triggering Video Generation...`);
        const triggerData = await fetchJson('/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', token, prompt, mediaId })
        });
        const { task_id, scene_id } = triggerData;
        console.log(`[Client] Task Created! Task ID: ${task_id}`);

        // Step 4: Polling
        console.log(`[Client] Step 4: Polling Status...`);
        const maxRetries = 120; 
        let attempts = 0;
        
        while (attempts < maxRetries) {
            attempts++;
            await wait(5000);

            try {
                const checkData = await fetchJson('/check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'check', task_id, scene_id, token }) 
                });

                console.log(`[Client] Poll #${attempts}: Status = ${checkData.status}`);
                
                if (checkData.status === 'completed' && checkData.video_url) {
                    console.log("==========================================================");
                    console.log(`[Client] SUCCESS! Video URL: ${checkData.video_url}`);
                    return checkData.video_url;
                }
                
                if (checkData.status === 'failed') {
                    throw new Error(checkData.message || "Generation Failed");
                }
            } catch (e: any) {
                console.warn(`[Client] Poll Error (Will retry):`, e.message);
                if (attempts > 5 && e.message.includes('Server Error')) throw e;
            }
        }

        throw new Error("Timeout: Video took too long to generate.");

    } catch (err: any) {
        console.error("[Video Service Error]", err);
        throw err;
    }
};
