import { useState, useCallback, useRef, useEffect } from 'react';

// =============================================================================
// Chat Panel Geometry Hook — Drag, Resize, Persist
// Performance: transform-based drag, ref-based interim state, rAF throttling.
// =============================================================================

export type ResizeEdge = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface PanelGeometry {
    top: number;
    left: number;
    w: number;
    h: number;
}

export interface PanelGeometryResult {
    /** Current panel rect (top/left/width/height + resize availability) */
    panelRect: {
        top: number; left: number; width: number; height: number;
        canResizeTop: boolean; canResizeBottom: boolean;
        canResizeLeft: boolean; canResizeRight: boolean;
    };
    /** True during drag or resize (disables pointer events below) */
    isInteracting: boolean;
    /** Transform offset for GPU-accelerated drag (applied during drag only) */
    dragTransform: { x: number; y: number } | null;
    /** Start dragging from header */
    handleDragStart: (e: React.MouseEvent) => void;
    /** Start resizing from an edge/corner */
    handleResizeStart: (edge: ResizeEdge) => (e: React.MouseEvent) => void;
}

const STORAGE_KEY = 'chat-panel-geometry';
const MIN_W = 320;
const MAX_W = 800;
const MIN_H = 360; // header(56) + context-bar(~28) + visible messages(~160) + input(~116)
const HEADER_H = 56;
const MIN_MARGIN = 24; // minimum gap from viewport edges
const EDGE_MIN_GAP = 24; // minimum gap from viewport edge to enable resize on that side

function readSaved(): PanelGeometry | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const g = JSON.parse(raw);
            if (typeof g.top === 'number' && typeof g.left === 'number' &&
                typeof g.w === 'number' && typeof g.h === 'number') {
                return g as PanelGeometry;
            }
        }
    } catch { /* ignore */ }
    return null;
}

function persistGeometry(g: PanelGeometry) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(g)); } catch { /* ignore */ }
}

function clampGeometry(g: PanelGeometry): PanelGeometry {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.max(MIN_W, Math.min(MAX_W, g.w));
    const maxH = vh - HEADER_H - MIN_MARGIN;
    const h = Math.max(MIN_H, Math.min(maxH, g.h));
    const left = Math.max(MIN_MARGIN, Math.min(vw - w - MIN_MARGIN, g.left));
    const top = Math.max(HEADER_H + MIN_MARGIN, Math.min(vh - h - MIN_MARGIN, g.top));
    return { top, left, w, h };
}

/**
 * Compute initial geometry from the bubble anchor position.
 * Panel's bottom-right corner aligns with the bubble's bottom-right corner.
 */
function computeInitialGeometry(anchorBottomPx: number, anchorRightPx: number, w: number, h: number): PanelGeometry {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = vw - anchorRightPx - w;
    const top = vh - anchorBottomPx - h;
    return clampGeometry({ top, left, w, h });
}

export function usePanelGeometry(anchorBottomPx: number, anchorRightPx: number): PanelGeometryResult {
    // --- Initial geometry: restore saved or compute from anchor ---
    const [geo, setGeo] = useState<PanelGeometry>(() => {
        const saved = readSaved();
        if (saved) return clampGeometry(saved);
        return computeInitialGeometry(anchorBottomPx, anchorRightPx, 400, 560);
    });

    const [isInteracting, setIsInteracting] = useState(false);
    const [dragTransform, setDragTransform] = useState<{ x: number; y: number } | null>(null);

    // --- Refs for rAF-throttled interaction ---
    const geoRef = useRef(geo);
    const interactionRef = useRef<'drag' | ResizeEdge | null>(null);
    const startMouseRef = useRef({ x: 0, y: 0 });
    const startGeoRef = useRef<PanelGeometry>(geo);
    const rafRef = useRef(0);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    // Keep ref in sync
    useEffect(() => { geoRef.current = geo; }, [geo]);

    // Re-clamp when viewport resizes (e.g. DevTools open/close)
    // Uses saved (preferred) geometry so panel restores when viewport grows back.
    useEffect(() => {
        const onResize = () => {
            if (interactionRef.current) return; // skip during active drag/resize
            const preferred = readSaved();
            if (preferred) setGeo(clampGeometry(preferred));
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // --- Cleanup helpers ---
    const cleanupRef = useRef<() => void>(() => { });
    const stableCleanup = useCallback(() => cleanupRef.current(), []);

    // --- Move handler (rAF-throttled) ---
    const handleMove = useCallback((e: MouseEvent) => {
        if (!interactionRef.current) return;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            const dx = e.clientX - startMouseRef.current.x;
            const dy = e.clientY - startMouseRef.current.y;
            const mode = interactionRef.current!;
            const s = startGeoRef.current;

            if (mode === 'drag') {
                // Clamp drag offset so panel stays within viewport bounds
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const minLeft = MIN_MARGIN;
                const maxLeft = vw - s.w - MIN_MARGIN;
                const minTop = HEADER_H + MIN_MARGIN;
                const maxTop = vh - s.h - MIN_MARGIN;
                const clampedX = Math.max(minLeft - s.left, Math.min(maxLeft - s.left, dx));
                const clampedY = Math.max(minTop - s.top, Math.min(maxTop - s.top, dy));
                dragOffsetRef.current = { x: clampedX, y: clampedY };
                setDragTransform({ x: clampedX, y: clampedY });
                return;
            }

            // --- Resize logic ---
            // Use edge-specific bounds so we never shift the opposite side.
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let newTop = s.top;
            let newLeft = s.left;
            let newW = s.w;
            let newH = s.h;

            // Vertical
            if (mode.includes('top')) {
                // Top edge moves up: min top = HEADER_H + MIN_MARGIN
                const maxGrow = s.top - (HEADER_H + MIN_MARGIN);
                const growth = Math.min(maxGrow, -dy); // -dy because dragging up = negative dy
                newH = Math.max(MIN_H, s.h + growth);
                newTop = s.top - (newH - s.h);
            } else if (mode.includes('bottom')) {
                // Bottom edge moves down: max bottom = vh - MIN_MARGIN
                const maxH = vh - MIN_MARGIN - s.top;
                newH = Math.max(MIN_H, Math.min(maxH, s.h + dy));
            }

            // Horizontal
            if (mode.includes('left')) {
                // Left edge moves left: min left = MIN_MARGIN
                const maxGrow = s.left - MIN_MARGIN;
                const growth = Math.min(maxGrow, -dx);
                newW = Math.max(MIN_W, Math.min(MAX_W, s.w + growth));
                newLeft = s.left - (newW - s.w);
            } else if (mode.includes('right')) {
                // Right edge moves right: max right = vw - MIN_MARGIN
                const maxW = vw - MIN_MARGIN - s.left;
                newW = Math.max(MIN_W, Math.min(MAX_W, Math.min(maxW, s.w + dx)));
            }

            setGeo({ top: newTop, left: newLeft, w: newW, h: newH });
        });
    }, []);

    // --- End handler ---
    useEffect(() => {
        cleanupRef.current = () => {
            cancelAnimationFrame(rafRef.current);
            const mode = interactionRef.current;
            interactionRef.current = null;
            setIsInteracting(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', stableCleanup);

            if (mode === 'drag') {
                // Commit transform to top/left
                const offset = dragOffsetRef.current;
                const s = startGeoRef.current;
                const committed = clampGeometry({
                    top: s.top + offset.y,
                    left: s.left + offset.x,
                    w: s.w,
                    h: s.h
                });
                setGeo(committed);
                setDragTransform(null);
                persistGeometry(committed);
            } else {
                persistGeometry(geoRef.current);
            }
        };
    }, [handleMove, stableCleanup]);

    // --- Drag start ---
    const handleDragStart = useCallback((e: React.MouseEvent) => {
        // Only trigger on primary button, not on interactive children
        if (e.button !== 0) return;
        e.preventDefault();
        interactionRef.current = 'drag';
        setIsInteracting(true);
        startMouseRef.current = { x: e.clientX, y: e.clientY };
        startGeoRef.current = { ...geoRef.current };
        dragOffsetRef.current = { x: 0, y: 0 };
        document.body.style.cursor = 'move';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', stableCleanup);
    }, [handleMove, stableCleanup]);

    // --- Resize start ---
    const handleResizeStart = useCallback((edge: ResizeEdge) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        interactionRef.current = edge;
        setIsInteracting(true);
        startMouseRef.current = { x: e.clientX, y: e.clientY };
        startGeoRef.current = { ...geoRef.current };

        const cursorMap: Record<ResizeEdge, string> = {
            'top': 'ns-resize', 'bottom': 'ns-resize',
            'left': 'ew-resize', 'right': 'ew-resize',
            'top-left': 'nwse-resize', 'bottom-right': 'nwse-resize',
            'top-right': 'nesw-resize', 'bottom-left': 'nesw-resize',
        };
        document.body.style.cursor = cursorMap[edge];
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', stableCleanup);
    }, [handleMove, stableCleanup]);

    // --- Safety cleanup on unmount ---
    useEffect(() => {
        return () => {
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', stableCleanup);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [handleMove, stableCleanup]);

    // --- Determine which resize edges are available (enough gap from viewport edge) ---
    // Exposed via panelRect so the consumer can conditionally render handles
    const panelRect = {
        top: geo.top,
        left: geo.left,
        width: geo.w,
        height: geo.h,
        // Availability flags for resize edges
        // Top: allow resize if panel can shrink (h > MIN_H) OR can grow upward (gap from top)
        canResizeTop: geo.h > MIN_H || geo.top > HEADER_H + EDGE_MIN_GAP,
        canResizeBottom: geo.top + geo.h < window.innerHeight - EDGE_MIN_GAP,
        canResizeLeft: geo.left > EDGE_MIN_GAP,
        canResizeRight: geo.left + geo.w < window.innerWidth - EDGE_MIN_GAP,
    };

    return {
        panelRect,
        isInteracting,
        dragTransform,
        handleDragStart,
        handleResizeStart,
    };
}
