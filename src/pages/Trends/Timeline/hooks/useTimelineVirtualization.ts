import { useMemo } from 'react';

import type { VideoPosition } from '../../../../core/types/trends';

interface UseTimelineVirtualizationProps {
    videoPositions: VideoPosition[];
    transform: { scale: number; offsetX: number; offsetY: number };
    worldWidth: number;
    viewportWidth?: number; // Optional, can default to window.innerWidth
}

export const useTimelineVirtualization = ({
    videoPositions,
    transform,
    worldWidth,
    viewportWidth
}: UseTimelineVirtualizationProps) => {

    // -- VIRTUALIZATION / CULLING (throttled for performance) --
    const rawVisibleRegion = useMemo(() => {
        const width = viewportWidth || (typeof window !== 'undefined' ? window.innerWidth : 1920);
        const minX = -500; // Buffer
        const maxX = width + 500;

        // Transform screen coords to world coords: screenX = worldX * scale + offsetX
        // worldX = (screenX - offsetX) / scale
        const worldMinX = (minX - transform.offsetX) / transform.scale;
        const worldMaxX = (maxX - transform.offsetX) / transform.scale;

        return { start: worldMinX, end: worldMaxX };
    }, [transform.offsetX, transform.scale, viewportWidth]);

    // Throttle removed to prevent flickering during rapid layout changes (anchoring)
    // The visibility check is cheap enough to run every frame
    const visibleRegion = rawVisibleRegion;

    // Filter videos based on X position
    const visibleVideos = useMemo(() => {
        return videoPositions.filter(p => {
            const x = p.xNorm * worldWidth;
            return x >= visibleRegion.start && x <= visibleRegion.end;
        });
    }, [videoPositions, visibleRegion, worldWidth]);

    return {
        visibleVideos,
        visibleRegion // Exposed for debug if needed
    };
};
