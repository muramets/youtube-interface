import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineVideoLayerHandle } from '../layers/TimelineVideoLayer';

import { calculateSelectionZoomTransform } from '../utils/timelineMath';

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
    onInteractionStart?: () => void; // Called when zoom/pan/selection starts
}




export const useTimelineInteraction = ({
    containerRef,
    videoLayerRef,
    transformRef,
    minScale,
    containerSizeRef,
    setTransformState,
    clampTransform,
    onHoverVideo,
    onInteractionStart
}: UseTimelineInteractionProps) => {

    const [isPanning, setIsPanning] = useState(false);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    // Selection State
    const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const isSelectingRef = useRef(false);
    const selectionStartRef = useRef({ x: 0, y: 0 });

    // Interpolation State
    const targetTransformRef = useRef({ ...transformRef.current });
    const rafRef = useRef<number | null>(null);

    // Sync target to current on mount or external reset (optional but good safety)
    useEffect(() => {
        targetTransformRef.current = { ...transformRef.current };
    }, []); // Run once, we trust internal updates mainly. 
    // Note: If parent force-resets transform (e.g. 'Z' fit), we might need to listen to that. 
    // But usually 'Z' sets transformRef directly. We should probably sync target to it in the next loop or on event.
    // For now, let's ensure we sync target on interaction start.

    const syncToDom = useCallback(() => {
        // Imperative DOM update for video layer (bypasses React reconciliation)
        if (videoLayerRef.current) {
            videoLayerRef.current.updateTransform(transformRef.current);
        }
        // React state update (might be throttled by parent if needed, but here direct)
        setTransformState({ ...transformRef.current });
    }, [videoLayerRef, transformRef, setTransformState]);

    // Lerp helper
    const lerp = (start: number, end: number, t: number) => {
        return start * (1 - t) + end * t;
    };

    const updateAnimation = useCallback(() => {
        const current = transformRef.current;
        const target = targetTransformRef.current;

        // Smooth factor (adjustable)
        const smoothness = 0.15;

        // Calculate new values
        const newScale = lerp(current.scale, target.scale, smoothness);
        const newOffsetX = lerp(current.offsetX, target.offsetX, smoothness);
        const newOffsetY = lerp(current.offsetY, target.offsetY, smoothness);

        // Check for completion (epsilon)
        const isFinished =
            Math.abs(newScale - target.scale) < 0.0001 &&
            Math.abs(newOffsetX - target.offsetX) < 0.1 &&
            Math.abs(newOffsetY - target.offsetY) < 0.1;

        if (isFinished) {
            transformRef.current = { ...target };
            syncToDom();
            rafRef.current = null; // Stop loop
        } else {
            transformRef.current = {
                scale: newScale,
                offsetX: newOffsetX,
                offsetY: newOffsetY
            };
            syncToDom();
            rafRef.current = requestAnimationFrame(updateAnimation);
        }
    }, [transformRef, syncToDom]);

    const startAnimation = useCallback(() => {
        if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(updateAnimation);
        }
    }, [updateAnimation]);

    const stopAnimation = useCallback(() => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    // Wheel Handler
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();

        const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
        if (viewportWidth === 0) return;

        // Ensure target is synced if we were idle (handles 'Z' reset case implicitly)
        if (!rafRef.current) {
            targetTransformRef.current = { ...transformRef.current };
        }

        if (e.ctrlKey || e.metaKey) {
            // Zooming
            if (onHoverVideo) onHoverVideo(false);
            if (onInteractionStart) onInteractionStart();

            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const ZOOM_SENSITIVITY = 0.03; // 3x sensitivity
            const delta = Math.max(-100, Math.min(100, e.deltaY));

            const currentTargetScale = targetTransformRef.current.scale; // Use TARGET for accumulation
            const scaleFactor = Math.exp(-delta * ZOOM_SENSITIVITY);

            const newScale = Math.max(minScale, Math.min(10, currentTargetScale * scaleFactor));
            const scaleRatio = newScale / currentTargetScale;

            // Calculate standard relative zoom offsets (Mouse-Centered)
            let targetOffsetX = mouseX - (mouseX - targetTransformRef.current.offsetX) * scaleRatio;
            let targetOffsetY = mouseY - (mouseY - targetTransformRef.current.offsetY) * scaleRatio;

            const clamped = clampTransform({
                scale: newScale,
                offsetX: targetOffsetX,
                offsetY: targetOffsetY
            }, viewportWidth, viewportHeight);

            // Update Target & Animate
            targetTransformRef.current = clamped;
            startAnimation();
        } else {
            // Panning
            const clamped = clampTransform({
                ...targetTransformRef.current,
                offsetX: targetTransformRef.current.offsetX - e.deltaX,
                offsetY: targetTransformRef.current.offsetY - e.deltaY
            }, viewportWidth, viewportHeight);

            // Update Target & Animate (Consolidated smooth feeling)
            targetTransformRef.current = clamped;
            startAnimation();
        }
    }, [containerSizeRef, containerRef, transformRef, minScale, clampTransform, onHoverVideo, startAnimation]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Stop any inertial movement instantly on grab
        stopAnimation();
        // Sync target to where we actually are
        targetTransformRef.current = { ...transformRef.current };

        // Prevent default to stop text selection or native drag
        if (e.button === 0) {
            // Prevent text selection/native drag
            // Note: Preventing default on MouseDown helps stop text selection significantly.

            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;

            if (e.shiftKey) {
                // START SELECTION
                isSelectingRef.current = true;
                selectionStartRef.current = { x: localX, y: localY };
                // Hide tooltip and floating bar during selection
                if (onHoverVideo) onHoverVideo(false);
                if (onInteractionStart) onInteractionStart();
            } else {
                // START PANNING
                setIsPanning(true);
                isPanningRef.current = true;
                panStartRef.current = {
                    x: e.clientX - transformRef.current.offsetX,
                    y: e.clientY - transformRef.current.offsetY
                };
            }
        }
    }, [transformRef, stopAnimation, containerRef, onHoverVideo]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanningRef.current) {
            if (onHoverVideo) onHoverVideo(false);
            if (onInteractionStart) onInteractionStart();

            const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
            if (viewportWidth === 0) return;

            const clamped = clampTransform({
                ...transformRef.current,
                offsetX: e.clientX - panStartRef.current.x,
                offsetY: e.clientY - panStartRef.current.y
            }, viewportWidth, viewportHeight);

            transformRef.current = clamped;
            // Sync target so releasing doesn't jump back to old target
            targetTransformRef.current = clamped;
            syncToDom();
        } else if (isSelectingRef.current) {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;

            const startX = selectionStartRef.current.x;
            const startY = selectionStartRef.current.y;

            // Calculate positive width/height rect
            const x = Math.min(startX, localX);
            const y = Math.min(startY, localY);
            const width = Math.abs(localX - startX);
            const height = Math.abs(localY - startY);

            setSelectionRect({ x, y, width, height });
        }
    }, [containerSizeRef, transformRef, clampTransform, syncToDom, onHoverVideo, containerRef]);

    const handleMouseUp = useCallback((e?: React.MouseEvent) => {
        // PAN END
        if (isPanningRef.current) {
            setIsPanning(false);
            isPanningRef.current = false;
        }

        // SELECTION END -> ZOOM
        if (isSelectingRef.current) {
            isSelectingRef.current = false;
            setSelectionRect(null); // Hide rect

            const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
            if (viewportWidth === 0) return;

            const container = containerRef.current;
            if (!container) return;

            // We need to calculate based on the FINAL MOUSE POSITION.
            // If e is provided, use it. If not (global listener), we might need to rely on the last rect state?
            // Actually, handleMouseUp IS usually attached to the container in this case, receiving the event.
            // Assuming this is used as onMouseUp={handleMouseUp}

            if (e) {
                const rect = container.getBoundingClientRect();
                const localX = e.clientX - rect.left;
                const localY = e.clientY - rect.top;

                const startX = selectionStartRef.current.x;
                const startY = selectionStartRef.current.y;

                const width = Math.abs(localX - startX);
                const height = Math.abs(localY - startY);

                // Calculate positive width/height rect for logic
                const x = Math.min(startX, localX);
                const y = Math.min(startY, localY);

                const newTransform = calculateSelectionZoomTransform(
                    { x, y, width, height },
                    { width: viewportWidth, height: viewportHeight },
                    transformRef.current,
                    minScale
                );

                // Animate to it
                targetTransformRef.current = newTransform;
                startAnimation();
            }
        }
    }, [containerSizeRef, containerRef, transformRef, minScale, clampTransform, startAnimation]);

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

    const zoomToPoint = useCallback((worldX: number, worldY: number, targetZoomScale: number) => {
        const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
        if (viewportWidth === 0) return;

        // Calculate New Offset to center the world point
        // ViewportCenter = WorldPoint * Scale + Offset
        // Offset = ViewportCenter - WorldPoint * Scale
        const newOffsetX = (viewportWidth / 2) - (worldX * targetZoomScale);
        const newOffsetY = (viewportHeight / 2) - (worldY * targetZoomScale);

        const clamped = clampTransform({
            scale: targetZoomScale,
            offsetX: newOffsetX,
            offsetY: newOffsetY
        }, viewportWidth, viewportHeight);

        targetTransformRef.current = clamped;
        startAnimation();
    }, [containerSizeRef, clampTransform, startAnimation]);

    const smoothToTransform = useCallback((target: Transform) => {
        targetTransformRef.current = { ...target };
        startAnimation();
    }, [startAnimation]);

    return {
        isPanning,
        selectionRect,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        syncToDom,
        zoomToPoint,
        smoothToTransform
    };
};
