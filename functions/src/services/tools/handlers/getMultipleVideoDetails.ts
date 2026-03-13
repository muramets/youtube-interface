// =============================================================================
// getMultipleVideoDetails handler — batch fetch video metadata
//
// Cascade search (cheapest → most expensive):
//   1. videos/{videoId}                — own videos (0 cost)
//   2. cached_external_videos/{videoId} — external cache (0 cost)
//   3. YouTube Data API fallback        — 1 unit per 50 videos
//
// YouTube results are cached in cached_external_videos/ for future 0-cost lookups.
// =============================================================================

import { db } from "../../../shared/db.js";
import { YouTubeService } from "../../youtube.js";
import { resolveVideosByIds } from "../utils/resolveVideos.js";
import { resolveVideoIdsByTitle } from "../utils/resolveVideosByTitle.js";
import { resolveThumbnailUrl } from "../utils/resolveThumbnailUrl.js";
import { getViewDeltas } from "../../trendSnapshotService.js";
import type { ToolContext } from "../types.js";

export async function handleGetMultipleVideoDetails(
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

    // --- Phase 0: Resolve titles to videoIds (if provided) ---
    let titleResolvedIds: string[] = [];
    const notFoundTitles: string[] = [];

    if (hasTitles) {
        const cappedTitles = rawTitles.slice(0, 20);
        ctx.reportProgress?.(`Looking up ${cappedTitles.length} video(s) by title…`);
        const { resolved, unresolved } = await resolveVideoIdsByTitle(basePath, cappedTitles);
        titleResolvedIds = [...resolved.values()];
        notFoundTitles.push(...unresolved);
    }

    // Merge: explicit videoIds + title-resolved IDs, deduplicate, cap at 20
    const ids = [...new Set([...(rawVideoIds ?? []), ...titleResolvedIds])].slice(0, 20);

    if (ids.length === 0) {
        return {
            videos: [],
            notFound: [],
            ...(notFoundTitles.length > 0 ? { notFoundTitles } : {}),
            error: notFoundTitles.length > 0
                ? `No videos found for titles: ${notFoundTitles.join(", ")}`
                : "No valid video IDs to look up",
        };
    }

    // --- Step 1: Resolve videos from Firestore (direct + publishedVideoId) ---
    const { resolved, missingIds: notFoundIds } = await resolveVideosByIds(basePath, ids);

    const videos: Record<string, unknown>[] = [];
    for (const id of ids) {
        const entry = resolved.get(id);
        if (!entry) continue;

        const collectionSource: CollectionSource =
            entry.source === "video_grid" ? "own"
                : entry.source === "trend_channel" ? "competitor"
                    : "external_cache";
        videos.push(formatVideoData(id, entry.data, collectionSource, ctx.channelName));
    }

    // --- Step 2: YouTube API fallback for remaining IDs ---
    let quotaUsed = 0;
    if (notFoundIds.length > 0 && ctx.youtubeApiKey) {
        try {
            const yt = new YouTubeService(ctx.youtubeApiKey);
            const details = await yt.getVideoDetails(notFoundIds);
            quotaUsed = details.quotaUsed;

            // Cache fetched videos and add to results
            if (details.videos.length > 0) {
                const WRITE_BATCH_SIZE = 500;
                for (let b = 0; b < details.videos.length; b += WRITE_BATCH_SIZE) {
                    const chunk = details.videos.slice(b, b + WRITE_BATCH_SIZE);
                    const writeBatch = db.batch();
                    for (const item of chunk) {
                        const cacheData: Record<string, unknown> = {
                            title: item.snippet.title,
                            description: item.snippet.description ?? "",
                            tags: item.snippet.tags ?? [],
                            channelId: item.snippet.channelId || undefined,
                            channelTitle: item.snippet.channelTitle,
                            publishedAt: item.snippet.publishedAt,
                            thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
                            viewCount: parseInt(item.statistics.viewCount ?? "0", 10),
                            likeCount: parseInt(item.statistics.likeCount ?? "0", 10),
                            commentCount: parseInt(item.statistics.commentCount ?? "0", 10),
                            source: "api_fallback",
                            cachedAt: Date.now(),
                        };
                        writeBatch.set(
                            db.doc(`${basePath}/cached_external_videos/${item.id}`),
                            cacheData,
                        );
                        videos.push(formatVideoData(item.id, cacheData, "youtube_api", ctx.channelName));
                    }
                    await writeBatch.commit();
                }

                // Remove successfully fetched IDs from notFound
                const fetchedIds = new Set(details.videos.map(v => v.id));
                const stillMissing = notFoundIds.filter(id => !fetchedIds.has(id));
                notFoundIds.length = 0;
                notFoundIds.push(...stillMissing);
            }
        } catch (err) {
            console.warn(`[getMultipleVideoDetails] YouTube API fallback failed:`, err);
            // Continue with what we have — notFoundIds stays as-is
        }
    }

    // --- Step 3: Enrich with view deltas (24h/7d/30d) ---
    try {
        const allVideoIds = videos.map(v => v.videoId as string);
        const hints = new Set(
            videos.map(v => v.channelId as string).filter(Boolean),
        );
        const deltaMap = await getViewDeltas(
            ctx.userId, ctx.channelId, allVideoIds,
            hints.size > 0 ? hints : undefined,
        );
        for (const video of videos) {
            const stats = deltaMap.get(video.videoId as string);
            if (stats) {
                video.viewDelta24h = stats.delta24h;
                video.viewDelta7d = stats.delta7d;
                video.viewDelta30d = stats.delta30d;
            }
        }
    } catch (err) {
        console.warn("[getMultipleVideoDetails] View deltas enrichment failed:", err);
    }

    return {
        videos,
        notFound: notFoundIds,
        ...(notFoundTitles.length > 0 ? { notFoundTitles } : {}),
        ...(quotaUsed > 0 ? { quotaUsed } : {}),
    };
}

// --- Helpers ---

/** Which Firestore collection (or API) the video data came from. */
type CollectionSource = "own" | "external_cache" | "competitor" | "youtube_api";

function formatVideoData(
    videoId: string,
    data: Record<string, unknown>,
    source: CollectionSource,
    channelName?: string,
): Record<string, unknown> {
    // Ownership: isCustom = own video, channelTitle match = own published YouTube video
    const isOwn = !!data.isCustom || !!(channelName && data.channelTitle === channelName);
    const ownership = isOwn
        ? (data.isCustom && !data.publishedVideoId ? "own-draft" : "own-published")
        : "external";

    // YouTube-embeddable video ID: for custom videos use publishedVideoId,
    // for regular videos videoId IS the YouTube ID, for drafts — undefined.
    const youtubeVideoId = data.isCustom
        ? (data.publishedVideoId as string | undefined)
        : videoId;

    return {
        videoId,
        ...(youtubeVideoId && youtubeVideoId !== videoId ? { youtubeVideoId } : {}),
        title: data.title || "(untitled)",
        description: data.description || "",
        tags: data.tags || [],
        ownership,
        channelId: data.channelId || undefined,
        channelTitle: data.channelTitle || undefined,
        viewCount: data.viewCount != null ? Number(data.viewCount) || undefined : undefined,
        likeCount: data.likeCount != null ? Number(data.likeCount) || undefined : undefined,
        commentCount: data.commentCount != null ? Number(data.commentCount) || undefined : undefined,
        publishedAt: data.publishedAt || undefined,
        duration: data.duration || undefined,
        thumbnailUrl: resolveThumbnailUrl(videoId, data.thumbnail as string | undefined),
        // Traffic snapshot counts (denormalized from traffic/main and trafficSource/main)
        // Only present for own videos after user visits the Traffic tab (lazy sync)
        ...(isOwn && typeof data.suggestedTrafficSnapshotCount === "number"
            ? { suggestedTrafficSnapshotCount: data.suggestedTrafficSnapshotCount } : {}),
        ...(isOwn && typeof data.trafficSourceSnapshotCount === "number"
            ? { trafficSourceSnapshotCount: data.trafficSourceSnapshotCount } : {}),
    };
}
