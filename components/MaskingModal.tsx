
import React, { useState } from 'react';
import { FileData } from '../types';
import MaskableImage from './common/MaskableImage';

interface MaskingModalProps {
  image: FileData;
  initialMask?: FileData | null;
  onClose: () => void;
  onApply: (mask: FileData | null) => void;
  maskColor?: string;
}

const MaskingModal: React.FC<MaskingModalProps> = ({ image, initialMask, onClose, onApply, maskColor }) => {
  const [mask, setMask] = useState<FileData | null>(initialMask || null);

  const handleApply = () => {
    onApply(mask);
    onClose(); 
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div 
        className="bg-surface dark:bg-dark-bg p-4 sm:p-6 rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto flex flex-col gap-4 shadow-2xl border border-gray-200 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
            <h2 className="text-xl font-bold text-text-primary dark:text-white">Vẽ Vùng Chọn (Mask)</h2>
            <p className="text-text-secondary dark:text-gray-300 text-sm mt-1">Vẽ lên vùng ảnh bạn muốn AI tập trung chỉnh sửa.</p>
        </div>

        <MaskableImage 
            image={image} 
            initialMask={initialMask}
            onMaskChange={setMask} 
            maskColor={maskColor} 
        />
        
        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-2 border-t border-gray-100 dark:border-gray-800 pt-4">
          <button
            onClick={onClose}
            className="w-full sm:w-auto bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-text-primary dark:text-white font-bold py-2 px-8 rounded-xl transition-all"
          >
            Hủy
          </button>
          <button
            onClick={handleApply}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-10 rounded-xl transition-all shadow-lg"
          >
            Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaskingModal;
