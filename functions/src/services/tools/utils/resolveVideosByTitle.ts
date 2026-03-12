// =============================================================================
// resolveVideosByTitle — resolve video titles to videoIds via Firestore
//
// Shared utility used by viewThumbnails and getMultipleVideoDetails.
// Search order: videos/ → cached_external_videos/ → trendChannels/{ch}/videos/
//
// Trade-off: trendChannels search = N channels × M titles queries.
// Acceptable because title search is a rare fallback path (~5% of calls).
// =============================================================================

import { db } from "../../../shared/db.js";

export interface TitleResolution {
    /** The original title that was searched for. */
    title: string;
    /** The resolved Firestore document ID. */
    videoId: string;
}

export interface TitleResolveResult {
    /** Successfully resolved titles → videoIds. */
    resolved: Map<string, string>;
    /** Titles that were not found in any collection. */
    unresolved: string[];
}

/**
 * Resolve video titles to videoIds by querying all Firestore collections.
 * Returns a map of title → videoId for successfully resolved titles.
 *
 * Search order: videos/ → cached_external_videos/ → trendChannels/{ch}/videos/
 */
export async function resolveVideoIdsByTitle(
    basePath: string,
    titles: string[],
): Promise<TitleResolveResult> {
    const resolved = new Map<string, string>();
    const unresolved: string[] = [];

    // Get trend channel list once for fallback search
    const trendChannelsSnap = await db.collection(`${basePath}/trendChannels`).get();
    const trendChannelIds = trendChannelsSnap.docs.map(d => d.id);

    // Query collections for each title
    const queries = titles.map(async (title) => {
        const [videoSnap, suggestedSnap] = await Promise.all([
            db.collection(`${basePath}/videos`).where("title", "==", title).limit(1).get(),
            db.collection(`${basePath}/cached_external_videos`).where("title", "==", title).limit(1).get(),
        ]);

        // Prefer main videos/ collection
        if (videoSnap.docs.length > 0) {
            resolved.set(title, videoSnap.docs[0].id);
            return;
        }
        if (suggestedSnap.docs.length > 0) {
            resolved.set(title, suggestedSnap.docs[0].id);
            return;
        }

        // Fallback: search in trendChannels (parallel queries)
        const trendResults = await Promise.all(
            trendChannelIds.map(tcId =>
                db.collection(`${basePath}/trendChannels/${tcId}/videos`)
                    .where("title", "==", title)
                    .limit(1)
                    .get(),
            ),
        );
        const trendHit = trendResults.find(snap => snap.docs.length > 0);
        if (trendHit) {
            resolved.set(title, trendHit.docs[0].id);
            return;
        }

        unresolved.push(title);
    });

    await Promise.all(queries);
    return { resolved, unresolved };
}
