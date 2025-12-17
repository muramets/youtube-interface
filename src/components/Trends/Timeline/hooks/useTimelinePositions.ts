import { useMemo } from 'react';
import type { TrendVideo, TimelineStats, VideoPosition } from '../../../../types/trends';

const BASE_THUMBNAIL_SIZE = 200;
const MIN_THUMBNAIL_SIZE = 40;

export interface UseTimelinePositionsProps {
    videos: TrendVideo[];
    stats: TimelineStats;
    monthLayouts: any[];
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

        const { minViews, maxViews } = stats;
        const viewRangeLinear = maxViews - minViews || 1;
        const viewRangeLog = Math.log(Math.max(1, maxViews)) - Math.log(Math.max(1, minViews)) || 1;
        const viewRangeSqrt = Math.sqrt(maxViews) - Math.sqrt(minViews) || 1;

        // Effective Spread
        const spread = verticalSpread !== undefined ? verticalSpread : 1.0;

        // Pre-calculate percentile thresholds if needed
        const sortedByViews = [...videos].sort((a, b) => a.viewCount - b.viewCount);
        const rankMap = new Map<string, number>();
        sortedByViews.forEach((v, i) => rankMap.set(v.id, i / (videos.length - 1 || 1)));

        const positions = videos.map(video => {
            const d = new Date(video.publishedAtTimestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            const layout = monthLayouts.find(l => l.monthKey === key);

            // X-AXIS: Snap to day grid (center of day)
            let xNorm: number;
            if (layout) {
                const dayOfMonth = d.getDate(); // 1-indexed
                const daysInMonth = layout.daysInMonth || new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                // Center of the day: (day - 0.5) / daysInMonth gives center position
                const dayProgress = (dayOfMonth - 0.5) / daysInMonth;
                xNorm = layout.startX + (dayProgress * layout.width);
            } else {
                const dateRange = stats.maxDate - stats.minDate || 1;
                xNorm = (video.publishedAtTimestamp - stats.minDate) / dateRange;
            }

            let yNorm: number;
            let sizeRatio: number;

            const isSingleValue = Math.abs(stats.maxViews - stats.minViews) < 0.001;

            if (isSingleValue) {
                yNorm = 0.5; // Center vertically
                sizeRatio = 0.5; // Default to mid-size for single value
            } else {
                switch (scalingMode) {
                    case 'linear':
                        yNorm = 1 - (video.viewCount - stats.minViews) / viewRangeLinear;
                        sizeRatio = (video.viewCount - stats.minViews) / viewRangeLinear;
                        break;
                    case 'log':
                        const viewLog = Math.log(Math.max(1, video.viewCount));
                        const minLog = Math.log(Math.max(1, stats.minViews));
                        yNorm = 1 - (viewLog - minLog) / viewRangeLog;
                        sizeRatio = (viewLog - minLog) / viewRangeLog;
                        break;
                    case 'sqrt':
                        const viewSqrt = Math.sqrt(video.viewCount);
                        const minSqrt = Math.sqrt(stats.minViews);
                        yNorm = 1 - (viewSqrt - minSqrt) / viewRangeSqrt;
                        sizeRatio = (viewSqrt - minSqrt) / viewRangeSqrt;
                        break;
                    case 'percentile':
                        const percentileRank = rankMap.get(video.id) ?? 0.5;
                        yNorm = 1 - percentileRank;
                        sizeRatio = percentileRank;
                        break;
                    default:
                        yNorm = 0.5;
                        sizeRatio = 0.5;
                }
            }

            // Squash Logic
            // spread is already effectiveVerticalSpread derived above
            const effectiveYNorm = 0.5 + (yNorm - 0.5) * spread;

            const baseSize = MIN_THUMBNAIL_SIZE + sizeRatio * (BASE_THUMBNAIL_SIZE - MIN_THUMBNAIL_SIZE);
            const radius = baseSize / 2;

            // Dynamic Radius Position
            // y = Radius + yNorm * (WorldHeight - Diameter)
            const expandedY = radius + effectiveYNorm * (dynamicWorldHeight - baseSize);

            // Return normalized Y relative to dynamicWorldHeight
            return { video, xNorm, yNorm: expandedY / dynamicWorldHeight, baseSize };
        });

        positions.sort((a, b) => b.baseSize - a.baseSize);
        return positions;
    }, [videos, stats, scalingMode, monthLayouts, verticalSpread, dynamicWorldHeight]);

    // Percentile Helper
    const getPercentileGroup = useMemo(() => {
        // If percentileMap is provided, use it directly (O(1))
        if (percentileMap) {
            return (videoId: string): string | undefined => {
                return percentileMap.get(videoId);
            };
        }

        if (videos.length === 0) return () => undefined;
        const sortedByViews = [...videos].sort((a, b) => b.viewCount - a.viewCount);
        const rankMap = new Map<string, number>();
        sortedByViews.forEach((v, i) => {
            const percentile = (i / videos.length) * 100;
            rankMap.set(v.id, percentile);
        });
        return (videoId: string): string | undefined => {
            const percentile = rankMap.get(videoId);
            if (percentile === undefined) return undefined;
            if (percentile <= 1) return 'Top 1%';
            if (percentile <= 5) return 'Top 5%';
            if (percentile <= 20) return 'Top 20%';
            if (percentile <= 80) return 'Middle 60%';
            return 'Bottom 20%';
        };
    }, [videos, percentileMap]);

    return {
        videoPositions,
        getPercentileGroup
    };
};
