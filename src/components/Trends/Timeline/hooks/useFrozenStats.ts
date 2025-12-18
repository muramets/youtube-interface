import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { TimelineStats, TrendVideo } from '../../../../types/trends';

interface ChannelBasic {
    id: string;
}

interface UseFrozenStatsProps {
    /** All videos for the current context (used for Global mode stats) */
    allVideos: TrendVideo[];
    /** Filtered videos (used for Filtered mode stats and always for display) */
    filteredVideos: TrendVideo[];
    channels: ChannelBasic[];
    selectedChannelId: string | null;
    filterMode: 'global' | 'filtered';
    /** List of active niche IDs */
    activeNicheIds: string[];
}

/**
 * Computes stats for the timeline world from a set of videos.
 */
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

export const useFrozenStats = ({
    allVideos,
    filteredVideos,
    channels,
    selectedChannelId,
    filterMode,
    activeNicheIds
}: UseFrozenStatsProps) => {
    // Stats are "frozen" and only update on explicit triggers:
    // - Initial page load
    // - Z key / revert (via onRequestStatsRefresh callback)
    // - Channel add/remove (not visibility toggle!)

    const frozenStatsRef = useRef<TimelineStats | undefined>(undefined);
    const [statsVersion, setStatsVersion] = useState(0);

    // Track state for change detection
    const hasNicheFilter = activeNicheIds.length > 0;
    const nicheIdsKey = useMemo(() => activeNicheIds.sort().join(','), [activeNicheIds]);

    // Track channel IDs for detecting add/remove (not visibility changes)
    const channelIdsKey = useMemo(() => channels.map(c => c.id).sort().join(','), [channels]);
    const prevChannelIdsKeyRef = useRef(channelIdsKey);

    // Reset state immediately when channel switches (Derived State pattern)
    // We track this locally to control the ref reset
    const [prevChannelForReset, setPrevChannelForReset] = useState(selectedChannelId);
    if (selectedChannelId !== prevChannelForReset) {
        setPrevChannelForReset(selectedChannelId);
        // Reset frozen stats on channel context switch
        frozenStatsRef.current = undefined;
    }

    // Determine source videos based on context:
    // - Main Trends page (no selectedChannelId): Use filteredVideos (visible channels)
    // - Channel view without niche filter: Use allVideos (full channel = global)
    // - Channel view with niche filter + Global mode: Use allVideos (global context)
    // - Channel view with niche filter + Filtered mode: Use filteredVideos
    const statsSourceVideos = useMemo(() => {
        // Main Trends page: always use filtered (visible channels only)
        if (!selectedChannelId) {
            return filteredVideos;
        }
        // Channel view without niche filter: always global
        if (!hasNicheFilter) {
            return allVideos;
        }
        // Channel view with niche filter: respect filterMode setting
        return filterMode === 'global' ? allVideos : filteredVideos;
    }, [selectedChannelId, hasNicheFilter, filterMode, allVideos, filteredVideos]);

    // Calculate current stats from the appropriate source
    const currentStats = useMemo(() => computeStats(statsSourceVideos), [statsSourceVideos]);

    // Track filterMode and niche changes for auto-refresh
    const prevFilterModeRef = useRef(filterMode);
    const prevNicheIdsKeyRef = useRef(nicheIdsKey);
    const skipAutoFitRef = useRef(false);

    // Update frozen stats on:
    // 1. Initial load (frozenStatsRef is undefined)
    // 2. statsVersion change (Z key pressed)
    // 3. Channel list change (add/remove, not visibility)
    // 4. filterMode change
    // 5. Niche selection change (adding/removing niches)
    useEffect(() => {
        const channelListChanged = prevChannelIdsKeyRef.current !== channelIdsKey;
        prevChannelIdsKeyRef.current = channelIdsKey;

        const filterModeChanged = prevFilterModeRef.current !== filterMode;
        prevFilterModeRef.current = filterMode;

        const nicheSelectionChanged = prevNicheIdsKeyRef.current !== nicheIdsKey;
        prevNicheIdsKeyRef.current = nicheIdsKey;

        // Auto-refresh conditions:
        // - Initial load (no frozen stats yet)
        // - Channel list changed
        // - filterMode changed
        // - Niche selection changed (this ensures adding/removing niches triggers a rebuilt)
        const shouldAutoRefresh =
            !frozenStatsRef.current ||
            channelListChanged ||
            filterModeChanged ||
            nicheSelectionChanged;

        // Track whether this is just a filterMode toggle (shouldn't trigger auto-fit)
        // We only skip auto-fit if NOTHING else changed except filterMode
        const isFilterModeToggleOnly = !!(filterModeChanged && !channelListChanged && !nicheSelectionChanged);

        if (shouldAutoRefresh) {
            frozenStatsRef.current = currentStats;
            setStatsVersion(v => v + 1); // Force re-render to propagate new stats
        }

        // Update the skip flag for consumers
        skipAutoFitRef.current = isFilterModeToggleOnly;
    }, [currentStats, channelIdsKey, filterMode, nicheIdsKey, selectedChannelId, hasNicheFilter]);

    // Callback for TimelineCanvas to request stats refresh (on Z key)
    const refreshStats = useCallback(() => {
        frozenStatsRef.current = currentStats;
        skipAutoFitRef.current = false; // Manual refresh should allow auto-fit
        setStatsVersion(v => v + 1);
    }, [currentStats]);

    // Effective Stats Logic:
    // If FilterMode is 'filtered', we return UNDEFINED. 
    // This removes the "forcedStats" in TimelineCanvas, allowing it to naturally 
    // fit to whatever videos are passed, including automatically adjusting 
    // when niche filters change (as requested by user).
    // If FilterMode is 'global', we return the frozen stats to maintain context.
    const effectiveStats = filterMode === 'global' ? frozenStatsRef.current : undefined;

    // Memoize the return object to prevent stable-value-but-new-reference jerks
    return useMemo(() => ({
        currentStats,
        effectiveStats,
        refreshStats,
        skipAutoFitRef
    }), [currentStats, effectiveStats, refreshStats]);
};
