import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useDebounce } from '../../../../hooks/useDebounce';
import { useTrendStore } from '../../../../stores/trendStore';
import { calculatePreservedTransform } from '../utils/timelineMath';
import type { MonthLayout, TimelineStats } from '../../../../types/trends';

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
    stats: TimelineStats;
}

export const useTimelineTransform = ({
    worldWidth,
    headerHeight,
    padding,
    videosLength,
    monthLayouts,
    stats
}: UseTimelineTransformProps) => {
    const { timelineConfig, setTimelineConfig, channels } = useTrendStore();
    const { zoomLevel, offsetX, offsetY, isCustomView, contentHash: savedContentHash } = timelineConfig;

    // Calculate current content hash based on VISIBLE channels
    const currentContentHash = useMemo(() => {
        const visibleIds = channels
            .filter(c => c.isVisible)
            .map(c => c.id)
            .sort();
        return visibleIds.join(',');
    }, [channels]);

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
        const scaledHeight = dynamicWorldHeight * t.scale;

        // X-Axis clamping
        let constrainedOffsetX: number;

        // Calculate the safe bounds (with padding)
        // Upper bound (Leftmost position): Padding
        const maxOffsetX = padding;

        // Simplification: The math is identical in both cases if we just use Min/Max correctly!
        // When Small: minOffset (Right Edge) > maxOffset (Left Edge).
        // We want constraint: between Left(40) and Right(800).
        // When Large: minOffset (Left Limit) < maxOffset (Left Edge).

        const maxScale = Math.max(t.scale, minScale); // Ensure we don't clamp below minScale logic
        const effectiveWorldWidth = worldWidth * maxScale;

        // If content is smaller than viewport (rare in fit mode, but possible)
        if (effectiveWorldWidth <= viewportWidth) {
            // Center it
            constrainedOffsetX = (viewportWidth - effectiveWorldWidth) / 2;
        } else {
            const minOffsetX = viewportWidth - (effectiveWorldWidth + padding);

            // Bounds:
            // maxOffsetX = 40.
            // Range [-1040, 40].
            // Numerical min = -1040. Numerical max = 40.

            // Same logic works: Math.min/max of the two bounds.
            const lowerBound = Math.min(maxOffsetX, minOffsetX);
            const upperBound = Math.max(maxOffsetX, minOffsetX);

            constrainedOffsetX = Math.max(lowerBound, Math.min(upperBound, t.offsetX));
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
    }, [worldWidth, dynamicWorldHeight, headerHeight, padding, minScale]);

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
            isCustomView: false,
            contentHash: currentContentHash // Save hash on auto-fit
        });
    }, [calculateAutoFitTransform, setTransformState, setTimelineConfig, currentContentHash]);

    // Track initialization
    const hasInitializedRef = useRef(false);
    const prevViewportSizeRef = useRef({ width: 0, height: 0 });

    // Initial Auto-fit Logic
    useEffect(() => {
        if (hasInitializedRef.current) return;
        if (videosLength === 0 || viewportSize.width === 0) return;

        hasInitializedRef.current = true;
        prevViewportSizeRef.current = viewportSize;

        // 1. If user hasn't customized view, Auto-Fit.
        // 2. OR, if the content has changed (hash mismatch) compared to what was saved, Auto-Fit.
        const shouldAutoFit = !isCustomView || (savedContentHash !== currentContentHash);

        if (shouldAutoFit) {
            handleAutoFit();
        }
    }, [handleAutoFit, isCustomView, videosLength, viewportSize, savedContentHash, currentContentHash]);

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
    }, [viewportSize, isCustomView, handleAutoFit]);


    // --- Interaction & Update Logic using useLayoutEffect (Same as before) ---
    // (This block keeps the relative positioning on data/viewport changes)
    const prevWorldWidthRef = useRef(worldWidth);
    const prevWorldHeightRef = useRef(dynamicWorldHeight);
    const pendingAnchorRef = useRef<{ time: number; yNorm?: number; screenX?: number; screenY?: number } | null>(null);

    // Provide a way to queue a time-anchor (e.g. from hotkeys or external actions)
    const anchorToTime = useCallback((timeOrObj: number | { time: number; yNorm?: number; screenX?: number; screenY?: number }) => {
        if (typeof timeOrObj === 'number') {
            pendingAnchorRef.current = { time: timeOrObj };
        } else {
            pendingAnchorRef.current = timeOrObj;
        }
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
    if (pendingAnchorRef.current !== null && (widthChanged || heightChanged)) {
        activeTransform = calculatePreservedTransform({
            currentTransform: transformState,
            viewportSize,
            headerHeight,
            worldDimensions: {
                prevWidth,
                currWidth: currentWidth,
                prevHeight,
                currHeight: currentHeight
            },
            anchor: {
                time: pendingAnchorRef.current.time,
                yNorm: pendingAnchorRef.current.yNorm,
                screenX: pendingAnchorRef.current.screenX,
                screenY: pendingAnchorRef.current.screenY,
                monthLayouts,
                stats
            }
        });
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
        if (pendingAnchorRef.current !== null) {
            const newTransform = calculatePreservedTransform({
                currentTransform: transformState,
                viewportSize,
                headerHeight,
                worldDimensions: {
                    prevWidth: pWidth,
                    currWidth: cWidth,
                    prevHeight: pHeight,
                    currHeight: cHeight
                },
                anchor: {
                    time: pendingAnchorRef.current.time,
                    yNorm: pendingAnchorRef.current.yNorm,
                    screenX: pendingAnchorRef.current.screenX,
                    screenY: pendingAnchorRef.current.screenY,
                    monthLayouts,
                    stats
                }
            });

            setTransformState(newTransform);
            pendingAnchorRef.current = null;
            return;
        }

        if (wChanged || hChanged) {
            // Priority 0: Auto-Fit Maintenance
            const prevFitScale = (viewportSize.width - padding * 2) / Math.max(1, pWidth);
            const scaleDiff = Math.abs(transformState.scale - prevFitScale);
            const isRoughlyFitted = scaleDiff < 0.001 || (scaleDiff / prevFitScale) < 0.05;

            if (isRoughlyFitted && wChanged) {
                handleAutoFit();
                prevWorldWidthRef.current = cWidth;
                prevWorldHeightRef.current = cHeight;
                return;
            }

            // Priority 1: Initialization / Placeholder Transition
            const isTransitionFromPlaceholder = pWidth <= 2500 && Math.abs(transformState.offsetX) > 1;

            if (isTransitionFromPlaceholder) {
                prevWorldWidthRef.current = cWidth;
                prevWorldHeightRef.current = cHeight;
                return;
            }

            // Priority 2: Standard Ratio Preservation
            const newTransform = calculatePreservedTransform({
                currentTransform: transformState,
                viewportSize,
                headerHeight,
                worldDimensions: {
                    prevWidth: pWidth,
                    currWidth: cWidth,
                    prevHeight: pHeight,
                    currHeight: cHeight
                }
                // No anchor -> implies ratio mode
            });

            setTransformState(newTransform);
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
                isCustomView: true,
                contentHash: currentContentHash // Save hash on interaction
            });
        }
    }, [debouncedTransform, setTimelineConfig, currentContentHash]);

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
        calculateAutoFitTransform,
        currentContentHash // Expose hash for manual updates
    };
};
