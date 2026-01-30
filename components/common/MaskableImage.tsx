
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FileData } from '../../types';

interface MaskableImageProps {
  image: FileData;
  initialMask?: FileData | null;
  onMaskChange: (mask: FileData | null) => void;
  maskColor?: string;
}

const MaskableImage: React.FC<MaskableImageProps> = ({ image, initialMask, onMaskChange, maskColor }) => {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [mode, setMode] = useState<'draw' | 'erase'>('draw');
  const [isCanvasReady, setIsCanvasReady] = useState(false);

  const [cursorPosition, setCursorPosition] = useState({ x: -100, y: -100 });
  const [isCursorVisible, setIsCursorVisible] = useState(false);

  const updateMaskData = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      onMaskChange({
        base64,
        mimeType: 'image/png',
        objectURL: dataUrl
      });
    }
  }, [onMaskChange]);

  const alignCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const imageEl = imageRef.current;
    const wrapper = wrapperRef.current;

    if (canvas && imageEl && wrapper) {
      const width = imageEl.clientWidth;
      const height = imageEl.clientHeight;

      if (width === 0 || height === 0) return;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        wrapper.style.width = `${width}px`;
        wrapper.style.height = `${height}px`;
        setIsCanvasReady(true);
      }
    }
  }, []);

  // Khôi phục mask cũ khi canvas đã sẵn sàng
  useEffect(() => {
    if (isCanvasReady && initialMask && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Cập nhật lại dữ liệu mask ban đầu để đảm bảo state đồng bộ
                updateMaskData();
            };
            img.src = initialMask.objectURL;
        }
    }
  }, [isCanvasReady, initialMask, updateMaskData]);

  useEffect(() => {
    alignCanvas();
    const resizeObserver = new ResizeObserver(() => alignCanvas());
    if (imageRef.current) resizeObserver.observe(imageRef.current);
    window.addEventListener('resize', alignCanvas);
    return () => {
      window.removeEventListener('resize', alignCanvas);
      resizeObserver.disconnect();
    };
  }, [image, alignCanvas]);

  const startDrawing = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    const nativeEvent = event.nativeEvent;
    if (nativeEvent instanceof MouseEvent && nativeEvent.button !== 0) return;
    setIsDrawing(true);
    draw(event.nativeEvent);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    updateMaskData();
  };

  const draw = (event: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.globalCompositeOperation = mode === 'draw' ? 'source-over' : 'destination-out';
    
    let drawingColor = '#ffffff';
    if (maskColor) {
        drawingColor = maskColor.startsWith('rgba') ? maskColor.replace(/,\s*[\d\.]+\s*\)/, ', 1)') : maskColor;
    }

    ctx.fillStyle = mode === 'draw' ? drawingColor : '#000';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (container) {
        const rect = container.getBoundingClientRect();
        setCursorPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (isDrawing) draw(e.nativeEvent);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDrawing) draw(e.nativeEvent);
  };

  const handleClearMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onMaskChange(null);
    }
  };
  
  const cursorStyle = {
      borderColor: mode === 'draw' ? (maskColor?.includes('239, 68, 68') ? '#ffffff' : '#ef4444') : '#000000',
      backgroundColor: mode === 'draw' ? (maskColor || 'rgba(255, 255, 255, 0.3)') : 'rgba(255, 255, 255, 0.5)',
      boxShadow: '0 0 4px 1px rgba(0,0,0,0.4)'
  };
  
  return (
    <div className="space-y-4">
      <div 
        ref={containerRef}
        className="relative w-full h-[60vh] min-h-[400px] flex items-center justify-center bg-main-bg dark:bg-gray-800 rounded-lg border-2 border-dashed border-border-color dark:border-gray-700 overflow-hidden select-none touch-none"
        style={{ cursor: isCursorVisible ? 'none' : 'default' }}
        onMouseEnter={() => setIsCursorVisible(true)}
        onMouseLeave={() => {
            setIsCursorVisible(false);
            stopDrawing();
        }}
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseMove={handleMouseMove}
        onTouchStart={startDrawing}
        onTouchEnd={stopDrawing}
        onTouchMove={handleTouchMove}
      >
        <div ref={wrapperRef} className="relative flex items-center justify-center">
            <img
                ref={imageRef}
                src={image.objectURL}
                alt="Original for editing"
                className="max-w-full max-h-[60vh] object-contain pointer-events-none select-none block"
                onLoad={alignCanvas}
            />
            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                style={{ opacity: 0.55 }}
            />
        </div>

        {isCursorVisible && (
            <div
                className="absolute rounded-full pointer-events-none border-2 transition-transform duration-75 z-50"
                style={{
                    left: cursorPosition.x,
                    top: cursorPosition.y,
                    width: brushSize,
                    height: brushSize,
                    borderColor: cursorStyle.borderColor,
                    backgroundColor: cursorStyle.backgroundColor,
                    boxShadow: cursorStyle.boxShadow,
                    transform: `translate(-50%, -50%) scale(${isDrawing ? 0.9 : 1})`,
                }}
            />
        )}
      </div>
      
      <div className="bg-main-bg dark:bg-gray-800 p-3 rounded-lg border border-border-color dark:border-gray-700 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-center gap-2">
            <button onClick={() => setMode('draw')} className={`p-2 rounded-md transition-colors ${mode === 'draw' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-text-secondary dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}><span className="material-symbols-outlined text-base">draw</span></button>
            <button onClick={() => setMode('erase')} className={`p-2 rounded-md transition-colors ${mode === 'erase' ? 'bg-red-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-text-secondary dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}><span className="material-symbols-outlined text-base">ink_eraser</span></button>
        </div>
        <div className="flex items-center gap-3 flex-grow w-full sm:w-auto">
            <label className="text-sm text-text-secondary dark:text-gray-300 whitespace-nowrap">Cỡ bút:</label>
            <input type="range" min="5" max="150" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent" />
        </div>
        <button onClick={handleClearMask} className="px-3 py-2 text-sm font-semibold rounded-md transition-colors bg-gray-200 dark:bg-gray-700 text-text-secondary dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-2"><span className="material-symbols-outlined text-base">delete</span>Xoá</button>
      </div>
    </div>
  );
};

export default MaskableImage;
