import { useState, useCallback, useRef, useEffect } from 'react';

// =============================================================================
// Mini Player Geometry Hook — Drag, Resize, Persist
// Same UX patterns as Chat panel: rAF-throttled, transform-based drag, edge
// resize with dynamic availability, localStorage persistence.
// Key difference: maintains 16:9 aspect ratio during resize.
// =============================================================================

export type ResizeEdge = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface PlayerGeometry {
    top: number;
    left: number;
    w: number;          // width drives everything
}

export interface PlayerGeometryResult {
    /** Current rect (top/left/width/height + resize edge availability) */
    rect: {
        top: number; left: number; width: number; height: number;
        canResizeTop: boolean; canResizeBottom: boolean;
        canResizeLeft: boolean; canResizeRight: boolean;
    };
    /** True during drag or resize (disables pointer events on iframe) */
    isInteracting: boolean;
    /** GPU-accelerated transform offset applied during drag only */
    dragTransform: { x: number; y: number } | null;
    /** Attach to header's onMouseDown */
    handleDragStart: (e: React.MouseEvent) => void;
    /** Factory for edge resize onMouseDown handlers */
    handleResizeStart: (edge: ResizeEdge) => (e: React.MouseEvent) => void;
}

// --- Constants ---

const STORAGE_KEY = 'mini-player-geometry';
const ASPECT_RATIO = 9 / 16;
const HEADER_H = 32;       // fixed header height (px)
const MIN_W = 240;
const MAX_W = 720;
const MIN_MARGIN = 16;      // minimum gap from viewport edges
const APP_HEADER_H = 56;    // app-level top header
const EDGE_MIN_GAP = 24;    // gap threshold to enable resize on a given side
const DEFAULT_W = 320;

// --- Derived height from width ---

function heightFromWidth(w: number): number {
    return Math.round(w * ASPECT_RATIO) + HEADER_H;
}

// --- Persistence ---

function readSaved(): PlayerGeometry | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const g = JSON.parse(raw);
            if (typeof g.top === 'number' && typeof g.left === 'number' && typeof g.w === 'number') {
                return g as PlayerGeometry;
            }
        }
    } catch { /* ignore */ }
    return null;
}

function persistGeometry(g: PlayerGeometry) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(g)); } catch { /* ignore */ }
}

// --- Clamping ---

function clampGeometry(g: PlayerGeometry): PlayerGeometry {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.max(MIN_W, Math.min(MAX_W, g.w));
    const h = heightFromWidth(w);
    const left = Math.max(MIN_MARGIN, Math.min(vw - w - MIN_MARGIN, g.left));
    const top = Math.max(APP_HEADER_H + MIN_MARGIN, Math.min(vh - h - MIN_MARGIN, g.top));
    return { top, left, w };
}

// --- Default position (bottom-right corner) ---

function defaultGeometry(): PlayerGeometry {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = DEFAULT_W;
    const h = heightFromWidth(w);
    return clampGeometry({
        top: vh - h - MIN_MARGIN,
        left: vw - w - MIN_MARGIN,
        w,
    });
}

// =============================================================================
// Hook
// =============================================================================

export function useMiniPlayerGeometry(): PlayerGeometryResult {
    // --- State ---
    const [geo, setGeo] = useState<PlayerGeometry>(() => {
        const saved = readSaved();
        return saved ? clampGeometry(saved) : defaultGeometry();
    });

    const [isInteracting, setIsInteracting] = useState(false);
    const [dragTransform, setDragTransform] = useState<{ x: number; y: number } | null>(null);

    // --- Refs for rAF-throttled interaction ---
    const geoRef = useRef(geo);
    const interactionRef = useRef<'drag' | ResizeEdge | null>(null);
    const startMouseRef = useRef({ x: 0, y: 0 });
    const startGeoRef = useRef<PlayerGeometry>(geo);
    const rafRef = useRef(0);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    // Keep ref in sync
    useEffect(() => { geoRef.current = geo; }, [geo]);

    // --- Re-clamp on viewport resize ---
    useEffect(() => {
        const onResize = () => {
            if (interactionRef.current) return;
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
            const sH = heightFromWidth(s.w);

            if (mode === 'drag') {
                // Clamp drag offset to viewport bounds
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const minLeft = MIN_MARGIN;
                const maxLeft = vw - s.w - MIN_MARGIN;
                const minTop = APP_HEADER_H + MIN_MARGIN;
                const maxTop = vh - sH - MIN_MARGIN;
                const clampedX = Math.max(minLeft - s.left, Math.min(maxLeft - s.left, dx));
                const clampedY = Math.max(minTop - s.top, Math.min(maxTop - s.top, dy));
                dragOffsetRef.current = { x: clampedX, y: clampedY };
                setDragTransform({ x: clampedX, y: clampedY });
                return;
            }

            // --- Resize logic (aspect-ratio locked) ---
            // Determine new width from the drag delta, then derive everything.
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let newW = s.w;
            let newTop = s.top;
            let newLeft = s.left;

            // Horizontal resizing
            if (mode.includes('left')) {
                // Dragging left edge leftward → width increases
                const maxGrow = s.left - MIN_MARGIN;
                const growth = Math.min(maxGrow, -dx);
                newW = Math.max(MIN_W, Math.min(MAX_W, s.w + growth));
                newLeft = s.left - (newW - s.w);
            } else if (mode.includes('right')) {
                const maxW = vw - MIN_MARGIN - s.left;
                newW = Math.max(MIN_W, Math.min(MAX_W, Math.min(maxW, s.w + dx)));
            }

            // Vertical resizing → derive width from height delta
            if (mode === 'top' || mode === 'bottom') {
                if (mode === 'top') {
                    const maxGrow = s.top - (APP_HEADER_H + MIN_MARGIN);
                    const growth = Math.min(maxGrow, -dy);
                    const newH = Math.max(heightFromWidth(MIN_W), sH + growth);
                    newW = Math.max(MIN_W, Math.min(MAX_W, Math.round((newH - HEADER_H) / ASPECT_RATIO)));
                    newTop = s.top - (heightFromWidth(newW) - sH);
                } else {
                    const maxH = vh - MIN_MARGIN - s.top;
                    const newH = Math.max(heightFromWidth(MIN_W), Math.min(maxH, sH + dy));
                    newW = Math.max(MIN_W, Math.min(MAX_W, Math.round((newH - HEADER_H) / ASPECT_RATIO)));
                }
            }

            // Corner resize: width already set above; now ensure aspect-locked height fits
            const newH = heightFromWidth(newW);

            // Ensure the panel still fits vertically after aspect-ratio-driven height change
            if (mode.includes('top')) {
                // Grows upward: ensure top >= APP_HEADER_H + MIN_MARGIN
                const minPossibleTop = APP_HEADER_H + MIN_MARGIN;
                if (newTop < minPossibleTop) {
                    newTop = minPossibleTop;
                    const availH = sH + (s.top - minPossibleTop);
                    newW = Math.max(MIN_W, Math.round((availH - HEADER_H) / ASPECT_RATIO));
                    // Recalc left for left-edge resize
                    if (mode.includes('left')) {
                        newLeft = s.left - (newW - s.w);
                    }
                }
            } else {
                // Grows downward: ensure bottom <= vh - MIN_MARGIN
                if (newTop + newH > vh - MIN_MARGIN) {
                    const availH = vh - MIN_MARGIN - newTop;
                    newW = Math.max(MIN_W, Math.round((availH - HEADER_H) / ASPECT_RATIO));
                }
            }

            setGeo({ top: newTop, left: newLeft, w: newW });
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
                const offset = dragOffsetRef.current;
                const s = startGeoRef.current;
                const committed = clampGeometry({
                    top: s.top + offset.y,
                    left: s.left + offset.x,
                    w: s.w,
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
        if (e.button !== 0) return;
        // Don't initiate drag on interactive elements (buttons, etc.)
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        interactionRef.current = 'drag';
        setIsInteracting(true);
        startMouseRef.current = { x: e.clientX, y: e.clientY };
        startGeoRef.current = { ...geoRef.current };
        dragOffsetRef.current = { x: 0, y: 0 };
        document.body.style.cursor = 'grabbing';
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

    // --- Compute derived values ---
    const h = heightFromWidth(geo.w);
    const rect = {
        top: geo.top,
        left: geo.left,
        width: geo.w,
        height: h,
        canResizeTop: geo.top > APP_HEADER_H + EDGE_MIN_GAP,
        canResizeBottom: geo.top + h < window.innerHeight - EDGE_MIN_GAP,
        canResizeLeft: geo.left > EDGE_MIN_GAP,
        canResizeRight: geo.left + geo.w < window.innerWidth - EDGE_MIN_GAP,
    };

    return {
        rect,
        isInteracting,
        dragTransform,
        handleDragStart,
        handleResizeStart,
    };
}
