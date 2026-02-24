// =============================================================================
// useCanvasPanZoom — rAF-lerped pan/zoom interaction for the canvas board
// =============================================================================

import { useRef, useEffect, useCallback, useState } from 'react';
import type { CanvasViewport } from '../../../core/types/canvas';
import { liveZoom } from '../utils/liveZoom';
import { debug, DEBUG_ENABLED } from '../../../core/utils/debug';

// --- Constants ---
const SMOOTH_FACTOR = 0.15;
const ZOOM_SENSITIVITY = 0.03;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

interface UseCanvasPanZoomOptions {
    viewport: CanvasViewport;
    onViewportChange: (vp: CanvasViewport) => void;
    onZoomFrame?: (zoom: number) => void;
    /** Throttled callback during pan/zoom — used for mid-animation culling updates */
    onPanFrame?: (vp: CanvasViewport) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    /** Ref to the transform layer div — used for direct DOM writes during animation */
    transformLayerRef: React.RefObject<HTMLDivElement | null>;
}

export interface PanZoomControls {
    transform: { x: number; y: number; zoom: number };
    isPanning: boolean;
    /** True while lerp animation is running (pan or zoom) */
    isAnimating: boolean;
    /** Start a pan drag from mousedown on the board */
    handlePanStart: (clientX: number, clientY: number) => void;
    /** Continue a pan during mousemove */
    handlePanMove: (clientX: number, clientY: number) => boolean;
    /** End pan on mouseup */
    handlePanEnd: () => void;
    /** Apply an animated target (used by zoomTo, fitToContent, centerOnPos) */
    applyTarget: (target: { x: number; y: number; zoom: number }, onComplete?: () => void) => void;
    /** Get current refs for imperative handle */
    transformRef: React.RefObject<{ x: number; y: number; zoom: number }>;
    targetRef: React.RefObject<{ x: number; y: number; zoom: number }>;
    /** Immediately shift the viewport by screen-space delta (no animation, no React render) */
    panBy: (dx: number, dy: number) => void;
}

export function useCanvasPanZoom({
    viewport,
    onViewportChange,
    onZoomFrame,
    onPanFrame,
    containerRef,
    transformLayerRef,
}: UseCanvasPanZoomOptions): PanZoomControls {
    const transformRef = useRef({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    const targetRef = useRef({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    const [transform, setTransform] = useState({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    const rafRef = useRef<number | null>(null);
    /** Fired once when the current applyTarget animation finishes */
    const onAnimCompleteRef = useRef<(() => void) | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const mouseDownPosRef = useRef({ x: 0, y: 0 });
    const hasMoveRef = useRef(false);

    // Throttle state for onPanFrame (150ms)
    const lastPanFrameRef = useRef(0);
    const PAN_FRAME_THROTTLE = 150;

    // Stable refs for callbacks — prevents updateAnim from depending on
    // potentially unstable callback props (which would cause infinite rAF loop)
    const onViewportChangeRef = useRef(onViewportChange);
    const onZoomFrameRef = useRef(onZoomFrame);
    const onPanFrameRef = useRef(onPanFrame);
    useEffect(() => {
        onViewportChangeRef.current = onViewportChange;
        onZoomFrameRef.current = onZoomFrame;
        onPanFrameRef.current = onPanFrame;
    });

    // --- Direct DOM write (bypasses React during animation) ---
    const GRID_SIZE_BASE = 24;
    const rafFpsRef = useRef({ count: 0, lastLog: 0 });
    const flushToDom = useCallback(() => {
        const t = transformRef.current;
        // rAF FPS tracking — gated behind debug flag for zero overhead
        if (DEBUG_ENABLED.canvas) {
            const now = performance.now();
            const fps = rafFpsRef.current;
            if (fps.lastLog === 0) fps.lastLog = now;
            fps.count++;
            if (now - fps.lastLog >= 1000) {
                const rate = Math.round(fps.count / ((now - fps.lastLog) / 1000));
                debug.canvas(`🎞 rAF FPS: ${rate} (zoom=${t.zoom.toFixed(2)})`);
                fps.count = 0;
                fps.lastLog = now;
            }
        }
        // 1. Transform layer
        const layer = transformLayerRef.current;
        if (layer) {
            layer.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.zoom})`;
        }
        // 2. Grid background on container
        const container = containerRef.current;
        if (container) {
            const gridSize = GRID_SIZE_BASE * t.zoom;
            const dotR = Math.max(0.6, t.zoom);
            const gridOpacity = t.zoom < 0.15 ? 0.35
                : t.zoom < 0.4 ? 0.35 + (t.zoom - 0.15) / 0.25 * 0.65 : 1;
            container.style.backgroundSize = `${gridSize}px ${gridSize}px`;
            container.style.backgroundPosition = `${t.x % gridSize}px ${t.y % gridSize}px`;
            container.style.backgroundImage = gridOpacity > 0
                ? `radial-gradient(circle, rgba(var(--border-rgb), ${gridOpacity}) ${dotR}px, transparent ${dotR}px)`
                : 'none';
            container.style.setProperty('--canvas-zoom', String(t.zoom));
        }
    }, [containerRef, transformLayerRef]);

    // --- React state sync (only called when animation ends) ---
    const syncToReact = useCallback(() => {
        setTransform({ ...transformRef.current });
    }, []);

    // Sync from external viewport (channel change)
    const lastChannelSyncRef = useRef({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    useEffect(() => {
        const prev = lastChannelSyncRef.current;
        const changed = prev.x !== viewport.x || prev.y !== viewport.y || prev.zoom !== viewport.zoom;
        if (changed) {
            lastChannelSyncRef.current = viewport;
            transformRef.current = { ...viewport };
            targetRef.current = { ...viewport };
            liveZoom.current = viewport.zoom;
            // Flush directly to DOM + sync React state
            if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(() => {
                    flushToDom();
                    syncToReact();
                    rafRef.current = null;
                });
            }
        }
    }, [viewport, flushToDom, syncToReact]);

    const updateAnimRef = useRef<() => void>(null!);
    const updateAnim = useCallback(() => {
        const cur = transformRef.current;
        const tgt = targetRef.current;
        const lerp = (a: number, b: number) => a + (b - a) * SMOOTH_FACTOR;

        const nx = lerp(cur.x, tgt.x);
        const ny = lerp(cur.y, tgt.y);
        const nz = lerp(cur.zoom, tgt.zoom);

        const finished =
            Math.abs(nx - tgt.x) < 0.1 &&
            Math.abs(ny - tgt.y) < 0.1 &&
            Math.abs(nz - tgt.zoom) < 0.0001;

        if (finished) {
            transformRef.current = { ...tgt };
            flushToDom();
            syncToReact(); // Sync React state only on finish
            setIsAnimating(false);
            onAnimCompleteRef.current?.();
            onAnimCompleteRef.current = null;
            liveZoom.current = tgt.zoom;
            onViewportChangeRef.current({ x: tgt.x, y: tgt.y, zoom: tgt.zoom });
            onZoomFrameRef.current?.(tgt.zoom);
            rafRef.current = null;
        } else {
            transformRef.current = { x: nx, y: ny, zoom: nz };
            flushToDom(); // Direct DOM write — no React
            liveZoom.current = nz;
            onZoomFrameRef.current?.(nz);
            // Throttled culling update during zoom animation
            const now = performance.now();
            if (onPanFrameRef.current && now - lastPanFrameRef.current > PAN_FRAME_THROTTLE) {
                lastPanFrameRef.current = now;
                onPanFrameRef.current({ x: nx, y: ny, zoom: nz });
            }
            rafRef.current = requestAnimationFrame(updateAnimRef.current);
        }
    }, [flushToDom, syncToReact]);

    useEffect(() => {
        updateAnimRef.current = updateAnim;
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [updateAnim]);

    const startAnim = useCallback(() => {
        setIsAnimating(true);
        if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(updateAnimRef.current);
        }
    }, []);

    const applyTarget = useCallback((newTarget: { x: number; y: number; zoom: number }, onComplete?: () => void) => {
        onAnimCompleteRef.current = onComplete ?? null;
        targetRef.current = newTarget;
        startAnim();
    }, [startAnim]);

    // --- Wheel handler ---
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        if (!rafRef.current) {
            targetRef.current = { ...transformRef.current };
        }

        if (e.ctrlKey || e.metaKey) {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const delta = Math.max(-100, Math.min(100, e.deltaY));
            const factor = Math.exp(-delta * ZOOM_SENSITIVITY);
            const curZoom = targetRef.current.zoom;
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, curZoom * factor));
            const zoomRatio = newZoom / curZoom;

            const newX = mouseX - (mouseX - targetRef.current.x) * zoomRatio;
            const newY = mouseY - (mouseY - targetRef.current.y) * zoomRatio;

            applyTarget({ x: newX, y: newY, zoom: newZoom });
        } else {
            applyTarget({
                ...targetRef.current,
                x: targetRef.current.x - e.deltaX,
                y: targetRef.current.y - e.deltaY,
            });
        }
    }, [applyTarget, containerRef]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.addEventListener('wheel', handleWheel, { passive: false });
        const prevent = (e: Event) => e.preventDefault();
        document.addEventListener('gesturestart', prevent);
        document.addEventListener('gesturechange', prevent);
        return () => {
            el.removeEventListener('wheel', handleWheel);
            document.removeEventListener('gesturestart', prevent);
            document.removeEventListener('gesturechange', prevent);
        };
    }, [handleWheel, containerRef]);

    // --- Pan handlers (called from CanvasBoard mouse events) ---
    const handlePanStart = useCallback((clientX: number, clientY: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            transformRef.current = { ...targetRef.current };
        }
        mouseDownPosRef.current = { x: clientX, y: clientY };
        panStartRef.current = {
            x: clientX - transformRef.current.x,
            y: clientY - transformRef.current.y,
        };
        hasMoveRef.current = false;
    }, []);

    const handlePanMove = useCallback((clientX: number, clientY: number): boolean => {
        const dx = Math.abs(clientX - mouseDownPosRef.current.x);
        const dy = Math.abs(clientY - mouseDownPosRef.current.y);

        if (!hasMoveRef.current && dx < 5 && dy < 5) return false;

        hasMoveRef.current = true;
        setIsPanning(true);

        const newX = clientX - panStartRef.current.x;
        const newY = clientY - panStartRef.current.y;
        transformRef.current = { ...transformRef.current, x: newX, y: newY };
        targetRef.current = { ...transformRef.current };
        flushToDom(); // Direct DOM write — no React

        // Throttled culling update during pan
        const now = performance.now();
        if (onPanFrameRef.current && now - lastPanFrameRef.current > PAN_FRAME_THROTTLE) {
            lastPanFrameRef.current = now;
            onPanFrameRef.current({ x: newX, y: newY, zoom: transformRef.current.zoom });
        }
        return true;
    }, [flushToDom]);

    const handlePanEnd = useCallback(() => {
        if (hasMoveRef.current) {
            syncToReact(); // Sync React state when pan ends
            onViewportChangeRef.current({
                x: transformRef.current.x,
                y: transformRef.current.y,
                zoom: transformRef.current.zoom,
            });
        }
        setIsPanning(false);
        hasMoveRef.current = false;
    }, [syncToReact]);

    const panBy = useCallback((dx: number, dy: number) => {
        const cur = transformRef.current;
        const shifted = { x: cur.x + dx, y: cur.y + dy, zoom: cur.zoom };
        transformRef.current = shifted;
        targetRef.current = shifted;
        flushToDom();
    }, [flushToDom]);

    return {
        transform,
        isPanning,
        isAnimating,
        handlePanStart,
        handlePanMove,
        handlePanEnd,
        applyTarget,
        transformRef,
        targetRef,
        panBy,
    };
}
