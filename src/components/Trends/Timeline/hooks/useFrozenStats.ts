import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { TimelineStats, TrendVideo } from '../../../../types/trends';

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
    activeNicheIds: string[];
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
 * - Niche selection change
 */
export const useFrozenStats = ({
    allVideos,
    filteredVideos,
    channels,
    selectedChannelId,
    filterMode,
    activeNicheIds
}: UseFrozenStatsProps) => {
    const frozenStatsRef = useRef<TimelineStats | undefined>(undefined);
    const [statsVersion, setStatsVersion] = useState(0);

    const hasNicheFilter = activeNicheIds.length > 0;
    const nicheIdsKey = useMemo(() => activeNicheIds.sort().join(','), [activeNicheIds]);
    const channelIdsKey = useMemo(() => channels.map(c => c.id).sort().join(','), [channels]);

    const prevChannelIdsKeyRef = useRef(channelIdsKey);
    const prevFilterModeRef = useRef(filterMode);
    const prevNicheIdsKeyRef = useRef(nicheIdsKey);
    const prevAllCountRef = useRef(allVideos.length);
    const skipAutoFitRef = useRef(false);
    const skipNextFreezeRef = useRef(false);

    // Channel switch reset (derived state pattern)
    const [prevChannelForReset, setPrevChannelForReset] = useState(selectedChannelId);
    if (selectedChannelId !== prevChannelForReset) {
        setPrevChannelForReset(selectedChannelId);
        frozenStatsRef.current = undefined;
        // Skip first freeze when switching to main Trends (first render has stale data)
        if (selectedChannelId === null) {
            skipNextFreezeRef.current = true;
        }
    }

    // Stats source selection based on context
    const statsSourceVideos = useMemo(() => {
        // Main Trends page: use allVideos (visible channels)
        if (!selectedChannelId) {
            return allVideos;
        }
        // Channel view without niche: always global
        if (!hasNicheFilter) {
            return allVideos;
        }
        // Channel view with niche: respect filterMode
        return filterMode === 'global' ? allVideos : filteredVideos;
    }, [selectedChannelId, hasNicheFilter, filterMode, allVideos, filteredVideos]);

    const currentStats = useMemo(() => computeStats(statsSourceVideos), [statsSourceVideos]);

    // Auto-refresh logic
    useEffect(() => {
        const channelListChanged = prevChannelIdsKeyRef.current !== channelIdsKey;
        prevChannelIdsKeyRef.current = channelIdsKey;

        const filterModeChanged = prevFilterModeRef.current !== filterMode;
        prevFilterModeRef.current = filterMode;

        const nicheSelectionChanged = prevNicheIdsKeyRef.current !== nicheIdsKey;
        prevNicheIdsKeyRef.current = nicheIdsKey;

        prevAllCountRef.current = allVideos.length;

        const shouldAutoRefresh =
            !frozenStatsRef.current ||
            channelListChanged ||
            filterModeChanged ||
            nicheSelectionChanged;

        const isFilterModeToggleOnly = filterModeChanged && !channelListChanged && !nicheSelectionChanged;

        if (shouldAutoRefresh) {
            if (skipNextFreezeRef.current) {
                skipNextFreezeRef.current = false;
            } else {
                frozenStatsRef.current = currentStats;
                setStatsVersion(v => v + 1);
            }
        }

        skipAutoFitRef.current = isFilterModeToggleOnly;
    }, [currentStats, channelIdsKey, filterMode, nicheIdsKey, allVideos.length]);

    // Manual refresh callback (Z key)
    const refreshStats = useCallback(() => {
        frozenStatsRef.current = currentStats;
        skipAutoFitRef.current = false;
        setStatsVersion(v => v + 1);
    }, [currentStats]);

    // Explicit flag: filtered mode should auto-fit, global mode uses frozen stats
    const shouldAutoFit = filterMode !== 'global';

    return useMemo(() => ({
        currentStats,
        frozenStats: frozenStatsRef.current,
        shouldAutoFit,
        refreshStats,
        skipAutoFitRef
    }), [currentStats, shouldAutoFit, refreshStats, statsVersion]);
};
