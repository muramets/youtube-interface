// =============================================================================
// useCanvasPanZoom — rAF-lerped pan/zoom interaction for the canvas board
// =============================================================================

import { useRef, useEffect, useCallback, useState } from 'react';
import type { CanvasViewport } from '../../../core/types/canvas';
import { liveZoom } from '../liveZoom';

// --- Constants ---
const SMOOTH_FACTOR = 0.15;
const ZOOM_SENSITIVITY = 0.03;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

interface UseCanvasPanZoomOptions {
    viewport: CanvasViewport;
    onViewportChange: (vp: CanvasViewport) => void;
    onZoomFrame?: (zoom: number) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export interface PanZoomControls {
    transform: { x: number; y: number; zoom: number };
    isPanning: boolean;
    /** Start a pan drag from mousedown on the board */
    handlePanStart: (clientX: number, clientY: number) => void;
    /** Continue a pan during mousemove */
    handlePanMove: (clientX: number, clientY: number) => boolean;
    /** End pan on mouseup */
    handlePanEnd: () => void;
    /** Apply an animated target (used by zoomTo, fitToContent) */
    applyTarget: (target: { x: number; y: number; zoom: number }) => void;
    /** Get current refs for imperative handle */
    transformRef: React.RefObject<{ x: number; y: number; zoom: number }>;
    targetRef: React.RefObject<{ x: number; y: number; zoom: number }>;
}

export function useCanvasPanZoom({
    viewport,
    onViewportChange,
    onZoomFrame,
    containerRef,
}: UseCanvasPanZoomOptions): PanZoomControls {
    const transformRef = useRef({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    const targetRef = useRef({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    const [transform, setTransform] = useState({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    const rafRef = useRef<number | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const mouseDownPosRef = useRef({ x: 0, y: 0 });
    const hasMoveRef = useRef(false);

    // --- rAF helpers ---
    const syncToDom = useCallback(() => {
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
            // Trigger one rAF tick to flush refs → React state (outside effect)
            if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(() => {
                    syncToDom();
                    rafRef.current = null;
                });
            }
        }
    }, [viewport, syncToDom]);

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
            syncToDom();
            liveZoom.current = tgt.zoom;
            onViewportChange({ x: tgt.x, y: tgt.y, zoom: tgt.zoom });
            onZoomFrame?.(tgt.zoom);
            rafRef.current = null;
        } else {
            transformRef.current = { x: nx, y: ny, zoom: nz };
            syncToDom();
            liveZoom.current = nz;
            onZoomFrame?.(nz);
            rafRef.current = requestAnimationFrame(updateAnimRef.current);
        }
    }, [syncToDom, onViewportChange, onZoomFrame]);

    useEffect(() => {
        updateAnimRef.current = updateAnim;
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [updateAnim]);

    const startAnim = useCallback(() => {
        if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(updateAnimRef.current);
        }
    }, []);

    const applyTarget = useCallback((newTarget: { x: number; y: number; zoom: number }) => {
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
        syncToDom();
        return true;
    }, [syncToDom]);

    const handlePanEnd = useCallback(() => {
        if (hasMoveRef.current) {
            onViewportChange({
                x: transformRef.current.x,
                y: transformRef.current.y,
                zoom: transformRef.current.zoom,
            });
        }
        setIsPanning(false);
        hasMoveRef.current = false;
    }, [onViewportChange]);

    return {
        transform,
        isPanning,
        handlePanStart,
        handlePanMove,
        handlePanEnd,
        applyTarget,
        transformRef,
        targetRef,
    };
}
