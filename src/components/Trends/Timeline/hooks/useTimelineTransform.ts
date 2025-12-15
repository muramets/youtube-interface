import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
        if (scaledWidth < viewportWidth) {
            constrainedOffsetX = (viewportWidth - scaledWidth) / 2;
        } else {
            const minOffsetX = viewportWidth - scaledWidth;
            const maxOffsetX = 0;
            constrainedOffsetX = Math.max(minOffsetX, Math.min(maxOffsetX, t.offsetX));
        }

        // Y-Axis clamping
        let constrainedOffsetY: number;
        const availableHeight = viewportHeight - headerHeight;

        if (scaledHeight < availableHeight) {
            constrainedOffsetY = headerHeight + (availableHeight - scaledHeight) / 2;
        } else {
            const maxOffsetY = headerHeight;
            const minOffsetY = viewportHeight - scaledHeight;
            constrainedOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, t.offsetY));
        }

        return {
            scale: t.scale,
            offsetX: constrainedOffsetX,
            offsetY: constrainedOffsetY
        };
    }, [worldWidth, dynamicWorldHeight, headerHeight]);

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

    // Persist to store (Debounced)
    const debouncedTransform = useDebounce(transformState, 500);
    useEffect(() => {
        if (
            Math.abs(debouncedTransform.scale - zoomLevel) > 0.001 ||
            Math.abs(debouncedTransform.offsetX - offsetX) > 1 ||
            Math.abs(debouncedTransform.offsetY - offsetY) > 1
        ) {
            setTimelineConfig({
                zoomLevel: debouncedTransform.scale,
                offsetX: debouncedTransform.offsetX,
                offsetY: debouncedTransform.offsetY,
                isCustomView: true
            });
        }
    }, [debouncedTransform, setTimelineConfig, zoomLevel, offsetX, offsetY]);

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
