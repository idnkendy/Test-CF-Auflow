
import { FileData, AspectRatio, Tool, ImageResolution } from '../types';

export interface LuBanRulerState {
    width: string;
    height: string;
    checkDimension: 'width' | 'height';
}

export interface LayoutGeneratorState {
    prompt: string;
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    aspectRatio: AspectRatio;
    resolution: ImageResolution;
}

export interface DrawingGeneratorState {
    prompt: string;
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    aspectRatio: AspectRatio;
    resolution: ImageResolution;
    drawingType: 'floor-plan' | 'elevation' | 'section';
}

export interface DiagramGeneratorState {
    prompt: string;
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    aspectRatio: AspectRatio;
    diagramType: string;
    resolution: ImageResolution;
}

export interface RealEstatePosterState {
    prompt: string;
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    aspectRatio: AspectRatio;
    posterStyle: 'luxury' | 'modern' | 'minimalist' | 'commercial';
    resolution: ImageResolution;
}

export interface EditByNoteState {
    prompt: string;
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    resolution: ImageResolution;
    aspectRatio: AspectRatio; // Added
}

export interface ReRenderState {
    prompt: string;
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    resolution: ImageResolution;
    aspectRatio: AspectRatio;
}

export interface PricingState {
}

export interface ProfileState {
    activeTab: 'profile' | 'history';
}

export interface ImageGeneratorState {
    renderMode: 'arch' | 'interior' | 'urban' | 'landscape';
    style: string;
    context: string;
    lighting: string;
    weather: string;
    buildingType: string;
    roomType: string; // for interior
    colorPalette: string; // for interior
    viewType: string; // for urban
    density: string; // for urban
    gardenStyle: string; // for landscape
    timeOfDay: string; // for landscape
    features: string; // for landscape
    customPrompt: string;
    referenceImages: FileData[];
    sourceImage: FileData | null;
    isLoading: boolean;
    isUpscaling: boolean;
    error: string | null;
    resultImages: string[];
    upscaledImage: string | null;
    numberOfImages: number;
    aspectRatio: AspectRatio;
    resolution: ImageResolution;
}

export interface InteriorGeneratorState {
    style: string;
    roomType: string;
    lighting: string;
    colorPalette: string;
    customPrompt: string;
    referenceImages: FileData[];
    sourceImage: FileData | null;
    isLoading: boolean;
    isUpscaling: boolean;
    error: string | null;
    resultImages: string[];
    upscaledImage: string | null;
    numberOfImages: number;
    aspectRatio: AspectRatio;
    resolution: ImageResolution;
}

export interface UrbanPlanningState {
    viewType: string;
    density: string;
    lighting: string;
    customPrompt: string;
    referenceImages: FileData[];
    sourceImage: FileData | null;
    isLoading: boolean;
    isUpscaling: boolean;
    error: string | null;
    resultImages: string[];
    upscaledImage: string | null;
    numberOfImages: number;
    aspectRatio: AspectRatio;
    resolution: ImageResolution;
}

export interface LandscapeRenderingState {
    gardenStyle: string;
    timeOfDay: string;
    features: string;
    customPrompt: string;
    referenceImages: FileData[];
    sourceImage: FileData | null;
    isLoading: boolean;
    isUpscaling: boolean;
    error: string | null;
    resultImages: string[];
    upscaledImage: string | null;
    numberOfImages: number;
    aspectRatio: AspectRatio;
    resolution: ImageResolution;
}

export interface FloorPlanState {
    prompt: string;
    layoutPrompt: string;
    sourceImage: FileData | null;
    referenceImages: FileData[];
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    renderMode: 'top-down' | 'perspective';
    planType: 'architecture' | 'interior' | 'urban' | 'landscape';
    aspectRatio: AspectRatio;
    resolution: ImageResolution;
    // New options
    projectType: string;
    importantArea: string;
    time: string;
    weather: string;
    style: string; // Added style
}

export interface RenovationState {
    renoMode: 'interior' | 'exterior' | 'landscape' | 'spatial'; // Added
    prompt: string;
    sourceImage: FileData | null;
    referenceImages: FileData[];
    maskImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    renovatedImages: string[];
    numberOfImages: number;
    aspectRatio: AspectRatio;
    resolution: ImageResolution;
}

export interface ViewSyncState {
    sourceImage: FileData | null;
    directionImage: FileData | null;
    characterImage: FileData | null; // New for Creative View
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    sceneType: 'exterior' | 'interior';
    aspectRatio: AspectRatio;
    customPrompt: string;
    selectedPerspective: string;
    selectedAtmosphere: string;
    selectedFraming: string;
    selectedInteriorAngle: string;
    resolution: ImageResolution;
    // New Creative View State
    activeTab: 'sync' | 'creative';
    creativeOption: 'interior' | 'architecture' | 'interior-from-arch' | 'marketing-showcase';
    creativeResults: Record<string, string>; // Map View Name -> URL
    creativePrompts: Record<string, string>; // Map View Name -> Editable Prompt
    generatingViewId: string | null;
}

export interface VirtualTourState {
    sourceImage: FileData | null;
    currentTourImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    tourStepSize: number;
    tourHistory: FileData[];
    resolution: ImageResolution;
}

export interface PromptSuggesterState {
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    suggestions: any | null;
    selectedSubject: string;
    numberOfSuggestions: number;
    customInstruction: string;
}

export interface PromptEnhancerState {
    sourceImage: FileData | null;
    customNeeds: string;
    isLoading: boolean;
    error: string | null;
    resultPrompt: string | null;
}

export interface MaterialSwapperState {
    prompt: string;
    sceneImage: FileData | null;
    materialImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    aspectRatio: AspectRatio; // Added default
    resolution: ImageResolution;
}

export interface UpscaleState {
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    upscaledImages: string[];
    numberOfImages: number;
    resolution: ImageResolution;
    detailMode: 'fast' | 'quality';
    prompt: string;
}

export interface MoodboardGeneratorState {
    prompt: string;
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    aspectRatio: AspectRatio;
    mode: 'moodboardToScene' | 'sceneToMoodboard';
    resolution: ImageResolution;
}

export interface VideoContextItem {
    id: string;
    file: FileData;
    originalFile: FileData;
    prompt: string;
    isGeneratingPrompt: boolean;
    videoUrl?: string;
    isGeneratingVideo: boolean;
    isUploaded: boolean;
    isInTimeline: boolean;
    useCharacter?: boolean; // New: Flag to indicate character integration
}

export interface VideoGeneratorState {
    prompt: string;
    startImage: FileData | null;
    endImage?: FileData | null; // Added: Optional end image for transitions
    characterImage: FileData | null; 
    contextItems: VideoContextItem[];
    selectedContextId: string | null;
    isLoading: boolean;
    loadingMessage: string;
    error: string | null;
    generatedVideoUrl: string | null;
    mode: 'exterior' | 'interior';
    aspectRatio: '16:9' | '9:16' | 'default';
}

export interface ImageEditorState {
    prompt: string;
    sourceImage: FileData | null;
    maskImage: FileData | null;
    referenceImages: FileData[];
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    resolution: ImageResolution;
    aspectRatio: AspectRatio; // Added
}

export interface StagingState {
    prompt: string;
    sceneImage: FileData | null;
    objectImages: FileData[];
    isLoading: boolean;
    error: string | null;
    resultImages: string[];
    numberOfImages: number;
    aspectRatio: AspectRatio; // Added default
    resolution: ImageResolution;
}

export interface AITechnicalDrawingsState {
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    resultImage: string | null;
    resultImages: string[];
    numberOfImages: number;
    aspectRatio: AspectRatio; 
    resolution: ImageResolution;
    prompt: string;
}

export interface SketchConverterState {
    sourceImage: FileData | null;
    isLoading: boolean;
    error: string | null;
    resultImage: string | null;
    sketchStyle: 'pencil' | 'charcoal' | 'watercolor';
    detailLevel: 'medium' | 'high';
    resolution: ImageResolution;
    aspectRatio: AspectRatio; // Added default
}

// Khởi tạo giá trị mặc định cho trạng thái của tất cả công cụ
export const initialToolStates = {
    [Tool.ArchitecturalRendering]: {
        renderMode: 'arch',
        style: 'none',
        context: 'none',
        lighting: 'none',
        weather: 'none',
        buildingType: 'none',
        roomType: 'none',
        colorPalette: 'none',
        viewType: 'none',
        density: 'none',
        gardenStyle: 'none',
        timeOfDay: 'none',
        features: 'none',
        customPrompt: 'Biến thành ảnh chụp thực tế nhà ở',
        referenceImages: [], 
        sourceImage: null,
        isLoading: false,
        isUpscaling: false,
        error: null,
        resultImages: [],
        upscaledImage: null,
        numberOfImages: 1,
        aspectRatio: '16:9',
        resolution: 'Standard',
    } as ImageGeneratorState,
    [Tool.InteriorRendering]: {
        style: 'none',
        roomType: 'none',
        lighting: 'none',
        colorPalette: 'none',
        customPrompt: 'Biến thành ảnh chụp thực tế không gian nội thất',
        referenceImages: [], 
        sourceImage: null,
        isLoading: false,
        isUpscaling: false,
        error: null,
        resultImages: [],
        upscaledImage: null,
        numberOfImages: 1,
        aspectRatio: '16:9',
        resolution: 'Standard',
    } as InteriorGeneratorState,
    [Tool.UrbanPlanning]: {
        viewType: 'none',
        density: 'none',
        lighting: 'none',
        customPrompt: 'Render một khu đô thị ven sông, có nhiều cây xanh, các toà nhà hiện đại và một cây cầu đi bộ.',
        referenceImages: [], 
        sourceImage: null,
        isLoading: false,
        isUpscaling: false,
        error: null,
        resultImages: [],
        upscaledImage: null,
        numberOfImages: 1,
        aspectRatio: '16:9',
        resolution: 'Standard',
    } as UrbanPlanningState,
    [Tool.LandscapeRendering]: {
        gardenStyle: 'none',
        timeOfDay: 'none',
        features: 'none',
        customPrompt: 'Render một sân vườn nhỏ phía sau nhà, có lối đi bằng đá, nhiều hoa và một bộ bàn ghế nhỏ.',
        referenceImages: [], 
        sourceImage: null,
        isLoading: false,
        isUpscaling: false,
        error: null,
        resultImages: [],
        upscaledImage: null,
        numberOfImages: 1,
        aspectRatio: '16:9',
        resolution: 'Standard',
    } as LandscapeRenderingState,
    [Tool.FloorPlan]: {
        prompt: 'Biến thành ảnh chụp thực tế dự án',
        layoutPrompt: 'Biến thành ảnh chụp thực tế dự án',
        sourceImage: null,
        referenceImages: [], 
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        renderMode: 'top-down',
        planType: 'architecture',
        aspectRatio: '16:9',
        resolution: 'Standard',
        projectType: 'none',
        importantArea: 'none',
        time: 'none',
        weather: 'none',
        style: 'none', // Initialized style
    } as FloorPlanState,
    [Tool.Renovation]: {
        renoMode: 'interior', // Added
        prompt: 'Cải tạo mặt tiền ngôi nhà này theo phong cách hiện đại, tối giản. Sử dụng vật liệu gỗ, kính và bê tông. Thêm nhiều cây xanh xung quanh.',
        sourceImage: null,
        referenceImages: [],
        maskImage: null,
        isLoading: false,
        error: null,
        renovatedImages: [],
        numberOfImages: 1,
        aspectRatio: '16:9',
        resolution: 'Standard',
    } as RenovationState,
    [Tool.ViewSync]: {
        sourceImage: null,
        directionImage: null,
        characterImage: null,
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        sceneType: 'exterior',
        aspectRatio: '16:9',
        customPrompt: '',
        selectedPerspective: 'default',
        selectedAtmosphere: 'default',
        selectedFraming: 'none',
        selectedInteriorAngle: 'default',
        resolution: 'Standard',
        activeTab: 'sync',
        creativeOption: 'interior',
        creativeResults: {},
        creativePrompts: {},
        generatingViewId: null
    } as ViewSyncState,
    [Tool.VirtualTour]: {
        sourceImage: null,
        currentTourImage: null,
        isLoading: false,
        error: null,
        tourStepSize: 30,
        tourHistory: [],
        resolution: 'Standard',
    } as VirtualTourState,
     [Tool.PromptSuggester]: {
        sourceImage: null,
        isLoading: false,
        error: null,
        suggestions: null,
        selectedSubject: 'all',
        numberOfSuggestions: 5,
        customInstruction: '',
    } as PromptSuggesterState,
    [Tool.PromptEnhancer]: {
        sourceImage: null,
        customNeeds: 'Tạo một prompt chi tiết, chuyên nghiệp cho việc render kiến trúc, tập trung vào phong cách hiện đại, ánh sáng ban ngày và vật liệu tự nhiên.',
        isLoading: false,
        error: null,
        resultPrompt: null,
    } as PromptEnhancerState,
    [Tool.MaterialSwap]: {
        prompt: 'Thay thế sàn trong ảnh chính bằng vật liệu gỗ từ ảnh tham khảo.',
        sceneImage: null,
        materialImage: null,
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        aspectRatio: '16:9', // Added default
        resolution: 'Standard',
    } as MaterialSwapperState,
    [Tool.Upscale]: {
        sourceImage: null,
        isLoading: false,
        error: null,
        upscaledImages: [],
        numberOfImages: 1,
        resolution: 'Standard',
        detailMode: 'fast',
        prompt: 'Tăng cường độ chi tiết và độ phân giải, làm cho nó sắc nét hơn.',
    } as UpscaleState,
    [Tool.Moodboard]: {
        prompt: 'Một phòng khách hiện đại và rộng rãi.',
        sourceImage: null,
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        aspectRatio: '16:9',
        // Fixed bitwise OR operator error
        mode: 'moodboardToScene',
        resolution: 'Standard',
    } as MoodboardGeneratorState,
    [Tool.VideoGeneration]: {
        prompt: 'Tạo video time-lapse cho thấy tòa nhà chuyển từ cảnh ban ngày nắng đẹp sang cảnh ban đêm được chiếu sáng đẹp mắt.',
        startImage: null,
        endImage: null,
        characterImage: null,
        contextItems: [],
        selectedContextId: null,
        isLoading: false,
        loadingMessage: "Đang khởi tạo các photon ánh sáng...",
        error: null,
        generatedVideoUrl: null,
        // Fixed bitwise OR operator error
        mode: 'exterior',
        aspectRatio: 'default', 
    } as VideoGeneratorState,
    [Tool.ImageEditing]: {
        prompt: 'Thêm một ban công sắt nghệ thuật vào cửa sổ tầng hai.',
        sourceImage: null,
        maskImage: null,
        referenceImages: [],
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        resolution: 'Standard',
        aspectRatio: '1:1', // Default Aspect Ratio
    } as ImageEditorState,
    [Tool.Staging]: {
        prompt: 'Đặt các đồ vật này vào không gian một cách hợp lý và tự nhiên.',
        sceneImage: null,
        objectImages: [],
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        aspectRatio: '16:9', // Added default
        resolution: 'Standard',
    } as StagingState,
    [Tool.AITechnicalDrawings]: {
        sourceImage: null,
        isLoading: false,
        error: null,
        resultImage: null,
        resultImages: [],
        numberOfImages: 1,
        aspectRatio: '16:9', // Added default
        resolution: 'Standard',
        prompt: 'Tạo một bảng trình bày kiến trúc (architectural presentation board) sử dụng thiết kế của tòa nhà này. Tạo các bản vẽ đặc trưng gồm: mặt bằng, mặt cắt, phối cảnh trục đo axonometric và 5 sơ đồ diễn tiến khối (massing evolution) từng bước. Tạo thêm các cảnh khác, nội thất, mặt đứng và khiến bảng trình bày trở nên mạch lạc và thu hút bằng bố cục và phần chữ được sắp xếp hợp lý.', 
    } as AITechnicalDrawingsState,
    [Tool.SketchConverter]: {
        sourceImage: null,
        isLoading: false,
        error: null,
        resultImage: null,
        sketchStyle: 'pencil',
        detailLevel: 'medium',
        resolution: 'Standard',
        aspectRatio: '16:9', // Added default
    } as SketchConverterState,
    [Tool.LuBanRuler]: {
        width: '1200',
        height: '2400',
        checkDimension: 'width',
    } as LuBanRulerState,
    [Tool.LayoutGenerator]: {
        prompt: 'Tạo một bảng trình bày kiến trúc (architectural presentation board) sử dụng thiết kế của tòa nhà này. Tạo các bản vẽ đặc trưng gồm: mặt bằng, mặt cắt, phối cảnh trục đo axonometric và 5 sơ đồ diễn tiến khối (massing evolution) từng bước. Tạo thêm các cảnh khác, nội thất, mặt đứng và khiến bảng trình bày trở nên mạch lạc và thu hút bằng bố cục và phần chữ được sắp xếp hợp lý.',
        sourceImage: null, 
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        aspectRatio: '16:9',
        resolution: 'Standard',
    } as LayoutGeneratorState,
    [Tool.DrawingGenerator]: {
        prompt: '', // Changed to empty to support dynamic language default
        sourceImage: null,
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        aspectRatio: '16:9',
        resolution: 'Standard',
        drawingType: 'floor-plan',
    } as DrawingGeneratorState,
    [Tool.DiagramGenerator]: {
        prompt: "Exploded axonometric architectural diagram, showing functional layers, flow arrows, analytical style, clean lines, pastel colors.",
        sourceImage: null,
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        aspectRatio: '16:9',
        diagramType: '',
        resolution: 'Standard',
    } as DiagramGeneratorState,
    [Tool.RealEstatePoster]: {
        prompt: 'Thiết kế poster bất động sản sang trọng, hiện đại. Bao gồm tiêu đề lớn, thông tin nổi bật, bố cục tạp chí. Giữ hình ảnh công trình làm chủ đạo.',
        sourceImage: null, 
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        aspectRatio: '16:9',
        posterStyle: 'luxury',
        resolution: 'Standard',
    } as RealEstatePosterState,
    [Tool.EditByNote]: {
        prompt: '',
        sourceImage: null,
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        resolution: 'Standard',
        aspectRatio: '16:9', // Added default
    } as EditByNoteState,
    [Tool.ReRender]: {
        prompt: 'Biến ảnh thành ảnh thực tế',
        sourceImage: null,
        isLoading: false,
        error: null,
        resultImages: [],
        numberOfImages: 1,
        resolution: 'Standard',
        aspectRatio: '16:9',
    } as ReRenderState,
    [Tool.Pricing]: {} as PricingState,
    [Tool.Profile]: { activeTab: 'profile' } as ProfileState,
    [Tool.History]: {},
    [Tool.ExtendedFeaturesDashboard]: {},
};

export type ToolStates = typeof initialToolStates;
