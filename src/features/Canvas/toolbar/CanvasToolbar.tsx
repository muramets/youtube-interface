// =============================================================================
// CANVAS: Controls — zoom pill (drag-to-zoom) + close button.
// Pan guard in CanvasBoard ensures dragging this pill never starts canvas pan,
// so we can use simple window mouse listeners without pointer capture tricks.
// =============================================================================

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { X, RotateCcw, StickyNote } from 'lucide-react';
import { ControlPill } from '../../../pages/Trends/Timeline/components/ControlPill';
import type { CanvasBoardHandle } from '../CanvasBoard';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { liveZoom } from '../utils/liveZoom';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const DRAG_SENSITIVITY = 0.005; // zoom units per pixel dragged

interface CanvasToolbarProps {
    onClose: () => void;
    boardRef: React.RefObject<CanvasBoardHandle | null>;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({ onClose, boardRef }) => {
    const hasAudioPlayer = !!useMusicStore((s) => s.playingTrackId);
    const addNode = useCanvasStore((s) => s.addNode);

    // Read zoom from shared ref — poll via rAF for smooth pill updates
    const [zoomDisplay, setZoomDisplay] = useState(liveZoom.current);
    useEffect(() => {
        let raf: number;
        const tick = () => {
            const z = Math.round(liveZoom.current * 100);
            setZoomDisplay((prev) => prev === z ? prev : z);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    const handleAddNote = useCallback(() => {
        addNode({ type: 'sticky-note', content: '', color: 'yellow' });
    }, [addNode]);

    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; zoom: number } | null>(null);
    const pillRef = useRef<HTMLDivElement>(null);

    const handleReset = (e: React.MouseEvent) => {
        e.stopPropagation();
        boardRef.current?.zoomTo(1);
    };

    const handlePillMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        dragStartRef.current = { x: e.clientX, zoom: liveZoom.current };
        setIsDragging(true);
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!dragStartRef.current) return;
            const dx = e.clientX - dragStartRef.current.x;
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
                dragStartRef.current.zoom + dx * DRAG_SENSITIVITY
            ));
            boardRef.current?.zoomTo(newZoom);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            dragStartRef.current = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, boardRef]);

    return (
        <div
            className={`fixed ${hasAudioPlayer ? 'bottom-[88px]' : 'bottom-4'} right-6 z-overlay-ui select-none flex items-center gap-2 transition-[bottom] duration-200`}
            style={{ cursor: isDragging ? 'ew-resize' : undefined }}
        >
            {/* Zoom pill — drag left/right, ↺ resets to 100% */}
            <ControlPill
                orientation="horizontal"
                text={`${zoomDisplay}%`}
                className="w-[92px]"
                isDragging={isDragging}
                containerRef={pillRef}
                onMouseDown={handlePillMouseDown}
                icon={
                    <button
                        onClick={handleReset}
                        className="flex items-center justify-center p-0 rounded-full hover:text-text-primary transition-colors"
                        title="Reset zoom (100%)"
                    >
                        <RotateCcw size={14} />
                    </button>
                }
            />

            {/* Fullscreen cursor overlay while dragging (cursor lock + prevents hover effects) */}
            {isDragging && (
                <div className="fixed inset-0 z-overlay-ui cursor-ew-resize" />
            )}

            {/* Add sticky note */}
            <button
                onClick={handleAddNote}
                className="flex items-center justify-center w-[34px] h-[34px] rounded-full bg-bg-secondary/90 backdrop-blur-md border border-border shadow-lg text-text-secondary hover:text-text-primary hover:brightness-125 transition-all duration-200 select-none"
                title="Add sticky note"
            >
                <StickyNote size={14} />
            </button>

            {/* Close button */}
            <button
                onClick={onClose}
                className="flex items-center justify-center w-[34px] h-[34px] rounded-full bg-bg-secondary/90 backdrop-blur-md border border-border shadow-lg text-text-secondary hover:text-text-primary hover:brightness-125 transition-all duration-200 select-none"
                title="Close Canvas (Esc)"
            >
                <X size={14} />
            </button>
        </div>
    );
};
