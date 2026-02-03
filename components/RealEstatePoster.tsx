import React, { useState, useMemo, useEffect } from 'react';
import { FileData, Tool, ImageResolution, AspectRatio } from '../types';
import { RealEstatePosterState } from '../state/toolState';
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

interface RealEstatePosterProps {
    state: RealEstatePosterState;
    onStateChange: (newState: Partial<RealEstatePosterState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

// Local Error Modal Component
const ErrorModal: React.FC<{ isOpen: boolean; onClose: () => void; message: string }> = ({ isOpen, onClose, message }) => {
    const { t } = useLanguage();
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
            <div className="bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#302839] rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center animate-scale-up">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-red-600 dark:text-red-500 text-4xl">error</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('common.error')}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6 leading-relaxed">{message}</p>
                <button 
                    onClick={onClose}
                    className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-black font-bold rounded-xl transition-all hover:opacity-90"
                >
                    {t('common.close')}
                </button>
            </div>
        </div>
    );
};

const RealEstatePoster: React.FC<RealEstatePosterProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { prompt, sourceImage, isLoading, error, resultImages, numberOfImages, posterStyle, resolution, aspectRatio } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false); 
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [localErrorMessage, setLocalErrorMessage] = useState("");

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);
    
    // Handle Default Prompt Switching
    useEffect(() => {
        const viDefault = 'Thiết kế poster bất động sản sang trọng, hiện đại. Bao gồm tiêu đề lớn, thông tin nổi bật, bố cục tạp chí. Giữ hình ảnh công trình làm chủ đạo.';
        const enDefault = 'Design a luxurious, modern real estate poster. Include large headline, key information, magazine layout. Keep the building image as the main focus.';
        
        // If current prompt is empty or matches one of the defaults, update it
        if (!prompt || prompt === viDefault || prompt === enDefault) {
             onStateChange({ prompt: language === 'vi' ? viDefault : enDefault });
        }
    }, [language]);

    const posterPresets = useMemo(() => [
        {
            label: t('poster.preset.infographic'),
            value: language === 'vi' 
                ? "Hãy tạo một poster bất động sản cao cấp theo đúng phong cách infographic như hình mẫu:\n• Hình dự án ở dưới, chiếm 40–50% poster\n• Phía trên là danh sách tiện ích xung quanh dạng cột đứng có ảnh minh họa và số thứ tự\n• Typography sang trọng, sắc nét, mô phỏng phong cách thiết kế cao cấp quốc tế.\n\nYÊU CẦU BỐ CỤC:\n 1. Khu tiện ích (phần trên poster)\n\n • Tạo 4–6 ô tiện ích dạng hình chữ nhật đứng.\n • Mỗi ô gồm:\n• ảnh minh họa tiện ích\n• số thứ tự (01–05)\n• tiêu đề tiện ích\n• mô tả ngắn 1 dòng\n • Các ô xếp thành hàng ngang, có hiệu ứng phát sáng nhẹ.\n\n 2. Khu hình dự án\n\n • Đặt hình dự án lớn ở phần dưới poster.\n • Tăng độ sáng – độ trong – hiệu ứng ánh đèn vàng warm.\n • Giữ đúng đường nét công trình.\n\n 3. Tiêu đề chính\n\n • Text sang trọng:\nĐÓN ĐẦU NGUỒN KHÁCH DỒI DÀO QUANH NĂM\n • Hoặc AI tự đề xuất tiêu đề phù hợp.\n\n 4. Tagline dự án\n\n • Ví dụ:\nTỌA ĐỘ GIAO THƯƠNG ĐẮT GIÁ – BỨT PHÁ TIỀM NĂNG KINH DOANH\n • Font serif hoặc sans-serif luxury.\n\n 5. Logo & branding\n\n • Đặt logo dự án phía dưới phải.\n • Tông màu vàng gold / trắng.\n\n 6. Màu sắc & phong cách\n\n • Tone xanh–nâu–xám sang trọng.\n • Ánh sáng mềm, mang cảm giác cao cấp.\n • Dùng hiệu ứng chiều sâu và transition mượt giữa phần trên & dưới.\n\nOUTPUT\n\n• 1 poster hoàn chỉnh theo layout giống hình tôi gửi\n• Có tiện ích → hình dự án → tagline → logo\n• Bố cục đẹp, rõ, sang trọng — dùng được ngay cho marketing BĐS."
                : "Create a high-end real estate poster in an infographic style:\n• Project image at the bottom, occupying 40–50% of the poster\n• Above is a list of surrounding amenities in vertical columns with illustrations and numbers\n• Luxurious, sharp typography, simulating international high-end design style.\n\nLAYOUT REQUIREMENTS:\n 1. Amenities Area (top part)\n • Create 4–6 rectangular amenity boxes.\n • Each box includes: icon/image, number (01–05), title, short description.\n • Arranged horizontally with a slight glow effect.\n\n 2. Project Image Area\n • Large project image at the bottom.\n • Increase brightness, clarity, warm light effect.\n • Keep original building lines.\n\n 3. Main Title\n • Luxurious text: PRIME LOCATION - YEAR-ROUND TRAFFIC\n • Or AI suggests a suitable title.\n\n 4. Tagline\n • Example: GOLDEN INTERSECTION - BREAKTHROUGH BUSINESS POTENTIAL\n • Serif or luxury sans-serif font.\n\n 5. Logo & Branding\n • Logo at bottom right.\n • Gold/White tone.\n\n 6. Color & Style\n • Luxurious Blue-Brown-Gray tone.\n • Soft lighting, premium feel.\n • Depth effect and smooth transition.\n\nOUTPUT\n• 1 complete poster with layout\n• Amenities -> Project Image -> Tagline -> Logo\n• Beautiful, clear, luxurious layout ready for real estate marketing."
        },
        {
            label: t('poster.preset.luxury'),
            value: language === 'vi'
                ? "Hãy tạo một Poster Bất động sản chuyên nghiệp từ bức ảnh tòa nhà tôi cung cấp, theo phong cách hiện đại – sang trọng như các poster dự án cao cấp.\nYêu cầu:\n\n1. Thiết kế tổng thể\n • Nền gradient tối – xanh navy hoặc xanh đêm.\n • Phía dưới là hình tòa nhà (ảnh gốc) được làm sáng, nổi bật, tăng độ sắc nét.\n • Hiệu ứng ánh sáng vàng sang trọng trên các cửa kính.\n\n2. Bố cục thông tin\n • Tiêu đề lớn, nổi bật ở trung tâm poster:\nWHERE LUXURY MEETS LOCATION (hoặc tùy chỉnh theo ảnh)\n • Dòng mô tả nhỏ phía dưới: 3 & 4 BHK Prime Residencies hoặc nội dung phù hợp.\n\n3. Icon tiện ích xung quanh\n\nTạo các vòng tròn icon kết nối bằng nét đứt:\n • Hospital\n • Educational Institutions\n • Shopping Mall\n • Restaurants\n • Upcoming Highway\n(hoặc tự động nhận diện và tạo icon phù hợp với ảnh)\n\n4. Logo dự án\n • Thêm logo/mẫu logo ở chính giữa phía dưới (tự thiết kế dạng monogram sang trọng nếu ảnh không có logo).\n • Tông màu vàng hoặc trắng.\n\n5. Footer thông tin\n • Đặt thông tin liên hệ, hotline, địa chỉ ở cuối poster.\n • Typography hiện đại, dễ đọc.\n\n6. Phong cách\n • Luxury\n • Clean, minimal nhưng ấn tượng\n • Ánh sáng cinematic\n • Layout cân đối giống poster BĐS cao cấp quốc tế.\n\nHãy xuất ra 1 Poster hoàn chỉnh với bố cục đẹp, rõ ràng, mang tính thương mại và phù hợp marketing bất động sản."
                : "Create a Professional Real Estate Poster from the provided building image, in a Modern - Luxury style.\nRequirements:\n\n1. Overall Design\n • Dark gradient background – navy blue or night blue.\n • Project image at the bottom (original), brightened, sharpened.\n • Luxurious golden light effect on windows.\n\n2. Info Layout\n • Large title in center:\nWHERE LUXURY MEETS LOCATION\n • Subtitle: 3 & 4 BHK Prime Residencies.\n\n3. Amenity Icons\nCreate connected circle icons:\n • Hospital\n • Educational Institutions\n • Shopping Mall\n • Restaurants\n • Upcoming Highway\n\n4. Project Logo\n • Add logo/mockup logo at bottom center (luxury monogram style).\n • Gold or White tone.\n\n5. Footer Info\n • Contact info, hotline, address at the bottom.\n • Modern, readable typography.\n\n6. Style\n • Luxury\n • Clean, minimal but impressive\n • Cinematic lighting\n • Balanced layout like international real estate posters.\n\nOutput 1 complete Poster with beautiful, clear layout, commercial and suitable for marketing."
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
        onStateChange({ posterStyle: selectedValue as any, prompt: selectedValue });
    };
    
    const showError = (msg: string) => { setLocalErrorMessage(msg); setIsErrorModalOpen(true); };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits();
             else showError(t('common.insufficient'));
             return;
        }
        if (!sourceImage) return;

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));

        const fullPrompt = `Create a high-quality real estate marketing poster. Instructions: ${prompt}.`;
        let logId: string | null = null;
        
        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Tạo Poster BDS (${numberOfImages} ảnh) - ${resolution}`);
            }
            
            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const inputImages = [sourceImage];

            // Parallel Generation Loop
            const promises = Array.from({ length: numberOfImages }).map(async (_, idx) => {
                const result = await externalVideoService.generateFlowImage(
                    fullPrompt, 
                    inputImages, 
                    aspectRatio, 
                    1, // Force 1 image per request
                    modelName,
                    (msg) => setStatusMessage(`${t('common.processing')} (${idx+1}/${numberOfImages})`)
                );

                if (result.imageUrls && result.imageUrls.length > 0) {
                    let finalUrl = result.imageUrls[0];
                    if ((resolution === '2K' || resolution === '4K') && result.mediaIds?.[0]) {
                        const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                        const upResult = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes, aspectRatio);
                        if (upResult?.imageUrl) finalUrl = upResult.imageUrl;
                    }
                    return finalUrl;
                }
                return null;
            });

            const results = await Promise.all(promises);
            const successfulUrls = results.filter((url): url is string => url !== null);

            if (successfulUrls.length > 0) {
                onStateChange({ resultImages: successfulUrls });
                successfulUrls.forEach(url => historyService.addToHistory({ 
                    tool: Tool.RealEstatePoster, prompt: fullPrompt, 
                    sourceImageURL: sourceImage.objectURL, resultImageURL: url 
                }));
            } else {
                throw new Error("Không thể tạo ảnh nào sau nhiều lần thử.");
            }

        } catch (err: any) {
            const rawMsg = err.message || "";
            const friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") {
                setShowSafetyModal(true);
            } else {
                showError(t(friendlyKey));
            }

            // Refund logic
            if (logId && onDeductCredits) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    try {
                        await refundCredits(user.id, cost, `Hoàn tiền: Lỗi Poster (${rawMsg})`, logId);
                        if (friendlyKey !== "SAFETY_POLICY_VIOLATION") {
                            setLocalErrorMessage(prev => `${prev}\n\n(Credits đã được hoàn trả)`);
                        }
                    } catch (refundErr) {
                        console.error("Refund failed:", refundErr);
                    }
                }
            }
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleDownload = async () => {
        if (resultImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImages[selectedIndex], `poster-${Date.now()}.png`);
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
            <ErrorModal isOpen={isErrorModalOpen} onClose={() => setIsErrorModalOpen(false)} message={localErrorMessage} />
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="p-3 space-y-4 flex-1 lg:overflow-y-auto custom-sidebar-scroll">
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.poster.step1')}</label>
                            <ImageUpload onFileSelect={handleFileSelect} previewUrl={sourceImage?.objectURL} />
                        </div>
                    </div>
                    
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <OptionSelector id="poster-style" label={t('ext.poster.step2')} options={posterPresets} value={posterStyle} onChange={handlePresetChange} variant="grid" />
                        <div>
                            <label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.poster.step3')}</label>
                            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] shadow-inner">
                                <textarea rows={8} className="w-full bg-transparent outline-none text-sm resize-none font-medium text-text-primary dark:text-white" placeholder="Thông tin poster..." value={prompt} onChange={(e) => onStateChange({ prompt: e.target.value })} />
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5">
                        <AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} />
                        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                    </div>
                </div>
                <div className="p-4 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] lg:sticky lg:bottom-0 z-10 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base">
                        {isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('ext.poster.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-lg align-middle notranslate">monetization_on</span></>}
                    </button>
                </div>
            </aside>
            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm min-h-full overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex flex-col items-center justify-center min-h-[400px]">
                        {resultImages.length > 0 ? (
                            <div className="w-full h-full p-2 animate-fade-in flex flex-col items-center justify-center relative">
                                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                                    {sourceImage ? <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[selectedIndex]} /> : <img src={resultImages[selectedIndex]} alt="Result" className="max-w-full max-h-[75vh] object-contain" />}
                                </div>
                                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                    <button onClick={handleDownload} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.download')}</span>
                                        <span className="material-symbols-outlined text-lg">download</span>
                                    </button>
                                    <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.zoom')}</span>
                                        <span className="material-symbols-outlined text-lg">zoom_in</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center py-40 opacity-20 select-none bg-main-bg dark:bg-[#121212]"><span className="material-symbols-outlined text-6xl mb-4">campaign</span><p className="text-base font-medium">{t('msg.no_result_render')}</p></div>
                        )}
                        {isLoading && (
                            <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center"><Spinner /><p className="text-white mt-4 font-bold animate-pulse">{statusMessage}</p></div>
                        )}
                    </div>
                    {resultImages.length > 0 && !isLoading && (
                        <div className="flex-shrink-0 w-full p-2 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839]"><div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center items-center">{resultImages.map((url, idx) => (<button key={url} onClick={() => setSelectedIndex(idx)} className={`flex-shrink-0 w-12 sm:w-16 md:w-20 aspect-square rounded-lg border-2 transition-all overflow-hidden ${selectedIndex === idx ? 'border-[#7f13ec] ring-2 ring-purple-500/20 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}><img src={url} className="w-full h-full object-cover" alt={`Result ${idx + 1}`} /></button>))}</div></div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default RealEstatePoster;