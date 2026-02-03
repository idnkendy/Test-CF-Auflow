
import React from 'react';

interface InsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToPricing: () => void;
}

const InsufficientCreditsModal: React.FC<InsufficientCreditsModalProps> = ({ isOpen, onClose, onNavigateToPricing }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
        <style>{`
            @keyframes scale-up {
                0% { transform: scale(0.95); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }
            .animate-scale-up { animation: scale-up 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        `}</style>

      <div 
        className="relative bg-[#181818] border border-[#2A2A2A] rounded-2xl p-6 md:p-8 shadow-2xl max-w-[360px] w-full flex flex-col items-center text-center animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
            {/* Close Button */}
            <button 
                onClick={onClose}
                className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/5"
            >
                <span className="material-symbols-outlined text-lg">close</span>
            </button>

            {/* Icon Graphic */}
            <div className="w-16 h-16 mb-5 relative flex items-center justify-center">
                {/* Subtle glow */}
                <div className="absolute inset-0 bg-yellow-500/10 rounded-full blur-lg"></div>
                
                <div className="relative w-full h-full bg-gradient-to-b from-[#251A2B] to-[#121212] rounded-full flex items-center justify-center border border-yellow-500/20 shadow-lg">
                    <span className="material-symbols-outlined text-3xl text-yellow-400 drop-shadow-sm notranslate">
                        monetization_on
                    </span>
                    {/* Badge */}
                    <div className="absolute -top-1 -right-1 bg-[#1A1A1A] rounded-full border border-yellow-500/30 p-[2px]">
                         <span className="material-symbols-outlined text-[10px] text-yellow-400 notranslate font-bold bg-yellow-500/10 rounded-full w-4 h-4 flex items-center justify-center">add</span>
                    </div>
                </div>
            </div>
            
            <h2 className="text-lg font-bold text-white mb-2">
                Hết Credits
            </h2>
            
            <p className="text-gray-400 text-sm mb-6 leading-relaxed px-2">
                Bạn cần thêm credits để tiếp tục sáng tạo. <br/>
                Nâng cấp gói ngay để không bị gián đoạn!
            </p>

            <div className="flex flex-col gap-3 w-full">
                <button
                    onClick={() => {
                        onClose();
                        onNavigateToPricing();
                    }}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] hover:from-[#690fca] hover:to-[#8a3dcf] text-white font-bold text-sm transition-all shadow-md hover:shadow-purple-500/20 flex items-center justify-center gap-2 transform active:scale-95"
                >
                    <span className="material-symbols-outlined text-lg">rocket_launch</span>
                    <span>Nạp Credits Ngay</span>
                </button>
                
                <button
                    onClick={onClose}
                    className="w-full py-2.5 text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-xl font-medium text-xs transition-colors"
                >
                    Để sau, tôi sẽ nạp sau
                </button>
            </div>
      </div>
    </div>
  );
};

export default InsufficientCreditsModal;
