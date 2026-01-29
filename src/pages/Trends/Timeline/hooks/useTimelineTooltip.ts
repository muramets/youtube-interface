import { useState, useRef, useCallback, useEffect } from 'react';
import type { TrendVideo } from '../../../../core/types/trends';
import { debug } from '../../../../core/utils/debug';

export interface TooltipData {
    video: TrendVideo;
    x: number;
    y: number;
    width: number;
    height: number;
}

export const useTimelineTooltip = ({ delayShowCondition = false }: { delayShowCondition?: boolean } = {}) => {
    const [hoveredVideo, setHoveredVideo] = useState<TooltipData | null>(null);
    const [isTooltipClosing, setIsTooltipClosing] = useState(false);

    const isTooltipHoveredRef = useRef(false);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // New ref for show delay
    const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Track delay condition in ref to access fresh value in callbacks if needed
    const delayShowConditionRef = useRef(delayShowCondition);

    // Sync ref safely
    // Sync ref safely and cleanup timeouts on unmount
    useEffect(() => {
        delayShowConditionRef.current = delayShowCondition;
        return () => {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
            if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
        };
    }, [delayShowCondition]);

    const closeTooltipSmoothly = useCallback(() => {
        debug.timelineHook('⚪ useTimelineTooltip: closeTooltipSmoothly called');
        setIsTooltipClosing(true);
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);

        closeTimeoutRef.current = setTimeout(() => {
            debug.timelineHook('⚪ useTimelineTooltip: closeTooltipSmoothly timeout fired, setting hoveredVideo to null');
            setHoveredVideo(null);
            setIsTooltipClosing(false);
        }, 200); // Wait for fade out
    }, []);

    const handleHoverVideo = useCallback((data: TooltipData | null) => {
        debug.timelineHook('🔵 useTimelineTooltip: handleHoverVideo', {
            hasData: !!data,
            videoId: data?.video?.id,
            delayShowCondition: delayShowConditionRef.current
        });

        if (data) {
            // Clear any pending hide/close/show timers
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
            if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);

            setIsTooltipClosing(false);

            if (delayShowConditionRef.current) {
                // If we need to delay showing, set a timeout
                // Only if not already showing a tooltip (optional refinement, but per spec "hover on video")
                // If we are already showing a tooltip for *another* video, typically we switch instantly or also delay. 
                // Let's assume simple delay for now: any new hover target -> wait 1000ms.

                // However, if we wanted "instant switch if tooltip is already open", we'd check `hoveredVideo`.
                // But the request says "time needed to show tooltip... increased to 1000ms".
                // So we'll force the delay.

                showTimeoutRef.current = setTimeout(() => {
                    debug.timelineHook('🔵 useTimelineTooltip: Delayed show timeout fired, setting hoveredVideo');
                    setHoveredVideo(data);
                }, 1000);
            } else {
                // Immediate show
                debug.timelineHook('🔵 useTimelineTooltip: Immediate show, setting hoveredVideo');
                setHoveredVideo(data);
            }
        } else {
            // Mouse left a video
            debug.timelineHook('🔵 useTimelineTooltip: data is null, scheduling hide');
            if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);

            hideTimeoutRef.current = setTimeout(() => {
                debug.timelineHook('🔵 useTimelineTooltip: hide timeout fired, isTooltipHovered:', isTooltipHoveredRef.current);
                if (!isTooltipHoveredRef.current) {
                    closeTooltipSmoothly();
                }
            }, 150); // Delay before starting fade out
        }
    }, [closeTooltipSmoothly]);

    const handleTooltipMouseEnter = useCallback(() => {
        debug.timelineHook('🟡 useTimelineTooltip: handleTooltipMouseEnter');
        isTooltipHoveredRef.current = true;
        setIsTooltipClosing(false); // Cancel closing if we re-enter
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    }, []);

    const handleTooltipMouseLeave = useCallback(() => {
        debug.timelineHook('🟡 useTimelineTooltip: handleTooltipMouseLeave');
        isTooltipHoveredRef.current = false;
        // Trigger generic close logic via state update or just null?
        // In original code: setHoveredVideo(null) immediately.
        setHoveredVideo(null);
    }, []);

    return {
        hoveredVideo,
        isTooltipClosing,
        handleHoverVideo,
        handleTooltipMouseEnter,
        handleTooltipMouseLeave,
        forceCloseTooltip: closeTooltipSmoothly
    };
};
