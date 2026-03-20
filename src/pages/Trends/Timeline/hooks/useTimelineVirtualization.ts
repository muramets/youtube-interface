import { useMemo } from 'react';
import type { Transform } from '../utils/timelineMath';

import type { VideoPosition } from '../../../../core/types/trends';

interface UseTimelineVirtualizationProps {
    videoPositions: VideoPosition[];
    transform: Transform;
    worldWidth: number;
    worldHeight: number;
    viewportWidth?: number;
    viewportHeight?: number;
}

const BUFFER_PX = 500;

export const useTimelineVirtualization = ({
    videoPositions,
    transform,
    worldWidth,
    worldHeight,
    viewportWidth,
    viewportHeight
}: UseTimelineVirtualizationProps) => {

    // -- VIRTUALIZATION / CULLING --
    const visibleRegion = useMemo(() => {
        const width = viewportWidth || (typeof window !== 'undefined' ? window.innerWidth : 1920);
        const height = viewportHeight || (typeof window !== 'undefined' ? window.innerHeight : 1080);

        // Transform screen coords to world coords: screenX = worldX * scale + offsetX
        // worldX = (screenX - offsetX) / scale
        const worldMinX = (-BUFFER_PX - transform.offsetX) / transform.scale;
        const worldMaxX = (width + BUFFER_PX - transform.offsetX) / transform.scale;
        const worldMinY = (-BUFFER_PX - transform.offsetY) / transform.scale;
        const worldMaxY = (height + BUFFER_PX - transform.offsetY) / transform.scale;

        return {
            startX: worldMinX, endX: worldMaxX,
            startY: worldMinY, endY: worldMaxY
        };
    }, [transform.offsetX, transform.offsetY, transform.scale, viewportWidth, viewportHeight]);

    // Filter videos based on X and Y position
    const visibleVideos = useMemo(() => {
        return videoPositions.filter(p => {
            const x = p.xNorm * worldWidth;
            const y = p.yNorm * worldHeight;
            return x >= visibleRegion.startX && x <= visibleRegion.endX
                && y >= visibleRegion.startY && y <= visibleRegion.endY;
        });
    }, [videoPositions, visibleRegion, worldWidth, worldHeight]);

    return {
        visibleVideos,
        visibleRegion
    };
};
