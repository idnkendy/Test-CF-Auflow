
import React, { useState, useMemo, useEffect } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { DiagramGeneratorState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService'; 
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
import SafetyWarningModal from './common/SafetyWarningModal';
import ImageComparator from './ImageComparator';
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
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false); 
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

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
        onStateChange({ diagramType: selectedValue, prompt: selectedValue });
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             return;
        }
        if (!sourceImage) return;

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));

        const fullPrompt = `${prompt} Ensure the output maintains professional architectural diagram aesthetics.`;
        
        try {
            if (onDeductCredits) await onDeductCredits(cost, `Tạo Diagram (${numberOfImages} ảnh) - ${resolution}`);
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";

            const result = await externalVideoService.generateFlowImage(
                fullPrompt, [sourceImage], aspectRatio, numberOfImages, modelName,
                (msg) => setStatusMessage(msg)
            );

            if (result.imageUrls) {
                onStateChange({ resultImages: result.imageUrls });
                result.imageUrls.forEach(url => historyService.addToHistory({ tool: Tool.DiagramGenerator, prompt: fullPrompt, sourceImageURL: sourceImage.objectURL, resultImageURL: url }));
            }
        } catch (err: any) {
            const rawMsg = err.message || "";
            let friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") setShowSafetyModal(true);
            else onStateChange({ error: t(friendlyKey) });
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleDownload = async () => {
        if (resultImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImages[selectedIndex], `diagram-${Date.now()}.png`);
            setIsDownloading(false);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 md:gap-8 max-w-[1920px] mx-auto items-stretch px-2 sm:px-4">
            <style>{`
                .custom-sidebar-scroll::-webkit-scrollbar { width: 5px; }
                .custom-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb { background: #334155; }
                .dark .custom-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #7f13ec; }
            `}</style>

            <SafetyWarningModal isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="p-3 space-y-4 flex-1 overflow-y-auto custom-sidebar-scroll">
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.diagram.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                    </div>
                    
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <OptionSelector id="diagram-type" label={t('ext.diagram.step2')} options={diagramPresets} value={diagramType} onChange={handlePresetChange} variant="grid" />
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.diagram.step3')}</label>
                            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                                <textarea rows={6} className="w-full bg-transparent outline-none text-sm resize-none font-medium text-text-primary dark:text-white" placeholder="Mô tả diagram..." value={prompt} onChange={(e) => onStateChange({ prompt: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} />
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                    </div>
                </div>

                <div className="sticky bottom-0 w-full bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] p-4 z-40 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base">
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('ext.diagram.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm min-h-full overflow-hidden">
                <div className="p-0 flex flex-col h-full items-start">
                    <div className="w-full bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex flex-col items-start min-h-[400px]">
                        {resultImages.length > 0 ? (
                            <div className="w-full p-0 animate-fade-in flex flex-col items-start relative">
                                <div className="w-full min-h-[300px] sm:min-h-[450px] lg:min-h-[550px] flex items-center justify-center">
                                    {sourceImage ? (
                                        <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[selectedIndex]} />
                                    ) : (
                                        <img src={resultImages[selectedIndex]} alt="Result" className="max-w-full max-h-[75vh] object-contain" />
                                    )}
                                </div>
                                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                    <button onClick={handleDownload} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">download</span></button>
                                    <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20"><span className="material-symbols-outlined text-lg">zoom_in</span></button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center py-40 opacity-20 select-none bg-main-bg dark:bg-[#121212]">
                                <span className="material-symbols-outlined text-6xl mb-4">schema</span>
                                <p className="text-base font-medium">{t('msg.no_result_render')}</p>
                            </div>
                        )}
                        {isLoading && (
                            <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
                                <Spinner />
                                <p className="text-white mt-4 font-bold animate-pulse">{statusMessage}</p>
                            </div>
                        )}
                    </div>

                    {resultImages.length > 0 && !isLoading && (
                        <div className="w-full p-3 sm:p-4 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839]">
                            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                                {resultImages.map((url, idx) => (
                                    <button key={url} onClick={() => setSelectedIndex(idx)} className={`flex-shrink-0 w-24 sm:w-32 aspect-video rounded-lg border-2 transition-all overflow-hidden ${selectedIndex === idx ? 'border-[#7f13ec] ring-2 ring-purple-500/20 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                                        <img src={url} className="w-full h-full object-cover" alt={`Result ${idx + 1}`} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default DiagramGenerator;
