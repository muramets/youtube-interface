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
import type { ToolContext } from "../types.js";

export async function handleGetMultipleVideoDetails(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const videoIds = args.videoIds as string[];
    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
        return { error: "videoIds (non-empty array) is required" };
    }

    // Cap at 20 to prevent abuse
    const ids = videoIds.slice(0, 20);
    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;

    // --- Step 1: Batch read both Firestore collections in parallel ---
    const videoRefs = ids.map(id => db.doc(`${basePath}/videos/${id}`));
    const externalRefs = ids.map(id => db.doc(`${basePath}/cached_external_videos/${id}`));

    const [videoSnaps, externalSnaps] = await Promise.all([
        db.getAll(...videoRefs),
        db.getAll(...externalRefs),
    ]);

    const videos: Record<string, unknown>[] = [];
    const notFoundIds: string[] = [];

    for (let i = 0; i < ids.length; i++) {
        const videoId = ids[i];
        // Priority: own videos → external cache
        let snap;
        let collectionSource: CollectionSource = "own";
        if (videoSnaps[i].exists) {
            snap = videoSnaps[i];
            collectionSource = "own";
        } else if (externalSnaps[i].exists) {
            snap = externalSnaps[i];
            collectionSource = "external_cache";
        }

        if (!snap?.exists) {
            notFoundIds.push(videoId);
            continue;
        }

        videos.push(formatVideoData(videoId, snap.data()!, collectionSource));
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
                            channelTitle: item.snippet.channelTitle,
                            publishedAt: item.snippet.publishedAt,
                            thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
                            viewCount: parseInt(item.statistics.viewCount ?? "0", 10),
                            likeCount: parseInt(item.statistics.likeCount ?? "0", 10),
                            source: "api_fallback",
                            cachedAt: Date.now(),
                        };
                        writeBatch.set(
                            db.doc(`${basePath}/cached_external_videos/${item.id}`),
                            cacheData,
                        );
                        videos.push(formatVideoData(item.id, cacheData, "youtube_api"));
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

    return {
        videos,
        notFound: notFoundIds,
        ...(quotaUsed > 0 ? { quotaUsed } : {}),
    };
}

// --- Helpers ---

/** Which Firestore collection (or API) the video data came from. */
type CollectionSource = "own" | "external_cache" | "youtube_api";

function formatVideoData(
    videoId: string,
    data: Record<string, unknown>,
    source: CollectionSource,
): Record<string, unknown> {
    // Ownership: trust explicit field from videos/ collection,
    // everything else is external (competitor / cached)
    const ownership = source === "own"
        ? (data.ownership as string) || "own-published"
        : "external";

    return {
        videoId,
        title: data.title || "(untitled)",
        description: data.description || "",
        tags: data.tags || [],
        ownership,
        channelTitle: data.channelTitle || undefined,
        viewCount: data.viewCount || undefined,
        likeCount: data.likeCount || undefined,
        publishedAt: data.publishedAt || undefined,
        duration: data.duration || undefined,
        thumbnailUrl: data.thumbnail || undefined,
        // Traffic snapshot counts (denormalized from traffic/main and trafficSource/main)
        // Only present for own videos after user visits the Traffic tab (lazy sync)
        ...(source === "own" && typeof data.suggestedTrafficSnapshotCount === "number"
            ? { suggestedTrafficSnapshotCount: data.suggestedTrafficSnapshotCount } : {}),
        ...(source === "own" && typeof data.trafficSourceSnapshotCount === "number"
            ? { trafficSourceSnapshotCount: data.trafficSourceSnapshotCount } : {}),
    };
}
