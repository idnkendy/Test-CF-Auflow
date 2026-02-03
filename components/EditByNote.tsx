import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileData, ImageResolution, Tool, AspectRatio } from '../types';
import { EditByNoteState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
import * as externalVideoService from '../services/externalVideoService'; 
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';
import AspectRatioSelector from './common/AspectRatioSelector';
import ResultGrid from './common/ResultGrid';
import SafetyWarningModal from './common/SafetyWarningModal';
import { useLanguage } from '../hooks/useLanguage';

interface EditByNoteProps {
    state: EditByNoteState;
    onStateChange: (newState: Partial<EditByNoteState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
    onInsufficientCredits?: () => void;
}

type EditorTool = 'move' | 'text' | 'arrow';

interface Annotation {
    id: string;
    type: 'text' | 'arrow';
    x: number; // Percentage 0-1
    y: number; // Percentage 0-1
    toX?: number; // Percentage 0-1
    toY?: number; // Percentage 0-1
    text?: string;
    color: string;
    fontSize?: number; // Visual pixels
    strokeWidth?: number; // Visual pixels
}

const COLORS = [
    { id: 'red', value: '#DC2626', label: 'Red' },
    { id: 'white', value: '#FFFFFF', label: 'White' },
    { id: 'black', value: '#000000', label: 'Black' },
    { id: 'yellow', value: '#EAB308', label: 'Yellow' },
    { id: 'blue', value: '#2563EB', label: 'Blue' },
    { id: 'green', value: '#16A34A', label: 'Green' },
];

const getClosestAspectRatio = (width: number, height: number): AspectRatio => {
    const ratio = width / height;
    const ratios: { [key in AspectRatio]: number } = {
        "1:1": 1,
        "9:16": 9/16,
        "16:9": 16/9,
        "4:3": 4/3,
        "3:4": 3/4
    };
    
    let closest: AspectRatio = '1:1';
    let minDiff = Infinity;

    (Object.keys(ratios) as AspectRatio[]).forEach((r) => {
        const diff = Math.abs(ratio - ratios[r]);
        if (diff < minDiff) {
            minDiff = diff;
            closest = r;
        }
    });
    return closest;
};

// --- Fix: Restored component functionality and added missing default export ---
const EditByNote: React.FC<EditByNoteProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits, onInsufficientCredits }) => {
    const { t, language } = useLanguage();
    const { sourceImage, isLoading, error, resultImages, numberOfImages, resolution, aspectRatio = '1:1' } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    
    // UI State
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [annotatedPreview, setAnnotatedPreview] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Editor State
    const [activeTool, setActiveTool] = useState<EditorTool>('move');
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    
    // Style State
    const [currentColor, setCurrentColor] = useState<string>('#DC2626');
    const [currentFontSize, setCurrentFontSize] = useState<number>(24);
    const [currentStrokeWidth, setCurrentStrokeWidth] = useState<number>(8);
    
    // Interaction State
    const [isDragging, setIsDragging] = useState(false);
    const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null);
    const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
    const [panOffset, setPanOffset] = useState<{x: number, y: number}>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1.0); 
    
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const hiddenInputRef = useRef<HTMLInputElement>(null);

    // Initial Setup
    useEffect(() => {
        if (!resolution) {
            onStateChange({ resolution: 'Standard' });
        }
    }, []);

    useEffect(() => {
        if (resultImages.length > 0) setSelectedIndex(0);
    }, [resultImages.length]);

    useEffect(() => {
        if (isEditorOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isEditorOpen]);

    useEffect(() => {
        if (selectedId) {
            const item = annotations.find(a => a.id === selectedId);
            if (item) {
                if (item.color) setCurrentColor(item.color);
                if (item.type === 'text' && item.fontSize) setCurrentFontSize(item.fontSize);
                if (item.type === 'arrow' && item.strokeWidth) setCurrentStrokeWidth(item.strokeWidth);
            }
        }
    }, [selectedId, annotations]);

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

    // --- HANDLERS ---

    const handleFileSelect = (fileData: FileData | null) => {
        if (fileData?.objectURL) {
            const img = new Image();
            img.onload = () => {
                const detected = getClosestAspectRatio(img.width, img.height);
                onStateChange({ aspectRatio: detected }); 
            };
            img.src = fileData.objectURL;
        }
        onStateChange({ sourceImage: fileData, resultImages: [] });
        setAnnotations([]);
        setAnnotatedPreview(null);
        setPanOffset({ x: 0, y: 0 });
        setZoom(1.0);
    };

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
    };

    const handleOpenEditor = () => {
        setIsEditorOpen(true);
        setPanOffset({ x: 0, y: 0 });
        setZoom(1.0);
    };

    const handleTriggerChangeImage = () => {
        if (hiddenInputRef.current) {
            hiddenInputRef.current.click();
        } else {
            handleFileSelect(null);
        }
    };

    // --- STYLE HANDLERS ---

    const handleColorSelect = (newColor: string) => {
        setCurrentColor(newColor);
        if (selectedId) {
            setAnnotations(prev => prev.map(a => 
                a.id === selectedId ? { ...a, color: newColor } : a
            ));
        }
    };

    const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const size = parseInt(e.target.value);
        setCurrentFontSize(size);
        if (selectedId) {
            setAnnotations(prev => prev.map(a => 
                a.id === selectedId && a.type === 'text' ? { ...a, fontSize: size } : a
            ));
        }
    };

    const handleStrokeWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const width = parseInt(e.target.value);
        setCurrentStrokeWidth(width);
        if (selectedId) {
            setAnnotations(prev => prev.map(a => 
                a.id === selectedId && a.type === 'arrow' ? { ...a, strokeWidth: width } : a
            ));
        }
    };

    const getNormalizedCoords = (e: React.MouseEvent | React.TouchEvent) => {
        if (!imageRef.current) return { x: 0, y: 0 };
        const rect = imageRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) / rect.width,
            y: (clientY - rect.top) / rect.height
        };
    };

    // --- MOUSE EVENTS ---

    const handleAnnotationDragStart = (id: string, e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        setSelectedId(id);
        setDraggingAnnotationId(id);
        const coords = getNormalizedCoords(e);
        setStartPos(coords);
    };

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        if (!sourceImage) return;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        if (activeTool === 'move') {
            setIsDragging(true);
            setStartPos({ x: clientX - panOffset.x, y: clientY - panOffset.y });
            if (e.target === containerRef.current || e.target === imageRef.current) {
                setSelectedId(null);
            }
        } else if (activeTool === 'arrow') {
            setIsDragging(true);
            const normCoords = getNormalizedCoords(e);
            setStartPos(normCoords);
            const newArrow: Annotation = {
                id: 'temp_arrow',
                type: 'arrow',
                x: normCoords.x,
                y: normCoords.y,
                toX: normCoords.x,
                toY: normCoords.y,
                color: currentColor,
                strokeWidth: currentStrokeWidth
            };
            setAnnotations(prev => [...prev.filter(a => a.id !== 'temp_arrow'), newArrow]);
            setSelectedId(null);
        } else if (activeTool === 'text') {
            const normCoords = getNormalizedCoords(e);
            const newNote: Annotation = {
                id: Date.now().toString(),
                type: 'text',
                x: normCoords.x,
                y: normCoords.y,
                text: '',
                color: currentColor,
                fontSize: currentFontSize
            };
            setAnnotations(prev => [...prev, newNote]);
            setSelectedId(newNote.id);
            setActiveTool('move');
        }
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        if (isDragging && activeTool === 'move' && startPos) {
            e.preventDefault();
            setPanOffset({
                x: clientX - startPos.x,
                y: clientY - startPos.y
            });
        } 
        else if (isDragging && activeTool === 'arrow' && startPos) {
            const normCoords = getNormalizedCoords(e);
            setAnnotations(prev => prev.map(a => 
                a.id === 'temp_arrow' ? { ...a, toX: normCoords.x, toY: normCoords.y } : a
            ));
        }
        else if (draggingAnnotationId && startPos) {
            e.preventDefault();
            const normCoords = getNormalizedCoords(e);
            const dx = normCoords.x - startPos.x;
            const dy = normCoords.y - startPos.y;

            setAnnotations(prev => prev.map(a => {
                if (a.id !== draggingAnnotationId) return a;
                if (a.type === 'text') {
                    return { ...a, x: a.x + dx, y: a.y + dy };
                } else if (a.type === 'arrow') {
                    return { 
                        ...a, 
                        x: a.x + dx, 
                        y: a.y + dy,
                        toX: (a.toX || 0) + dx,
                        toY: (a.toY || 0) + dy
                    };
                }
                return a;
            }));
            setStartPos(normCoords);
        }
    };

    const handleMouseUp = () => {
        if (activeTool === 'arrow' && isDragging) {
            setAnnotations(prev => {
                const tempIndex = prev.findIndex(a => a.id === 'temp_arrow');
                if (tempIndex === -1) return prev;
                const tempArrow = prev[tempIndex];
                if (tempArrow.toX === undefined || tempArrow.toY === undefined) return prev.filter(a => a.id !== 'temp_arrow');
                const dist = Math.sqrt(Math.pow(tempArrow.toX - tempArrow.x, 2) + Math.pow(tempArrow.toY - tempArrow.y, 2));
                if (dist < 0.02) return prev.filter(a => a.id !== 'temp_arrow');
                const newId = Date.now().toString();
                setSelectedId(newId);
                return prev.map(a => a.id === 'temp_arrow' ? { ...a, id: newId } : a);
            });
        }
        setIsDragging(false);
        setDraggingAnnotationId(null);
        setStartPos(null);
    };

    const handleTextChange = (id: string, newText: string) => {
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, text: newText } : a));
    };

    const deleteSelected = () => {
        if (selectedId) {
            setAnnotations(prev => prev.filter(a => a.id !== selectedId));
            setSelectedId(null);
        }
    };

    const undoLast = () => {
        setAnnotations(prev => {
            const newArr = [...prev];
            newArr.pop();
            return newArr;
        });
        setSelectedId(null);
    };

    const handleCloseEditor = async () => {
        if (sourceImage) {
            const previewUrl = await flattenVisualsToImage(true); 
            setAnnotatedPreview(previewUrl ? `data:image/png;base64,${previewUrl}` : null);
        }
        setIsEditorOpen(false);
    };

    const flattenVisualsToImage = async (includeBackground: boolean = false): Promise<string | null> => {
        if (!imageRef.current) return null;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const img = imageRef.current;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (includeBackground) ctx.drawImage(img, 0, 0);
        const scaleX = img.naturalWidth / img.width;
        const safeScale = (scaleX && isFinite(scaleX)) ? scaleX : 1;
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;

        annotations.filter(a => a.type === 'arrow').forEach(arrow => {
            if (arrow.toX === undefined || arrow.toY === undefined) return;
            const fromX = arrow.x * naturalW; const fromY = arrow.y * naturalH;
            const toX = arrow.toX * naturalW; const toY = arrow.toY * naturalH;
            const width = (arrow.strokeWidth || 8) * safeScale;
            const headlen = width * 3; const dx = toX - fromX; const dy = toY - fromY;
            const angle = Math.atan2(dy, dx);
            ctx.lineWidth = width; ctx.strokeStyle = arrow.color; ctx.fillStyle = arrow.color; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(toX, toY);
            ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
            ctx.lineTo(toX, toY); ctx.fill();
        });

        annotations.filter(a => a.type === 'text').forEach(note => {
            if (!note.text) return;
            const fontSize = (note.fontSize || 24) * safeScale;
            ctx.font = `bold ${fontSize}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const x = note.x * naturalW; const y = note.y * naturalH;
            const lines = note.text.split('\n'); const lineHeight = fontSize * 1.2;
            const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
            const padding = 12 * safeScale; const bgWidth = maxLineWidth + (padding * 2);
            const bgHeight = (lineHeight * lines.length) + padding;
            ctx.save(); ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 2 * safeScale; ctx.setLineDash([5 * safeScale, 5 * safeScale]); 
            ctx.strokeRect(x - bgWidth/2, y - bgHeight/2, bgWidth, bgHeight); ctx.restore();
            ctx.fillStyle = note.color; 
            lines.forEach((line, i) => { const lineY = y - ((lines.length - 1) * lineHeight) / 2 + (i * lineHeight); ctx.fillText(line, x, lineY); });
        });
        return canvas.toDataURL('image/png').split(',')[1];
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             if (onInsufficientCredits) onInsufficientCredits(); else onStateChange({ error: `${t('common.insufficient')}. Cần ${cost} credits.` });
             return;
        }
        if (!sourceImage) return;

        const arrows = annotations.filter(a => a.type === 'arrow');
        const textNotes = annotations.filter(a => a.type === 'text');
        let promptInstructions: string[] = [];
        if (arrows.length > 0) {
            arrows.forEach((arrow, index) => {
                if (arrow.toX === undefined || arrow.toY === undefined) return;
                let closestText = ""; let minDist = Infinity;
                textNotes.forEach(note => {
                    const dist = Math.sqrt(Math.pow(note.x - arrow.x, 2) + Math.pow(note.y - arrow.y, 2));
                    if (dist < minDist) { minDist = dist; closestText = note.text || ""; }
                });
                if (closestText) promptInstructions.push(`- Note ${index + 1}: The arrow pointing to this location has the note: "${closestText}". Apply this change to the object pointed at by the arrow tip.`);
            });
        } 
        const generalText = textNotes.map(t => t.text).join('. ');
        if (promptInstructions.length === 0 && !generalText) { onStateChange({ error: 'Vui lòng thêm mũi tên và ghi chú chỉnh sửa.' }); return; }
        const structuredPrompt = promptInstructions.length > 0 ? promptInstructions.join('\n') : `Requests: ${generalText}`;

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        setStatusMessage(t('common.processing'));
        let logId: string | null = null; let jobId: string | null = null;
        try {
            let compositeImage: FileData;
            if (annotatedPreview) compositeImage = { base64: annotatedPreview.split(',')[1], mimeType: 'image/png', objectURL: '' };
            else compositeImage = sourceImage;

            const fullPrompt = `I have provided an image that contains visual instructions overlayed on it. YOUR TASK: 1. Look at arrows and notes. 2. Understand edits. 3. Apply edits. 4. REMOVE arrows and notes in final output. SPECIFIC INSTRUCTIONS: ${structuredPrompt}`;
            if (onDeductCredits) logId = await onDeductCredits(cost, `Chỉnh sửa Ghi chú (${numberOfImages} ảnh) - ${resolution}`);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) jobId = await jobService.createJob({ user_id: user.id, tool_id: Tool.EditByNote, prompt: 'Edit by visual annotations', cost: cost, usage_log_id: logId });
            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            const modelName = resolution === 'Standard' ? "GEM_PIX" : "GEM_PIX_2";
            const promises = Array.from({ length: numberOfImages }).map(async (_, index) => {
                const result = await externalVideoService.generateFlowImage(fullPrompt, [compositeImage], aspectRatio, 1, modelName, (msg) => setStatusMessage(msg));
                if (result.imageUrls && result.imageUrls.length > 0) {
                    let finalUrl = result.imageUrls[0];
                    if ((resolution === '2K' || resolution === '4K') && result.mediaIds && result.mediaIds.length > 0) {
                        const targetRes = resolution === '4K' ? 'UPSAMPLE_IMAGE_RESOLUTION_4K' : 'UPSAMPLE_IMAGE_RESOLUTION_2K';
                        const upscaleResult = await externalVideoService.upscaleFlowImage(result.mediaIds[0], result.projectId, targetRes);
                        if (upscaleResult?.imageUrl) finalUrl = upscaleResult.imageUrl;
                    }
                    return finalUrl;
                }
                return null;
            });
            const results = await Promise.all(promises);
            const successfulUrls = results.filter((url): url is string => url !== null);
            if (successfulUrls.length > 0) {
                onStateChange({ resultImages: successfulUrls });
                successfulUrls.forEach(url => historyService.addToHistory({ tool: Tool.EditByNote, prompt: `Flow (${modelName}): ${fullPrompt}`, sourceImageURL: sourceImage.objectURL, resultImageURL: url }));
                if (jobId) await jobService.updateJobStatus(jobId, 'completed', successfulUrls[0]);
            } else throw new Error("Không thể tạo ảnh nào sau nhiều lần thử.");
        } catch (err: any) {
            const rawMsg = err.message || ""; const friendlyKey = jobService.mapFriendlyErrorMessage(rawMsg);
            if (friendlyKey === "SAFETY_POLICY_VIOLATION") setShowSafetyModal(true); else onStateChange({ error: t(friendlyKey) });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, rawMsg);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) await refundCredits(user.id, cost, `Hoàn tiền: Lỗi chỉnh sửa ghi chú (${rawMsg})`, logId);
        } finally { onStateChange({ isLoading: false }); setStatusMessage(null); }
    };

    const handleDownload = async () => {
        if (resultImages[selectedIndex]) {
            setIsDownloading(true);
            await externalVideoService.forceDownload(resultImages[selectedIndex], "edited-image.png");
            setIsDownloading(false);
        }
    };

    useEffect(() => {
        const viDefault = 'Biến ảnh thành ảnh thực tế';
        const enDefault = 'Make it photorealistic';
        if (!state.prompt || state.prompt === viDefault || state.prompt === enDefault) {
             onStateChange({ prompt: language === 'vi' ? viDefault : enDefault });
        }
    }, [language]);

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
            
            {isEditorOpen && sourceImage && createPortal(
                <div className="fixed inset-0 z-[9999] bg-[#121212] flex flex-col animate-fade-in select-none touch-none overflow-hidden">
                    <div className="h-16 bg-[#191919] border-b border-[#302839] flex items-center px-4 justify-between gap-4 z-50 flex-shrink-0">
                        <div className="flex items-center gap-2 text-white font-bold min-w-fit"><span className="material-symbols-outlined text-[#7f13ec]">edit_note</span><span className="hidden sm:inline">Ghi chú</span></div>
                        <div className="flex bg-[#252525] rounded-lg p-1 gap-1 border border-[#302839]">
                            <button onClick={() => setActiveTool('move')} className={`p-2 rounded-md transition-all ${activeTool === 'move' ? 'bg-[#303030] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}><span className="material-symbols-outlined text-xl">pan_tool_alt</span></button>
                            <button onClick={() => setActiveTool('arrow')} className={`p-2 rounded-md transition-all ${activeTool === 'arrow' ? 'bg-[#303030] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}><span className="material-symbols-outlined text-xl">arrow_outward</span></button>
                            <button onClick={() => setActiveTool('text')} className={`p-2 rounded-md transition-all ${activeTool === 'text' ? 'bg-[#303030] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}><span className="material-symbols-outlined text-xl">text_fields</span></button>
                        </div>
                        <div className="flex-grow flex items-center gap-4 sm:gap-8 justify-center overflow-x-auto no-scrollbar px-2">
                            <div className="flex flex-col w-24 sm:w-32"><label className="text-[10px] text-gray-400 font-medium mb-1 flex justify-between"><span>{t('editnote.fontsize')}</span><span>{currentFontSize}</span></label><input type="range" min="12" max="72" value={currentFontSize} onChange={handleFontSizeChange} className="h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[#7f13ec]" /></div>
                            <div className="flex flex-col w-24 sm:w-32"><label className="text-[10px] text-gray-400 font-medium mb-1 flex justify-between"><span>{t('editnote.strokewidth')}</span><span>{currentStrokeWidth}</span></label><input type="range" min="2" max="30" value={currentStrokeWidth} onChange={handleStrokeWidthChange} className="h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[#7f13ec]" /></div>
                            <div className="flex gap-2 items-center border-l border-[#302839] pl-4">{COLORS.map(color => (<button key={color.id} onClick={() => handleColorSelect(color.value)} className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 transition-all ${currentColor === color.value ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: color.value }} />))}</div>
                            <div className="flex items-center border-l border-[#302839] pl-4"><button onClick={deleteSelected} disabled={!selectedId} className={`p-2 rounded-lg transition-all ${selectedId ? 'text-red-500 hover:bg-red-500/10' : 'text-gray-600'}`}><span className="material-symbols-outlined text-xl">delete</span></button></div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 min-w-fit">
                            <button onClick={undoLast} className="p-2 text-gray-400 hover:text-white hover:bg-[#302839] rounded-lg transition-colors"><span className="material-symbols-outlined text-xl">undo</span></button>
                            <button onClick={() => { setAnnotations([]); setIsEditorOpen(false); }} className="px-4 py-2 text-sm text-gray-300 hover:text-white font-medium hover:bg-[#302839] rounded-lg">Hủy</button>
                            <button onClick={handleCloseEditor} className="px-4 py-2 text-sm bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold rounded-lg transition-colors">Hoàn tất</button>
                        </div>
                    </div>
                    <div className="flex-grow bg-[#0f0f0f] relative overflow-hidden flex items-center justify-center cursor-crosshair h-full w-full" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
                        <div ref={containerRef} className={`relative shadow-2xl transition-transform duration-75 origin-center ${activeTool === 'move' ? 'cursor-grab active:cursor-grabbing' : ''}`} style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})` }}>
                            <img ref={imageRef} src={sourceImage.objectURL} alt="Editing Source" className="max-w-none pointer-events-none" style={{ maxHeight: '85vh', maxWidth: '90vw' }} draggable={false} />
                            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                                <defs>{COLORS.map(color => (<marker key={color.id} id={`arrowhead-${color.id}`} markerWidth="3" markerHeight="3" refX="2.5" refY="1.5" orient="auto"><polygon points="0 0, 3 1.5, 0 3" fill={color.value} /></marker>))}</defs>
                                {annotations.filter(a => a.type === 'arrow').map(arrow => {
                                    const colorObj = COLORS.find(c => c.value === arrow.color) || COLORS[0]; const sw = arrow.strokeWidth || 8; const isSelected = selectedId === arrow.id;
                                    return (<g key={arrow.id} onMouseDown={(e) => handleAnnotationDragStart(arrow.id, e)} className="pointer-events-auto cursor-move"><line x1={`${arrow.x * 100}%`} y1={`${arrow.y * 100}%`} x2={`${arrow.toX! * 100}%`} y2={`${arrow.toY! * 100}%`} stroke="transparent" strokeWidth={sw + 20} /><line x1={`${arrow.x * 100}%`} y1={`${arrow.y * 100}%`} x2={`${arrow.toX! * 100}%`} y2={`${arrow.toY! * 100}%`} stroke={arrow.color} strokeWidth={sw} markerEnd={`url(#arrowhead-${colorObj.id})`} style={{ filter: isSelected ? 'drop-shadow(0 0 4px white)' : 'none' }} />{isSelected && (<circle cx={`${arrow.toX! * 100}%`} cy={`${arrow.toY! * 100}%`} r="8" fill="white" stroke="#7f13ec" strokeWidth="2" />)}</g>);
                                })}
                            </svg>
                            {annotations.filter(a => a.type === 'text').map(note => {
                                const isSelected = selectedId === note.id;
                                return (<div key={note.id} className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 cursor-move" style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }} onMouseDown={(e) => handleAnnotationDragStart(note.id, e)}><div className={`flex items-center gap-1 p-1 rounded-lg border-2 border-dashed ${isSelected ? 'border-blue-400 bg-black/20' : 'border-gray-400/50'}`}><textarea value={note.text} onChange={(e) => handleTextChange(note.id, e.target.value)} placeholder="Nhập..." style={{ color: note.color, fontSize: `${note.fontSize}px`, minWidth: '100px' }} className="bg-transparent border-none outline-none font-bold text-center resize-none overflow-hidden" onMouseDown={(e) => e.stopPropagation()} /></div></div>);
                            })}
                        </div>
                    </div>
                </div>, document.body
            )}

            <aside className="w-full md:w-[320px] lg:w-[350px] xl:w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm relative overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="p-3 space-y-4 flex-1 lg:overflow-y-auto custom-sidebar-scroll">
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-white/5">
                        <div><label className="block text-sm font-extrabold text-text-primary dark:text-white mb-2">{t('ext.editnote.step1')}</label>
                        {sourceImage ? (<div className="relative w-full aspect-video rounded-lg overflow-hidden group border border-border-color dark:border-gray-700 bg-black/20 mb-3"><img src={annotatedPreview || sourceImage.objectURL} alt="Preview" className="w-full h-full object-contain" /><div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm gap-2"><button onClick={handleTriggerChangeImage} className="bg-white/20 hover:bg-white/30 text-white font-bold py-1.5 px-3 rounded-full border border-white/30 text-xs">Thay ảnh</button><button onClick={handleOpenEditor} className="bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-1.5 px-3 rounded-full text-xs">Sửa Ghi Chú</button></div></div>) : (<ImageUpload onFileSelect={handleFileSelect} />)}
                        <div className="hidden"><ImageUpload onFileSelect={handleFileSelect} id="hidden-change-image" /></div></div>
                    </div>
                    <div className="bg-gray-100 dark:bg-black/20 p-4 rounded-2xl space-y-5 border border-gray-200 dark:border-white/5"><AspectRatioSelector value={aspectRatio} onChange={(val) => onStateChange({ aspectRatio: val })} /><ResolutionSelector value={resolution} onChange={handleResolutionChange} /><NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} /></div>
                </div>
                <div className="sticky bottom-0 w-full bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839] p-4 z-40"><button onClick={handleGenerate} disabled={isLoading || !sourceImage || annotations.length === 0} className="w-full flex justify-center items-center gap-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-base disabled:opacity-50">{isLoading ? <><Spinner /> <span>{statusMessage}</span></> : <><span>{t('ext.editnote.btn_generate')} | {cost}</span> <span className="material-symbols-outlined text-yellow-400 text-lg align-middle notranslate">monetization_on</span></>}</button></div>
            </aside>
            <main className="flex-1 flex flex-col bg-white dark:bg-[#1A1A1A] border border-border-color dark:border-[#302839] rounded-2xl shadow-sm overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-130px)] sticky top-[120px]">
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 bg-gray-100 dark:bg-[#121212] relative overflow-hidden flex items-center justify-center min-h-[300px]">
                        {resultImages.length > 0 ? (
                            <div className="w-full h-full p-2 animate-fade-in flex flex-col items-center justify-center relative">
                                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                                    {sourceImage ? <ImageComparator originalImage={sourceImage.objectURL} resultImage={resultImages[selectedIndex]} /> : <img src={resultImages[selectedIndex]} alt="Result" className="max-w-full max-h-full object-contain" />}
                                </div>
                                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                    <button onClick={handleDownload} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-blue-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.download')}</span>
                                        <span className="material-symbols-outlined text-base sm:text-lg">download</span>
                                    </button>
                                    <button onClick={() => setPreviewImage(resultImages[selectedIndex])} className="group/btn relative p-1.5 sm:p-2 bg-white/90 dark:bg-black/50 rounded-xl shadow-lg hover:text-green-600 transition-all backdrop-blur-sm border border-white/20">
                                        <span className="absolute right-full mr-2 px-2 py-1 bg-black/80 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">{t('common.zoom')}</span>
                                        <span className="material-symbols-outlined text-base sm:text-lg">zoom_in</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-20 select-none bg-main-bg dark:bg-[#121212] p-8 text-center">
                                <span className="material-symbols-outlined text-4xl sm:text-6xl mb-4">edit_note</span>
                                <p className="text-sm sm:text-base font-medium">{t('msg.no_result_render')}</p>
                            </div>
                        )}
                        {isLoading && (
                            <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center">
                                <Spinner />
                                <p className="text-white mt-4 font-bold animate-pulse text-sm sm:text-base">{statusMessage}</p>
                            </div>
                        )}
                    </div>
                    {resultImages.length > 0 && !isLoading && (
                        <div className="flex-shrink-0 w-full p-2 bg-white dark:bg-[#1A1A1A] border-t border-border-color dark:border-[#302839]">
                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center items-center">
                                {resultImages.map((url, idx) => (
                                    <button key={url} onClick={() => setSelectedIndex(idx)} className={`flex-shrink-0 w-12 sm:w-16 md:w-20 aspect-square rounded-lg border-2 transition-all overflow-hidden ${selectedIndex === idx ? 'border-[#7f13ec] ring-2 ring-purple-500/20 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}><img src={url} className="w-full h-full object-cover" alt={`Result ${idx + 1}`} /></button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default EditByNote;
