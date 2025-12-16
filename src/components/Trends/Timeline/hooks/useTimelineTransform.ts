import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useDebounce } from '../../../../hooks/useDebounce';
import { useTrendStore } from '../../../../stores/trendStore';

interface Transform {
    scale: number;
    offsetX: number;
    offsetY: number;
}

interface UseTimelineTransformProps {
    worldWidth: number;
    headerHeight: number;
    padding: number;
    videosLength: number;
}

export const useTimelineTransform = ({
    worldWidth,
    headerHeight,
    padding,
    videosLength
}: UseTimelineTransformProps) => {
    const { timelineConfig, setTimelineConfig } = useTrendStore();
    const { zoomLevel, offsetX, offsetY, isCustomView } = timelineConfig;

    // Transform state
    const transformRef = useRef<Transform>({
        scale: zoomLevel || 0.01,
        offsetX: offsetX || 0,
        offsetY: offsetY || 0
    });

    const [transformState, setTransformStateInternal] = useState<Transform>(transformRef.current);

    // Only update state if significantly changed to avoid thrashing
    const setTransformState = useCallback((newTransform: Transform) => {
        transformRef.current = newTransform;
        setTransformStateInternal({ ...newTransform });
    }, []);

    // Container size tracking
    const containerRef = useRef<HTMLDivElement>(null);
    const containerSizeRef = useRef({ width: 0, height: 0 });
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newSize = {
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                };
                containerSizeRef.current = newSize;
                setViewportSize(newSize);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // 1. Calculate 'Fit Scale' based on Width
    const fitScale = useMemo(() => {
        if (viewportSize.width <= 0) return 0.001;
        return (viewportSize.width - padding * 2) / Math.max(1, worldWidth);
    }, [viewportSize.width, padding, worldWidth]);

    // 2. Derive Dynamic World Height
    const dynamicWorldHeight = useMemo(() => {
        if (viewportSize.height <= 0 || fitScale <= 0) return 1000;
        return (viewportSize.height - headerHeight) / fitScale;
    }, [viewportSize.height, headerHeight, fitScale]);

    // 3. Min Scale
    const minScale = fitScale;

    // Helper to clamp transform
    const clampTransform = useCallback((
        t: Transform,
        viewportWidth: number,
        viewportHeight: number
    ): Transform => {
        const scaledWidth = worldWidth * t.scale;
        const scaledHeight = dynamicWorldHeight * t.scale;

        // X-Axis clamping
        let constrainedOffsetX: number;

        // Calculate the safe bounds (with padding)
        // Upper bound (Leftmost position): Padding
        // Lower bound (Rightmost position): Viewport - Scaled - Padding
        const maxOffsetX = padding;
        const minOffsetX = viewportWidth - scaledWidth - padding;

        // Simplification: The math is identical in both cases if we just use Min/Max correctly!
        // When Small: minOffset (Right Edge) > maxOffset (Left Edge).
        // We want constraint: between Left(40) and Right(800).
        // When Large: minOffset (Left Limit) < maxOffset (Left Edge).
        // We want constraint: between LeftLimit(-500) and RightLimit(40).

        // So we can just say:
        // const lowerBound = Math.min(minOffsetX, maxOffsetX); -- Wait, no.

        // Use logic:
        // Left Limit is always Math.min(maxOffsetX, minOffsetX)? No.

        // Let's stick to the explicit branches to be safe and readable.
        if (scaledWidth < viewportWidth) {
            // Content is smaller than viewport ("slack" exists)
            // minOffsetX is the Left Limit (Padding)
            // maxOffsetX is the Right Limit (Viewport - Scaled - Padding)
            // Wait, standard coordinate system:
            // Larger OffsetX = Moves Right. Lower OffsetX = Moves Left.
            // Rightmost valid position: OffsetX such that Left Edge is at Padding? -> OffsetX = Padding.
            // Leftmost valid position: OffsetX such that Right Edge is at Viewport-Padding? -> OffsetX = Viewport - Width - Padding.

            // So:
            // Max Val (Rightmost visual) = Padding.
            // Min Val (Leftmost visual) = Viewport - Width - Padding.

            // So logic was: const maxOffsetX = padding; const minOffsetX = ...
            // And we want to clamp t.offsetX between min and max.

            // Wait, if ScaledWidth < Viewport.
            // Viewport (1000) - Width (500) - Padding (40) = 460.
            // Padding = 40.
            // 460 is > 40.

            // So MinOffsetX (variable name) = 460? That's confusing naming.
            // We want [40, 460].
            // So numerical min = maxOffsetX (40).
            // Numerical max = minOffsetX (460).

            const lowerBound = Math.min(maxOffsetX, minOffsetX);
            const upperBound = Math.max(maxOffsetX, minOffsetX);

            constrainedOffsetX = Math.max(lowerBound, Math.min(upperBound, t.offsetX));

        } else {
            // Content larger.
            // minOffsetX = Viewport(1000) - Width(2000) - Padding(40) = -1040.
            // maxOffsetX = 40.
            // Range [-1040, 40].
            // Numerical min = -1040. Numerical max = 40.

            // Same logic works: Math.min/max of the two bounds.
            const lowerBound = Math.min(maxOffsetX, minOffsetX);
            const upperBound = Math.max(maxOffsetX, minOffsetX);

            constrainedOffsetX = Math.max(lowerBound, Math.min(upperBound, t.offsetX));
        }

        if (Math.abs(constrainedOffsetX - t.offsetX) > 0.1) {
            // Debug log removed
        }

        // Y-Axis clamping
        let constrainedOffsetY: number;
        const availableHeight = viewportHeight - headerHeight;

        if (scaledHeight < availableHeight) {
            constrainedOffsetY = headerHeight + (availableHeight - scaledHeight) / 2;
        } else {
            // Add vertical padding for consistency (optional but "robust")
            const verticalPadding = 20; // Hardcoded small buffer or reuse padding
            const maxOffsetY = headerHeight + verticalPadding;
            const minOffsetY = viewportHeight - scaledHeight - verticalPadding;
            constrainedOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, t.offsetY));
        }

        return {
            scale: t.scale,
            offsetX: constrainedOffsetX,
            offsetY: constrainedOffsetY
        };
    }, [worldWidth, dynamicWorldHeight, headerHeight, padding]);

    // Handle Auto Fit
    const handleAutoFit = useCallback(() => {
        if (videosLength === 0 || viewportSize.width <= 0) return;

        const currentFitScale = (viewportSize.width - padding * 2) / Math.max(1, worldWidth);
        const contentWidth = worldWidth * currentFitScale;
        const contentHeight = dynamicWorldHeight * currentFitScale;

        const newOffsetX = (viewportSize.width - contentWidth) / 2;
        const newOffsetY = headerHeight + ((viewportSize.height - headerHeight) - contentHeight) / 2;

        const newState = { scale: currentFitScale, offsetX: newOffsetX, offsetY: newOffsetY };

        setTransformState(newState);

        setTimelineConfig({
            zoomLevel: currentFitScale,
            offsetX: newOffsetX,
            offsetY: newOffsetY,
            isCustomView: false
        });
    }, [
        videosLength,
        viewportSize,
        padding,
        worldWidth,
        dynamicWorldHeight,
        headerHeight,
        setTransformState,
        setTimelineConfig
    ]);

    // Track initialization
    const hasInitializedRef = useRef(false);
    const prevViewportSizeRef = useRef({ width: 0, height: 0 });

    // Initial Auto-fit
    useEffect(() => {
        if (hasInitializedRef.current) return;
        if (videosLength === 0 || viewportSize.width === 0) return;

        hasInitializedRef.current = true;
        prevViewportSizeRef.current = viewportSize;

        if (!isCustomView) {
            handleAutoFit();
        }
    }, [handleAutoFit, isCustomView, videosLength, viewportSize]);

    // Resize Auto-fit
    useEffect(() => {
        if (!hasInitializedRef.current) return;
        const prevSize = prevViewportSizeRef.current;
        const hasResized = prevSize.width > 0 &&
            (Math.abs(prevSize.width - viewportSize.width) > 10 ||
                Math.abs(prevSize.height - viewportSize.height) > 10);

        if (hasResized) {
            handleAutoFit();
        }
        prevViewportSizeRef.current = viewportSize;
    }, [viewportSize, handleAutoFit]);

    // Track previous world width to calculate ratios for anchoring
    const prevWorldWidthRef = useRef(worldWidth);

    // Auto-fit OR Anchor on World Width Change
    // usage of useLayoutEffect prevents visual "stutter" or "flash" of incorrect position before the anchor logic applies
    useLayoutEffect(() => {
        const prevWidth = prevWorldWidthRef.current;
        const currentWidth = worldWidth;

        // CRITICAL FIX: Only proceed if world width ACTUALLY changed.
        if (Math.abs(currentWidth - prevWidth) < 1) {
            return;
        }

        // Update ref immediately for next run
        prevWorldWidthRef.current = currentWidth;

        if (videosLength === 0 || viewportSize.width === 0 || prevWidth === 0) return;

        // Calculate what the fit scale WAS before this width change
        const prevFitScale = (viewportSize.width - padding * 2) / Math.max(1, prevWidth);

        // Compare our current scale (which hasn't updated yet) to that previous fit scale
        const scaleDiff = Math.abs(transformState.scale - prevFitScale);

        // Relaxed tolerance: 5% relative error or 0.01 absolute
        const isRoughlyFitted = scaleDiff < 0.01 || (scaleDiff / prevFitScale) < 0.05;

        const wasFitted = !isCustomView || isRoughlyFitted;

        if (wasFitted) {
            // Case 1: Was fitted -> Stay fitted (re-run auto-fit for new width)
            handleAutoFit();
        } else {
            // Case 2: Was zoomed in -> Anchor center

            // Ratios
            const widthRatio = currentWidth / prevWidth;
            const ratio = widthRatio;

            // X-Axis Anchoring
            const viewportCenterX = viewportSize.width / 2;
            const distCenterX = viewportCenterX - transformState.offsetX;
            const newOffsetX = viewportCenterX - (distCenterX * ratio);

            // Y-Axis Anchoring
            const availableHeight = viewportSize.height - headerHeight;
            const viewportCenterY = headerHeight + (availableHeight / 2);
            const distCenterY = viewportCenterY - transformState.offsetY;
            const newOffsetY = viewportCenterY - (distCenterY * ratio);

            const newTransform = {
                ...transformState,
                offsetX: newOffsetX,
                offsetY: newOffsetY
            };

            setTransformState(newTransform);
        }

    }, [worldWidth, videosLength, viewportSize.width, viewportSize.height, headerHeight, isCustomView, fitScale, handleAutoFit, transformState, setTransformState]);

    // Track latest store config in ref to avoid effect dependency loops
    const latestConfigRef = useRef({ zoomLevel, offsetX, offsetY });
    useEffect(() => {
        latestConfigRef.current = { zoomLevel, offsetX, offsetY };
    }, [zoomLevel, offsetX, offsetY]);

    // Persist to store (Debounced)
    const debouncedTransform = useDebounce(transformState, 500);
    useEffect(() => {
        const { zoomLevel: sZoom, offsetX: sX, offsetY: sY } = latestConfigRef.current;

        if (
            Math.abs(debouncedTransform.scale - sZoom) > 0.001 ||
            Math.abs(debouncedTransform.offsetX - sX) > 1 ||
            Math.abs(debouncedTransform.offsetY - sY) > 1
        ) {
            setTimelineConfig({
                zoomLevel: debouncedTransform.scale,
                offsetX: debouncedTransform.offsetX,
                offsetY: debouncedTransform.offsetY,
                isCustomView: true
            });
        }
    }, [debouncedTransform, setTimelineConfig]);

    return {
        containerRef,
        containerSizeRef,
        viewportSize,
        transformState,
        transformRef,
        setTransformState,
        clampTransform,
        handleAutoFit,
        minScale,
        dynamicWorldHeight,
        fitScale
    };
};
