// =============================================================================
// Vector Search — batched nearest-neighbor search over globalVideoEmbeddings
//
// Handles Firestore `in` limit (30) by splitting channel IDs into batches,
// running parallel queries, and merging results by distance.
// Uses Firestore `findNearest()` (firebase-admin v12+).
// =============================================================================

import { db } from "../shared/db.js";
import type { EmbeddingDoc } from "./types.js";

/** Firestore `where('field', 'in', array)` limit */
const FIRESTORE_IN_LIMIT = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorSearchResult {
    videoId: string;
    distance: number;
    data: EmbeddingDoc;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Find nearest videos by embedding similarity across tracked channels.
 *
 * - Batches channel IDs into chunks of 30 (Firestore `in` limit)
 * - Runs parallel `findNearest` queries per batch
 * - Over-fetches `limit * 3` per batch for quality merge
 * - Merges all results by distance ascending (most similar first)
 *
 * @returns Sorted results — lower distance = more similar
 */
export async function findNearestVideos(params: {
    queryVector: number[];
    field: "packagingEmbedding" | "visualEmbedding";
    youtubeChannelIds: string[];
    limit: number;
}): Promise<VectorSearchResult[]> {
    const { queryVector, field, youtubeChannelIds, limit } = params;
    if (youtubeChannelIds.length === 0) return [];

    // Batch channel IDs into chunks of 30
    const batches: string[][] = [];
    for (let i = 0; i < youtubeChannelIds.length; i += FIRESTORE_IN_LIMIT) {
        batches.push(youtubeChannelIds.slice(i, i + FIRESTORE_IN_LIMIT));
    }

    const perBatchLimit = limit * 3; // Over-fetch for quality merge

    // Parallel batch queries
    const batchResults = await Promise.all(
        batches.map(async (batchIds) => {
            const snap = await db
                .collection("globalVideoEmbeddings")
                .where("youtubeChannelId", "in", batchIds)
                .findNearest({
                    vectorField: field,
                    queryVector,
                    limit: perBatchLimit,
                    distanceMeasure: "COSINE",
                    distanceResultField: "__distance",
                })
                .get();

            return snap.docs.map((doc) => {
                const rawData = doc.data();
                const distance = typeof rawData.__distance === "number"
                    ? rawData.__distance
                    : Infinity;

                // Remove synthetic distance field from returned data
                delete rawData.__distance;

                return {
                    videoId: doc.id,
                    distance,
                    data: rawData as unknown as EmbeddingDoc,
                };
            });
        }),
    );

    // Merge all batch results, sort by distance ascending (most similar first)
    const merged = batchResults.flat();
    merged.sort((a, b) => a.distance - b.distance);

    return merged.slice(0, limit);
}
