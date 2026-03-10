// =============================================================================
// resolveVideos — resolves YouTube video IDs to Firestore documents
//
// Problem: Custom videos have document IDs like "custom-1772299911717" but
// store the YouTube video ID in a `publishedVideoId` field. Direct document
// lookups by YouTube ID miss these videos entirely.
//
// Solution: 3-step resolution
//   1. Direct document lookup by ID (fast, O(1) per video)
//   2. Reverse lookup via `publishedVideoId` field for any remaining misses
//   3. Trend channel videos lookup via trendChannels/*/videos/
//
// All tool handlers should use this instead of raw db.doc() lookups.
// =============================================================================

import { db } from "../../../shared/db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedVideo {
    /** The YouTube video ID that was requested. */
    requestedId: string;
    /** The actual Firestore document ID (may differ for custom videos). */
    docId: string;
    /** Document data. */
    data: Record<string, unknown>;
    /** Which collection the document was found in. */
    source: "video_grid" | "external_cache" | "trend_channel";
}

export interface ResolveResult {
    /** Successfully resolved videos, keyed by the requested YouTube video ID. */
    resolved: Map<string, ResolvedVideo>;
    /** YouTube video IDs that were not found in any collection. */
    missingIds: string[];
}

export interface ResolveOptions {
    /** Skip external sources: cached_external_videos/ and trendChannels/ (e.g. for traffic analysis of own videos). */
    skipExternal?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Firestore getAll() practical batch size. */
const DOC_BATCH_SIZE = 100;

/** Firestore `in` query limit. */
const IN_QUERY_LIMIT = 30;

/** Firestore getAll() hard limit per call. */
const GETALL_BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolves YouTube video IDs to Firestore documents across all collections
 * (videos/, cached_external_videos/, trendChannels/{channelId}/videos/),
 * including custom videos that store YouTube IDs in `publishedVideoId`.
 *
 * @param basePath - Firestore path prefix: `users/{uid}/channels/{chId}`
 * @param youtubeVideoIds - YouTube video IDs to resolve
 * @param options - Optional: skip external cache collection
 */
export async function resolveVideosByIds(
    basePath: string,
    youtubeVideoIds: string[],
    options?: ResolveOptions,
): Promise<ResolveResult> {
    const resolved = new Map<string, ResolvedVideo>();
    if (youtubeVideoIds.length === 0) return { resolved, missingIds: [] };

    // --- Step 1: Direct document lookup by ID ---
    const { missing: stillMissing, externalOnly } = await resolveByDocumentId(basePath, youtubeVideoIds, resolved, options);

    const step1VideoGrid = [...resolved.values()].filter(v => v.source === "video_grid").length;
    const step1ExternalCache = [...resolved.values()].filter(v => v.source === "external_cache").length;
    console.log(`[resolveVideos] Step 1: ${youtubeVideoIds.length} requested → ${step1VideoGrid} video_grid, ${step1ExternalCache} external_cache, ${stillMissing.length} missing, ${externalOnly.length} externalOnly`);

    // --- Step 2: Reverse lookup via publishedVideoId for remaining misses ---
    // Also check externalOnly IDs — custom videos (doc ID "custom-XXX") may exist
    // in videos/ under a different ID but were shadowed by cached_external_videos/.
    const needsReverseLookup = [...stillMissing, ...externalOnly];
    if (needsReverseLookup.length > 0) {
        await resolveByPublishedVideoId(basePath, needsReverseLookup, resolved);
        const step2VideoGrid = [...resolved.values()].filter(v => v.source === "video_grid").length;
        const upgraded = step2VideoGrid - step1VideoGrid;
        console.log(`[resolveVideos] Step 2: ${needsReverseLookup.length} checked → ${upgraded} upgraded to video_grid, ${step2VideoGrid} total video_grid`);
    }

    // --- Step 3: Trend channel videos lookup ---
    const missingAfterStep2 = youtubeVideoIds.filter(id => !resolved.has(id));
    if (!options?.skipExternal && missingAfterStep2.length > 0) {
        await resolveFromTrendChannels(basePath, missingAfterStep2, resolved);
    }

    // Whatever is still not in `resolved` is truly missing
    const missingIds = youtubeVideoIds.filter(id => !resolved.has(id));

    return { resolved, missingIds };
}

// ---------------------------------------------------------------------------
// Step 1: Direct document lookup
// ---------------------------------------------------------------------------

async function resolveByDocumentId(
    basePath: string,
    videoIds: string[],
    resolved: Map<string, ResolvedVideo>,
    options?: ResolveOptions,
): Promise<{ missing: string[]; externalOnly: string[] }> {
    const missing: string[] = [];
    const externalOnly: string[] = [];

    for (let i = 0; i < videoIds.length; i += DOC_BATCH_SIZE) {
        const batch = videoIds.slice(i, i + DOC_BATCH_SIZE);
        const ownRefs = batch.map(id => db.doc(`${basePath}/videos/${id}`));

        if (options?.skipExternal) {
            // Only check videos/ collection
            const ownSnaps = await db.getAll(...ownRefs);
            for (let j = 0; j < batch.length; j++) {
                if (ownSnaps[j].exists) {
                    resolved.set(batch[j], {
                        requestedId: batch[j],
                        docId: batch[j],
                        data: ownSnaps[j].data() as Record<string, unknown>,
                        source: "video_grid",
                    });
                } else {
                    missing.push(batch[j]);
                }
            }
        } else {
            // Check both collections in parallel
            const extRefs = batch.map(id => db.doc(`${basePath}/cached_external_videos/${id}`));
            const [ownSnaps, extSnaps] = await Promise.all([
                db.getAll(...ownRefs),
                db.getAll(...extRefs),
            ]);

            for (let j = 0; j < batch.length; j++) {
                const own = ownSnaps[j];
                const ext = extSnaps[j];

                if (own.exists) {
                    resolved.set(batch[j], {
                        requestedId: batch[j],
                        docId: batch[j],
                        data: own.data() as Record<string, unknown>,
                        source: "video_grid",
                    });
                } else if (ext.exists) {
                    resolved.set(batch[j], {
                        requestedId: batch[j],
                        docId: batch[j],
                        data: ext.data() as Record<string, unknown>,
                        source: "external_cache",
                    });
                    externalOnly.push(batch[j]);
                } else {
                    missing.push(batch[j]);
                }
            }
        }
    }

    return { missing, externalOnly };
}

// ---------------------------------------------------------------------------
// Step 2: Reverse lookup via publishedVideoId field
// ---------------------------------------------------------------------------

async function resolveByPublishedVideoId(
    basePath: string,
    missingIds: string[],
    resolved: Map<string, ResolvedVideo>,
): Promise<void> {
    const videosCollection = db.collection(`${basePath}/videos`);

    for (let i = 0; i < missingIds.length; i += IN_QUERY_LIMIT) {
        const batch = missingIds.slice(i, i + IN_QUERY_LIMIT);
        const snap = await videosCollection
            .where("publishedVideoId", "in", batch)
            .get();

        for (const doc of snap.docs) {
            const data = doc.data() as Record<string, unknown>;
            const publishedId = data.publishedVideoId as string;

            // Add if not yet resolved, or upgrade from external_cache to video_grid
            // (custom videos in videos/ may have been shadowed by cached_external_videos/)
            if (publishedId && (!resolved.has(publishedId) || resolved.get(publishedId)!.source === "external_cache")) {
                resolved.set(publishedId, {
                    requestedId: publishedId,
                    docId: doc.id,
                    data,
                    source: "video_grid",
                });
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Step 3: Trend channel videos lookup
// ---------------------------------------------------------------------------

async function resolveFromTrendChannels(
    basePath: string,
    missingIds: string[],
    resolved: Map<string, ResolvedVideo>,
): Promise<void> {
    try {
        const trendChannelsSnap = await db.collection(`${basePath}/trendChannels`).get();
        const channelIds = trendChannelsSnap.docs.map(d => d.id);
        if (channelIds.length === 0) return;

        // Build ref descriptors: each missing ID × each channel
        const entries = missingIds.flatMap(videoId =>
            channelIds.map(channelId => ({
                ref: db.doc(`${basePath}/trendChannels/${channelId}/videos/${videoId}`),
                videoId,
                channelId,
            })),
        );

        let found = 0;
        for (let i = 0; i < entries.length; i += GETALL_BATCH_SIZE) {
            const batch = entries.slice(i, i + GETALL_BATCH_SIZE);
            const snaps = await db.getAll(...batch.map(e => e.ref));

            for (let j = 0; j < snaps.length; j++) {
                if (snaps[j].exists && !resolved.has(batch[j].videoId)) {
                    const data = snaps[j].data() as Record<string, unknown>;
                    resolved.set(batch[j].videoId, {
                        requestedId: batch[j].videoId,
                        docId: batch[j].videoId,
                        data: { ...data, channelId: batch[j].channelId },
                        source: "trend_channel",
                    });
                    found++;
                }
            }
        }

        console.log(`[resolveVideos] Step 3: ${entries.length} checked → ${found} found in trendChannels`);
    } catch (err) {
        console.warn("[resolveVideos] Step 3 failed:", err);
    }
}
