// =============================================================================
// CANVAS: The Board — infinite pan/zoom workspace
// Composes useCanvasPanZoom + useMarqueeSelection hooks.
// =============================================================================

import React, { useRef, useEffect, useCallback, useImperativeHandle } from 'react';
import type { CanvasViewport } from '../../core/types/canvas';
import { useCanvasPanZoom } from './hooks/useCanvasPanZoom';
import { useMarqueeSelection } from './hooks/useMarqueeSelection';

// --- Constants ---
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

interface CanvasBoardProps {
    viewport: CanvasViewport;
    onViewportChange: (vp: CanvasViewport) => void;
    onZoomFrame?: (zoom: number) => void;
    onClick?: () => void;
    onSelectRect?: (rect: { left: number; top: number; right: number; bottom: number }) => void;
    /** Called when cursor moves over empty canvas (not panning). World coordinates. */
    onCursorMove?: (worldPos: { x: number; y: number }) => void;
    /** Called on double-click on empty canvas. World coordinates centered on cursor. */
    onDblClick?: (worldPos: { x: number; y: number }) => void;
    children?: React.ReactNode;
}

export interface CanvasBoardHandle {
    getViewportCenter: () => { x: number; y: number };
    zoomTo: (zoom: number) => void;
    fitToContent: (nodeRects: { x: number; y: number; w: number; h: number }[]) => void;
}

export const CanvasBoard = React.forwardRef<CanvasBoardHandle, CanvasBoardProps>(
    ({ viewport, onViewportChange, onZoomFrame, onClick, onSelectRect, onCursorMove, onDblClick, children }, ref) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const containerSizeRef = useRef({ width: 0, height: 0 });
        const mouseDownOnBoardRef = useRef(false);

        // Track container size
        useEffect(() => {
            const el = containerRef.current;
            if (!el) return;
            const ro = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    containerSizeRef.current = {
                        width: entry.contentRect.width,
                        height: entry.contentRect.height,
                    };
                }
            });
            ro.observe(el);
            return () => ro.disconnect();
        }, []);

        // --- Pan/Zoom ---
        const {
            transform, isPanning,
            handlePanStart, handlePanMove, handlePanEnd,
            applyTarget, transformRef,
        } = useCanvasPanZoom({
            viewport,
            onViewportChange,
            onZoomFrame,
            containerRef,
        });

        // --- Marquee Selection ---
        const marquee = useMarqueeSelection({ containerRef, onSelectRect });

        // --- Mouse handlers ---
        const handleMouseDown = useCallback((e: React.MouseEvent) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest('.canvas-node')) return;

            mouseDownOnBoardRef.current = true;

            // Shift+click → marquee; otherwise → pan
            if (marquee.tryStart(e.clientX, e.clientY, e.shiftKey)) return;
            handlePanStart(e.clientX, e.clientY);
        }, [marquee, handlePanStart]);

        const handleMouseMove = useCallback((e: React.MouseEvent) => {
            if (e.buttons !== 1 || !mouseDownOnBoardRef.current) return;
            if (marquee.move(e.clientX, e.clientY)) return;
            handlePanMove(e.clientX, e.clientY);
        }, [marquee, handlePanMove]);

        const handleMouseMoveCapture = useCallback((e: React.MouseEvent) => {
            // Track cursor position in world coordinates (only when not panning)
            if (!onCursorMove || isPanning) return;
            const el = containerRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const { x, y, zoom } = transform;
            const worldX = (e.clientX - rect.left - x) / zoom;
            const worldY = (e.clientY - rect.top - y) / zoom;
            onCursorMove({ x: worldX, y: worldY });
        }, [onCursorMove, isPanning, transform]);

        const handleMouseUp = useCallback(() => {
            mouseDownOnBoardRef.current = false;
            if (marquee.end()) return;
            handlePanEnd();
        }, [marquee, handlePanEnd]);

        const handleClick = useCallback(() => {
            if (marquee.wasSelecting) {
                marquee.clearWasSelecting();
                return;
            }
            onClick?.();
        }, [onClick, marquee]);

        const handleDblClick = useCallback((e: React.MouseEvent) => {
            if (!onDblClick) return;
            if ((e.target as HTMLElement).closest('.canvas-node')) return;
            const el = containerRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const { x, y, zoom } = transform;
            const worldX = (e.clientX - rect.left - x) / zoom;
            const worldY = (e.clientY - rect.top - y) / zoom;
            onDblClick({ x: worldX, y: worldY });
        }, [onDblClick, transform]);

        // --- Imperative handle ---
        useImperativeHandle(ref, () => ({
            getViewportCenter: () => {
                let { width, height } = containerSizeRef.current;
                if ((width === 0 || height === 0) && containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    width = rect.width;
                    height = rect.height;
                }
                const { x, y, zoom } = transformRef.current;
                return {
                    x: (width / 2 - x) / zoom,
                    y: (height / 2 - y) / zoom,
                };
            },
            zoomTo: (zoom: number) => {
                const { width, height } = containerSizeRef.current;
                const cur = transformRef.current;
                const ratio = zoom / cur.zoom;
                applyTarget({
                    x: width / 2 - (width / 2 - cur.x) * ratio,
                    y: height / 2 - (height / 2 - cur.y) * ratio,
                    zoom,
                });
            },
            fitToContent: (rects) => {
                if (rects.length === 0) return;
                const { width, height } = containerSizeRef.current;
                const minX = Math.min(...rects.map((r) => r.x));
                const minY = Math.min(...rects.map((r) => r.y));
                const maxX = Math.max(...rects.map((r) => r.x + r.w));
                const maxY = Math.max(...rects.map((r) => r.y + r.h));
                const contentW = maxX - minX + 80;
                const contentH = maxY - minY + 80;
                const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(width / contentW, height / contentH) * 0.9));
                const x = width / 2 - (minX + contentW / 2) * zoom;
                const y = height / 2 - (minY + contentH / 2) * zoom;
                applyTarget({ x, y, zoom });
            },
        }), [applyTarget, transformRef]);

        // Dot grid — fade out smoothly at low zoom to prevent moiré
        const gridSize = 24 * transform.zoom;
        const gridOpacity = transform.zoom < 0.15 ? 0.35
            : transform.zoom < 0.4 ? 0.35 + (transform.zoom - 0.15) / 0.25 * 0.65
                : 1;
        const dotR = Math.max(0.6, transform.zoom);

        return (
            <div
                ref={containerRef}
                className={`canvas-board w-full h-full overflow-hidden relative select-none ${isPanning ? 'is-panning' : 'pan-ready'}`}
                style={{
                    backgroundImage: gridOpacity > 0
                        ? `radial-gradient(circle, rgba(var(--border-rgb), ${gridOpacity}) ${dotR}px, transparent ${dotR}px)`
                        : 'none',
                    backgroundSize: `${gridSize}px ${gridSize}px`,
                    backgroundPosition: `${transform.x % gridSize}px ${transform.y % gridSize}px`,
                    // Publish zoom for child CSS consumers (e.g. resize handle counter-scaling)
                    ['--canvas-zoom' as string]: transform.zoom,
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseMoveCapture={handleMouseMoveCapture}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={handleClick}
                onDoubleClick={handleDblClick}
            >
                {/* Selection rect overlay */}
                {marquee.selectionRect && (
                    <div
                        className="absolute pointer-events-none z-50"
                        style={{
                            left: marquee.selectionRect.x,
                            top: marquee.selectionRect.y,
                            width: marquee.selectionRect.w,
                            height: marquee.selectionRect.h,
                            background: 'rgba(99,102,241,0.15)',
                            border: '1px solid #6366f1',
                            borderRadius: 2,
                        }}
                    />
                )}
                {/* Transform layer */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
                        transformOrigin: '0 0',
                        willChange: isPanning ? 'transform' : undefined,
                    }}
                >
                    {children}
                </div>
            </div>
        );
    },
);

CanvasBoard.displayName = 'CanvasBoard';
