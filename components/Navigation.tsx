
import React, { useState, useEffect, useRef } from 'react';
import { Tool } from '../types';
import { useLanguage } from '../hooks/useLanguage';

// --- MAIN ICONS ---
const FloorPlanIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
);
const RenovationIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 00-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
);
const PhotoIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
);
const InteriorIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
);
const ViewGridIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
);
const SparklesIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
);

const UrbanIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
);
const LandscapeIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
);
const MagicTextIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
);
const AnnotationIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
);
const LayoutBoardIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
);
const BlueprintIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
);
const StructureIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
);
const MarketingIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
);
const MoodboardIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12.5a2 2 0 002-2v-6.5a2 2 0 00-2-2H7" /></svg>
);
const UpscaleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" /></svg>
);
const MaterialIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 v2M7 7h10" /></svg>
);
const BrushIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
);
// --- Fix: Added missing PencilIcon component definition ---
const PencilIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
);
const HistoryIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const PlusCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const HomeIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 0 001 1m-6 0h6" /></svg>
);

interface NavigationProps {
  activeTool: Tool;
  setActiveTool: (tool: Tool) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onGoHome?: () => void;
}

export const useUtilityTools = () => {
    const { t } = useLanguage();
    return {
        label: t('tool.extended'),
        icon: <PlusCircleIcon />,
        tools: [
            { tool: Tool.ReRender, label: t('ext.rerender.title'), desc: t('dash.rerender.desc'), icon: <BrushIcon />, image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/RERENDER%20THUMB.jpeg' },
            { tool: Tool.PromptSuggester, label: t('tool.prompt'), desc: t('dash.prompt.desc'), icon: <MagicTextIcon />, image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/prompt-recommend.png' },
            { tool: Tool.EditByNote, label: t('tool.edit_note'), desc: t('dash.edit_note.desc'), icon: <AnnotationIcon />, image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/edit-by-note.png' },
            { tool: Tool.LayoutGenerator, label: t('tool.layout'), desc: t('dash.layout.desc'), icon: <LayoutBoardIcon />, image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/layout.png' },
            { tool: Tool.DrawingGenerator, label: t('tool.drawing'), desc: t('dash.drawing.desc'), icon: <BlueprintIcon />, image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/tao-ban-ve.png' },
            { tool: Tool.DiagramGenerator, label: t('tool.diagram'), desc: t('dash.diagram.desc'), icon: <StructureIcon />, image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/diagram.png' },
            { tool: Tool.RealEstatePoster, label: t('tool.poster'), desc: t('dash.poster.desc'), icon: <MarketingIcon />, image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=600&auto=format&fit=crop' },
            { tool: Tool.Moodboard, label: t('tool.moodboard'), desc: t('dash.moodboard.desc'), icon: <MoodboardIcon />, image: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=600&auto=format&fit=crop' },
            { tool: Tool.Upscale, label: t('tool.upscale'), desc: t('dash.upscale.desc'), icon: <UpscaleIcon />, image: 'https://images.unsplash.com/photo-1518640467707-6811f4a6ab73?q=80&w=600&auto=format&fit=crop' },
            { tool: Tool.MaterialSwap, label: t('tool.material'), desc: t('dash.material.desc'), icon: <MaterialIcon />, image: 'https://images.unsplash.com/photo-1615529182904-14819c35db37?q=80&w=600&auto=format&fit=crop' },
            { tool: Tool.Staging, label: t('tool.staging'), desc: t('dash.staging.desc'), icon: <InteriorIcon />, image: 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?q=80&w=600&auto=format&fit=crop' },
            { tool: Tool.SketchConverter, label: t('tool.sketch'), desc: t('dash.sketch.desc'), icon: <PencilIcon />, image: 'https://mtlomjjlgvsjpudxlspq.supabase.co/storage/v1/object/public/background-imgs/photo-to-sketch.png' },
            { tool: Tool.AITechnicalDrawings, label: t('tool.technical'), desc: t('dash.technical.desc'), icon: <BlueprintIcon />, image: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=600&auto=format&fit=crop' },
        ]
    };
};

const Navigation: React.FC<NavigationProps> = ({ activeTool, setActiveTool, isMobileOpen = false, onCloseMobile, onGoHome }) => {
    const { t } = useLanguage();
    const utilityTools = useUtilityTools();
    const [isVisible, setIsVisible] = useState(true);
    const lastScrollY = useRef(0);
    
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            // Chỉ bắt đầu ẩn thanh Nav sau khi đã cuộn qua Header (khoảng 60px)
            if (currentScrollY > 60) {
                if (currentScrollY > lastScrollY.current) {
                    setIsVisible(false); // Cuộn xuống -> Ẩn
                } else {
                    setIsVisible(true); // Cuộn lên -> Hiện
                }
            } else {
                setIsVisible(true); // Luôn hiện nếu ở gần đầu trang
            }
            lastScrollY.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);
    
    const mainNavItems = [
        { tool: Tool.ArchitecturalRendering, label: t('tool.arch'), icon: <PhotoIcon /> },
        { tool: Tool.FloorPlan, label: t('tool.floorplan'), icon: <FloorPlanIcon /> },
        { tool: Tool.Renovation, label: t('tool.renovation'), icon: <RenovationIcon /> },
        { tool: Tool.ViewSync, label: t('tool.viewsync'), icon: <ViewGridIcon /> },
        { tool: Tool.ImageEditing, label: t('tool.editor'), icon: <SparklesIcon /> },
    ];
    
    const isExtendedToolActive = utilityTools.tools.some(item => item.tool === activeTool) || activeTool === Tool.ExtendedFeaturesDashboard;

    const renderItem = (item: { tool: Tool; label: string; icon: React.ReactElement<any>; }) => (
        <button
            key={item.tool}
            onClick={() => setActiveTool(item.tool)}
            className={`group relative flex items-center gap-2 px-3 lg:px-4 py-1.5 rounded-full transition-all duration-300 text-sm font-medium whitespace-nowrap outline-none
              ${activeTool === item.tool
                ? 'text-white bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] shadow-md shadow-purple-500/20 ring-1 ring-white/10' 
                : 'text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white hover:bg-gray-200/50 dark:hover:bg-white/5'
              }`}
            title={item.label}
          >
            <span className={`relative z-10 transition-colors duration-300 ${activeTool === item.tool ? 'text-white' : 'group-hover:text-[#7f13ec]'}`}>
                {React.cloneElement(item.icon, { className: "h-4 w-4 md:h-5 md:w-5" })}
            </span>
            <span className={`relative z-10 hidden lg:inline`}>{item.label}</span>
          </button>
    );

  return (
    <>
      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 md:hidden transition-opacity" onClick={onCloseMobile}>
             <aside className="absolute inset-y-0 left-0 w-[80%] max-w-[300px] bg-surface dark:bg-[#121212] border-r border-border-color dark:border-[#302839] shadow-2xl p-4 flex flex-col h-full overflow-y-auto">
                <div className="flex justify-between items-center mb-6 px-2">
                    <h2 className="text-xl font-bold text-text-primary dark:text-white">{t('nav.menu')}</h2>
                    <button onClick={onCloseMobile} className="p-2 rounded-lg bg-gray-100 dark:bg-[#302839] text-text-secondary dark:text-gray-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="space-y-1">
                    {onGoHome && (
                        <button onClick={() => { onGoHome(); onCloseMobile?.(); }} className="group flex items-center w-full gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 text-sm font-medium text-text-secondary dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#302839] hover:text-text-primary dark:hover:text-white">
                            <span className="text-gray-400 group-hover:text-[#7f13ec]"><HomeIcon /></span>
                            <span className="truncate">{t('nav.home')}</span>
                        </button>
                    )}
                    {mainNavItems.map(item => (
                        <button key={item.tool} onClick={() => setActiveTool(item.tool)} className={`group flex items-center w-full gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 text-sm font-medium ${activeTool === item.tool ? 'bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] text-white shadow-md' : 'text-text-secondary dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#302839] hover:text-text-primary dark:hover:text-white'}`}>
                            <span className={`${activeTool === item.tool ? 'text-white' : 'text-gray-400 group-hover:text-[#7f13ec]'}`}>{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                        </button>
                    ))}
                    <button onClick={() => setActiveTool(Tool.ExtendedFeaturesDashboard)} className={`group flex items-center w-full gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 text-sm font-medium ${isExtendedToolActive ? 'bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] text-white shadow-md' : 'text-text-secondary dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#302839] hover:text-text-primary dark:hover:text-white'}`}>
                        <span className={`${isExtendedToolActive ? 'text-white' : 'text-gray-400 group-hover:text-[#7f13ec]'}`}>{utilityTools.icon}</span>
                        <span className="truncate">{t('tool.extended')}</span>
                    </button>
                    <div className="pt-4 mt-4 border-t border-border-color dark:border-[#302839]">
                         <button onClick={() => setActiveTool(Tool.History)} className={`group flex items-center w-full gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 text-sm font-medium ${activeTool === Tool.History ? 'bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] text-white shadow-md' : 'text-text-secondary dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#302839] hover:text-text-primary dark:hover:text-white'}`}>
                            <span className={`${activeTool === Tool.History ? 'text-white' : 'text-gray-400 group-hover:text-[#7f13ec]'}`}><HistoryIcon /></span>
                            <span className="truncate">{t('nav.history')}</span>
                        </button>
                    </div>
                </div>
             </aside>
        </div>
      )}

      {/* Desktop Horizontal Toolbar - Sticky with Auto-hide animation */}
      <nav 
        className={`hidden md:flex w-full sticky top-[60px] z-30 bg-surface/90 dark:bg-[#121212]/95 backdrop-blur-xl border-b border-border-color dark:border-[#302839] shadow-sm justify-center h-[56px] transition-all duration-500 ease-in-out ${
            isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
        }`}
      >
        <div className="max-w-[1600px] w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            {onGoHome && (
                <div className="absolute left-6 flex items-center">
                    <button onClick={onGoHome} className="group relative flex items-center justify-center p-1.5 rounded-full transition-all duration-300 outline-none text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white hover:bg-gray-200/50 dark:hover:bg-white/5" title={t('nav.home')}><HomeIcon className="h-5 w-5" /></button>
                </div>
            )}
            <div className="flex-1 flex justify-center">
                <div className="flex items-center p-1 rounded-full bg-gray-50/80 dark:bg-white/5 border border-gray-200 dark:border-white/5 shadow-inner">
                    {mainNavItems.map((item, index) => (
                        <React.Fragment key={item.tool}>
                            {renderItem(item)}
                            <div className="h-4 w-px bg-gray-300 dark:bg-white/10 mx-1"></div>
                        </React.Fragment>
                    ))}
                    <button onClick={() => setActiveTool(Tool.ExtendedFeaturesDashboard)} className={`group relative flex items-center gap-2 px-3 lg:px-4 py-1.5 rounded-full transition-all duration-300 text-sm font-medium whitespace-nowrap outline-none ${isExtendedToolActive ? 'text-white bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] shadow-md shadow-purple-500/20 ring-1 ring-white/10' : 'text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white hover:bg-gray-200/50 dark:hover:bg-white/5'}`} title={t('tool.extended')}>
                        <span className={`relative z-10 transition-colors duration-300 ${isExtendedToolActive ? 'text-white' : 'group-hover:text-[#7f13ec]'}`}>{React.cloneElement(utilityTools.icon, { className: "h-4 w-4 md:h-5 md:w-5" })}</span>
                        <span className="relative z-10 hidden lg:inline">{t('tool.extended')}</span>
                    </button>
                </div>
            </div>
            <div className="absolute right-6 flex items-center">
                <div className="flex items-center p-1 rounded-full bg-gray-50/80 dark:bg-white/5 border border-gray-200 dark:border-white/5 shadow-inner">
                    <button onClick={() => setActiveTool(Tool.History)} className={`group relative flex items-center gap-2 px-3 lg:px-4 py-1.5 rounded-full transition-all duration-300 text-sm font-medium whitespace-nowrap outline-none ${activeTool === Tool.History ? 'text-white bg-gradient-to-r from-[#7f13ec] to-[#9d4edd] shadow-md shadow-purple-500/20 ring-1 ring-white/10' : 'text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white hover:bg-gray-200/50 dark:hover:bg-white/5'}`} title={t('nav.history')}>
                        <span className={`relative z-10 transition-colors duration-300 ${activeTool === Tool.History ? 'text-white' : 'group-hover:text-[#7f13ec]'}`}><HistoryIcon className="h-4 w-4 md:h-5 md:w-5" /></span>
                        <span className={`relative z-10 hidden lg:inline`}>{t('nav.history')}</span>
                    </button>
                </div>
            </div>
        </div>
      </nav>
    </>
  );
};

export default Navigation;
