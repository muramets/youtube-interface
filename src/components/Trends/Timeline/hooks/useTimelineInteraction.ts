import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineVideoLayerHandle } from '../layers/TimelineVideoLayer';

interface Transform {
    scale: number;
    offsetX: number;
    offsetY: number;
}

interface UseTimelineInteractionProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    videoLayerRef: React.RefObject<TimelineVideoLayerHandle | null>;
    transformRef: React.MutableRefObject<Transform>;
    minScale: number;
    containerSizeRef: React.MutableRefObject<{ width: number; height: number }>;
    setTransformState: (t: Transform) => void;
    clampTransform: (t: Transform, w: number, h: number) => Transform;
    onHoverVideo?: (hovered: boolean) => void;
}

// Performance logging flag
const PERF_LOGGING = true;

export const useTimelineInteraction = ({
    containerRef,
    videoLayerRef,
    transformRef,
    minScale,
    containerSizeRef,
    setTransformState,
    clampTransform,
    onHoverVideo
}: UseTimelineInteractionProps) => {

    const [isPanning, setIsPanning] = useState(false);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    // Performance refs
    const perfFrameCountRef = useRef(0);
    const perfLastTimeRef = useRef(performance.now());
    const perfActiveRef = useRef(false);
    const perfTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const syncToDom = useCallback(() => {
        // Imperative DOM update for video layer (bypasses React reconciliation)
        if (videoLayerRef.current) {
            videoLayerRef.current.updateTransform(transformRef.current);
        }

        // React state update (might be throttled by parent if needed, but here direct)
        setTransformState({ ...transformRef.current });

        // Performance logging
        if (PERF_LOGGING) {
            perfFrameCountRef.current++;
            if (!perfActiveRef.current) {
                perfActiveRef.current = true;
                perfLastTimeRef.current = performance.now();
                perfFrameCountRef.current = 1;
            }
            if (perfTimeoutRef.current) clearTimeout(perfTimeoutRef.current);

            const now = performance.now();
            const elapsed = now - perfLastTimeRef.current;
            if (elapsed >= 1000) {
                const fps = Math.round(perfFrameCountRef.current * 1000 / elapsed);
                console.log(`📊 FPS: ${fps} (${perfFrameCountRef.current} frames in ${elapsed.toFixed(0)}ms)`);
                perfFrameCountRef.current = 0;
                perfLastTimeRef.current = now;
            }

            perfTimeoutRef.current = setTimeout(() => {
                perfActiveRef.current = false;
                perfFrameCountRef.current = 0;
            }, 500);
        }
    }, [videoLayerRef, transformRef, setTransformState]);

    // Wheel Handler
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();

        const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
        if (viewportWidth === 0) return;

        if (e.ctrlKey || e.metaKey) {
            // Zooming
            if (onHoverVideo) onHoverVideo(false); // Hide tooltip

            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const ZOOM_SENSITIVITY = 0.01;
            const delta = Math.max(-100, Math.min(100, e.deltaY));

            const currentScale = transformRef.current.scale;
            const scaleFactor = Math.exp(-delta * ZOOM_SENSITIVITY);

            const newScale = Math.max(minScale, Math.min(10, currentScale * scaleFactor));
            const scaleRatio = newScale / currentScale;

            const newOffsetX = mouseX - (mouseX - transformRef.current.offsetX) * scaleRatio;
            const newOffsetY = mouseY - (mouseY - transformRef.current.offsetY) * scaleRatio;

            const clamped = clampTransform({
                scale: newScale,
                offsetX: newOffsetX,
                offsetY: newOffsetY
            }, viewportWidth, viewportHeight);

            transformRef.current = clamped;
            syncToDom();
        } else {
            // Panning
            const clamped = clampTransform({
                ...transformRef.current,
                offsetX: transformRef.current.offsetX - e.deltaX,
                offsetY: transformRef.current.offsetY - e.deltaY
            }, viewportWidth, viewportHeight);

            transformRef.current = clamped;
            syncToDom();
        }
    }, [containerSizeRef, containerRef, transformRef, minScale, clampTransform, syncToDom, onHoverVideo]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Only left click and if not clicking a video (handled by bubble propagation stop usually, but check here if needed)
        // If hoveredVideo is present, we might still want to pan if clicking background?
        // Logic from original: "if (!hoveredVideo)"

        if (e.button === 0) {
            setIsPanning(true);
            isPanningRef.current = true;
            panStartRef.current = {
                x: e.clientX - transformRef.current.offsetX,
                y: e.clientY - transformRef.current.offsetY
            };
        }
    }, [transformRef]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanningRef.current) {
            if (onHoverVideo) onHoverVideo(false);

            const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
            if (viewportWidth === 0) return;

            const clamped = clampTransform({
                ...transformRef.current,
                offsetX: e.clientX - panStartRef.current.x,
                offsetY: e.clientY - panStartRef.current.y
            }, viewportWidth, viewportHeight);

            transformRef.current = clamped;
            syncToDom();
        }
    }, [containerSizeRef, transformRef, clampTransform, syncToDom, onHoverVideo]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        isPanningRef.current = false;
    }, []);

    // Events attachment
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const gestureHandler = (e: Event) => e.preventDefault();
        container.addEventListener('wheel', handleWheel, { passive: false });

        // Disable native gestures to prevent page zoom
        document.addEventListener('gesturestart', gestureHandler);
        document.addEventListener('gesturechange', gestureHandler);
        document.addEventListener('gestureend', gestureHandler);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            document.removeEventListener('gesturestart', gestureHandler);
            document.removeEventListener('gesturechange', gestureHandler);
            document.removeEventListener('gestureend', gestureHandler);
        };
    }, [handleWheel, containerRef]);

    return {
        isPanning,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        syncToDom  // Expose sync for other imperative needs
    };
};
