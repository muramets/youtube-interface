// =============================================================================
// CANVAS: Full-screen Overlay — Orchestrator
// Manages Firestore subscription, keyboard shortcuts (Escape), and
// places pending nodes when Canvas opens or when new nodes are added while open.
// =============================================================================

import React, { useRef, useCallback } from 'react';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import { useCanvasSync } from './hooks/useCanvasSync';
import { useCanvasPlacement } from './hooks/useCanvasPlacement';
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard';
import { CanvasFloatingBar } from './CanvasFloatingBar';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasBoard, type CanvasBoardHandle } from './CanvasBoard';
import { CanvasNodeWrapper } from './CanvasNodeWrapper';
import { VideoCardNode } from './VideoCardNode';
import { TrafficSourceNode } from './TrafficSourceNode';
import { EdgeLayer, EdgeHandles } from './EdgeLayer';
import type { CanvasViewport } from '../../core/types/canvas';
import type { VideoCardContext, TrafficSourceCardData } from '../../core/types/appContext';
import './Canvas.css';

export const CanvasOverlay: React.FC = () => {
    const {
        isOpen,
        setOpen,
        nodes,
        viewport,
        setViewport,
        clearSelection,
        setSelectedNodeIds,
    } = useCanvasStore();

    const boardRef = useRef<CanvasBoardHandle>(null);
    const [liveZoom, setLiveZoom] = React.useState(viewport.zoom);

    // --- Hooks: sync, placement, keyboard ---
    useCanvasSync(isOpen);
    useCanvasPlacement(isOpen, boardRef);
    useCanvasKeyboard(isOpen, boardRef);

    const handleViewportChange = useCallback((vp: CanvasViewport) => {
        setViewport(vp);
        setLiveZoom(vp.zoom);
    }, [setViewport]);

    // Called every rAF frame — updates zoom pill display without store overhead
    const handleZoomFrame = useCallback((zoom: number) => {
        setLiveZoom(zoom);
    }, []);

    // Marquee selection: hit-test all [data-node-id] elements against client rect
    const handleSelectRect = useCallback((rect: { left: number; top: number; right: number; bottom: number }) => {
        const els = document.querySelectorAll<HTMLElement>('[data-node-id]');
        const ids: string[] = [];
        els.forEach((el) => {
            const id = el.dataset.nodeId;
            if (!id) return;
            const bb = el.getBoundingClientRect();
            const overlaps =
                bb.left < rect.right &&
                bb.right > rect.left &&
                bb.top < rect.bottom &&
                bb.bottom > rect.top;
            if (overlaps) ids.push(id);
        });
        setSelectedNodeIds(ids);
    }, [setSelectedNodeIds]);

    const placedNodes = nodes.filter((n) => n.position !== null);
    const hasNodes = placedNodes.length > 0;

    if (!isOpen) return null;

    return (
        <>
            {/* Overlay: board background + nodes */}
            <div
                className="canvas-overlay fixed inset-0 z-panel flex flex-col"
                style={{ background: 'var(--bg-primary)' }}
            >
                {/* Board — nodes are children of the transform layer */}
                <CanvasBoard
                    ref={boardRef}
                    viewport={viewport}
                    onViewportChange={handleViewportChange}
                    onZoomFrame={handleZoomFrame}
                    onClick={clearSelection}
                    onSelectRect={handleSelectRect}
                >
                    {/* EdgeLayer behind nodes so cards appear on top of edge lines */}
                    <EdgeLayer />

                    {placedNodes.map((node) => (
                        <CanvasNodeWrapper key={node.id} node={node}>
                            {node.type === 'video-card' && (
                                <VideoCardNode data={node.data as VideoCardContext} nodeId={node.id} />
                            )}
                            {node.type === 'traffic-source' && (
                                <TrafficSourceNode data={node.data as TrafficSourceCardData} />
                            )}
                        </CanvasNodeWrapper>
                    ))}

                    {/* EdgeHandles AFTER nodes — re-wire circles render above node cards */}
                    <EdgeHandles />
                </CanvasBoard>

                {/* Empty state — outside transform layer, stays centered */}
                {!hasNodes && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                        <div className="flex flex-col items-center gap-3 opacity-30">
                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                                <rect x="6" y="14" width="16" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
                                <rect x="26" y="8" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
                                <rect x="26" y="26" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
                            </svg>
                            <p className="text-text-secondary text-sm font-medium">Select videos in Playlists to add</p>
                            <p className="text-text-tertiary text-xs">Use the floating bar → Canvas icon</p>
                        </div>
                    </div>
                )}
            </div>

            <CanvasFloatingBar />

            {/* Toolbar: fixed, outside overlay stacking context → genuinely z-overlay-ui (403) globally */}
            <CanvasToolbar
                zoom={liveZoom}
                onClose={() => setOpen(false)}
                boardRef={boardRef}
            />
        </>
    );
};
