// =============================================================================
// CANVAS: Full-screen Overlay — Orchestrator
// Manages Firestore subscription, keyboard shortcuts (Escape), and
// places pending nodes when Canvas opens or when new nodes are added while open.
// =============================================================================

import React, { useRef, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import { useCanvasSync } from './hooks/useCanvasSync';
import { useCanvasPlacement } from './hooks/useCanvasPlacement';
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard';
import { useCanvasNicheSync } from './hooks/useCanvasNicheSync';
import { useCanvasContextBridge } from './hooks/useCanvasContextBridge';
import { CanvasFloatingBar } from './CanvasFloatingBar';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasBoard, type CanvasBoardHandle } from './CanvasBoard';
import { CanvasNodeWrapper } from './CanvasNodeWrapper';
import { VideoCardNode } from './VideoCardNode';
import { TrafficSourceNode } from './TrafficSourceNode';
import { StickyNoteNode } from './StickyNoteNode';
import { ImageNode } from './ImageNode';
import { GlobalInsightsBar } from './GlobalInsightsBar';
import { EdgeLayer, EdgeHandles } from './EdgeLayer';
import { SnapshotFrame } from './SnapshotFrame';
import { isNodeVisible } from './geometry/viewportCulling';
import { deriveFrameBounds } from './utils/frameLayout';
import type { CanvasViewport, StickyNoteData, ImageNodeData } from '../../core/types/canvas';
import type { VideoCardContext, TrafficSourceCardData } from '../../core/types/appContext';
import { debug } from '../../core/utils/debug';
import { CanvasPageHeader } from './CanvasPageHeader';
import './Canvas.css';


// --- Two-level LOD thresholds with hysteresis ±0.03 ---
const LOD_FULL_UP = 0.53;  // zoom-in: switch TO full
const LOD_FULL_DOWN = 0.47;  // zoom-out: switch FROM full
const LOD_MIN_UP = 0.28;  // zoom-in: switch TO medium
const LOD_MIN_DOWN = 0.22;  // zoom-out: switch FROM medium

type LodLevel = import('./CanvasNodeWrapper').LodLevel;

const computeLod = (zoom: number, prev: LodLevel): LodLevel => {
    if (prev === 'full') return zoom < LOD_FULL_DOWN ? (zoom < LOD_MIN_DOWN ? 'minimal' : 'medium') : 'full';
    if (prev === 'medium') return zoom >= LOD_FULL_UP ? 'full' : (zoom < LOD_MIN_DOWN ? 'minimal' : 'medium');
    /* minimal */           return zoom >= LOD_MIN_UP ? (zoom >= LOD_FULL_UP ? 'full' : 'medium') : 'minimal';
};

export const CanvasOverlay: React.FC = () => {
    const {
        isOpen,
        setOpen,
        nodes,
        nodeSizes,
        viewport,
        setViewport,
        clearSelection,
        setSelectedNodeIds,
        setLastCanvasWorldPos,
        addNodeAt,
        markPlaced,
        pages,
        activePageId,
        switchPage,
        addPage,
        renamePage,
        deletePage,
    } = useCanvasStore(
        useShallow((s) => ({
            isOpen: s.isOpen,
            setOpen: s.setOpen,
            nodes: s.nodes,
            nodeSizes: s.nodeSizes,
            viewport: s.viewport,
            setViewport: s.setViewport,
            clearSelection: s.clearSelection,
            setSelectedNodeIds: s.setSelectedNodeIds,
            setLastCanvasWorldPos: s.setLastCanvasWorldPos,
            addNodeAt: s.addNodeAt,
            markPlaced: s.markPlaced,
            pages: s.pages,
            activePageId: s.activePageId,
            switchPage: s.switchPage,
            addPage: s.addPage,
            renamePage: s.renamePage,
            deletePage: s.deletePage,
        }))
    );

    const boardRef = useRef<CanvasBoardHandle>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const liveZoomRef = useRef(viewport.zoom);
    // Culling viewport: updated mid-pan/zoom via throttled callback
    const [cullingViewport, setCullingViewport] = React.useState(viewport);
    // LOD level — only re-renders when level actually transitions (rare)
    const [lodLevel, setLodLevel] = React.useState<LodLevel>('full');

    // Auto-focus overlay so document receives generic paste/keyboard events
    React.useEffect(() => {
        if (isOpen) overlayRef.current?.focus();
    }, [isOpen]);

    // --- Hooks: sync, placement, keyboard ---
    useCanvasSync(isOpen);
    useCanvasPlacement(isOpen, boardRef);
    useCanvasKeyboard(isOpen, boardRef);
    useCanvasNicheSync(isOpen);
    useCanvasContextBridge(isOpen);

    // Sync liveZoom and cullingViewport when viewport changes externally
    React.useEffect(() => {
        liveZoomRef.current = viewport.zoom;
        setCullingViewport(viewport);
    }, [viewport]);

    const handleViewportChange = useCallback((vp: CanvasViewport) => {
        setViewport(vp);
        liveZoomRef.current = vp.zoom;
        setCullingViewport(vp);
    }, [setViewport]);

    // Called every rAF frame — updates zoom ref and LOD level (no React re-render
    // unless LOD actually transitions, which is rare: 3 levels with hysteresis)
    const handleZoomFrame = useCallback((zoom: number) => {
        liveZoomRef.current = zoom;
        setLodLevel((prev) => {
            const next = computeLod(zoom, prev);
            if (next !== prev) {
                debug.canvas(`🎨 LOD → ${next} (zoom=${zoom.toFixed(3)})`);
            }
            return next;
        });
    }, []);

    // Throttled mid-pan/zoom update — drives viewport culling recalculation
    const handlePanFrame = useCallback((vp: CanvasViewport) => {
        setCullingViewport(vp);
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
        // Dismiss pending glow for all selected nodes (same as single-click)
        ids.forEach(markPlaced);
    }, [setSelectedNodeIds, markPlaced]);

    // Double-click on empty canvas → create sticky note with top-left at cursor
    const handleCanvasDblClick = useCallback((worldPos: { x: number; y: number }) => {
        addNodeAt(
            { type: 'sticky-note', content: '', color: 'yellow' },
            worldPos,
        );
    }, [addNodeAt]);

    // Register pan-to-node handler so store.panToNode() can animate camera
    React.useEffect(() => {
        const handler = (worldX: number, worldY: number, onComplete?: () => void) => {
            boardRef.current?.centerOnPos(worldX, worldY, true, onComplete);
        };
        useCanvasStore.getState()._registerPanHandler(handler);
        return () => useCanvasStore.getState()._unregisterPanHandler();
    }, []);

    // Register panBy handler so store.autoPanBy() can shift viewport during edge drag
    React.useEffect(() => {
        const handler = (dx: number, dy: number) => {
            boardRef.current?.panBy(dx, dy);
        };
        useCanvasStore.getState()._registerPanByHandler(handler);
        return () => useCanvasStore.getState()._unregisterPanByHandler();
    }, []); const placedNodes = useMemo(() => nodes.filter((n) => n.position !== null), [nodes]);
    const hasNodes = placedNodes.length > 0;

    // --- Viewport Culling: only render nodes visible on screen ---
    // Uses cullingViewport (updated mid-pan) instead of store viewport
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const visibleNodes = useMemo(
        () => placedNodes.filter((n) => isNodeVisible(n, cullingViewport, screenW, screenH, nodeSizes[n.id])),
        [placedNodes, cullingViewport, screenW, screenH, nodeSizes],
    );

    // --- Snapshot Frames: compute bounds from placed node positions ---
    const frameBounds = useMemo(
        () => deriveFrameBounds(placedNodes, nodeSizes),
        [placedNodes, nodeSizes],
    );

    debug.fps('canvas', `CanvasOverlay (zoom=${viewport.zoom.toFixed(2)}, nodes=${placedNodes.length}, visible=${visibleNodes.length}, lod=${lodLevel}, frames=${frameBounds.length})`);

    if (!isOpen) return null;

    // Map CanvasPageMeta to CanvasPage shape for tabs
    const tabPages = pages.map((p) => ({ id: p.id, title: p.title }));

    return (
        <>
            {/* Overlay: board background + nodes */}
            <div
                ref={overlayRef}
                tabIndex={-1}
                className="canvas-overlay fixed inset-0 z-panel flex flex-col focus:outline-none"
                style={{ background: 'var(--bg-primary)' }}
            >
                {/* Page header — frozen blur, above board */}
                <CanvasPageHeader
                    pages={tabPages}
                    activePageId={activePageId ?? ''}
                    onSwitch={switchPage}
                    onAdd={() => addPage(`Page ${pages.length + 1}`)}
                    onRename={renamePage}
                    onDelete={deletePage}
                />

                {/* Global Pinned Insights */}
                <GlobalInsightsBar />

                {/* Board — nodes are children of the transform layer */}
                <CanvasBoard
                    ref={boardRef}
                    viewport={viewport}
                    onViewportChange={handleViewportChange}
                    onZoomFrame={handleZoomFrame}
                    onPanFrame={handlePanFrame}
                    onPointerDown={() => overlayRef.current?.focus()}
                    onClick={() => {
                        clearSelection();
                        useCanvasStore.getState().clearHighlightedEdge();
                        overlayRef.current?.focus();
                    }}
                    onSelectRect={handleSelectRect}
                    onCursorMove={setLastCanvasWorldPos}
                    onDblClick={handleCanvasDblClick}
                >
                    {/* EdgeLayer behind nodes so cards appear on top of edge lines */}
                    <EdgeLayer />

                    {/* Snapshot frames: rendered below nodes (visual grouping)
                        — not selectable, not draggable */}
                    {frameBounds.map((fb) => (
                        <SnapshotFrame
                            key={fb.key}
                            label={fb.snapshotLabel}
                            x={fb.x}
                            y={fb.y}
                            w={fb.w}
                            h={fb.h}
                        />
                    ))}

                    {visibleNodes.map((node) => (
                        <CanvasNodeWrapper key={node.id} node={node} lodLevel={lodLevel} measuredHeight={nodeSizes[node.id]}>
                            {node.type === 'video-card' && (
                                <VideoCardNode data={node.data as VideoCardContext} nodeId={node.id} />
                            )}
                            {node.type === 'traffic-source' && (
                                <TrafficSourceNode data={node.data as TrafficSourceCardData} />
                            )}
                            {node.type === 'sticky-note' && (
                                <StickyNoteNode data={node.data as StickyNoteData} nodeId={node.id} />
                            )}
                            {node.type === 'image' && (
                                <ImageNode data={node.data as ImageNodeData} nodeId={node.id} />
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
                onClose={() => setOpen(false)}
                boardRef={boardRef}
            />
        </>
    );
};
