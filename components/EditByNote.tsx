
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileData, ImageResolution, Tool, AspectRatio } from '../types';
import { EditByNoteState } from '../state/toolState';
import * as geminiService from '../services/geminiService';
import * as historyService from '../services/historyService';
import * as jobService from '../services/jobService';
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
    toX?: number;
    toY?: number;
    text?: string;
    color: string;
    fontSize?: number;
    strokeWidth?: number;
}

const COLORS = [
    { id: 'red', value: '#DC2626', label: 'Đỏ' },
    { id: 'white', value: '#FFFFFF', label: 'Trắng' },
    { id: 'black', value: '#000000', label: 'Đen' },
];

const EditByNote: React.FC<EditByNoteProps> = ({ state, onStateChange, userCredits = 0, onDeductCredits }) => {
    const { sourceImage, isLoading, error, resultImages, numberOfImages, resolution } = state;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<EditorTool>('move');
    const [currentColor, setCurrentColor] = useState<string>('#DC2626');
    const [zoom, setZoom] = useState(1.0);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

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

    const handleGenerate = async () => {
        if (onDeductCredits && userCredits < cost) {
             onStateChange({ error: `Bạn không đủ credits. Cần ${cost} credits.` });
             return;
        }

        if (!sourceImage || annotations.length === 0) {
            onStateChange({ error: 'Vui lòng thêm ảnh và ghi chú.' });
            return;
        }

        onStateChange({ isLoading: true, error: null, resultImages: [] });
        let logId: string | null = null;
        let jobId: string | null = null;

        try {
            if (onDeductCredits) {
                logId = await onDeductCredits(cost, `Chỉnh sửa Ghi chú (${numberOfImages} ảnh)`);
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId) {
                jobId = await jobService.createJob({
                    user_id: user.id,
                    tool_id: Tool.EditByNote,
                    prompt: 'Edit by visual annotations',
                    cost: cost,
                    usage_log_id: logId
                });
            }

            if (jobId) await jobService.updateJobStatus(jobId, 'processing');

            // Simplified: In a real scenario, you'd flatten annotations to a composite image.
            // For now, we simulate the high-level logic.
            const prompt = "Apply the edits pointed at by the arrows and described in the notes. Then remove the annotations.";
            
            let imageUrls: string[] = [];
            if (resolution === '1K' || resolution === '2K' || resolution === '4K') {
                const promises = Array.from({ length: numberOfImages }).map(async () => {
                    const images = await geminiService.generateHighQualityImage(prompt, '1:1', resolution, sourceImage, jobId || undefined);
                    return images[0];
                });
                imageUrls = await Promise.all(promises);
            } else {
                const results = await geminiService.editImage(prompt, sourceImage, numberOfImages);
                imageUrls = results.map(r => r.imageUrl);
            }

            onStateChange({ resultImages: imageUrls });
            if (jobId && imageUrls.length > 0) await jobService.updateJobStatus(jobId, 'completed', imageUrls[0]);

            imageUrls.forEach(url => historyService.addToHistory({ tool: Tool.EditByNote, prompt: prompt, sourceImageURL: sourceImage.objectURL, resultImageURL: url }));
        } catch (err: any) {
            onStateChange({ error: err.message });
            if (jobId) await jobService.updateJobStatus(jobId, 'failed', undefined, err.message);
            const { data: { user } } = await supabase.auth.getUser();
            if (user && logId && onDeductCredits) {
                await refundCredits(user.id, cost, `Hoàn tiền: Lỗi chỉnh sửa ghi chú (${err.message})`, logId);
            }
        } finally {
            onStateChange({ isLoading: false });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
            {isEditorOpen && createPortal(<div className="fixed inset-0 z-[9999] bg-black flex flex-col">
                <div className="h-16 bg-gray-900 flex items-center px-4 justify-between">
                    <button onClick={() => setIsEditorOpen(false)} className="text-white">Đóng</button>
                    <div className="flex gap-2">
                        <button onClick={() => setActiveTool('arrow')} className={`p-2 rounded ${activeTool === 'arrow' ? 'bg-purple-600' : 'bg-gray-700'}`}>Mũi tên</button>
                        <button onClick={() => setActiveTool('text')} className={`p-2 rounded ${activeTool === 'text' ? 'bg-purple-600' : 'bg-gray-700'}`}>Ghi chú</button>
                    </div>
                    <button onClick={() => setIsEditorOpen(false)} className="bg-purple-600 text-white px-4 py-2 rounded">Hoàn tất</button>
                </div>
                <div className="flex-1 overflow-hidden relative flex items-center justify-center bg-[#0f0f0f]">
                    <img src={sourceImage?.objectURL} className="max-h-full object-contain" />
                </div>
            </div>, document.body)}

            <h2 className="text-2xl font-bold">Chỉnh Sửa Bằng Ghi Chú</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 bg-main-bg/50 dark:bg-dark-bg/50 p-6 rounded-xl border">
                    <ImageUpload onFileSelect={(f) => onStateChange({ sourceImage: f, resultImages: [] })} previewUrl={sourceImage?.objectURL} />
                    {sourceImage && <button onClick={() => setIsEditorOpen(true)} className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg shadow-lg">Mở Trình Vẽ Ghi Chú</button>}
                    <div className="grid grid-cols-2 gap-4">
                        <NumberOfImagesSelector value={numberOfImages} onChange={(val) => onStateChange({ numberOfImages: val })} />
                        <ResolutionSelector value={resolution} onChange={(val) => onStateChange({ resolution: val })} />
                    </div>
                    <div className="flex justify-between text-sm">
                        <span>Chi phí: <b>{cost} Credits</b></span>
                        <span>{userCredits < cost ? 'Không đủ' : `Còn: ${userCredits}`}</span>
                    </div>
                    <button onClick={handleGenerate} disabled={isLoading || !sourceImage || userCredits < cost} className="w-full py-3 bg-[#7f13ec] text-white font-bold rounded-xl shadow-lg">
                        {isLoading ? <Spinner /> : 'Tạo Ảnh'}
                    </button>
                </div>
                <div className="aspect-video bg-main-bg dark:bg-gray-800/50 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden">
                    {isLoading ? <Spinner /> : resultImages.length > 0 ? <ImageComparator originalImage={sourceImage?.objectURL || ''} resultImage={resultImages[0]} /> : <p className="text-gray-400">Kết quả sẽ hiển thị ở đây</p>}
                </div>
            </div>
        </div>
    );
};

export default EditByNote;
