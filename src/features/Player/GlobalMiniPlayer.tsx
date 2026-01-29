import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useVideoPlayer } from '../../core/hooks/useVideoPlayer';

export const GlobalMiniPlayer: React.FC = () => {
    const { activeVideoId, isMinimized, close, videoTitle } = useVideoPlayer();
    const [width, setWidth] = useState(320); // Initial width
    const [isResizing, setIsResizing] = useState(false); // For UI updates (e.g. pointer-events)
    const isResizingRef = useRef(false); // For event logic (avoiding stale closures)
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizingRef.current = true;
        setIsResizing(true);
        startXRef.current = e.clientX;
        startWidthRef.current = width;
        document.body.style.cursor = 'nwse-resize';
        document.body.style.userSelect = 'none'; // Prevent text selection
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizingRef.current) return;

        // Dragging LEFT decreases X, so (Start - Current) is positive.
        // We want dragging LEFT to INCREASE width.
        // If current X is less than start X, delta is positive -> Width increases.
        const deltaX = startXRef.current - e.clientX;

        let newWidth = startWidthRef.current + deltaX;

        // Constrain width
        const minWidth = 200;
        const maxWidth = 800; // max reasonable width
        newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));

        setWidth(newWidth);
    }, []);

    const handleMouseUp = useCallback(() => {
        isResizingRef.current = false;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    useEffect(() => {
        if (isMinimized) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isMinimized, handleMouseMove, handleMouseUp]);

    if (!activeVideoId || !isMinimized) return null;

    // derived height for 16:9
    const height = (width * 9) / 16;
    // Header height is fixed (e.g. 32px or 2rem)
    const headerHeight = 32;

    return (
        <div
            className="fixed bottom-4 right-4 z-[9999] flex flex-col shadow-2xl rounded-xl overflow-hidden bg-bg-secondary transition-none animate-in slide-in-from-bottom-5 fade-in"
            style={{
                width: `${width}px`,
                height: `${height + headerHeight}px`,
            }}
        >
            {/* Header / Controls Overlay */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#0F0F0F] relative w-full h-8 shrink-0">
                <div className="text-[11px] font-medium text-text-primary truncate pr-2 select-none pointer-events-none">
                    {activeVideoId ? (videoTitle || 'Playing...') : 'No Video'}
                </div>
                <button
                    onClick={close}
                    className="text-text-tertiary hover:text-white transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Video Container - Height fills remaining space */}
            <div className="flex-1 w-full bg-black relative min-h-0">
                <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&modestbranding=1&rel=0`}
                    title={videoTitle || "Mini Player"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className={`w-full h-full absolute inset-0 ${isResizing ? 'pointer-events-none' : ''}`}
                ></iframe>
            </div>

            {/* Resize Handle - Top Left Overlay on the ENTIRE PLAYER (Header + Video) */}
            {/* 
                Placement: Top-left of the ROOT CONTAINER.
                Visual: Invisible (transparent).
                Logic: Drag increases size (expanding Up and Left).
            */}
            <div
                className="absolute top-0 left-0 w-8 h-8 z-[10000] cursor-nwse-resize group flex items-start justify-start"
                style={{
                    transform: 'translate(-30%, -30%)' // Shift slightly out to better catch the corner
                }}
                onMouseDown={handleMouseDown}
                title="Resize"
            >
                {/* Invisible large hit area */}
                <div className="w-full h-full bg-transparent"></div>
            </div>
        </div>
    );
};
