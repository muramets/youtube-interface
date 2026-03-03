// =============================================================================
// viewThumbnails handler — batch fetch thumbnail URLs for visual context
//
// Searches in two collections (same as getMultipleVideoDetails):
//   1. videos/{videoId}                          — own/competitor videos
//   2. cached_suggested_traffic_videos/{videoId}  — suggested traffic
//
// Accepts videoIds directly OR titles for lookup (fallback when IDs are unknown).
// Returns visualContextUrls for thumbnailMiddleware to process.
// Does NOT download images — that is thumbnailMiddleware's job.
// =============================================================================

import { db } from "../../../shared/db.js";
import type { ToolContext } from "../types.js";

/**
 * Resolve video titles to videoIds by querying both Firestore collections.
 * Returns a map of title → videoId for successfully resolved titles.
 */
async function resolveVideoIdsByTitle(
    basePath: string,
    titles: string[],
): Promise<{ resolved: Map<string, string>; unresolved: string[] }> {
    const resolved = new Map<string, string>();
    const unresolved: string[] = [];

    // Query both collections in parallel for each title
    const queries = titles.map(async (title) => {
        const [videoSnap, suggestedSnap] = await Promise.all([
            db.collection(`${basePath}/videos`).where("title", "==", title).limit(1).get(),
            db.collection(`${basePath}/cached_suggested_traffic_videos`).where("title", "==", title).limit(1).get(),
        ]);

        // Prefer main videos/ collection
        const doc = !videoSnap.empty ? videoSnap.docs[0] : (!suggestedSnap.empty ? suggestedSnap.docs[0] : null);

        if (doc) {
            resolved.set(title, doc.id);
        } else {
            unresolved.push(title);
        }
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

    // --- Phase 3: Standard batch lookup by videoId ---
    const videoRefs = allIds.map(id => db.doc(`${basePath}/videos/${id}`));
    const suggestedRefs = allIds.map(id => db.doc(`${basePath}/cached_suggested_traffic_videos/${id}`));

    const [videoSnaps, suggestedSnaps] = await Promise.all([
        db.getAll(...videoRefs),
        db.getAll(...suggestedRefs),
    ]);

    const videos: Array<{ videoId: string; title: string; thumbnailUrl: string }> = [];
    const notFound: string[] = [];
    const visualContextUrls: string[] = [];

    for (let i = 0; i < allIds.length; i++) {
        const videoId = allIds[i];
        const snap = videoSnaps[i].exists ? videoSnaps[i] : suggestedSnaps[i];

        if (!snap.exists) {
            notFound.push(videoId);
            continue;
        }

        const data = snap.data()!;
        const thumbnail = data.thumbnail as string | undefined;

        if (!thumbnail) {
            notFound.push(videoId);
            continue;
        }

        videos.push({
            videoId,
            title: data.title as string || "(untitled)",
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

