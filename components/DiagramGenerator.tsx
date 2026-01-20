
import React, { useState, useMemo } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { DiagramGeneratorState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService'; // Flow Import
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import OptionSelector from './common/OptionSelector';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import AspectRatioSelector from './common/AspectRatioSelector';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResultGrid from './common/ResultGrid';
import SafetyWarningModal from './common/SafetyWarningModal'; // NEW
import { useLanguage } from '../hooks/useLanguage';

interface DiagramGeneratorProps {
    state: DiagramGeneratorState;
    onStateChange: (newState: Partial<DiagramGeneratorState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

const DiagramGenerator: React.FC<DiagramGeneratorProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { prompt, sourceImage, isLoading, error, resultImages, numberOfImages, diagramType, resolution, aspectRatio } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [upscaleWarning, setUpscaleWarning] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false); // NEW

    // Dynamic Presets using translations
    // NOTE: For 'value', we must provide English prompts if the language is English to help the AI.
    const diagramPresets = useMemo(() => [
        {
            label: t('diag.preset.exploded'),
            value: language === 'vi' 
                ? "Tạo một axonometric exploded diagram từ ảnh render này.\nGiữ đúng hình khối và tỷ lệ công trình gốc.\nXây dựng lại mô hình dưới dạng axonometric và tách thành các lớp:\n– mái\n– tầng trên\n– tầng dưới\n– mặt sàn\n– nền/đế\nHiển thị các lớp theo dạng exploded view với đường dẫn chấm thẳng đứng.\nNét mảnh, đồng đều, độ rõ cao, đơn giản hóa chi tiết nhưng giữ đúng hình học.\nThêm nhãn chú thích Mặt bằng tầng 1,2,3 theo thứ tự từ dưới lên.\nKhông thêm chi tiết mới ngoài hình gốc."
                : "Create an axonometric exploded diagram from this render.\nMaintain original building massing and proportions.\nReconstruct the model in axonometric view and separate into layers:\n- roof\n- upper floor\n- lower floor\n- floor slab\n- base/foundation\nDisplay layers in exploded view with vertical dashed guidelines.\nThin, consistent lines, high clarity, simplified details but geometrically accurate.\nAdd labels for Floor 1, 2, 3 in ascending order.\nDo not add new details outside the original image."
        },
        {
            label: t('diag.preset.concept'),
            value: language === 'vi'
                ? "Tạo một concept diagram kiến trúc bằng cách vẽ các đường sketch, nét bút chì và ghi chú lên trên ảnh render này.\nGiữ nguyên hình ảnh gốc và thêm các yếu tố diagram như:\n– mũi tên tay vẽ (hand-drawn arrows)\n– vòng cung chỉ hướng\n– ký hiệu ánh sáng, gió, mặt trời\n– ghi chú text ngắn mô tả công năng, hướng gió, ánh sáng, lối vào, khoảng mở\n– khung chữ viết tay (handwritten annotation boxes)\n– đường nét trắng nhẹ, phong cách schematic architectural diagram\n\nPhong cách: giống bản phác thảo kiến trúc sư trên mô hình, nét tự nhiên, mềm, hơi nguệch ngoạc nhưng thẩm mỹ.\nKhông làm thay đổi hình khối công trình trong ảnh gốc.\nKhông thêm chi tiết mới, chỉ overlay diagram lên trên.\nKết quả: một concept architectural diagram đẹp, trực quan, giống bản viết tay minh họa ý tưởng."
                : "Create an architectural concept diagram by overlaying sketch lines, pencil strokes, and notes on this render.\nKeep the original image and add diagram elements such as:\n- hand-drawn arrows\n- directional arcs\n- symbols for light, wind, sun\n- short text notes describing function, wind direction, light, entrances, openings\n- handwritten annotation boxes\n- light white lines, schematic architectural diagram style\n\nStyle: like an architect's sketch over a model, natural, soft, slightly loose but aesthetic strokes.\nDo not alter the building massing in the original image.\nDo not add new details, only overlay diagram elements.\nResult: a beautiful, intuitive concept architectural diagram, resembling a hand-drawn idea illustration."
        },
        {
            label: t('diag.preset.axonometric'),
            value: language === 'vi'
                ? "Biến ảnh đầu vào thành phong cách biểu diễn kiến trúc dạng diagram. Giữ công trình chính nổi bật với màu sắc vật liệu phong cách technical illustration, đường nét sạch, mô hình hóa theo dạng 3D massing. Render theo phong cách axonometric / isometric.\nLàm mờ và giản lược toàn bộ bối cảnh xung quanh thành các khối trắng tinh, ít chi tiết, viền mảnh. Nhà cửa, đường phố, cây xanh chuyển thành tone trắng – xám nhạt như mô hình study mass.\nTập trung thể hiện rõ hình khối kiến trúc chính, các đường cong, tầng setback, ban công, cửa sổ trình bày bằng các đường line đều và tối giản.\nLoại bỏ texture thực tế, ánh sáng mềm, không đổ bóng mạnh.\nPhong cách tổng thể giống mô hình concept kiến trúc, minimal, clean, high-level design diagram"
                : "Transform the input image into an architectural diagram representation style. Keep the main building prominent with technical illustration style material colors, clean lines, modeled as 3D massing. Render in axonometric / isometric style.\nBlur and simplify the entire surrounding context into pure white blocks, low detail, thin outlines. Houses, streets, trees become white-light gray tones like a study mass model.\nFocus on clearly showing the main architectural massing, curves, setbacks, balconies, windows presented with even and minimalist lines.\nRemove realistic textures, soft lighting, no strong shadows.\nOverall style resembles an architectural concept model, minimal, clean, high-level design diagram."
        },
        {
            label: t('diag.preset.annotation'),
            value: language === 'vi'
                ? "Hãy biến bức ảnh tôi cung cấp thành một Architectural Annotation Diagram chi tiết.\nYêu cầu:\n 1. Vẽ overlay đường viền trắng (white outline) lên toàn bộ các chi tiết kiến trúc quan trọng: mái, cột, lan can, bậc tam cấp, tượng đá, phù điêu, đá lát…\n 2. Thêm mũi tên chú thích bằng tiếng Việt + tiếng Anh cho từng bộ phận (song ngữ).\n 3. Tạo icon minh họa line-art màu trắng cho từng loại vật liệu/chi tiết như: ngói, cột đá, phù điêu, đá lát, tượng.\n 4. Mỗi icon đặt cạnh label và có đường line trắng (leader line) dẫn đến vị trí đúng trong ảnh.\n 5. Phong cách minh họa giống kiến trúc kỹ thuật: rõ ràng, sạch sẽ, cân đối, nhẹ nhàng nhưng chính xác.\n 6. Giữ ảnh chụp gốc làm nền, overlay đường viền và label lên trên như bản phân tích kiến trúc.\n 7. Xuất ra ảnh diagram hoàn chỉnh + danh sách chi tiết + mô tả ngắn về phong cách.\n8 lưu ý phải chú thích đúng vật liệu và vị trí."
                : "Transform the provided image into a detailed Architectural Annotation Diagram.\nRequirements:\n 1. Draw white outline overlays on all important architectural details: roof, columns, railings, steps, statues, reliefs, paving stones...\n 2. Add annotation arrows in English for each part.\n 3. Create white line-art illustrative icons for each material/detail type: tiles, stone columns, reliefs, paving, statues.\n 4. Place each icon next to a label with a white leader line pointing to the correct position in the image.\n 5. Illustration style resembles technical architecture: clear, clean, balanced, light but accurate.\n 6. Keep the original photo as background, overlay outlines and labels like an architectural analysis.\n 7. Output a complete diagram image + detail list + short style description.\n 8. Note: must annotate correct materials and positions."
        }
    ], [t, language]);
    
    const getCostPerImage = () => {
        switch (resolution) {
            case 'Standard': return 5;
            case '1K': return 10;
            case '2K': return 20;
            case '4K': return 30;
            default: return 5;
        }
    };
    const unitCost = getCostPerImage();
    const cost = numberOfImages * unitCost;

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, resultImages: [] });
    };

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
    };

    const handlePresetChange = (selectedValue: string) => {
        onStateChange({ 
            diagramType: selectedValue, 
            prompt: selectedValue 
        });
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) {
                 onInsufficientCredits();
             } else {
                 onStateChange({ error: `${t('common.insufficient')}. Cần ${cost} credits.` });
             }
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên ảnh mô hình/công trình.' });
            return;
        }

        if (!prompt.trim()) {
            onStateChange({ error: 'Vui lòng chọn loại diagram hoặc nhập mô tả.' });
            return;
        }

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('ext.floorplan.analyzing'));
        setUpscaleWarning(null);

        const fullPrompt = `${prompt} Ensure the output maintains professional architectural diagram aesthetics.`;
        
        // Use Flow for ALL resolutions
        const useFlow = true;
        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Tạo Diagram (${numberOfImages} ảnh) - ${resolution}`);
            }
            
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.DiagramGenerator,
                    prompt: fullPrompt,
                    cost: cost,
                    usage_log_id: logId
                });
            }
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            let imageUrls: string[] = [];

            if (useFlow) {
                // --- FLOW LOGIC ---
                const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
                const collectedUrls: string[] = [];
                let lastError: any = null;

                const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                    try {
                        setStatusMessage(t('common.processing'));
                        const result = await externalVideoService.generateFlowImage(
                            fullPrompt, 
                            [sourceImage], 
                            aspectRatio, // Pass actual ratio string directly
                            1, 
                            modelName, 
                            (msg) => setStatusMessage(t('common.processing'))
                        );
                        
                        if (result.imageUrls && result.imageUrls.length > 0) {
                            let finalUrl = result.imageUrls[0];
                            
                            // Upscale Check (2K or 4K)
                            const shouldUpscale = (resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0;
                            
                            if (shouldUpscale) {
                                setStatusMessage(resolution === '4K' ? 'Đang xử lý (Upscale 4K)...' : 'Đang xử lý (Upscale 2K)...');
                                try {
                                    const mediaId = result.mediaIds[0];
                                    if (mediaId) {
                                        const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                                        const upscaleRes = await externalVideoService.upscaleFlowImage(mediaId, result.projectId, targetRes, aspectRatio);
                                        if (upscaleRes?.imageUrl) finalUrl = upscaleRes.imageUrl;
                                    }
                                } catch (e: any) {
                                    throw new Error(`Lỗi Upscale: ${e.message}`);
                                }
                            }
                            
                            collectedUrls.push(finalUrl);
                            onStateChange({ resultImages: [...collectedUrls] });
                            historyService.addToHistory({ 
                                tool: Tool.DiagramGenerator, 
                                prompt: `Flow (${modelName}): ${fullPrompt}`, 
                                sourceImageURL: sourceImage.objectURL, 
                                resultImageURL: finalUrl 
                            });
                        }
                    } catch (e: any) {
                        console.error(`Image ${index+1} failed`, e);
                        lastError = e;
                    }
                });

                await Promise.all(promises);
                if (collectedUrls.length === 0) {
                    const errorMsg = lastError ? (lastError.message || lastError.toString()) : "Không thể tạo ảnh nào. Vui lòng thử lại sau.";
                    throw new Error(errorMsg);
                }
                
                // --- PARTIAL REFUND ---
                const failedCount = numberOfImages - collectedUrls.length;
                if (failedCount > 0 && logId && user) {
                    const refundAmount = failedCount * unitCost;
                    await refundCredits(user.id, refundAmount, `Hoàn tiền: ${failedCount} ảnh lỗi`, logId);
                    onStateChange({ 
                        error: `Đã tạo thành công ${collectedUrls.length}/${numberOfImages} ảnh. Hệ thống đã hoàn lại ${refundAmount} credits cho ${failedCount} ảnh bị lỗi.` 
                    });
                }
                
                imageUrls = collectedUrls;

            } else {
                // Fallback (Not reached with useFlow=true)
                setStatusMessage(t('common.processing'));
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(fullPrompt, aspectRatio, resolution, sourceImage, jobId || undefined);
                    return images[0];
                });
                imageUrls = await Promise.all(promises);
                onStateChange({ resultImages: imageUrls });
                imageUrls.forEach(url => historyService.addToHistory({ tool: Tool.DiagramGenerator, prompt: fullPrompt, sourceImageURL: sourceImage.objectURL, resultImageURL: url }));
            }

            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);

        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyMsg = jobService.mapFriendlyErrorMessage(rawMsg);
            
            // --- SAFETY MODAL TRIGGER ---
            if (friendlyMsg === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
                onStateChange({ error: t('msg.safety_violation') });
            } else {
                onStateChange({ error: friendlyMsg });
            }
            
            // DB records specific raw message
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
            
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi hệ thống toàn bộ (${rawMsg})`, logId);
                if (friendlyMsg !== "SAFETY_POLICY_VIOLATION") friendlyMsg += " (Credits đã được hoàn trả)";
            }
        } finally {
            onStateChange({ isLoading: false });
            setStatusMessage(null);
        }
    };

    const handleDownload = async () => {
        if (resultImages.length === 0) return;
        setIsDownloading(true);
        await externalVideoService.forceDownload(resultImages[0], `diagram-generated-${Date.now()}.png`);
        setIsDownloading(false);
    };

    return (
        <div className="flex flex-col gap-8">
            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <h2 className="text-2xl font-bold text-text-primary dark:text-white mb-4">{t('ext.diagram.title')}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('ext.diagram.step1')}</label>
                        <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                    </div>
                    
                    <OptionSelector 
                        id="diagram-type"
                        label={t('ext.diagram.step2')}
                        options={diagramPresets}
                        value={diagramType}
                        onChange={handlePresetChange}
                        disabled={isLoading}
                        variant="grid"
                    />

                    <div>
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">{t('ext.diagram.step3')}</label>
                        <textarea
                            rows={6}
                            className="w-full bg-surface dark:bg-gray-700/50 border border-border-color dark:border-gray-600 rounded-lg p-3 text-text-primary dark:text-gray-200 focus:ring-2 focus:ring-accent focus:outline-none transition-all"
                            placeholder="Chọn một loại diagram ở trên hoặc tự nhập mô tả..."
                            value={prompt}
                            onChange={(e) => onStateChange({ prompt: e.target.value })}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} disabled={isLoading} />
                        </div>
                        <div>
                            <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} disabled={isLoading} />
                        </div>
                    </div>

                    <ResolutionSelector value={resolution} onChange={handleResolutionChange} disabled={isLoading} />

                    <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                            <span className="material-symbols-outlined text-yellow-500 text-sm">monetization_on</span>
                            <span>{t('common.cost')}: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                        </div>
                        <div className="text-xs">
                            {userCredits < cost ? (
                                <span className="text-red-500 font-semibold">{t('common.insufficient')} ({t('common.available')}: {userCredits})</span>
                            ) : (
                                <span className="text-green-600 dark:text-green-400">{t('common.available')}: {userCredits}</span>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !sourceImage}
                        className="w-full flex justify-center items-center gap-3 bg-accent hover:bg-accent-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                        {isLoading ? <><Spinner /> {statusMessage || t('common.processing')}</> : t('ext.diagram.btn_generate')}
                    </button>
                    {error && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-300 rounded-lg text-sm">{error}</div>}
                    {upscaleWarning && <div className="text-xs text-yellow-500 text-center">{upscaleWarning}</div>}
                </div>

                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-text-primary dark:text-white">{t('common.result')}</h3>
                        {resultImages.length > 0 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPreviewImage(resultImages[0])}
                                    className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-text-primary dark:text-white transition-colors"
                                    title="Phóng to"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                </button>
                                <button 
                                    onClick={handleDownload} 
                                    disabled={isDownloading}
                                    className="flex items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white px-3 py-1.5 rounded-lg font-bold shadow-lg text-sm transition-colors"
                                >
                                    {isDownloading ? <Spinner /> : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                    )}
                                    <span>{t('common.download')}</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="w-full aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-border-color dark:border-gray-700 flex items-center justify-center overflow-hidden">
                        {isLoading ? (
                            <div className="flex flex-col items-center">
                                <Spinner />
                                <p className="mt-2 text-gray-400">{statusMessage}</p>
                            </div>
                        ) : resultImages.length > 0 ? (
                             <ResultGrid images={resultImages} toolName="diagram-generator" />
                        ) : (
                             <p className="text-text-secondary dark:text-gray-400 text-center p-4">{t('msg.no_result_render')}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DiagramGenerator;
