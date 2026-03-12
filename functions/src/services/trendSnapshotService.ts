// =============================================================================
// trendSnapshotService — Server-side trend snapshot reads + view delta computation
//
// Uses Firebase Admin SDK (not frontend Firestore client).
// Delegates pure math to shared/viewDeltas.ts (same algorithm as frontend).
// =============================================================================

import { db } from "../shared/db.js";
import { calculateViewDeltas, DELTA_SNAPSHOT_DAYS } from "../shared/viewDeltas.js";
import type { ViewSnapshot, VideoDeltaStats } from "../shared/viewDeltas.js";

export type { VideoDeltaStats } from "../shared/viewDeltas.js";

/**
 * Read trend snapshots for a single trend channel from Firestore (admin SDK).
 */
export async function getTrendSnapshots(
    userId: string,
    channelId: string,
    trendChannelId: string,
    limitDays: number = DELTA_SNAPSHOT_DAYS,
): Promise<ViewSnapshot[]> {
    const ref = db.collection(
        `users/${userId}/channels/${channelId}/trendChannels/${trendChannelId}/snapshots`,
    );
    // Time-based query: fetch all snapshots within the window.
    // Using timestamp cutoff (not document limit) ensures correct coverage
    // even when duplicate snapshots exist (e.g. from re-deploy catch-up).
    const cutoff = Date.now() - limitDays * 24 * 60 * 60 * 1000;
    const snap = await ref
        .where("timestamp", ">=", cutoff)
        .orderBy("timestamp", "desc")
        .get();

    return snap.docs.map((doc) => {
        const data = doc.data();
        return {
            timestamp: data.timestamp as number,
            videoViews: (data.videoViews as Record<string, number>) ?? {},
        };
    });
}

/**
 * Compute per-video view deltas using trend snapshots (server-side).
 *
 * Flow:
 *   1. Read all trendChannels for the user's channel
 *   2. Filter by channelIdHints (if provided) to narrow lookups
 *   3. Fetch snapshots per trendChannel in parallel
 *   4. calculateViewDeltas() per channel (shared algorithm)
 *   5. Merge results — first channel with data wins
 *
 * @param userId          Firebase user ID
 * @param channelId       User's active channel ID
 * @param videoIds        YouTube video IDs to compute deltas for
 * @param channelIdHints  Optional: YouTube channel IDs to narrow trendChannel lookups
 * @param publishedDates  Optional: videoId → ISO date string. When provided, videos
 *                        published within a delta window (e.g. < 30 days) get their
 *                        `currentViews` as estimated delta instead of null.
 *                        This prevents recently published videos from dropping out
 *                        of delta-sorted rankings.
 */
export async function getViewDeltas(
    userId: string,
    channelId: string,
    videoIds: string[],
    channelIdHints?: Set<string>,
    publishedDates?: Map<string, string>,
): Promise<Map<string, VideoDeltaStats>> {
    if (videoIds.length === 0) return new Map();

    // 1. Read all trendChannels
    const trendChannelsSnap = await db
        .collection(`users/${userId}/channels/${channelId}/trendChannels`)
        .get();

    if (trendChannelsSnap.empty) return new Map();

    // 2. Filter by hints
    const allChannelIds = trendChannelsSnap.docs.map((doc) => doc.id);
    const relevantChannels = channelIdHints
        ? allChannelIds.filter((id) => channelIdHints.has(id))
        : allChannelIds;

    if (relevantChannels.length === 0) return new Map();

    // 3-4. Fetch snapshots per channel + compute deltas in parallel
    const channelResults = await Promise.all(
        relevantChannels.map(async (trendChannelId) => {
            try {
                const snapshots = await getTrendSnapshots(
                    userId,
                    channelId,
                    trendChannelId,
                );
                if (snapshots.length === 0) return new Map<string, VideoDeltaStats>();
                return calculateViewDeltas(snapshots, videoIds);
            } catch (err) {
                console.warn(
                    `[getViewDeltas] Failed for trendChannel ${trendChannelId}:`,
                    err,
                );
                return new Map<string, VideoDeltaStats>();
            }
        }),
    );

    // 5. Merge: first channel with data wins
    const merged = new Map<string, VideoDeltaStats>();
    for (const channelMap of channelResults) {
        for (const [videoId, stats] of channelMap) {
            if (!merged.has(videoId)) {
                merged.set(videoId, stats);
            }
        }
    }

    // 6. Estimated deltas for recently published videos.
    // A video published 10 days ago has delta30d = null (no snapshot from 30 days ago),
    // but its currentViews ≈ total growth since birth — all within the 30-day window.
    if (publishedDates && publishedDates.size > 0) {
        const now = Date.now();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;

        for (const [videoId, stats] of merged) {
            if (stats.currentViews === null) continue;

            const publishedAt = publishedDates.get(videoId);
            if (!publishedAt) continue;

            const ageMs = now - new Date(publishedAt).getTime();
            if (ageMs < 0) continue; // future date — skip

            if (stats.delta30d === null && ageMs < 30 * ONE_DAY_MS) {
                stats.delta30d = stats.currentViews;
            }
            if (stats.delta7d === null && ageMs < 7 * ONE_DAY_MS) {
                stats.delta7d = stats.currentViews;
            }
            if (stats.delta24h === null && ageMs < ONE_DAY_MS) {
                stats.delta24h = stats.currentViews;
            }
        }
    }

    return merged;
}
