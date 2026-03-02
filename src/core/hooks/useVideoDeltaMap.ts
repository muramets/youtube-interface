import { useState, useEffect, useMemo } from 'react';
import { useTrendStore } from '../stores/trends/trendStore';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';
import type { VideoDeltaStats } from '../types/videoDeltaStats';
import { computeVideoDeltas } from '../utils/computeVideoDeltas';

// =============================================================================
// Shared hook: computes per-video delta stats from Trend Snapshots.
// Accepts raw YouTube video IDs — no dependency on VideoDetails.
//
// Delegates computation to computeVideoDeltas() pure function.
//
// Used by:
//   - usePlaylistDeltaStats (wraps this + aggregates totals)
//   - TrafficTab (per-row delta in VideoPreviewTooltip)
// =============================================================================

export interface VideoDeltaMapResult {
    perVideo: Map<string, VideoDeltaStats>;
    isLoading: boolean;
}

/** Stable empty result to prevent re-render loops */
const EMPTY_RESULT: VideoDeltaMapResult = { perVideo: new Map(), isLoading: false };

/**
 * Compute 24h/7d/30d view deltas for a set of YouTube video IDs.
 *
 * @param videoIds  - YouTube video IDs (11-character strings)
 * @param channelIdHints - Optional set of YouTube channel IDs to narrow snapshot lookups.
 *                         If provided, only trend channels matching these IDs are queried.
 *                         If omitted, ALL trend channels are scanned (slower but works
 *                         when caller doesn't know which channels own the videos).
 */
export const useVideoDeltaMap = (
    videoIds: string[],
    channelIdHints?: Set<string>
): VideoDeltaMapResult => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { channels: trendChannels } = useTrendStore();

    const [result, setResult] = useState<VideoDeltaMapResult>(EMPTY_RESULT);

    // Filter to valid YouTube IDs only
    const youtubeVideoIds = useMemo(() => {
        return videoIds.filter(id => id && /^[a-zA-Z0-9_-]{11}$/.test(id));
    }, [videoIds]);

    // Stable key to prevent re-fetching on reorder
    const stableVideoIdKey = useMemo(() => {
        return youtubeVideoIds.slice().sort().join(',');
    }, [youtubeVideoIds]);

    // Stable key for channel hints (if provided)
    const stableChannelHintKey = useMemo(() => {
        if (!channelIdHints) return '';
        return Array.from(channelIdHints).sort().join(',');
    }, [channelIdHints]);

    useEffect(() => {
        if (!user?.uid || !currentChannel?.id || youtubeVideoIds.length === 0) {
            setResult(EMPTY_RESULT);
            return;
        }

        if (trendChannels.length === 0) return;

        const loadDeltas = async () => {
            setResult(prev => ({ ...prev, isLoading: true }));

            try {
                const perVideoMap = await computeVideoDeltas(
                    youtubeVideoIds,
                    trendChannels,
                    user.uid,
                    currentChannel.id,
                    channelIdHints,
                );

                setResult({ perVideo: perVideoMap, isLoading: false });
            } catch (error) {
                console.error('[useVideoDeltaMap] Error:', error);
                setResult(prev => ({ ...prev, isLoading: false }));
            }
        };

        loadDeltas();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid, currentChannel?.id, stableVideoIdKey, trendChannels.length, stableChannelHintKey]);

    return result;
};

