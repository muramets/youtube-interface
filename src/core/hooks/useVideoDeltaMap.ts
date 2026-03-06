import { useMemo } from 'react';
import { useTrendStore } from '../stores/trends/trendStore';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';
import { useTrendSnapshots } from './useTrendSnapshots';
import { calculateViewDeltas } from '../../../shared/viewDeltas';
import type { VideoDeltaStats } from '../../../shared/viewDeltas';

// =============================================================================
// Shared hook: computes per-video delta stats from cached Trend Snapshots.
// Accepts raw YouTube video IDs — no dependency on VideoDetails.
//
// Delegates I/O to useTrendSnapshots (TanStack Query cache).
// Delegates math to calculateViewDeltas (shared pure algorithm).
//
// Used by:
//   - usePlaylistDeltaStats (wraps this + aggregates totals)
//   - TrafficTab (per-row delta in VideoPreviewTooltip)
// =============================================================================

export interface VideoDeltaMapResult {
    perVideo: Map<string, VideoDeltaStats>;
    isLoading: boolean;
}

const EMPTY_MAP = new Map<string, VideoDeltaStats>();

/**
 * Compute 24h/7d/30d view deltas for a set of YouTube video IDs.
 *
 * @param videoIds  - YouTube video IDs (11-character strings)
 * @param channelIdHints - Optional set of YouTube channel IDs to narrow snapshot lookups.
 *                         If provided, only trend channels matching these IDs are queried.
 *                         If omitted, ALL trend channels are scanned.
 */
export const useVideoDeltaMap = (
    videoIds: string[],
    channelIdHints?: Set<string>
): VideoDeltaMapResult => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { channels: trendChannels } = useTrendStore();

    // Filter to valid YouTube IDs only
    const youtubeVideoIds = useMemo(() => {
        return videoIds.filter(id => id && /^[a-zA-Z0-9_-]{11}$/.test(id));
    }, [videoIds]);

    // Filter trend channels by hints
    const relevantChannels = useMemo(() => {
        if (!channelIdHints || trendChannels.length === 0) return trendChannels;
        return trendChannels.filter(ch => channelIdHints.has(ch.id));
    }, [trendChannels, channelIdHints]);

    // Cached snapshots via TanStack Query
    const { snapshotMap, isLoading } = useTrendSnapshots(
        user?.uid,
        currentChannel?.id,
        relevantChannels,
    );

    // Compute deltas: per-channel calculateViewDeltas, then merge (first wins)
    const perVideo = useMemo(() => {
        if (youtubeVideoIds.length === 0 || snapshotMap.size === 0) {
            return EMPTY_MAP;
        }

        const merged = new Map<string, VideoDeltaStats>();
        for (const [, snapshots] of snapshotMap) {
            if (snapshots.length === 0) continue;
            const channelDeltas = calculateViewDeltas(snapshots, youtubeVideoIds);
            for (const [videoId, stats] of channelDeltas) {
                if (!merged.has(videoId)) {
                    merged.set(videoId, stats);
                }
            }
        }
        return merged;
    }, [snapshotMap, youtubeVideoIds]);

    return { perVideo, isLoading };
};
