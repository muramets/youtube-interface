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
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
    videosLength: number;
    // New props for timestamp anchoring
    monthLayouts: MonthLayout[];
    stats: TimelineStats;
}

export const useTimelineTransform = ({
    worldWidth,
    headerHeight,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
    videosLength,
    monthLayouts,
    stats
}: UseTimelineTransformProps) => {
    // Total padding for calculations that need both
    const totalPadding = paddingLeft + paddingRight;
    const totalVerticalPadding = paddingTop + paddingBottom;
    const { timelineConfig, setTimelineConfig, selectedChannelId, trendsFilters } = useTrendStore();
    const { zoomLevel, offsetX, offsetY, isCustomView, contentHash: savedContentHash } = timelineConfig;

    // Calculate current content hash based on context (Channel ID + Filters)
    const currentContentHash = useMemo(() => {
        // NOTE: We deliberately EXCLUDE visibleIds (channel visibility) from this hash.
        // Changing channel visibility (eye icon) should NOT trigger a view reset.
        // Only switching channels or changing filters/niches should reset the view.

        // Include Niche ID in hash to trigger auto-fit when switching niches
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        const nicheKey = nicheFilter ? (nicheFilter.value as string[]).sort().join(',') : 'all';

        // Include selectedChannelId to distinguish Global view from Specific Channel view
        return `${selectedChannelId || 'global'}:${nicheKey}`;
    }, [selectedChannelId, trendsFilters]);

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
        return (viewportSize.width - totalPadding) / Math.max(1, worldWidth);
    }, [viewportSize.width, totalPadding, worldWidth]);

    // 2. Derive Dynamic World Height (with stability)
    // Account for vertical padding to create safe zones at top and bottom
    const lastValidWorldHeightRef = useRef(1000);
    const dynamicWorldHeight = useMemo(() => {
        if (viewportSize.height <= 0 || fitScale <= 0) {
            return lastValidWorldHeightRef.current; // Use last valid instead of fallback
        }
        // Subtract vertical padding from available height
        const availableHeight = viewportSize.height - headerHeight - totalVerticalPadding;
        const calculated = availableHeight / fitScale;
        lastValidWorldHeightRef.current = calculated; // Update ref
        return calculated;
    }, [viewportSize.height, headerHeight, fitScale, totalVerticalPadding]);

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

        // Dynamic Overscroll:
        // When at minScale (Fit), we want rigid boundaries (overscroll = 0).
        // Dynamic Overscroll:
        // Ultra-tight growth: (zoomFactor - 1) * 0.1 * viewportWidth.
        // Cap at 12% of viewport. This is enough to center small/medium items at edges, 
        // but prevents large voids.
        const zoomFactor = t.scale / Math.max(minScale, 0.000001);
        const dynamicOverscroll = Math.max(0, (zoomFactor - 1) * 0.1 * viewportWidth);

        // Cap overscroll at 12% of viewport
        const overscrollX = Math.min(viewportWidth * 0.12, dynamicOverscroll);

        // Calculate the safe bounds (with padding + overscroll)
        // Upper bound (Leftmost position): Left Padding + Overscroll
        const maxOffsetX = paddingLeft + overscrollX;

        const maxScale = Math.max(t.scale, minScale); // Ensure we don't clamp below minScale logic
        const effectiveWorldWidth = worldWidth * maxScale;

        // Lower bound (Rightmost position): Viewport - World - Padding - Overscroll
        const minOffsetX = viewportWidth - (effectiveWorldWidth + paddingRight) - overscrollX;

        // Bounds:
        // We simply clamp between min and max.
        // Note: minOffsetX will be very negative for large worlds.
        const lowerBound = Math.min(maxOffsetX, minOffsetX);
        const upperBound = Math.max(maxOffsetX, minOffsetX);

        constrainedOffsetX = Math.max(lowerBound, Math.min(upperBound, t.offsetX));



        // Y-Axis clamping
        let constrainedOffsetY: number;
        const availableHeight = viewportHeight - headerHeight - totalVerticalPadding;

        if (scaledHeight <= availableHeight) {
            // Content fits: align to top padding (similar to left padding for X)
            constrainedOffsetY = headerHeight + paddingTop;
        } else {
            // Content is larger: Clamp with padding bounds
            const maxOffsetY = headerHeight + paddingTop;
            const minOffsetY = viewportHeight - paddingBottom - scaledHeight;
            constrainedOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, t.offsetY));
        }

        return {
            scale: t.scale,
            offsetX: constrainedOffsetX,
            offsetY: constrainedOffsetY
        };
    }, [worldWidth, dynamicWorldHeight, headerHeight, paddingLeft, paddingRight, paddingTop, paddingBottom, totalVerticalPadding, minScale]);

    // Calculate Auto Fit Transform (Pure Calculation)
    const calculateAutoFitTransform = useCallback(() => {
        if (videosLength === 0 || viewportSize.width <= 0) return null;

        const currentFitScale = (viewportSize.width - totalPadding) / Math.max(1, worldWidth);

        // Position content with padding offsets
        const newOffsetX = paddingLeft;
        const newOffsetY = headerHeight + paddingTop;

        return { scale: currentFitScale, offsetX: newOffsetX, offsetY: newOffsetY };
    }, [videosLength, viewportSize, totalPadding, paddingLeft, paddingTop, worldWidth, dynamicWorldHeight, headerHeight]);

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

    // Continuous Auto-fit on Hash Change (e.g. Filter Switch)
    useEffect(() => {
        if (!hasInitializedRef.current) return;

        // If the hash changes while we are already running, we MUST auto-fit to show new data.
        if (savedContentHash !== currentContentHash) {
            handleAutoFit();
        }
    }, [savedContentHash, currentContentHash, handleAutoFit]);

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
    const pendingAnchorRef = useRef<{ time: number; xNorm?: number; yNorm?: number; screenX?: number; screenY?: number } | null>(null);

    // Provide a way to queue a time-anchor (e.g. from hotkeys or external actions)
    const anchorToTime = useCallback((timeOrObj: number | { time: number; xNorm?: number; yNorm?: number; screenX?: number; screenY?: number }) => {
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
                xNorm: pendingAnchorRef.current.xNorm,
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
        // We need to re-check refs vs props here to be safe.
        const pWidth = prevWorldWidthRef.current;
        const pHeight = prevWorldHeightRef.current;
        const cWidth = worldWidth;
        const cHeight = dynamicWorldHeight;

        const wChanged = Math.abs(cWidth - pWidth) >= 1;
        const hChanged = Math.abs(cHeight - pHeight) >= 1;

        // Update refs immediately if changed
        if (wChanged) prevWorldWidthRef.current = cWidth;
        if (hChanged) prevWorldHeightRef.current = cHeight;

        /**
         * PRIORITY 1: Pending Anchor (User Action / Internal Request)
         * Highest priority: explicit request to anchor to a specific time/position.
         */
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
                    xNorm: pendingAnchorRef.current.xNorm,
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

        // Only proceed if dimensions actually changed
        if (!wChanged && !hChanged) return;

        /**
         * PRIORITY 2: Auto-Fit Maintenance
         * If the view was roughly fitted before the resize (within 5% tolerance),
         * maintain the "fitted" state by re-running auto-fit on the new dimensions.
         */
        const prevFitScale = (viewportSize.width - totalPadding) / Math.max(1, pWidth);
        const scaleDiff = Math.abs(transformState.scale - prevFitScale);
        const isRoughlyFitted = scaleDiff < 0.001 || (scaleDiff / prevFitScale) < 0.05;

        if (isRoughlyFitted && wChanged) {
            handleAutoFit();
            return;
        }

        /**
         * PRIORITY 3: Initialization / Placeholder Transition
         * If transitioning from a placeholder state (small width), do not attempt
         * ratio preservation as it leads to incorrect jumps. Just accept the new size.
         */
        const isTransitionFromPlaceholder = pWidth <= 2500 && Math.abs(transformState.offsetX) > 1;
        if (isTransitionFromPlaceholder) {
            return;
        }

        /**
         * PRIORITY 4: Standard Ratio Preservation
         * Default behavior: Adjust transform to keep the same relative time range
         * visible on screen despite the world content growing/shrinking.
         */
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
            // No anchor implies standard center-ratio preservation
        });

        setTransformState(newTransform);

    }, [worldWidth, dynamicWorldHeight, videosLength, viewportSize, headerHeight, isCustomView, handleAutoFit, transformState, setTransformState, monthLayouts, stats, totalPadding]); // Dependencies

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

    // Helper to get time at center of viewport
    const getCenterTime = useCallback(() => {
        const { width } = viewportSize;
        if (width <= 0) return Date.now();

        const { scale, offsetX } = transformState;
        const centerX = width / 2;
        const worldX = (centerX - offsetX) / scale;
        const xNorm = worldX / Math.max(1, worldWidth);

        // Inverse mapping: xNorm -> Time
        // Check month layouts first
        for (const layout of monthLayouts) {
            if (xNorm >= layout.startX && xNorm <= layout.endX) {
                const localProgress = (xNorm - layout.startX) / layout.width;
                return layout.startTs + localProgress * (layout.endTs - layout.startTs);
            }
        }

        // Fallback to global linear interpolation
        const range = stats.maxDate - stats.minDate;
        return stats.minDate + xNorm * range;
    }, [viewportSize, transformState, worldWidth, monthLayouts, stats]);

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
        currentContentHash, // Expose hash for manual updates
        getCenterTime
    };
};
