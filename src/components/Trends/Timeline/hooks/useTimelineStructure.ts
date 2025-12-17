import { useMemo, useRef, useCallback } from 'react';
import type { TrendVideo, MonthRegion, YearMarker, TimelineStats, MonthLayout } from '../../../../types/trends';
import { useFrozenValue } from './useFrozenValue';

// Helper: Days in month
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

interface UseTimelineStructureProps {
    videos: TrendVideo[];
    timeLinearity?: number;
    structureVersion?: number;
    stats?: TimelineStats;
    isFrozen?: boolean;
}

export const useTimelineStructure = ({
    videos,
    timeLinearity = 1.0, // Default to Density (1.0)
    structureVersion = 0, // Version to force structure recalculation
    stats: forcedStatsOverride, // Optional forced stats
    isFrozen = false // Strict freeze flag
}: UseTimelineStructureProps) => {

    // Trace initialization
    const hasInitializedRef = useRef(false);
    if (videos.length > 0) {
        hasInitializedRef.current = true;
    }

    // Custom update logic for strict freezing
    const shouldStrictUpdate = useCallback((prev: any, next: any) => {
        // 1. Version Change triggers update (Always)
        if (prev.version !== next.version) return true;

        // 2. Check dependencies FIRST - certain changes like timeLinearity should always update
        const prevDeps = prev.dependencies;
        const nextDeps = next.dependencies;
        if (prevDeps.length !== nextDeps.length) return true;
        for (let i = 0; i < prevDeps.length; i++) {
            if (prevDeps[i] !== nextDeps[i]) return true;
        }

        // 3. If strictly frozen and already initialized, reject non-dependency updates
        // (This check comes AFTER dependency check to ensure slider controls work)
        if (isFrozen && hasInitializedRef.current) return false;

        return false;
    }, [isFrozen]);

    // 1. Calculate Stats (Memoized)
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

    // Use forced stats if provided, otherwise local stats
    const calculatedEffectiveStats = forcedStatsOverride || currentStats;

    // Freeze Stats
    const effectiveStats = useFrozenValue({
        value: calculatedEffectiveStats,
        version: structureVersion,
        dependencies: [videos.length > 0],
        shouldUpdate: shouldStrictUpdate
    });

    // 2. Density Analysis (Independent of time linearity)
    const densityStats = useMemo(() => {
        const dynamicLinearPixelsPerDay = 120;
        const counts = new Map<string, number>();
        videos.forEach(v => {
            const d = new Date(v.publishedAtTimestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return { counts, dynamicLinearPixelsPerDay };
    }, [videos, effectiveStats]);

    // ============================================================
    // SINGLE SOURCE OF TRUTH: Timeline Date Range
    // Both worldWidth and monthLayouts use this shared calculation
    // ============================================================
    const timelineRange = useMemo(() => {
        const startDate = new Date(effectiveStats.minDate);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        // No buffer - start from the month of the first video

        const endDate = new Date(effectiveStats.maxDate);
        // Round up to the end of the current month (first day of next month)
        // This ensures the month containing the last video is fully rendered
        const safeEndDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);

        return { startDate, endDate: safeEndDate };
    }, [effectiveStats]);

    // 3. Calculate World Width (uses shared timelineRange)
    const currentWorldWidth = useMemo(() => {
        if (videos.length === 0) return 2000;

        const { counts, dynamicLinearPixelsPerDay } = densityStats;
        const VIDEO_DENSITY_MULTIPLIER = 80;

        let totalWidth = 0;
        const current = new Date(timelineRange.startDate);

        // Safety break
        let loops = 0;
        while (current < timelineRange.endDate && loops < 1000) {
            const year = current.getFullYear();
            const month = current.getMonth();
            const key = `${year}-${month}`;
            const count = counts.get(key) || 0;

            const densityWidth = Math.max(200, count * VIDEO_DENSITY_MULTIPLIER);
            const daysInMonth = getDaysInMonth(year, month);
            const linearWidth = daysInMonth * dynamicLinearPixelsPerDay;
            const width = linearWidth + (densityWidth - linearWidth) * timeLinearity;

            totalWidth += width;
            current.setMonth(current.getMonth() + 1);
            loops++;
        }

        return Math.max(2000, totalWidth);
    }, [videos, timeLinearity, densityStats, timelineRange]);

    // Freeze World Width
    const worldWidth = useFrozenValue({
        value: currentWorldWidth,
        version: structureVersion,
        dependencies: [timeLinearity, videos.length > 0],
        shouldUpdate: shouldStrictUpdate
    });

    // 4. Calculate Layouts (uses shared timelineRange)
    const currentMonthLayouts = useMemo(() => {
        if (videos.length === 0 && !forcedStatsOverride) return [];

        const { counts, dynamicLinearPixelsPerDay } = densityStats;
        const current = new Date(timelineRange.startDate);

        const layouts: any[] = [];
        let totalAbsWidth = 0;
        let loops = 0;

        while (current < timelineRange.endDate && loops < 1000) {
            const year = current.getFullYear();
            const month = current.getMonth();
            const key = `${year}-${month}`;
            const count = counts.get(key) || 0;

            const densityWidth = Math.max(200, count * 80);
            const daysInMonth = getDaysInMonth(year, month);
            const linearWidth = daysInMonth * dynamicLinearPixelsPerDay;
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
            current.setMonth(current.getMonth() + 1);
            loops++;
        }

        return layouts.map(l => ({
            ...l,
            startX: l.startX / Math.max(1, totalAbsWidth),
            endX: l.endX / Math.max(1, totalAbsWidth),
            width: l.width / Math.max(1, totalAbsWidth)
        })) as MonthLayout[];
    }, [videos, timeLinearity, densityStats, timelineRange, forcedStatsOverride]);

    // Freeze Layouts
    const monthLayouts = useFrozenValue({
        value: currentMonthLayouts,
        version: structureVersion,
        dependencies: [timeLinearity, videos.length > 0],
        shouldUpdate: shouldStrictUpdate
    });

    // Derived regions
    const monthRegions: MonthRegion[] = useMemo(() => {
        if (monthLayouts.length === 0) return [];
        let prevYear: number | null = null;
        return monthLayouts.map(layout => {
            const isFirst = layout.year !== prevYear;
            prevYear = layout.year;
            return {
                month: layout.label,
                year: layout.year,
                startX: layout.startX,
                endX: layout.endX,
                center: (layout.startX + layout.endX) / 2,
                daysInMonth: getDaysInMonth(layout.year, layout.month),
                isFirstOfYear: isFirst
            };
        });
    }, [monthLayouts]);

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
        stats: effectiveStats,
        monthLayouts,
        monthRegions,
        yearMarkers
    };
};
