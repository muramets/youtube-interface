// =============================================================================
// getMultipleVideoDetails handler — batch fetch video metadata from Firestore
//
// Searches in two collections:
//   1. videos/{videoId}                          — published, draft, competitor
//   2. cached_suggested_traffic_videos/{videoId}  — suggested traffic
// =============================================================================

import { db } from "../../../shared/db.js";
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

    // Build refs for both collections
    const videoRefs = ids.map(id => db.doc(`${basePath}/videos/${id}`));
    const suggestedRefs = ids.map(id => db.doc(`${basePath}/cached_suggested_traffic_videos/${id}`));

    // Batch read both collections in parallel
    const [videoSnaps, suggestedSnaps] = await Promise.all([
        db.getAll(...videoRefs),
        db.getAll(...suggestedRefs),
    ]);

    const videos: Record<string, unknown>[] = [];
    const notFound: string[] = [];

    for (let i = 0; i < ids.length; i++) {
        const videoId = ids[i];
        // Prefer main videos/ collection, fallback to cached_suggested
        const snap = videoSnaps[i].exists ? videoSnaps[i] : suggestedSnaps[i];

        if (!snap.exists) {
            notFound.push(videoId);
            continue;
        }

        const data = snap.data()!;
        videos.push({
            videoId,
            title: data.title || "(untitled)",
            description: data.description || "",
            tags: data.tags || [],
            ownership: data.ownership || "own-published",
            channelTitle: data.channelTitle || undefined,
            viewCount: data.viewCount || undefined,
            likeCount: data.likeCount || undefined,
            publishedAt: data.publishedAt || undefined,
            duration: data.duration || undefined,
            thumbnailUrl: data.thumbnailUrl || undefined,
        });
    }

    return { videos, notFound };
}
