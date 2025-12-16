import { useMemo, useRef } from 'react';
import type { TrendVideo, MonthRegion, YearMarker, TimelineStats } from '../../../../types/trends';

// Constants

const BASE_THUMBNAIL_SIZE = 200;
const MIN_THUMBNAIL_SIZE = 40;




export interface VideoPosition {
    video: TrendVideo;
    xNorm: number;
    yNorm: number;
    baseSize: number;
}

export const useTimelineStructure = ({
    videos,
    timeLinearity = 1.0, // Default to Density (1.0)
    structureVersion = 0 // Version to force structure recalculation
}: { videos: TrendVideo[], timeLinearity?: number, structureVersion?: number }) => {

    // Helper: Days in month
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

    // 1. Calculate View Stats (Moved first to support size-based width calculation)
    const currentStats = useMemo((): TimelineStats => {
        if (videos.length === 0) return { minViews: 0, maxViews: 1, minDate: Date.now(), maxDate: Date.now() };
        const views = videos.map(v => v.viewCount);
        const dates = videos.map(v => v.publishedAtTimestamp);
        const buffer = 1000 * 60 * 60 * 12;
        return {
            minViews: Math.max(1, Math.min(...views)),
            maxViews: Math.max(1, Math.max(...views)),
            minDate: Math.min(...dates) - buffer,
            maxDate: Math.max(...dates) + buffer
        };
    }, [videos]);

    // Freeze Stats
    const frozenStatsRef = useRef<{ version: number, value: typeof currentStats, wasEmpty: boolean } | null>(null);
    if (
        frozenStatsRef.current === null ||
        frozenStatsRef.current.version !== structureVersion ||
        (frozenStatsRef.current.wasEmpty && videos.length > 0) // Allow update if initializing
    ) {
        frozenStatsRef.current = {
            version: structureVersion,
            value: currentStats,
            wasEmpty: videos.length === 0
        };
    }
    const stats = frozenStatsRef.current.value;



    // 2. Calculate Density Stats (Shared Logic)
    const densityStats = useMemo(() => {
        if (videos.length === 0) return { counts: new Map<string, number>(), dynamicLinearPixelsPerDay: 40 };

        const counts = new Map<string, number>();
        const monthDetails = new Map<string, { count: number, totalSizeRatio: number }>();
        let maxCount = 0;
        let busiestMonthKey = '';

        const viewRangeLog = Math.log(stats.maxViews) - Math.log(stats.minViews) || 1;

        videos.forEach(v => {
            const d = new Date(v.publishedAtTimestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}`;

            // Heuristic size calculation (Log-based default)
            const viewLog = Math.log(Math.max(1, v.viewCount));
            const minLog = Math.log(Math.max(1, stats.minViews));
            const sizeRatio = (viewLog - minLog) / viewRangeLog;

            const current = monthDetails.get(key) || { count: 0, totalSizeRatio: 0 };
            current.count += 1;
            current.totalSizeRatio += sizeRatio;

            monthDetails.set(key, current);
            counts.set(key, current.count);

            if (current.count > maxCount) {
                maxCount = current.count;
                busiestMonthKey = key;
            }
        });

        // SMART LINEAR SCALE CALCULATION
        let dynamicLinearPixelsPerDay = 40; // Default fallback

        if (busiestMonthKey && maxCount > 0) {
            const details = monthDetails.get(busiestMonthKey);
            if (details) {
                const avgSizeRatio = details.totalSizeRatio / details.count;
                const avgThumbnailHeight = MIN_THUMBNAIL_SIZE + avgSizeRatio * (BASE_THUMBNAIL_SIZE - MIN_THUMBNAIL_SIZE);
                // Account for Aspect Ratio (16:9)
                const avgThumbnailWidth = avgThumbnailHeight * (16 / 9);
                // Calculate Required Width
                const requiredWidth = details.count * (avgThumbnailWidth * 0.9);
                // Provide specific linear PPD for this busy month
                dynamicLinearPixelsPerDay = Math.max(40, requiredWidth / 30);
            }
        }

        return { counts, dynamicLinearPixelsPerDay };
    }, [videos, stats]);

    // 3. Calculate World Width (Now size-aware)
    const currentWorldWidth = useMemo(() => {
        if (videos.length === 0) return 2000;

        const { counts, dynamicLinearPixelsPerDay } = densityStats;
        const VIDEO_DENSITY_MULTIPLIER = 80;

        let totalWidth = 0;
        const start = new Date(stats.minDate);
        const end = new Date(stats.maxDate);
        // Add buffer
        start.setMonth(start.getMonth() - 1);
        end.setMonth(end.getMonth() + 1);

        const current = new Date(start);
        current.setDate(1);

        while (current <= end) {
            const year = current.getFullYear();
            const month = current.getMonth();
            const key = `${year}-${month}`;
            const count = counts.get(key) || 0;

            // 1. Density Width (Count-based)
            const densityWidth = Math.max(200, count * VIDEO_DENSITY_MULTIPLIER);

            // 2. Linear Width (Time-based, Smart)
            const daysInMonth = getDaysInMonth(year, month);
            const linearWidth = daysInMonth * dynamicLinearPixelsPerDay;

            // 3. Interpolate
            const width = linearWidth + (densityWidth - linearWidth) * timeLinearity;

            totalWidth += width;
            current.setMonth(current.getMonth() + 1);
        }

        return Math.max(2000, totalWidth);
    }, [videos, timeLinearity, stats, densityStats]);

    // Freeze World Width
    const frozenWorldWidthRef = useRef<{ version: number, linearity: number, value: number, wasEmpty: boolean } | null>(null);

    // If version changed OR linearity changed OR first load OR initializing from empty
    if (
        frozenWorldWidthRef.current === null ||
        frozenWorldWidthRef.current.version !== structureVersion ||
        frozenWorldWidthRef.current.linearity !== timeLinearity ||
        (frozenWorldWidthRef.current.wasEmpty && videos.length > 0)
    ) {
        frozenWorldWidthRef.current = {
            version: structureVersion,
            linearity: timeLinearity,
            value: currentWorldWidth,
            wasEmpty: videos.length === 0
        };
    }
    const worldWidth = frozenWorldWidthRef.current.value;



    // 4. Calculate Layouts (using synchronized logic)
    const currentMonthLayouts = useMemo(() => {
        if (videos.length === 0) return [];

        const { counts, dynamicLinearPixelsPerDay } = densityStats;

        let current = new Date(stats.minDate);
        current.setDate(1);
        current.setHours(0, 0, 0, 0);

        const endDate = new Date(stats.maxDate);
        const safeEndDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);

        const layouts = [];
        let totalAbsWidth = 0;

        while (current < safeEndDate) {
            const year = current.getFullYear();
            const month = current.getMonth();
            const key = `${year}-${month}`;
            const count = counts.get(key) || 0;

            // 1. Density Width
            const densityWidth = Math.max(200, count * 80);

            // 2. Linear Width
            const daysInMonth = getDaysInMonth(year, month);
            const linearWidth = daysInMonth * dynamicLinearPixelsPerDay;

            // 3. Interpolate
            const absWidth = linearWidth + (densityWidth - linearWidth) * timeLinearity;

            const nextMonth = new Date(current);
            nextMonth.setMonth(current.getMonth() + 1);

            layouts.push({
                year,
                month,
                monthKey: key,
                label: current.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                count,
                startX: totalAbsWidth,
                endX: totalAbsWidth + absWidth,
                width: absWidth,
                startTs: current.getTime(),
                endTs: nextMonth.getTime()
            });

            totalAbsWidth += absWidth;
            current = nextMonth;
        }

        // Normalize
        return layouts.map(l => ({
            ...l,
            startX: l.startX / totalAbsWidth,
            endX: l.endX / totalAbsWidth,
            width: l.width / totalAbsWidth
        }));
    }, [videos, stats, timeLinearity, densityStats]);

    // Freeze Month Layouts
    const frozenLayoutsRef = useRef<{ version: number, linearity: number, value: typeof currentMonthLayouts, wasEmpty: boolean } | null>(null);
    if (
        frozenLayoutsRef.current === null ||
        frozenLayoutsRef.current.version !== structureVersion ||
        frozenLayoutsRef.current.linearity !== timeLinearity ||
        (frozenLayoutsRef.current.wasEmpty && videos.length > 0)
    ) {
        frozenLayoutsRef.current = {
            version: structureVersion,
            linearity: timeLinearity,
            value: currentMonthLayouts,
            wasEmpty: videos.length === 0
        };
    }
    const monthLayouts = frozenLayoutsRef.current.value;

    // Derived regions
    const monthRegions: MonthRegion[] = useMemo(() => {
        if (videos.length === 0 || monthLayouts.length === 0) return [];
        return monthLayouts.map(layout => { // Simplified
            return {
                month: layout.label,
                year: layout.year,
                startX: layout.startX,
                endX: layout.endX,
                center: (layout.startX + layout.endX) / 2,
                daysInMonth: getDaysInMonth(layout.year, layout.month),
                isFirstOfYear: false // Recalculated below properly or simplified
            };
        });
    }, [monthLayouts, videos.length]);

    // Fix isFirstOfYear logic from previous map
    const refinedMonthRegions = useMemo(() => {
        let prevYear: number | null = null;
        return monthRegions.map(m => {
            const isFirst = m.year !== prevYear;
            prevYear = m.year;
            return { ...m, isFirstOfYear: isFirst };
        });
    }, [monthRegions]);

    const yearMarkers: YearMarker[] = useMemo(() => {
        const years: YearMarker[] = [];
        let currentYear: number | null = null;
        let yearStart = 0;
        let yearEnd = 0;

        refinedMonthRegions.forEach((region, i) => {
            if (region.year !== currentYear) {
                if (currentYear !== null) {
                    years.push({ year: currentYear, startX: yearStart, endX: yearEnd });
                }
                currentYear = region.year;
                yearStart = region.startX;
            }
            yearEnd = region.endX;
            if (i === refinedMonthRegions.length - 1 && currentYear !== null) {
                years.push({ year: currentYear, startX: yearStart, endX: yearEnd });
            }
        });
        return years;
    }, [refinedMonthRegions]);

    return {
        worldWidth,
        stats: stats,
        monthLayouts,
        monthRegions: refinedMonthRegions,
        yearMarkers
    };
};
export interface UseTimelinePositionsProps {
    videos: TrendVideo[];
    stats: TimelineStats;
    monthLayouts: any[];
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile';
    verticalSpread?: number;
    dynamicWorldHeight: number;
}
export const useTimelinePositions = ({
    videos,
    stats,
    monthLayouts,
    scalingMode,
    verticalSpread,
    dynamicWorldHeight
}: UseTimelinePositionsProps) => {
    // Calculate video positions
    const videoPositions = useMemo(() => {
        if (!videos.length || !stats) return [];

        const { minViews, maxViews } = stats;
        const viewRangeLinear = maxViews - minViews || 1;
        const viewRangeLog = Math.log(maxViews) - Math.log(minViews) || 1;
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

            // X-AXIS
            let xNorm: number;
            if (layout) {
                const monthDuration = layout.endTs - layout.startTs;
                const offsetInMonth = video.publishedAtTimestamp - layout.startTs;
                const localProgress = Math.max(0, Math.min(1, offsetInMonth / monthDuration));
                xNorm = layout.startX + (localProgress * layout.width);
            } else {
                const dateRange = stats.maxDate - stats.minDate || 1;
                xNorm = (video.publishedAtTimestamp - stats.minDate) / dateRange;
            }

            let yNorm: number;
            let sizeRatio: number;

            switch (scalingMode) {
                case 'linear':
                    yNorm = 1 - (video.viewCount - stats.minViews) / viewRangeLinear;
                    sizeRatio = (video.viewCount - stats.minViews) / (stats.maxViews - stats.minViews);
                    break;
                case 'log':
                    const viewLog = Math.log(Math.max(1, video.viewCount));
                    const minLog = Math.log(Math.max(1, stats.minViews));
                    const maxLog = Math.log(Math.max(1, stats.maxViews));
                    yNorm = 1 - (viewLog - minLog) / viewRangeLog;
                    sizeRatio = (viewLog - minLog) / (maxLog - minLog);
                    break;
                case 'sqrt':
                    const viewSqrt = Math.sqrt(video.viewCount);
                    const minSqrt = Math.sqrt(stats.minViews);
                    const maxSqrt = Math.sqrt(stats.maxViews);
                    yNorm = 1 - (viewSqrt - minSqrt) / viewRangeSqrt;
                    sizeRatio = (viewSqrt - minSqrt) / (maxSqrt - minSqrt);
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
    }, [videos]);

    return {
        videoPositions,
        getPercentileGroup
    };
};

