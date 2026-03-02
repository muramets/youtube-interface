// =============================================================================
// computeVideoDeltas — Pure async function for video delta computation
//
// Extracted from useVideoDeltaMap hook to enable reuse outside React context
// (e.g., enrichment middleware in chatStore.sendMessage).
//
// Computes 24h/7d/30d view deltas from Trend Snapshots.
// =============================================================================

import { TrendService } from '../services/trendService';
import type { TrendChannel, TrendSnapshot } from '../types/trends';
import type { VideoDeltaStats } from '../types/videoDeltaStats';

/**
 * Compute per-video view deltas from Trend Snapshots.
 *
 * @param videoIds         - YouTube video IDs (11-character strings)
 * @param trendChannels    - Available trend channels to scan for snapshots
 * @param userId           - Firebase user ID
 * @param channelId        - User's active channel ID
 * @param channelIdHints   - Optional set of YouTube channel IDs to narrow lookups
 * @returns Map of videoId → VideoDeltaStats
 */
export async function computeVideoDeltas(
    videoIds: string[],
    trendChannels: TrendChannel[],
    userId: string,
    channelId: string,
    channelIdHints?: Set<string>,
): Promise<Map<string, VideoDeltaStats>> {
    const youtubeVideoIds = videoIds.filter(id => id && /^[a-zA-Z0-9_-]{11}$/.test(id));

    if (youtubeVideoIds.length === 0 || trendChannels.length === 0) {
        return new Map();
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const videoIdSet = new Set(youtubeVideoIds);
    const videoDeltas: Map<string, { current: number; past24h?: number; past7d?: number; past30d?: number }> = new Map();

    // Determine which trend channels to query
    const relevantChannels = channelIdHints
        ? trendChannels.filter(ch => channelIdHints.has(ch.id))
        : trendChannels; // No hints → scan all

    if (relevantChannels.length === 0) {
        return new Map();
    }

    // Fetch snapshots for each relevant trend channel (in parallel)
    const snapshotPromises = relevantChannels.map(async (channel) => {
        try {
            const snapshots = await TrendService.getTrendSnapshots(
                userId,
                channelId,
                channel.id,
                32, // 32 days covers 30d delta + buffer
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
            console.warn(`[computeVideoDeltas] Failed to fetch snapshots for channel ${channel.id}:`, err);
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

    return perVideoMap;
}
