import { useMemo, useRef } from 'react';
import type { TrendVideo, MonthRegion, YearMarker } from '../../../../types/trends';

// Constants
// Constants
const BASE_THUMBNAIL_SIZE = 200;
const MIN_THUMBNAIL_SIZE = 40;


interface UseTimelineDataProps {
    videos: TrendVideo[];
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile';
    amplifierLevel?: number;
    dynamicWorldHeight: number;
}

export interface VideoPosition {
    video: TrendVideo;
    xNorm: number;
    yNorm: number;
    baseSize: number;
}

export const useTimelineStructure = ({
    videos,
    timeLinearity = 1.0 // Default to Density (1.0)
}: { videos: TrendVideo[], timeLinearity?: number }) => {

    // Helper: Days in month
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

    // Calculate world width from videos (used for initial layout)
    const calculatedWorldWidth = useMemo(() => {
        if (videos.length === 0) return 2000;

        const counts = new Map<string, number>();
        let maxCount = 0;

        videos.forEach(v => {
            const d = new Date(v.publishedAtTimestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            const newCount = (counts.get(key) || 0) + 1;
            counts.set(key, newCount);
            maxCount = Math.max(maxCount, newCount);
        });

        // DENSITY-BASED WIDTH (Previously "Compact" / "Spacious")
        // We now standardize on the "Spacious" multiplier (80px) as the default density width.
        const VIDEO_DENSITY_MULTIPLIER = 80;

        // DYNAMIC LINEAR SCALE
        // Ensure "Linear" mode (0%) is at least as wide as the busiest month in "Density" mode.
        // Busiest Density Width ~= maxCount * 80px
        // Required Linear PPD ~= (maxCount * 80px) / 30days
        // Min PPD = 40px
        const busyMonthWidth = maxCount * VIDEO_DENSITY_MULTIPLIER;
        const dynamicLinearPixelsPerDay = Math.max(40, busyMonthWidth / 30);

        let totalWidth = 0;
        const start = new Date(Math.min(...videos.map(v => v.publishedAtTimestamp)));
        const end = new Date(Math.max(...videos.map(v => v.publishedAtTimestamp)));
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

            // 2. Linear Width (Time-based)
            const daysInMonth = getDaysInMonth(year, month);
            const linearWidth = daysInMonth * dynamicLinearPixelsPerDay;

            // 3. Interpolate
            // timeLinearity: 1 = Density, 0 = Linear
            const width = linearWidth + (densityWidth - linearWidth) * timeLinearity;

            totalWidth += width;
            current.setMonth(current.getMonth() + 1);
        }

        return Math.max(2000, totalWidth);
    }, [videos, timeLinearity]); // layoutMode dependency removed

    const frozenWorldWidthRef = useRef<number | null>(null);

    // Invalidate world width if timeLinearity changes
    const prevWidthLinearityRef = useRef(timeLinearity);

    if (prevWidthLinearityRef.current !== timeLinearity) {
        frozenWorldWidthRef.current = null;
        prevWidthLinearityRef.current = timeLinearity;
    }

    if (frozenWorldWidthRef.current === null && videos.length > 0) {
        frozenWorldWidthRef.current = calculatedWorldWidth;
    }
    const worldWidth = frozenWorldWidthRef.current ?? calculatedWorldWidth;

    // Calculate view stats for scaling
    const calculatedStats = useMemo(() => {
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

    const frozenStatsRef = useRef<typeof calculatedStats | null>(null);
    if (frozenStatsRef.current === null && videos.length > 0) {
        frozenStatsRef.current = calculatedStats;
    }
    const stats = frozenStatsRef.current ?? calculatedStats;

    // Calculate density-based month layouts
    const calculatedMonthLayouts = useMemo(() => {
        if (videos.length === 0) return [];
        const counts = new Map<string, number>();
        let maxCount = 0;

        videos.forEach(v => {
            const d = new Date(v.publishedAtTimestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            const newCount = (counts.get(key) || 0) + 1;
            counts.set(key, newCount);
            maxCount = Math.max(maxCount, newCount);
        });

        // STANDARD CONSTANTS
        const VIDEO_DENSITY_MULTIPLIER = 80;
        const busyMonthWidth = maxCount * VIDEO_DENSITY_MULTIPLIER;
        const dynamicLinearPixelsPerDay = Math.max(40, busyMonthWidth / 30);

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
            const densityWidth = Math.max(200, count * VIDEO_DENSITY_MULTIPLIER);

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
    }, [videos, stats, timeLinearity]); // layoutMode removed

    const frozenMonthLayoutsRef = useRef<typeof calculatedMonthLayouts | null>(null);

    // Invalidate frozen ref if timeLinearity changes
    const prevTimeLinearityRef = useRef(timeLinearity);

    if (prevTimeLinearityRef.current !== timeLinearity) {
        frozenMonthLayoutsRef.current = null;
        prevTimeLinearityRef.current = timeLinearity;
    }

    if (frozenMonthLayoutsRef.current === null && calculatedMonthLayouts.length > 0) {
        frozenMonthLayoutsRef.current = calculatedMonthLayouts;
    }
    const monthLayouts = frozenMonthLayoutsRef.current ?? calculatedMonthLayouts;

    // Derived regions
    const monthRegions: MonthRegion[] = useMemo(() => {
        if (videos.length === 0 || monthLayouts.length === 0) return [];
        let prevYear: number | null = null;
        return monthLayouts.map(layout => {
            const isFirstOfYear = layout.year !== prevYear;
            prevYear = layout.year;
            return {
                month: layout.label,
                year: layout.year,
                startX: layout.startX,
                endX: layout.endX,
                center: (layout.startX + layout.endX) / 2,
                daysInMonth: getDaysInMonth(layout.year, layout.month),
                isFirstOfYear
            };
        });
    }, [monthLayouts, videos.length]);

    const yearMarkers: YearMarker[] = useMemo(() => {
        const years: YearMarker[] = [];
        let currentYear: number | null = null;
        let yearStart = 0;
        let yearEnd = 0;

        monthRegions.forEach((region, i) => {
            if (region.year !== currentYear) {
                if (currentYear !== null) {
                    years.push({ year: currentYear, startX: yearStart, endX: yearEnd });
                }
                currentYear = region.year;
                yearStart = region.startX;
            }
            yearEnd = region.endX;
            if (i === monthRegions.length - 1 && currentYear !== null) {
                years.push({ year: currentYear, startX: yearStart, endX: yearEnd });
            }
        });
        return years;
    }, [monthRegions]);

    return {
        worldWidth,
        stats,
        monthLayouts,
        monthRegions,
        yearMarkers
    };
};

export const useTimelinePositions = ({
    videos,
    stats,
    monthLayouts,
    scalingMode,
    amplifierLevel,
    dynamicWorldHeight
}: {
    videos: TrendVideo[],
    stats: any,
    monthLayouts: any[],
    scalingMode: string,
    amplifierLevel?: number,
    dynamicWorldHeight: number
}) => {
    // Calculate video positions
    const videoPositions = useMemo(() => {
        const viewRangeLinear = stats.maxViews - stats.minViews || 1;
        const viewRangeLog = Math.log(stats.maxViews) - Math.log(stats.minViews) || 1;
        const viewRangeSqrt = Math.sqrt(stats.maxViews) - Math.sqrt(stats.minViews) || 1;

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
            const amp = amplifierLevel !== undefined ? amplifierLevel : 1.0;
            const effectiveYNorm = 0.5 + (yNorm - 0.5) * amp;

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
    }, [videos, stats, scalingMode, monthLayouts, amplifierLevel, dynamicWorldHeight]);

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

