import React from 'react';
import { X } from 'lucide-react';
import { useVideoPlayer } from '../../core/hooks/useVideoPlayer';
import { useMiniPlayerGeometry } from './hooks/useMiniPlayerGeometry';
import './MiniPlayer.css';

export const GlobalMiniPlayer: React.FC = () => {
    const { activeVideoId, isMinimized, close, videoTitle } = useVideoPlayer();
    const {
        rect,
        isInteracting,
        dragTransform,
        handleDragStart,
        handleResizeStart,
    } = useMiniPlayerGeometry();

    if (!activeVideoId || !isMinimized) return null;

    // Apply drag transform for GPU-accelerated movement during drag
    const style: React.CSSProperties = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        ...(dragTransform ? {
            transform: `translate(${dragTransform.x}px, ${dragTransform.y}px)`,
            willChange: 'transform',
        } : undefined),
    };

    return (
        <div
            className="fixed z-panel flex flex-col shadow-2xl rounded-xl overflow-hidden bg-bg-secondary animate-in slide-in-from-bottom-5 fade-in"
            style={style}
        >
            {/* Header — draggable */}
            <div
                className={`flex items-center justify-between px-3 py-2 bg-[#0F0F0F] w-full h-8 shrink-0 select-none ${isInteracting ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handleDragStart}
            >
                <div className="text-[11px] font-medium text-text-primary truncate pr-2 pointer-events-none">
                    {activeVideoId ? (videoTitle || 'Playing...') : 'No Video'}
                </div>
                <button
                    onClick={close}
                    className="text-text-tertiary hover:text-white transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Video container — 16:9, fills remaining space */}
            <div className="flex-1 w-full bg-black relative min-h-0">
                <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&modestbranding=1&rel=0`}
                    title={videoTitle || "Mini Player"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className={`w-full h-full absolute inset-0 ${isInteracting ? 'pointer-events-none' : ''}`}
                />
            </div>

            {/* Resize edge handles */}
            {rect.canResizeLeft && <div className="mp-resize-edge mp-resize-left" onMouseDown={handleResizeStart('left')} />}
            {rect.canResizeRight && <div className="mp-resize-edge mp-resize-right" onMouseDown={handleResizeStart('right')} />}
            {rect.canResizeTop && <div className="mp-resize-edge mp-resize-top" onMouseDown={handleResizeStart('top')} />}
            {rect.canResizeBottom && <div className="mp-resize-edge mp-resize-bottom" onMouseDown={handleResizeStart('bottom')} />}
            {rect.canResizeTop && rect.canResizeLeft && <div className="mp-resize-edge mp-resize-corner-tl" onMouseDown={handleResizeStart('top-left')} />}
            {rect.canResizeTop && rect.canResizeRight && <div className="mp-resize-edge mp-resize-corner-tr" onMouseDown={handleResizeStart('top-right')} />}
            {rect.canResizeBottom && rect.canResizeLeft && <div className="mp-resize-edge mp-resize-corner-bl" onMouseDown={handleResizeStart('bottom-left')} />}
            {rect.canResizeBottom && rect.canResizeRight && <div className="mp-resize-edge mp-resize-corner-br" onMouseDown={handleResizeStart('bottom-right')} />}
        </div>
    );
};
