import { useState, useRef, useCallback } from 'react';
import type { TrendVideo } from '../../../../types/trends';

export interface TooltipData {
    video: TrendVideo;
    x: number;
    y: number;
    width: number;
    height: number;
}

export const useTimelineTooltip = () => {
    const [hoveredVideo, setHoveredVideo] = useState<TooltipData | null>(null);
    const [isTooltipClosing, setIsTooltipClosing] = useState(false);

    const isTooltipHoveredRef = useRef(false);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const closeTooltipSmoothly = useCallback(() => {
        setIsTooltipClosing(true);
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => {
            setHoveredVideo(null);
            setIsTooltipClosing(false);
        }, 200); // Wait for fade out
    }, []);

    const handleHoverVideo = useCallback((data: TooltipData | null) => {
        if (data) {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
            setIsTooltipClosing(false);
            setHoveredVideo(data);
        } else {
            hideTimeoutRef.current = setTimeout(() => {
                if (!isTooltipHoveredRef.current) {
                    closeTooltipSmoothly();
                }
            }, 150); // Delay before starting fade out
        }
    }, [closeTooltipSmoothly]);

    const handleTooltipMouseEnter = useCallback(() => {
        isTooltipHoveredRef.current = true;
        setIsTooltipClosing(false); // Cancel closing if we re-enter
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    }, []);

    const handleTooltipMouseLeave = useCallback(() => {
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
