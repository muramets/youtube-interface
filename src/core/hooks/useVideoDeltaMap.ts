import { useState, useEffect, useMemo } from 'react';
import { TrendService } from '../services/trendService';
import { useTrendStore } from '../stores/trends/trendStore';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';
import type { TrendSnapshot } from '../types/trends';
import type { VideoDeltaStats } from '../types/videoDeltaStats';

// =============================================================================
// Shared hook: computes per-video delta stats from Trend Snapshots.
// Accepts raw YouTube video IDs — no dependency on VideoDetails.
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
                const now = Date.now();
                const oneDayMs = 24 * 60 * 60 * 1000;
                const videoIdSet = new Set(youtubeVideoIds);
                const videoDeltas: Map<string, { current: number; past24h?: number; past7d?: number; past30d?: number }> = new Map();

                // Determine which trend channels to query
                const relevantChannels = channelIdHints
                    ? trendChannels.filter(ch => channelIdHints.has(ch.id))
                    : trendChannels; // No hints → scan all

                if (relevantChannels.length === 0) {
                    setResult(EMPTY_RESULT);
                    return;
                }

                // Fetch snapshots for each relevant trend channel (in parallel)
                const snapshotPromises = relevantChannels.map(async (channel) => {
                    try {
                        const snapshots = await TrendService.getTrendSnapshots(
                            user.uid,
                            currentChannel.id,
                            channel.id,
                            32 // 32 days covers 30d delta + buffer
                        );

                        if (snapshots.length === 0) return;

                        const latestSnapshot = snapshots[0]; // Already sorted DESC

                        const findSnapshot = (targetTs: number): TrendSnapshot | undefined => {
                            return snapshots.find(s => s.timestamp <= targetTs);
                        };

                        const snap24h = findSnapshot(now - oneDayMs);
                        const snap7d = findSnapshot(now - (7 * oneDayMs));
                        const snap30d = findSnapshot(now - (30 * oneDayMs));

                        for (const videoId of videoIdSet) {
                            const currentViews = latestSnapshot.videoViews[videoId];
                            if (currentViews === undefined) continue;

                            if (!videoDeltas.has(videoId)) {
                                videoDeltas.set(videoId, { current: currentViews });
                            }

                            const entry = videoDeltas.get(videoId)!;

                            if (snap24h?.videoViews[videoId] !== undefined) {
                                entry.past24h = snap24h.videoViews[videoId];
                            }
                            if (snap7d?.videoViews[videoId] !== undefined) {
                                entry.past7d = snap7d.videoViews[videoId];
                            }
                            if (snap30d?.videoViews[videoId] !== undefined) {
                                entry.past30d = snap30d.videoViews[videoId];
                            }
                        }
                    } catch (err) {
                        console.warn(`[useVideoDeltaMap] Failed to fetch snapshots for channel ${channel.id}:`, err);
                    }
                });

                await Promise.all(snapshotPromises);

                // Build per-video delta map
                const perVideoMap: Map<string, VideoDeltaStats> = new Map();

                for (const [videoId, entry] of videoDeltas.entries()) {
                    const delta24h = entry.past24h !== undefined ? entry.current - entry.past24h : null;
                    const delta7d = entry.past7d !== undefined ? entry.current - entry.past7d : null;
                    const delta30d = entry.past30d !== undefined ? entry.current - entry.past30d : null;

                    perVideoMap.set(videoId, { delta24h, delta7d, delta30d, currentViews: entry.current });
                }

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
