
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import * as externalVideoService from '../../services/externalVideoService';

interface ImagePreviewModalProps {
  imageUrl: string;
  onClose: () => void;
}

const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);


const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ imageUrl, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDownloading(true);
    await externalVideoService.forceDownload(imageUrl, `ai-generated-image-${Date.now()}.png`);
    setIsDownloading(false);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Sử dụng Portal để render modal trực tiếp vào body, tránh bị ảnh hưởng bởi overflow của các thẻ cha
  return createPortal(
    <div
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] p-4 animate-fade-in backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
        <style>{`
            @keyframes fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
        `}</style>
      <div className="relative max-w-screen-xl max-h-[95vh] w-full h-full flex items-center justify-center pointer-events-none">
        <img
          src={imageUrl}
          alt="Preview"
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-auto"
        />
        <div className="absolute top-4 right-4 flex gap-3 pointer-events-auto">
            <button
                onClick={handleDownload}
                className="p-3 bg-black/50 hover:bg-blue-600 rounded-full text-white transition-all transform hover:scale-110 backdrop-blur-md border border-white/10"
                title="Tải xuống ảnh"
                disabled={isDownloading}
            >
                {isDownloading ? (
                    <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                ) : (
                    <DownloadIcon />
                )}
            </button>
            <button
                onClick={onClose}
                className="p-3 bg-black/50 hover:bg-red-600 rounded-full text-white transition-all transform hover:scale-110 backdrop-blur-md border border-white/10"
                title="Đóng"
            >
                <CloseIcon />
            </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImagePreviewModal;
