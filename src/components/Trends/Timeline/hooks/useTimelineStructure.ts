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

        // End exactly at the day of the last video (not rounded up to month end)
        const endDate = new Date(effectiveStats.maxDate);
        const lastVideoDay = endDate.getDate();
        const lastVideoDaysInMonth = getDaysInMonth(endDate.getFullYear(), endDate.getMonth());

        // Calculate clip factor for the last month (how much of the month to show)
        // e.g., if last video is on day 5 of 31, clipFactor = 5/31 ≈ 0.16
        const lastMonthClipFactor = (lastVideoDay + 0.5) / lastVideoDaysInMonth; // +0.5 to include the full day

        // For the loop condition, we still need to include the last month
        const safeEndDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);

        return {
            startDate,
            endDate: safeEndDate,
            lastMonthKey: `${endDate.getFullYear()}-${endDate.getMonth()}`,
            lastMonthClipFactor
        };
    }, [effectiveStats]);

    // ============================================================
    // PHASE 1: Base Grid Calculation (Static - No timeLinearity dependency)
    // ============================================================
    // This part does all the heavy lifting: Date operations, counting, etc.
    // It only re-runs if videos or strict dependencies change, NOT when slider moves.
    const baseTimelineGrid = useMemo(() => {
        if (videos.length === 0 && !forcedStatsOverride) return [];

        const { counts, dynamicLinearPixelsPerDay } = densityStats;
        const VIDEO_DENSITY_MULTIPLIER = 80;

        const grid: any[] = [];
        const current = new Date(timelineRange.startDate);
        let loops = 0;

        while (current < timelineRange.endDate && loops < 1000) {
            const year = current.getFullYear();
            const month = current.getMonth();
            const key = `${year}-${month}`;
            const count = counts.get(key) || 0;

            const daysInMonth = getDaysInMonth(year, month);
            const linearWidth = daysInMonth * dynamicLinearPixelsPerDay;
            const densityWidth = Math.max(200, count * VIDEO_DENSITY_MULTIPLIER);

            const isLastMonth = key === timelineRange.lastMonthKey;

            // Calculate timestamps locally to avoid Date usage later
            const nextMonth = new Date(current);
            nextMonth.setMonth(current.getMonth() + 1);

            grid.push({
                year,
                month,
                monthKey: key,
                label: current.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                count,
                linearWidth,
                densityWidth,
                startTs: current.getTime(),
                endTs: isLastMonth ? new Date(effectiveStats.maxDate).getTime() : nextMonth.getTime(),
                daysInMonth: isLastMonth
                    ? Math.ceil(daysInMonth * timelineRange.lastMonthClipFactor)
                    : daysInMonth,
                isLastMonth,
                clipFactor: isLastMonth ? timelineRange.lastMonthClipFactor : 1.0
            });

            current.setMonth(current.getMonth() + 1);
            loops++;
        }

        return grid;
    }, [videos, effectiveStats, densityStats, timelineRange, forcedStatsOverride]);

    // ============================================================
    // PHASE 2: Dynamic Interpolation (Light - Depends on timeLinearity)
    // ============================================================
    // This part runs every frame during animation. It MUST be fast.
    // No Date objects, no heavy loops, just basic math.
    const { currentWorldWidth, currentMonthLayouts } = useMemo(() => {
        if (baseTimelineGrid.length === 0) {
            return { currentWorldWidth: 2000, currentMonthLayouts: [] };
        }

        const layouts: MonthLayout[] = [];
        let totalAbsWidth = 0;

        // Fast loop over pre-calculated grid
        for (let i = 0; i < baseTimelineGrid.length; i++) {
            const node = baseTimelineGrid[i];

            // MATH ONLY: Linear Interpolation
            // width = linear + (density - linear) * t
            let absWidth = node.linearWidth + (node.densityWidth - node.linearWidth) * timeLinearity;

            // Apply clip factor for last month
            if (node.isLastMonth) {
                absWidth *= node.clipFactor;
            }

            layouts.push({
                year: node.year,
                month: node.month,
                monthKey: node.monthKey,
                label: node.label,
                count: node.count,
                startTs: node.startTs,
                endTs: node.endTs,
                daysInMonth: node.daysInMonth,
                // Temporary absolute positions
                startX: totalAbsWidth,
                endX: totalAbsWidth + absWidth,
                width: absWidth
            });

            totalAbsWidth += absWidth;
        }

        const finalWorldWidth = Math.max(2000, totalAbsWidth);

        // Normalize positions (0-1)
        const normalizedLayouts = layouts.map(l => ({
            ...l,
            startX: l.startX / Math.max(1, totalAbsWidth),
            endX: l.endX / Math.max(1, totalAbsWidth),
            width: l.width / Math.max(1, totalAbsWidth)
        }));

        return {
            currentWorldWidth: finalWorldWidth,
            currentMonthLayouts: normalizedLayouts
        };

    }, [baseTimelineGrid, timeLinearity]);

    // Freeze World Width
    const worldWidth = useFrozenValue({
        value: currentWorldWidth,
        version: structureVersion,
        dependencies: [timeLinearity, videos.length > 0],
        shouldUpdate: shouldStrictUpdate
    });

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
