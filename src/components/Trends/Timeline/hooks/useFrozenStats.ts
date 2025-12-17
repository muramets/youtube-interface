import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { TimelineStats, TrendVideo } from '../../../../types/trends';

interface ChannelBasic {
    id: string;
}

interface UseFrozenStatsProps {
    videos: TrendVideo[];
    channels: ChannelBasic[];
    selectedChannelId: string | null;
    filterMode: 'global' | 'filtered';
}

export const useFrozenStats = ({
    videos,
    channels,
    selectedChannelId,
    filterMode
}: UseFrozenStatsProps) => {
    // Stats are "frozen" and only update on explicit triggers:
    // - Initial page load
    // - Z key / revert (via onRequestStatsRefresh callback)
    // - Channel add/remove (not visibility toggle!)

    const frozenStatsRef = useRef<TimelineStats | undefined>(undefined);
    const [statsVersion, setStatsVersion] = useState(0);

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

    // Calculate current stats from visible videos (always fresh)
    const currentStats = useMemo((): TimelineStats | undefined => {
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
    }, [videos]);

    // Update frozen stats on:
    // 1. Initial load (frozenStatsRef is undefined)
    // 2. statsVersion change (Z key pressed)
    // 3. Channel list change (add/remove, not visibility)
    useEffect(() => {
        const channelListChanged = prevChannelIdsKeyRef.current !== channelIdsKey;
        prevChannelIdsKeyRef.current = channelIdsKey;

        // Strict Freeze: Only update if explicitly requested or context changes.
        // We do NOT update on visibility toggles (neither shrink nor expand).
        if (!frozenStatsRef.current || channelListChanged) {
            frozenStatsRef.current = currentStats;
        }
    }, [currentStats, statsVersion, channelIdsKey]);

    // Callback for TimelineCanvas to request stats refresh (on Z key)
    const refreshStats = useCallback(() => {
        frozenStatsRef.current = currentStats;
        setStatsVersion(v => v + 1);
    }, [currentStats]);

    // For global mode, use frozen stats. For filtered mode, use current stats.
    const effectiveStats = filterMode === 'global' ? frozenStatsRef.current : undefined;

    return {
        currentStats,
        effectiveStats,
        refreshStats
    };
};
