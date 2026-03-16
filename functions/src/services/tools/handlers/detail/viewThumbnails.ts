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

import { resolveVideosByIds } from "../../utils/resolveVideos.js";
import { resolveVideoIdsByTitle } from "../../utils/resolveVideosByTitle.js";
import type { ToolContext } from "../../types.js";

export async function handleViewThumbnails(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    // Defensive: small models (Haiku) sometimes pass a string instead of an array
    const rawVideoIds = Array.isArray(args.videoIds) ? args.videoIds as string[]
        : typeof args.videoIds === 'string' ? [args.videoIds]
        : undefined;
    const rawTitles = Array.isArray(args.titles) ? args.titles as string[]
        : typeof args.titles === 'string' ? [args.titles]
        : undefined;

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

