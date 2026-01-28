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
    const mouseDownPosRef = useRef({ x: 0, y: 0 });
    const hasSeenMouseDownRef = useRef(false);

    // Selection State
    const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const isSelectingRef = useRef(false);
    const selectionStartRef = useRef({ x: 0, y: 0 });

    // Interpolation State
    // eslint-disable-next-line react-hooks/refs
    const targetTransformRef = useRef({ ...transformRef.current });
    const rafRef = useRef<number | null>(null);

    // Sync target to current on mount or external reset (optional but good safety)
    useEffect(() => {
        targetTransformRef.current = { ...transformRef.current };
    }, [transformRef]); // Run once, we trust internal updates mainly. 

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

    // We use a ref to hold the update function so it can call itself recursively
    const updateAnimationRef = useRef<() => void>(null);

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
            if (updateAnimationRef.current) {
                rafRef.current = requestAnimationFrame(updateAnimationRef.current);
            }
        }
    }, [transformRef, syncToDom]);

    // Update the ref whenever the callback changes
    useEffect(() => {
        updateAnimationRef.current = updateAnimation;
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [updateAnimation]);

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

    const areTransformsDifferent = (a: Transform, b: Transform) => {
        return Math.abs(a.scale - b.scale) > 0.0001 ||
            Math.abs(a.offsetX - b.offsetX) > 0.1 ||
            Math.abs(a.offsetY - b.offsetY) > 0.1;
    };

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
            const targetOffsetX = mouseX - (mouseX - targetTransformRef.current.offsetX) * scaleRatio;
            const targetOffsetY = mouseY - (mouseY - targetTransformRef.current.offsetY) * scaleRatio;

            const clamped = clampTransform({
                scale: newScale,
                offsetX: targetOffsetX,
                offsetY: targetOffsetY
            }, viewportWidth, viewportHeight);

            // Update Target & Animate
            if (areTransformsDifferent(clamped, targetTransformRef.current)) {
                if (onInteractionStart) onInteractionStart();
                targetTransformRef.current = clamped;
                startAnimation();
            }
        } else {
            // Panning
            const clamped = clampTransform({
                ...targetTransformRef.current,
                offsetX: targetTransformRef.current.offsetX - e.deltaX,
                offsetY: targetTransformRef.current.offsetY - e.deltaY
            }, viewportWidth, viewportHeight);

            // Update Target & Animate (Consolidated smooth feeling)
            if (areTransformsDifferent(clamped, targetTransformRef.current)) {
                if (onInteractionStart) onInteractionStart();
                targetTransformRef.current = clamped;
                startAnimation();
            }
        }
    }, [containerSizeRef, containerRef, transformRef, minScale, clampTransform, onHoverVideo, startAnimation, onInteractionStart]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Stop any inertial movement instantly on grab
        stopAnimation();
        // Sync target to where we actually are
        targetTransformRef.current = { ...transformRef.current };

        // Prevent default to stop text selection or native drag
        if (e.button === 0) {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;

            if (e.shiftKey) {
                // START SELECTION
                isSelectingRef.current = true;
                selectionStartRef.current = { x: localX, y: localY };
                if (onHoverVideo) onHoverVideo(false);
                if (onInteractionStart) onInteractionStart();
            } else {
                // PREPARE PANNING (Don't set isPanning state yet)
                isPanningRef.current = false; // Reset
                setIsPanning(false);
                mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

                // Track start offset for when panning eventually starts
                panStartRef.current = {
                    x: e.clientX - transformRef.current.offsetX,
                    y: e.clientY - transformRef.current.offsetY
                };
                hasSeenMouseDownRef.current = true;
            }
        }
    }, [transformRef, stopAnimation, containerRef, onHoverVideo, onInteractionStart]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // If selecting, handle selection rect
        if (isSelectingRef.current) {
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
            return;
        }

        // If not panning yet, check threshold
        if (!isPanningRef.current && e.buttons === 1 && !e.shiftKey && hasSeenMouseDownRef.current) {
            const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
            const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);

            // Threshold of 5px
            if (dx > 5 || dy > 5) {
                isPanningRef.current = true;
                setIsPanning(true);
                if (onHoverVideo) onHoverVideo(false);
            }
        }

        // If panning (either just started or continuing)
        if (isPanningRef.current) {
            const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
            if (viewportWidth === 0) return;

            /**
             * Pan Logic:
             * 'panStartRef' captures the relationship between mouse position and timeline offset.
             * Even though we wait for a threshold (deadzone), applying this formula
             * results in a seamless transition once panning starts, effectively 
             * "picking up" the timeline exactly where it was grabbed.
             */

            const clamped = clampTransform({
                ...transformRef.current,
                offsetX: e.clientX - panStartRef.current.x,
                offsetY: e.clientY - panStartRef.current.y
            }, viewportWidth, viewportHeight);

            // Only trigger interaction start if we actually moved significantly
            if (areTransformsDifferent(clamped, targetTransformRef.current)) {
                if (onInteractionStart) onInteractionStart();
                transformRef.current = clamped;
                targetTransformRef.current = clamped;
                syncToDom();
            }
        }
    }, [containerSizeRef, transformRef, clampTransform, syncToDom, onHoverVideo, containerRef, onInteractionStart]);

    const lastPanEndTimeRef = useRef(0);

    const handleMouseUp = useCallback((e?: React.MouseEvent) => {
        // PAN END
        if (isPanningRef.current) {
            setIsPanning(false);
            isPanningRef.current = false;
            lastPanEndTimeRef.current = Date.now();
            // Ensure final state is synced to React to prevent re-render jumps
            syncToDom();
        }
        hasSeenMouseDownRef.current = false;

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
    }, [containerSizeRef, containerRef, transformRef, minScale, startAnimation, syncToDom]);

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
        smoothToTransform,
        lastPanEndTimeRef
    };
};
