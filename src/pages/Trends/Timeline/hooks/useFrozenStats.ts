import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { TimelineStats, TrendVideo } from '../../../../core/types/trends';

interface ChannelBasic {
    id: string;
}

interface UseFrozenStatsProps {
    /** All videos for current context (Global mode stats source) */
    allVideos: TrendVideo[];
    /** Filtered videos (Filtered mode stats source, always used for display) */
    filteredVideos: TrendVideo[];
    channels: ChannelBasic[];
    selectedChannelId: string | null;
    filterMode: 'global' | 'filtered';
    /** True when UNASSIGNED filter is active */
    hasUnassignedFilter?: boolean;
    /** Current combined filter hash (to detect all filter changes) */
    filterHash?: string;
}

/** Computes min/max stats from a set of videos */
const computeStats = (videos: TrendVideo[]): TimelineStats | undefined => {
    if (videos.length === 0) return undefined;
    const viewCounts = videos.map(v => v.viewCount);
    const dates = videos.map(v => v.publishedAtTimestamp);
    const buffer = 1000 * 60 * 60 * 12; // 12h buffer
    return {
        minViews: Math.max(1, Math.min(...viewCounts)),
        maxViews: Math.max(1, Math.max(...viewCounts)),
        minDate: Math.min(...dates) - buffer,
        maxDate: Math.max(...dates) + buffer
    };
};

/**
 * Manages "frozen" timeline stats that only update on explicit triggers:
 * - Initial page load
 * - Z key / revert
 * - Channel add/remove
 * - Filter mode change
 * - Filter hash change (applying any filter)
 * 
 * Also stays frozen when UNASSIGNED filter is active, so videos can be
 * assigned to niches without the timeline jumping.
 */
export const useFrozenStats = ({
    allVideos,
    filteredVideos,
    channels,
    selectedChannelId,
    filterMode,
    hasUnassignedFilter = false,
    filterHash
}: UseFrozenStatsProps) => {
    const [frozenStats, setFrozenStats] = useState<TimelineStats | undefined>(undefined);
    const [, setStatsVersion] = useState(0);

    const channelIdsKey = useMemo(() => channels.map(c => c.id).sort().join(','), [channels]);

    const prevChannelIdsKeyRef = useRef(channelIdsKey);
    const prevFilterModeRef = useRef(filterMode);
    const prevFilterHashRef = useRef(filterHash);
    const prevAllCountRef = useRef(allVideos.length);
    const skipAutoFitRef = useRef(false);
    const skipNextFreezeRef = useRef(false);

    // Channel switch reset (derived state pattern)
    // When channel changes, we reset frozen stats immediately (during render)
    // This is a valid pattern if we also update state to trigger re-render
    const [prevChannelForReset, setPrevChannelForReset] = useState(selectedChannelId);
    if (selectedChannelId !== prevChannelForReset) {
        setPrevChannelForReset(selectedChannelId);
        setFrozenStats(undefined);
        // Skip first freeze when switching to main Trends (first render has stale data)
        if (selectedChannelId === null) {
            // eslint-disable-next-line react-hooks/refs
            skipNextFreezeRef.current = true;
        }
    }

    // Stats source selection based on context
    // Any filter (niche, dates, views) in "Filtered" mode should cause timeline to fit filtered set.
    // In "Global" mode, we always use the full set (allVideos, which is already scoped to selected channel).
    const statsSourceVideos = useMemo(() => {
        return filterMode === 'global' ? allVideos : filteredVideos;
    }, [filterMode, allVideos, filteredVideos]);

    const currentStats = useMemo(() => computeStats(statsSourceVideos), [statsSourceVideos]);

    // Auto-refresh logic (Frozen Stats Management)
    useEffect(() => {
        const channelListChanged = prevChannelIdsKeyRef.current !== channelIdsKey;
        prevChannelIdsKeyRef.current = channelIdsKey;

        const filterModeChanged = prevFilterModeRef.current !== filterMode;
        prevFilterModeRef.current = filterMode;

        const filterHashChanged = prevFilterHashRef.current !== filterHash;
        prevFilterHashRef.current = filterHash;

        prevAllCountRef.current = allVideos.length;

        // Auto-refresh frozen stats if:
        // 1. No stats yet
        // 2. Fundamental context changed (channel list, filter mode)
        // 3. ANY filter changed (hash changed - dates, views, niches)
        const shouldAutoRefresh =
            !frozenStats ||
            channelListChanged ||
            filterModeChanged ||
            filterHashChanged;

        const isFilterModeToggleOnly = filterModeChanged && !channelListChanged && !filterHashChanged;

        if (shouldAutoRefresh) {
            if (skipNextFreezeRef.current) {
                skipNextFreezeRef.current = false;
            } else {
                setFrozenStats(currentStats);
                setStatsVersion(v => v + 1);
            }
        }

        skipAutoFitRef.current = isFilterModeToggleOnly;
    }, [currentStats, channelIdsKey, filterMode, filterHash, allVideos.length, frozenStats]);

    // Manual refresh callback (Z key)
    const refreshStats = useCallback(() => {
        setFrozenStats(currentStats);
        skipAutoFitRef.current = false;
        setStatsVersion(v => v + 1);
    }, [currentStats]);

    // Explicit flag: filtered mode should auto-fit, global mode uses frozen stats
    // Exception: UNASSIGNED filter should stay frozen (видео пропадают при assign, мир стабилен)
    const shouldAutoFit = filterMode !== 'global' && !hasUnassignedFilter;

    return useMemo(() => ({
        currentStats,
        frozenStats,
        shouldAutoFit,
        refreshStats,
        skipAutoFitRef
    }), [currentStats, shouldAutoFit, refreshStats, frozenStats]);
};
