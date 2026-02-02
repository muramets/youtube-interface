import { useMemo, useRef, useCallback, useEffect } from 'react';
import type { TrendVideo, MonthRegion, YearMarker, TimelineStats, MonthLayout } from '../../../../core/types/trends';
import { useFrozenValue } from './useFrozenValue';

// Helper: Days in month
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

interface UseTimelineStructureProps {
    videos: TrendVideo[];
    /** Full set of videos for the current context (used for consistent density) */
    allVideos?: TrendVideo[];
    timeLinearity?: number;
    structureVersion?: number;
    stats?: TimelineStats;
    isFrozen?: boolean;
}

export const useTimelineStructure = ({
    videos,
    allVideos = [],
    timeLinearity = 1.0, // Default to Density (1.0)
    structureVersion = 0, // Version to force structure recalculation
    stats: forcedStatsOverride, // Optional forced stats
    isFrozen = false // Strict freeze flag
}: UseTimelineStructureProps) => {

    const densitySourceVideos = allVideos.length > 0 ? allVideos : videos;

    // Trace initialization
    const hasInitializedRef = useRef(false);

    useEffect(() => {
        if (densitySourceVideos.length > 0) {
            hasInitializedRef.current = true;
        }
    }, [densitySourceVideos.length]);

    // Custom update logic for strict freezing
    const shouldStrictUpdate = useCallback((prev: { value: unknown, version: number, dependencies: unknown[] }, next: { value: unknown, version: number, dependencies: unknown[] }) => {
        // 1. Version Change triggers update (Always)
        if (prev.version !== next.version) return true;

        // 2. Check dependencies FIRST
        const prevDeps = prev.dependencies;
        const nextDeps = next.dependencies;
        if (prevDeps.length !== nextDeps.length) return true;
        for (let i = 0; i < prevDeps.length; i++) {
            if (prevDeps[i] !== nextDeps[i]) return true;
        }

        // 3. If strictly frozen and already initialized, reject non-dependency updates
        if (isFrozen && hasInitializedRef.current) return false;

        return false;
    }, [isFrozen]);

    // 1. Calculate Stats (Memoized)
    const currentStats = useMemo((): TimelineStats => {
        if (videos.length === 0) return { minViews: 0, maxViews: 1, minDate: 0, maxDate: 0 };
        const views = videos.map(v => v.viewCount);
        const validDates = videos
            .map(v => v.publishedAtTimestamp)
            .filter(ts => typeof ts === 'number' && !isNaN(ts));

        if (validDates.length === 0) {
            return { minViews: 0, maxViews: 1, minDate: 0, maxDate: 0 };
        }

        const buffer = 1000 * 60 * 60 * 12;
        return {
            minViews: Math.max(1, Math.min(...views)),
            maxViews: Math.max(1, Math.max(...views)),
            minDate: Math.min(...validDates) - buffer,
            maxDate: Math.max(...validDates) + buffer
        };
    }, [videos]);

    // Use forced stats if provided, otherwise local stats
    const calculatedEffectiveStats = forcedStatsOverride || currentStats;

    // Freeze Stats
    // NOTE: We depend on `videos.length > 0` (Video Presence) rather than `videos` (Video Content).
    // This allows `structureVersion` (controlled by useTimelineAutoUpdate) to be the sole
    // arbiter of WHEN to update the structure, supporting the "Manual Update" workflow.
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
        densitySourceVideos.forEach(v => {
            const d = new Date(v.publishedAtTimestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return { counts, dynamicLinearPixelsPerDay };
    }, [densitySourceVideos]);

    // ============================================================
    // SINGLE SOURCE OF TRUTH: Timeline Date Range
    // Both worldWidth and monthLayouts use this shared calculation
    // ============================================================
    const timelineRange = useMemo(() => {
        // Use the actual min date (with buffer removed) to determine the starting month
        // The buffer is 12 hours, so we add it back to get the real video date
        const BUFFER_MS = 1000 * 60 * 60 * 12;
        const actualMinDate = new Date(effectiveStats.minDate + BUFFER_MS);

        // Start from the 1st of the month containing the first video
        const startDate = new Date(actualMinDate.getFullYear(), actualMinDate.getMonth(), 1);

        // End exactly at the day of the last video (not rounded up to month end)
        // Also account for the buffer on maxDate
        const actualMaxDate = new Date(effectiveStats.maxDate - BUFFER_MS);
        const lastVideoDay = actualMaxDate.getDate();
        const lastVideoDaysInMonth = getDaysInMonth(actualMaxDate.getFullYear(), actualMaxDate.getMonth());

        // Calculate clip factor for the last month (how much of the month to show)
        // e.g., if last video is on day 5 of 31, clipFactor = 5/31 ≈ 0.16
        const lastMonthClipFactor = (lastVideoDay + 0.5) / lastVideoDaysInMonth; // +0.5 to include the full day

        // For the loop condition, we still need to include the last month
        const safeEndDate = new Date(actualMaxDate.getFullYear(), actualMaxDate.getMonth() + 1, 1);

        return {
            startDate,
            endDate: safeEndDate,
            lastMonthKey: `${actualMaxDate.getFullYear()}-${actualMaxDate.getMonth()}`,
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

        const grid: Array<{
            year: number;
            month: number;
            monthKey: string;
            label: string;
            count: number;
            linearWidth: number;
            densityWidth: number;
            startTs: number;
            endTs: number;
            daysInMonth: number;
            isLastMonth: boolean;
            clipFactor: number;
        }> = [];
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

            // CORRECT: Apply clip factor ONLY to linear (time) component.
            // Density component (content) handles its own "size" by count of items.
            // If we clip density, we squeeze videos into tiny space.
            const effectiveLinearWidth = node.linearWidth * node.clipFactor;

            // For Density: Use FULL width. Do NOT clip. 
            // The content is the content. It needs X pixels. It shouldn't be cut off.
            const effectiveDensityWidth = node.densityWidth;

            // Interpolate
            const absWidth = effectiveLinearWidth + (effectiveDensityWidth - effectiveLinearWidth) * timeLinearity;

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
