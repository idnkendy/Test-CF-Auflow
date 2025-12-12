
import React, { useState, useRef, useEffect } from 'react';
import { FileData, ImageResolution, Tool } from '../types';
import { EditByNoteState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import { refundCredits } from '../services/paymentService';
import { supabase } from '../services/supabaseClient';
import Spinner from './Spinner';
import ImageUpload from './common/ImageUpload';
import ImageComparator from './ImageComparator';
import NumberOfImagesSelector from './common/NumberOfImagesSelector';
import ResolutionSelector from './common/ResolutionSelector';
import ImagePreviewModal from './common/ImagePreviewModal';

interface EditByNoteProps {
    state: EditByNoteState;
    onStateChange: (newState: Partial<EditByNoteState>) => void;
    userCredits?: number;
    onDeductCredits?: (amount: number, description: string) => Promise<string>;
}

type EditorTool = 'move' | 'text' | 'arrow';

interface Annotation {
    id: string;
    type: 'text' | 'arrow';
    x: number;
    y: number;
    toX?: number; // For arrows
    toY?: number; // For arrows
    text?: string; // For text notes
}

const EditByNote: React.FC<EditByNoteProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const { sourceImage, isLoading, error, resultImages, numberOfImages, resolution } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    
    // UI State
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [annotatedPreview, setAnnotatedPreview] = useState<string | null>(null);

    // Editor State
    const [activeTool, setActiveTool] = useState<EditorTool>('move');
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    
    // Interaction State
    const [isDragging, setIsDragging] = useState(false);
    const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
    const [panOffset, setPanOffset] = useState<{x: number, y: number}>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1.5); // Default 150%
    
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const hiddenInputRef = useRef<HTMLInputElement>(null); // For "Change Image" functionality

    // Initial Setup - Default to Standard (Nano Flash) if not set
    useEffect(() => {
        if (!resolution) {
            onStateChange({ resolution: 'Standard' });
        }
    }, []);

    // Reset when source image changes
    useEffect(() => {
        if (sourceImage) {
            setAnnotations([]);
            setAnnotatedPreview(null);
        }
    }, [sourceImage]);

    // Canvas Sizing & Cost
    const getCost = () => {
        switch (resolution) {
            case 'Standard': return 5;
            case '1K': return 15;
            case '2K': return 20;
            case '4K': return 30;
            default: return 5;
        }
    };
    const cost = numberOfImages * getCost();

    // --- HANDLERS ---

    const handleFileSelect = (fileData: FileData | null) => {
        onStateChange({ sourceImage: fileData, resultImages: [] });
        setAnnotations([]);
        setAnnotatedPreview(null);
        setPanOffset({ x: 0, y: 0 });
        setZoom(1.5);
    };

    const handleResolutionChange = (val: ImageResolution) => {
        onStateChange({ resolution: val });
    };

    const handleOpenEditor = () => {
        setIsEditorOpen(true);
        // Reset view for editing
        setPanOffset({ x: 0, y: 0 });
        setZoom(1.5);
    };

    const handleTriggerChangeImage = () => {
        // Trigger the hidden file input from the ImageUpload component would be hard to reach
        // So we use a hidden input here or reset the state to null to show upload UI
        if (hiddenInputRef.current) {
            hiddenInputRef.current.click();
        } else {
            handleFileSelect(null);
        }
    };

    // --- COORDINATE HELPERS ---
    const getRelativeCoords = (e: React.MouseEvent | React.TouchEvent) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        return {
            x: (clientX - rect.left),
            y: (clientY - rect.top)
        };
    };

    const toImageCoords = (screenX: number, screenY: number) => {
        // panOffset is handled by CSS transform, so screenX/Y (relative to container rect)
        // only needs to be divided by zoom to get internal unscaled coordinates.
        return {
            x: screenX / zoom,
            y: screenY / zoom
        };
    };

    // --- MOUSE EVENTS (Inside Editor) ---

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        if (!sourceImage) return;
        const coords = getRelativeCoords(e);
        const imgCoords = toImageCoords(coords.x, coords.y);
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        if (activeTool === 'move') {
            setIsDragging(true);
            // Store anchor: MousePos - CurrentPan
            setStartPos({ x: clientX - panOffset.x, y: clientY - panOffset.y });
        } else if (activeTool === 'arrow') {
            setIsDragging(true);
            setStartPos(imgCoords);
            const newArrow: Annotation = {
                id: 'temp_arrow',
                type: 'arrow',
                x: imgCoords.x,
                y: imgCoords.y,
                toX: imgCoords.x,
                toY: imgCoords.y
            };
            setAnnotations(prev => [...prev.filter(a => a.id !== 'temp_arrow'), newArrow]);
            setSelectedId(null);
        } else if (activeTool === 'text') {
            const newNote: Annotation = {
                id: Date.now().toString(),
                type: 'text',
                x: imgCoords.x,
                y: imgCoords.y,
                text: ''
            };
            setAnnotations(prev => [...prev, newNote]);
            setSelectedId(newNote.id);
            setActiveTool('move');
        }
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDragging) return;
        const coords = getRelativeCoords(e);
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        if (activeTool === 'move' && startPos) {
            e.preventDefault();
            // New Pan = CurrentMousePos - Anchor
            setPanOffset({
                x: clientX - startPos.x,
                y: clientY - startPos.y
            });
        } else if (activeTool === 'arrow' && startPos) {
            const imgCoords = toImageCoords(coords.x, coords.y);
            setAnnotations(prev => prev.map(a => 
                a.id === 'temp_arrow' ? { ...a, toX: imgCoords.x, toY: imgCoords.y } : a
            ));
        }
    };

    const handleMouseUp = () => {
        if (activeTool === 'arrow' && isDragging) {
            setAnnotations(prev => {
                const tempIndex = prev.findIndex(a => a.id === 'temp_arrow');
                if (tempIndex === -1) return prev;

                const tempArrow = prev[tempIndex];
                if (tempArrow.toX === undefined || tempArrow.toY === undefined) return prev.filter(a => a.id !== 'temp_arrow');

                const dist = Math.sqrt(
                    Math.pow(tempArrow.toX - tempArrow.x, 2) + 
                    Math.pow(tempArrow.toY - tempArrow.y, 2)
                );

                if (dist < 30) {
                    return prev.filter(a => a.id !== 'temp_arrow');
                }

                return prev.map(a => 
                    a.id === 'temp_arrow' ? { ...a, id: Date.now().toString() } : a
                );
            });
        }
        setIsDragging(false);
        setStartPos(null);
    };

    // --- ANNOTATION ACTIONS ---

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

    const clearAllAnnotations = () => {
        if (window.confirm("Bạn có chắc muốn xóa tất cả hình vẽ không?")) {
            setAnnotations([]);
            setSelectedId(null);
        }
    };

    // --- SAVE & CLOSE EDITOR ---
    const handleCloseEditor = async () => {
        // Generate preview of annotated image
        if (sourceImage) {
            const previewUrl = await flattenVisualsToImage(true); 
            setAnnotatedPreview(previewUrl ? `data:image/png;base64,${previewUrl}` : null);
        }
        setIsEditorOpen(false);
    };

    // --- GENERATION LOGIC ---

    const flattenVisualsToImage = async (includeBackground: boolean = false): Promise<string | null> => {
        if (!imageRef.current) return null;
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const img = imageRef.current;
        // Use natural dimensions for high quality
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (includeBackground) {
            ctx.drawImage(img, 0, 0);
        }

        const clientWidth = img.width; // This is the rendered width
        const scaleX = img.naturalWidth / clientWidth;
        const safeScale = (scaleX && isFinite(scaleX)) ? scaleX : 1;

        // Draw Arrows
        annotations.filter(a => a.type === 'arrow').forEach(arrow => {
            if (arrow.toX === undefined || arrow.toY === undefined) return;
            
            const fromX = arrow.x * safeScale;
            const fromY = arrow.y * safeScale;
            const toX = arrow.toX * safeScale;
            const toY = arrow.toY * safeScale;

            const headlen = 25 * safeScale; 
            const dx = toX - fromX;
            const dy = toY - fromY;
            const angle = Math.atan2(dy, dx);

            ctx.lineWidth = 8 * safeScale; 
            ctx.strokeStyle = '#DC2626'; 
            ctx.fillStyle = '#DC2626';
            ctx.lineCap = 'round';

            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(toX, toY);
            ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
            ctx.lineTo(toX, toY);
            ctx.fill();
        });

        // Draw Text (Updated to Dashed Border + Transparent Background)
        ctx.font = `bold ${24 * safeScale}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        annotations.filter(a => a.type === 'text').forEach(note => {
            if (!note.text) return;
            const x = note.x * safeScale;
            const y = note.y * safeScale;
            
            const textMetrics = ctx.measureText(note.text);
            const padding = 12 * safeScale;
            const bgWidth = textMetrics.width + (padding * 2);
            const bgHeight = 40 * safeScale; 

            // Dashed Border box (Simulating what user sees)
            ctx.save();
            ctx.strokeStyle = '#DC2626'; // Red Border
            ctx.lineWidth = 2 * safeScale;
            ctx.setLineDash([5 * safeScale, 5 * safeScale]); // Dashed line
            ctx.strokeRect(x - bgWidth/2, y - bgHeight/2, bgWidth, bgHeight);
            ctx.restore();
            
            // Text Color
            ctx.fillStyle = '#DC2626'; 
            ctx.fillText(note.text, x, y);
        });

        return canvas.toDataURL('image/png').split(',')[1];
    };

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             onStateChange({ error: `Bạn không đủ credits. Cần ${cost} credits nhưng chỉ còn ${userCredits}. Vui lòng nạp thêm.` });
             return;
        }

        if (!sourceImage) {
            onStateChange({ error: 'Vui lòng tải lên ảnh gốc.' });
            return;
        }

        // Aggregate prompts
        const notePrompts = annotations
            .filter(a => a.type === 'text' && a.text?.trim())
            .map(a => a.text)
            .join('. ');

        if (!notePrompts && annotations.length === 0) {
            onStateChange({ error: 'Vui lòng thêm ghi chú chỉnh sửa.' });
            return;
        }

        onStateChange({ isLoading: true, error: null, resultImages: [] });

        try {
            // WORKAROUND: Create an offscreen image to allow canvas drawing.
            const tempImg = new Image();
            tempImg.src = sourceImage.objectURL;
            await new Promise(r => tempImg.onload = r);
            
            // Temporary ref override for the helper function
            const originalRef = imageRef.current;
            // @ts-ignore
            imageRef.current = tempImg; 
            const guideBase64 = await flattenVisualsToImage(false); // Only arrows/text
            // @ts-ignore
            imageRef.current = originalRef; // Restore

            const guideImage: FileData | undefined = guideBase64 ? {
                base64: guideBase64,
                mimeType: 'image/png',
                objectURL: '' 
            } : undefined;

            const fullPrompt = `Edit the image based on the visual annotations (red arrows and text notes) overlaid on the guide image. Instructions: ${notePrompts}`;

            if (onDeductCredits) {
                await onDeductCredits(cost, `Chỉnh sửa Ghi chú (${numberOfImages} ảnh)`);
            }

            let results: { imageUrl: string }[] = [];

            const promises = Array.from({ length: numberOfImages }).map(async () => {
                const images = await geminiService.generateHighQualityImage(
                    fullPrompt, 
                    '1:1', 
                    resolution, 
                    sourceImage, 
                    undefined, 
                    undefined,
                    guideImage 
                );
                return { imageUrl: images[0] };
            });
            results = await Promise.all(promises);

            const imageUrls = results.map(r => r.imageUrl);
            onStateChange({ resultImages: imageUrls });

            imageUrls.forEach(url => {
                historyService.addToHistory({
                    tool: Tool.EditByNote,
                    prompt: fullPrompt,
                    sourceImageURL: sourceImage.objectURL,
                    resultImageURL: url,
                });
            });

        } catch (err: any) {
            onStateChange({ error: err.message || 'Đã xảy ra lỗi không mong muốn.' });
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    const handleDownload = () => {
        if (resultImages.length !== 1) return;
        const link = document.createElement('a');
        link.href = resultImages[0];
        link.download = "edited-image.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex flex-col gap-8">
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            
            {/* --- EDITOR MODAL (Full Screen Overlay) --- */}
            {isEditorOpen && sourceImage && (
                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col animate-fade-in">
                    {/* Modal Header */}
                    <div className="h-16 border-b border-[#302839] flex items-center justify-between px-6 bg-[#191919]/50">
                        <h3 className="text-white font-bold text-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#7f13ec]">edit_note</span>
                            Trình Chỉnh Sửa Ghi Chú
                        </h3>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={handleCloseEditor}
                                className="px-6 py-2 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold rounded-lg transition-colors shadow-lg"
                            >
                                Hoàn tất
                            </button>
                        </div>
                    </div>

                    {/* Modal Body */}
                    <div className="flex-grow flex relative overflow-hidden">
                        {/* Toolbar */}
                        <div className="w-20 bg-[#191919]/80 border-r border-[#302839] flex flex-col items-center py-6 gap-4 z-20 backdrop-blur-sm">
                            <button
                                onClick={() => setActiveTool('move')}
                                className={`p-3 rounded-xl transition-all ${activeTool === 'move' ? 'bg-[#7f13ec] text-white shadow-lg' : 'text-gray-400 hover:bg-[#302839] hover:text-white'}`}
                                title="Di chuyển / Xem"
                            >
                                <span className="material-symbols-outlined text-2xl">pan_tool</span>
                            </button>
                            <button
                                onClick={() => setActiveTool('text')}
                                className={`p-3 rounded-xl transition-all ${activeTool === 'text' ? 'bg-[#7f13ec] text-white shadow-lg' : 'text-gray-400 hover:bg-[#302839] hover:text-white'}`}
                                title="Thêm ghi chú"
                            >
                                <span className="material-symbols-outlined text-2xl">edit_note</span>
                            </button>
                            <button
                                onClick={() => setActiveTool('arrow')}
                                className={`p-3 rounded-xl transition-all ${activeTool === 'arrow' ? 'bg-[#7f13ec] text-white shadow-lg' : 'text-gray-400 hover:bg-[#302839] hover:text-white'}`}
                                title="Vẽ mũi tên"
                            >
                                <span className="material-symbols-outlined text-2xl">arrow_outward</span>
                            </button>
                            
                            <div className="w-10 h-px bg-[#302839] my-2"></div>
                            
                            <button
                                onClick={undoLast}
                                className="p-3 rounded-xl text-gray-400 hover:bg-[#302839] hover:text-white transition-all"
                                title="Hoàn tác"
                            >
                                <span className="material-symbols-outlined text-2xl">undo</span>
                            </button>
                            <button
                                onClick={clearAllAnnotations}
                                className="p-3 rounded-xl text-red-500 hover:bg-red-900/20 transition-all"
                                title="Xóa tất cả"
                            >
                                <span className="material-symbols-outlined text-2xl">delete_sweep</span>
                            </button>
                            
                            {selectedId && (
                                <button
                                    onClick={deleteSelected}
                                    className="p-3 rounded-xl text-red-500 hover:bg-red-900/20 transition-all animate-pulse border border-red-500/30"
                                    title="Xóa mục chọn"
                                >
                                    <span className="material-symbols-outlined text-2xl">delete</span>
                                </button>
                            )}
                        </div>

                        {/* Canvas Area */}
                        <div 
                            className="flex-grow bg-black relative overflow-hidden flex items-center justify-center select-none cursor-crosshair"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onTouchStart={handleMouseDown}
                            onTouchMove={handleMouseMove}
                            onTouchEnd={handleMouseUp}
                        >
                            <div 
                                ref={containerRef}
                                className={`relative shadow-2xl transition-transform duration-75 origin-center ${activeTool === 'move' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                style={{ 
                                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`
                                }}
                            >
                                <img 
                                    ref={imageRef}
                                    src={sourceImage.objectURL} 
                                    alt="Editing Source" 
                                    className="max-w-full max-h-[85vh] object-contain pointer-events-none"
                                    draggable={false}
                                />
                                
                                {/* SVG Layer for Arrows */}
                                <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                                    <defs>
                                        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                            <polygon points="0 0, 6 3, 0 6" fill="#DC2626" />
                                        </marker>
                                        <marker id="arrowhead-selected" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                            <polygon points="0 0, 6 3, 0 6" fill="#3B82F6" />
                                        </marker>
                                    </defs>
                                    {annotations.filter(a => a.type === 'arrow').map(arrow => (
                                        <g key={arrow.id} onClick={(e) => { e.stopPropagation(); setSelectedId(arrow.id); }} className="pointer-events-auto cursor-pointer group">
                                            <line 
                                                x1={arrow.x} y1={arrow.y}
                                                x2={arrow.toX} y2={arrow.toY}
                                                stroke="transparent"
                                                strokeWidth="20"
                                            />
                                            <line 
                                                x1={arrow.x} y1={arrow.y}
                                                x2={arrow.toX} y2={arrow.toY}
                                                stroke={selectedId === arrow.id ? "#3B82F6" : "#DC2626"}
                                                strokeWidth="2"
                                                markerEnd={selectedId === arrow.id ? "url(#arrowhead-selected)" : "url(#arrowhead)"}
                                                className="group-hover:stroke-blue-400 transition-colors"
                                            />
                                            <circle 
                                                cx={arrow.toX} 
                                                cy={arrow.toY} 
                                                r="15" 
                                                fill="transparent" 
                                                className="cursor-pointer"
                                            />
                                        </g>
                                    ))}
                                </svg>

                                {/* HTML Layer for Text Bubbles */}
                                {annotations.filter(a => a.type === 'text').map(note => (
                                    <div
                                        key={note.id}
                                        className={`absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 min-w-[120px]`}
                                        style={{ left: note.x, top: note.y }}
                                        onClick={(e) => { e.stopPropagation(); setSelectedId(note.id); }}
                                    >
                                        <div className={`
                                            p-2 border-2 border-dashed rounded-lg transition-all
                                            ${selectedId === note.id 
                                                ? 'border-blue-500 bg-blue-500/10' 
                                                : 'border-red-500 bg-transparent'
                                            }
                                        `}>
                                            <input 
                                                type="text"
                                                autoFocus={note.text === ''}
                                                value={note.text}
                                                onChange={(e) => handleTextChange(note.id, e.target.value)}
                                                placeholder="Nhập ghi chú..."
                                                className={`
                                                    bg-transparent border-none outline-none text-sm font-bold text-center w-full min-w-[100px] placeholder-red-300/50
                                                    ${selectedId === note.id ? 'text-blue-500' : 'text-red-500'}
                                                `}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Zoom Controls */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#191919]/90 backdrop-blur-md p-1.5 rounded-xl border border-[#302839] shadow-lg z-20">
                                <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-2 hover:bg-[#302839] rounded-lg text-white">
                                    <span className="material-symbols-outlined text-lg">remove</span>
                                </button>
                                <span className="text-xs font-bold w-12 text-center text-white">{Math.round(zoom * 100)}%</span>
                                <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-2 hover:bg-[#302839] rounded-lg text-white">
                                    <span className="material-symbols-outlined text-lg">add</span>
                                </button>
                                <button onClick={() => { setZoom(1.5); setPanOffset({x:0, y:0}); }} className="px-3 py-1 hover:bg-[#302839] rounded-lg text-xs text-gray-400 font-medium">Reset</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-2 flex-shrink-0">
                <h2 className="text-2xl font-bold text-text-primary dark:text-white">Chỉnh Sửa Bằng Ghi Chú</h2>
                <p className="text-sm text-text-secondary dark:text-gray-300">Tạo ghi chú trực quan trên ảnh để chỉ định chính xác vị trí và nội dung cần AI chỉnh sửa.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                {/* LEFT: SOURCE & ANNOTATIONS */}
                <div className="flex flex-col gap-6">
                    <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-text-primary dark:text-white">1. Ảnh Gốc & Ghi Chú</h3>
                            {annotations.length > 0 && <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">Đã có ghi chú</span>}
                        </div>
                        
                        <div className="flex-grow flex flex-col justify-center min-h-[300px]">
                            {sourceImage ? (
                                <div className="relative w-full h-full rounded-lg overflow-hidden group border border-border-color dark:border-gray-700 bg-black/20">
                                    <img 
                                        src={annotatedPreview || sourceImage.objectURL} 
                                        alt="Preview" 
                                        className="w-full h-full object-contain max-h-[500px]"
                                    />
                                    {/* Hover Overlay to Change Image */}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                        <button 
                                            onClick={handleTriggerChangeImage}
                                            className="bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-6 rounded-full shadow-lg backdrop-blur-md flex items-center gap-2 transition-all border border-white/30"
                                        >
                                            <span className="material-symbols-outlined text-lg">image</span>
                                            Thay ảnh
                                        </button>
                                    </div>
                                    
                                    {/* Hidden Input for Changing Image */}
                                    <div className="hidden">
                                        <ImageUpload onFileSelect={handleFileSelect} id="hidden-change-image" />
                                    </div>
                                </div>
                            ) : (
                                <ImageUpload onFileSelect={handleFileSelect} />
                            )}
                        </div>

                        {sourceImage && (
                            <div className="mt-6 space-y-4">
                                <p className="text-sm text-text-secondary dark:text-gray-400 italic text-center">
                                    "Vẽ mũi tên và viết ghi chú để chỉ định cho AI biết cần sửa gì."
                                </p>
                                <button
                                    onClick={handleOpenEditor}
                                    className="w-full bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">draw</span>
                                    Thực Hiện Chỉnh Sửa
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: CONTROLS & RESULT */}
                <div className="flex flex-col gap-6">
                    <div className="bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border border-border-color dark:border-gray-700 h-full flex flex-col">
                        <h3 className="text-lg font-bold text-text-primary dark:text-white mb-4">2. Kết Quả</h3>
                        
                        <div className="flex-grow w-full bg-black/5 dark:bg-black/20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center overflow-hidden min-h-[300px] relative">
                            {isLoading && (
                                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 backdrop-blur-sm">
                                    <Spinner />
                                    <p className="text-white mt-3 font-medium">Đang xử lý...</p>
                                </div>
                            )}
                            
                            {!isLoading && resultImages.length > 0 ? (
                                <div className="relative w-full h-full group" onClick={() => setPreviewImage(resultImages[0])}>
                                    <img src={resultImages[0]} alt="Result" className="w-full h-full object-contain cursor-pointer" />
                                    <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={handleDownload} className="bg-white text-black px-4 py-2 rounded-lg font-bold shadow-lg text-sm flex items-center gap-2">
                                            <span className="material-symbols-outlined text-lg">download</span> Tải xuống
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center text-text-secondary dark:text-gray-500 p-8">
                                    <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="material-symbols-outlined text-3xl opacity-50">image</span>
                                    </div>
                                    <p className="font-medium">Kết quả sẽ hiện ở đây</p>
                                    <p className="text-xs mt-1 opacity-70">Sẵn sàng để tạo tác phẩm của bạn</p>
                                </div>
                            )}
                        </div>

                        {/* Generation Controls */}
                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} disabled={isLoading} />
                                {/* Removed filter to allow Standard (Nano Flash) again */}
                                <ResolutionSelector 
                                    value={resolution} 
                                    onChange={handleResolutionChange} 
                                    disabled={isLoading} 
                                />
                            </div>

                            <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/50 rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300">
                                    <span className="material-symbols-outlined text-yellow-500 text-sm">monetization_on</span>
                                    <span>Chi phí: <span className="font-bold text-text-primary dark:text-white">{cost} Credits</span></span>
                                </div>
                                <span className={`text-xs font-bold ${userCredits < cost ? 'text-red-500' : 'text-green-500'}`}>
                                    {userCredits < cost ? 'Không đủ' : 'Đủ điều kiện'}
                                </span>
                            </div>

                            <button
                                onClick={handleGenerate}
                                disabled={isLoading || !sourceImage || annotations.length === 0 || userCredits < cost}
                                className="w-full flex justify-center items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg"
                            >
                                {isLoading ? 'Đang tạo...' : 'Tạo Ảnh'}
                            </button>
                            {error && <div className="text-xs text-red-500 text-center bg-red-50 dark:bg-red-900/10 p-2 rounded-lg border border-red-100 dark:border-red-900/20">{error}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditByNote;
