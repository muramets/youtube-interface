// =============================================================================
// fetchThumbnailDescriptions — batch fetch AI-generated thumbnail descriptions
//
// Reads thumbnailDescription field from globalVideoEmbeddings collection.
// Used by browseTrendVideos and getMultipleVideoDetails to enrich responses
// with surface-level visual context (no API cost, single Firestore round-trip).
// =============================================================================

import { db } from "../../../shared/db.js";

/** Firestore getAll() hard limit per call. */
const GETALL_BATCH_SIZE = 500;

/**
 * Batch-fetches AI-generated thumbnail descriptions from globalVideoEmbeddings.
 *
 * @param videoIds - YouTube video IDs to look up
 * @returns Map of videoId → thumbnailDescription (only non-empty entries)
 */
export async function fetchThumbnailDescriptions(
    videoIds: string[],
): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (videoIds.length === 0) return result;

    const uniqueIds = [...new Set(videoIds)];

    for (let i = 0; i < uniqueIds.length; i += GETALL_BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + GETALL_BATCH_SIZE);
        const refs = batch.map(id => db.doc(`globalVideoEmbeddings/${id}`));
        const snapshots = await db.getAll(...refs);

        for (const snap of snapshots) {
            if (!snap.exists) continue;
            const desc = snap.data()?.thumbnailDescription;
            if (typeof desc === "string" && desc.length > 0) {
                result.set(snap.id, desc);
            }
        }
    }

    return result;
}
