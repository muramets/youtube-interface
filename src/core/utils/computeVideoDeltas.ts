// =============================================================================
// computeVideoDeltas — Async I/O wrapper for video delta computation
//
// Handles Firestore reads (TrendService) and delegates pure math to
// shared/viewDeltas.ts. Used outside React context (e.g., AI enrichment).
// =============================================================================

import { TrendService } from '../services/trendService';
import type { TrendChannel } from '../types/trends';
import { calculateViewDeltas, DELTA_SNAPSHOT_DAYS } from '../../../shared/viewDeltas';
import type { VideoDeltaStats } from '../../../shared/viewDeltas';

export type { VideoDeltaStats } from '../../../shared/viewDeltas';

/**
 * Compute per-video view deltas from Trend Snapshots.
 *
 * I/O layer: fetches snapshots from Firestore per channel, delegates math
 * to shared algorithm, merges results (first channel with data wins).
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

    // Determine which trend channels to query
    const relevantChannels = channelIdHints
        ? trendChannels.filter(ch => channelIdHints.has(ch.id))
        : trendChannels; // No hints → scan all

    if (relevantChannels.length === 0) {
        return new Map();
    }

    // Fetch snapshots per channel in parallel, compute deltas per channel
    const channelResults = await Promise.all(
        relevantChannels.map(async (channel) => {
            try {
                const snapshots = await TrendService.getTrendSnapshots(
                    userId,
                    channelId,
                    channel.id,
                    DELTA_SNAPSHOT_DAYS,
                );
                if (snapshots.length === 0) return new Map<string, VideoDeltaStats>();
                return calculateViewDeltas(snapshots, youtubeVideoIds);
            } catch (err) {
                console.warn(`[computeVideoDeltas] Failed to fetch snapshots for channel ${channel.id}:`, err);
                return new Map<string, VideoDeltaStats>();
            }
        }),
    );

    // Merge: first channel with data for a video wins
    const merged = new Map<string, VideoDeltaStats>();
    for (const channelMap of channelResults) {
        for (const [videoId, stats] of channelMap) {
            if (!merged.has(videoId)) {
                merged.set(videoId, stats);
            }
        }
    }

    return merged;
}
