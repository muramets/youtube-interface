// =============================================================================
// viewThumbnails handler — batch fetch thumbnail URLs for visual context
//
// Title resolution searches three collection layers (cheapest first):
//   1. videos/{videoId}                          — own videos
//   2. cached_external_videos/{videoId}          — traffic cache
//   3. trendChannels/{channelId}/videos/{videoId} — competitor videos
//
// Accepts videoIds directly OR titles for lookup (fallback when IDs are unknown).
// Returns visualContextUrls for thumbnailMiddleware to process.
// Does NOT download images — that is thumbnailMiddleware's job.
// =============================================================================

import { db } from "../../../shared/db.js";
import { resolveVideosByIds } from "../utils/resolveVideos.js";
import type { ToolContext } from "../types.js";

/**
 * Resolve video titles to videoIds by querying all Firestore collections.
 * Returns a map of title → videoId for successfully resolved titles.
 *
 * Search order: videos/ → cached_external_videos/ → trendChannels/{ch}/videos/
 * Trade-off: trendChannels search = N channels × M titles queries.
 * Acceptable because title search is a rare fallback path (~5% of calls).
 */
async function resolveVideoIdsByTitle(
    basePath: string,
    titles: string[],
): Promise<{ resolved: Map<string, string>; unresolved: string[] }> {
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

export async function handleViewThumbnails(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const rawVideoIds = args.videoIds as string[] | undefined;
    const rawTitles = args.titles as string[] | undefined;

    const hasIds = Array.isArray(rawVideoIds) && rawVideoIds.length > 0;
    const hasTitles = Array.isArray(rawTitles) && rawTitles.length > 0;

    if (!hasIds && !hasTitles) {
        return { error: "At least one of videoIds or titles is required" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;

    // --- Phase 1: Resolve titles to videoIds (if provided) ---
    let titleResolvedIds: string[] = [];
    const unresolvedTitles: string[] = [];

    if (hasTitles) {
        // Cap titles at 20 to prevent abuse
        const cappedTitles = rawTitles.slice(0, 20);
        ctx.reportProgress?.(`Looking up ${cappedTitles.length} video(s) by title…`);
        const { resolved, unresolved } = await resolveVideoIdsByTitle(basePath, cappedTitles);
        titleResolvedIds = [...resolved.values()];
        unresolvedTitles.push(...unresolved);
    }

    // --- Phase 2: Merge IDs from both sources, deduplicate, cap at 50 ---
    const allIds = [...new Set([...(rawVideoIds ?? []), ...titleResolvedIds])].slice(0, 50);

    if (allIds.length === 0 && unresolvedTitles.length > 0) {
        return { error: "No videos found for the given titles", notFoundTitles: unresolvedTitles };
    }

    // --- Phase 3: Resolve videos (direct + publishedVideoId reverse lookup) ---
    const { resolved, missingIds: resolverMissing } = await resolveVideosByIds(basePath, allIds);

    const videos: Array<{ videoId: string; title: string; thumbnailUrl: string }> = [];
    const notFound: string[] = [...resolverMissing];
    const visualContextUrls: string[] = [];

    for (const id of allIds) {
        const entry = resolved.get(id);
        if (!entry) continue;

        const thumbnail = entry.data.thumbnail as string | undefined;
        if (!thumbnail) {
            notFound.push(id);
            continue;
        }

        videos.push({
            videoId: id,
            title: entry.data.title as string || "(untitled)",
            thumbnailUrl: thumbnail,
        });
        visualContextUrls.push(thumbnail);
    }

    return {
        videos,
        notFound,
        ...(unresolvedTitles.length > 0 ? { notFoundTitles: unresolvedTitles } : {}),
        visualContextUrls,
    };
}

