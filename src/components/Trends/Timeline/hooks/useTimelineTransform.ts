import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useDebounce } from '../../../../hooks/useDebounce';
import { useTrendStore } from '../../../../stores/trendStore';
import { getWorldXAtTime } from '../utils/timelineMath';
import type { MonthLayout } from '../../../../types/trends';

export interface Transform {
    scale: number;
    offsetX: number;
    offsetY: number;
}

interface UseTimelineTransformProps {
    worldWidth: number;
    headerHeight: number;
    padding: number;
    videosLength: number;
    // New props for timestamp anchoring
    monthLayouts: MonthLayout[];
    stats: { minDate: number; maxDate: number };
}

export const useTimelineTransform = ({
    worldWidth,
    headerHeight,
    padding,
    videosLength,
    monthLayouts,
    stats
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

        if (scaledHeight <= availableHeight) {
            // Content matches or is smaller than viewport: Center it vertically (or top-align if preferred)
            constrainedOffsetY = headerHeight + (availableHeight - scaledHeight) / 2;
        } else {
            // Content is larger: Clamp strict bounds (No overscroll padding)
            // Top limit: Header Bottom (headerHeight)
            // Bottom limit: Viewport Bottom (viewportHeight - scaledHeight)
            const maxOffsetY = headerHeight;
            const minOffsetY = viewportHeight - scaledHeight;
            constrainedOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, t.offsetY));
        }

        return {
            scale: t.scale,
            offsetX: constrainedOffsetX,
            offsetY: constrainedOffsetY
        };
    }, [worldWidth, dynamicWorldHeight, headerHeight, padding]);

    // Calculate Auto Fit Transform (Pure Calculation)
    const calculateAutoFitTransform = useCallback(() => {
        if (videosLength === 0 || viewportSize.width <= 0) return null;

        const currentFitScale = (viewportSize.width - padding * 2) / Math.max(1, worldWidth);
        const contentWidth = worldWidth * currentFitScale;
        const contentHeight = dynamicWorldHeight * currentFitScale;

        const newOffsetX = (viewportSize.width - contentWidth) / 2;
        const newOffsetY = headerHeight + ((viewportSize.height - headerHeight) - contentHeight) / 2;

        return { scale: currentFitScale, offsetX: newOffsetX, offsetY: newOffsetY };
    }, [videosLength, viewportSize, padding, worldWidth, dynamicWorldHeight, headerHeight]);

    // Handle Auto Fit (Instant)
    const handleAutoFit = useCallback(() => {
        const newState = calculateAutoFitTransform();
        if (!newState) return;

        setTransformState(newState);

        setTimelineConfig({
            zoomLevel: newState.scale,
            offsetX: newState.offsetX,
            offsetY: newState.offsetY,
            isCustomView: false
        });
    }, [calculateAutoFitTransform, setTransformState, setTimelineConfig]);

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

        // If the user has a custom view (zoomed in/panned), DO NOT auto-fit on resize.
        // The useLayoutEffect logic will handle maintaining relative position (ratios).
        if (isCustomView) {
            prevViewportSizeRef.current = viewportSize; // Just update the ref
            return;
        }

        const prevSize = prevViewportSizeRef.current;
        const hasResized = prevSize.width > 0 &&
            (Math.abs(prevSize.width - viewportSize.width) > 10 ||
                Math.abs(prevSize.height - viewportSize.height) > 10);

        if (hasResized) {
            handleAutoFit();
        }
        prevViewportSizeRef.current = viewportSize;
    }, [viewportSize, handleAutoFit, isCustomView]);

    // Track previous world dimensions to calculate ratios for anchoring
    const prevWorldWidthRef = useRef(worldWidth);
    const prevWorldHeightRef = useRef(dynamicWorldHeight);

    // Pending Anchor Time (for Time Distribution changes)
    const pendingAnchorTimeRef = useRef<number | null>(null);

    // Method to request an anchor before a layout change
    const anchorToTime = useCallback((timestamp: number) => {
        pendingAnchorTimeRef.current = timestamp;
    }, []);

    // 4. Render-Phase Anchoring (Synchronous)
    // To prevent flicker (Render 1: Bad Layout, Render 2: Corrected), we calculate 
    // the anchored transform synchronously if a layout change is detected.

    const prevWidth = prevWorldWidthRef.current;
    const prevHeight = prevWorldHeightRef.current;
    const currentWidth = worldWidth;
    const currentHeight = dynamicWorldHeight;
    const widthChanged = Math.abs(currentWidth - prevWidth) >= 1;
    const heightChanged = Math.abs(currentHeight - prevHeight) >= 1;

    let activeTransform = transformState;

    // Only apply correction if we have a pending anchor request
    if (pendingAnchorTimeRef.current !== null && (widthChanged || heightChanged)) {
        const anchorTime = pendingAnchorTimeRef.current;
        // Debug log removed

        // X-AXIS: Restore center based on timestamp
        const newNormX = getWorldXAtTime(anchorTime, monthLayouts, stats);
        const newWorldX = newNormX * currentWidth;

        // Center in Viewport
        const viewportCenterX = viewportSize.width / 2;
        const newOffsetX = viewportCenterX - (newWorldX * transformState.scale);

        // Y-AXIS: Scale Vertical Position
        const heightRatio = heightChanged ? currentHeight / prevHeight : 1.0;
        const availableHeight = viewportSize.height - headerHeight;
        const viewportCenterY = headerHeight + (availableHeight / 2);

        const distCenterY = viewportCenterY - transformState.offsetY;
        const newOffsetY = viewportCenterY - (distCenterY * heightRatio);

        // OVERRIDE state for this render frame
        activeTransform = {
            ...transformState,
            offsetX: newOffsetX,
            offsetY: newOffsetY
        };
    }

    // Auto-fit OR Anchor (Commit Phase)
    useLayoutEffect(() => {
        // We already have the boolean flags (widthChanged, heightChanged) 
        // calculated in the render scope, but effect scope is different.
        // We need to re-check refs vs props here or use the render-scoped check if stable.
        // Let's re-read refs to be safe.

        const pWidth = prevWorldWidthRef.current;
        const pHeight = prevWorldHeightRef.current;
        const cWidth = worldWidth;
        const cHeight = dynamicWorldHeight;

        const wChanged = Math.abs(cWidth - pWidth) >= 1;
        const hChanged = Math.abs(cHeight - pHeight) >= 1;

        if (wChanged) prevWorldWidthRef.current = cWidth;
        if (hChanged) prevWorldHeightRef.current = cHeight;

        // 1. Commit Synchronous Anchor
        if (pendingAnchorTimeRef.current !== null) {
            // We already calculated and rendered this frame using 'activeTransform'.
            // Now we must Commit it to state so future renders use it.
            // Be careful to use the SAME calculation to ensure stability.

            // Re-calculate (or we could store the derived transform in a ref during render?)
            // Re-calculation is safer than side-effects in render.

            const anchorTime = pendingAnchorTimeRef.current;
            const newNormX = getWorldXAtTime(anchorTime, monthLayouts, stats);
            const newWorldX = newNormX * cWidth;
            const viewportCenterX = viewportSize.width / 2;
            const newOffsetX = viewportCenterX - (newWorldX * transformState.scale); // use current scale

            const hRatio = hChanged ? cHeight / pHeight : 1.0;
            const availH = viewportSize.height - headerHeight;
            const viewCY = headerHeight + (availH / 2);
            const distCY = viewCY - transformState.offsetY;
            const newOffsetY = viewCY - (distCY * hRatio);

            setTransformState({ // Changed from setTransformStateInternal to setTransformState
                ...transformState,
                offsetX: newOffsetX,
                offsetY: newOffsetY
            });

            pendingAnchorTimeRef.current = null;
            return;
        }

        if (wChanged || hChanged) {
            // Priority 0: Auto-Fit Maintenance
            // If we were fitted to the PREVIOUS width, we should snap to the NEW width (Auto-Fit)
            // unless we specifically requested an anchor (handled above).

            const prevFitScale = (viewportSize.width - padding * 2) / Math.max(1, pWidth);
            // Relaxed tolerance for "roughly fitted"
            const scaleDiff = Math.abs(transformState.scale - prevFitScale);
            const isRoughlyFitted = scaleDiff < 0.001 || (scaleDiff / prevFitScale) < 0.05;

            // Check if we effectively had a "Fit" state
            // Note: isCustomView might be true if we dragged, but if we snapped back to fit, we treat it as fit.
            if (isRoughlyFitted && wChanged) {
                handleAutoFit();
                // Update refs since we handled the change
                prevWorldWidthRef.current = cWidth;
                prevWorldHeightRef.current = cHeight;
                return;
            }

            // Priority 1: Initialization / Placeholder Transition
            // Check for initialization case (loading -> loaded) OR (placeholder -> placeholder resize)
            // If previous width was small (placeholder), we assume we rely on the ABSOLUTE persisted offset.
            // We should NOT scale the offset based on the ratio of placeholder dimensions.
            const isTransitionFromPlaceholder = pWidth <= 2500 && Math.abs(transformState.offsetX) > 1;

            if (isTransitionFromPlaceholder) {
                // Update refs but do NOT scale the offset
                // This allows the persisted offset to remain valid for the new content size
                prevWorldWidthRef.current = cWidth;
                prevWorldHeightRef.current = cHeight;
                return;
            }

            const prevW = Math.max(1, pWidth);
            const prevH = Math.max(1, pHeight);

            // Only apply ratio if we had a valid previous dimension to scale FROM.
            // If pWidth was 0 (or close to), it means we are hydrating/loading.
            const isValidTransition = pWidth > 1 && pHeight > 1;

            const widthRatio = (wChanged && isValidTransition) ? cWidth / prevW : 1.0;
            const heightRatio = (hChanged && isValidTransition) ? cHeight / prevH : 1.0;

            const viewportX = viewportSize.width / 2;
            const distX = viewportX - transformState.offsetX;
            const newX = viewportX - (distX * widthRatio);

            const availH = viewportSize.height - headerHeight;
            const viewY = headerHeight + (availH / 2);
            const distY = viewY - transformState.offsetY;
            const newY = viewY - (distY * heightRatio);

            setTransformState({
                ...transformState,
                offsetX: newX,
                offsetY: newY
            });
        }

    }, [worldWidth, dynamicWorldHeight, videosLength, viewportSize, headerHeight, isCustomView, handleAutoFit, transformState, setTransformState, monthLayouts, stats, padding]); // Dependencies

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
        transformState: activeTransform,
        transformRef,
        setTransformState,
        clampTransform,
        handleAutoFit,
        minScale,
        dynamicWorldHeight,
        fitScale,
        anchorToTime,
        calculateAutoFitTransform
    };
};
