import { useMemo, useCallback } from 'react';
import type { TrendVideo, TimelineStats, VideoPosition, MonthLayout } from '../../../../core/types/trends';
import { getTrendYPosition, getTrendXPosition } from '../utils/trendLayoutUtils';

export interface UseTimelinePositionsProps {
    videos: TrendVideo[];
    stats: TimelineStats;
    monthLayouts: MonthLayout[];
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile';
    verticalSpread?: number;
    dynamicWorldHeight: number;
    percentileMap?: Map<string, string>;
}

export const useTimelinePositions = ({
    videos,
    stats,
    monthLayouts,
    scalingMode,
    verticalSpread,
    dynamicWorldHeight,
    percentileMap
}: UseTimelinePositionsProps) => {
    // Calculate video positions
    const videoPositions = useMemo<VideoPosition[]>(() => {
        if (!videos.length || !stats) return [];

        // Effective Spread
        const spread = verticalSpread !== undefined ? verticalSpread : 1.0;

        // Pre-calculate percentile thresholds if needed
        const sortedByViews = [...videos].sort((a, b) => a.viewCount - b.viewCount);
        const rankMap = new Map<string, number>();
        sortedByViews.forEach((v, i) => rankMap.set(v.id, i / (videos.length - 1 || 1)));

        const positions = videos.map(video => {
            // X-AXIS: Use shared utility (Handles non-linear time distribution)
            const xNorm = getTrendXPosition(video.publishedAtTimestamp, stats, monthLayouts);

            // Y-AXIS: Use shared utility
            const { y: expandedY, baseSize } = getTrendYPosition(
                video.viewCount,
                stats,
                scalingMode,
                spread,
                dynamicWorldHeight,
                // Only needed for percentile mode
                rankMap.get(video.id) ?? 0.5
            );



            // Return normalized Y relative to dynamicWorldHeight
            return { video, xNorm, yNorm: expandedY / dynamicWorldHeight, baseSize };
        });

        /**
         * Z-ORDER SORTING:
         * Sort by baseSize ASCENDING so that:
         * 1. Smaller dots are rendered first (background)
         * 2. Larger dots are rendered last (foreground / on top)
         * 3. Hit detection picks largest overlapping dot (matching visual z-order)
         */
        positions.sort((a, b) => a.baseSize - b.baseSize);
        return positions;
    }, [videos, stats, scalingMode, monthLayouts, verticalSpread, dynamicWorldHeight]);

    // Percentile Helper — percentileMap is always provided by TrendsPage (O(1) lookup)
    const getPercentileGroup = useCallback((videoId: string): string | undefined => {
        return percentileMap?.get(videoId);
    }, [percentileMap]);

    return {
        videoPositions,
        getPercentileGroup
    };
};
