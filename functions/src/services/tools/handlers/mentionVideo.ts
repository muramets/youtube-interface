// =============================================================================
// mentionVideo handler — looks up a video by ID for structured mentions
// =============================================================================

import { db } from "../../../shared/db.js";
import type { ToolContext } from "../types.js";

export async function handleMentionVideo(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const videoId = args.videoId as string;
    if (!videoId) {
        return { error: "videoId is required" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;

    // Search in videos/ first, fallback to cached_external_videos/
    const videoSnap = await db.doc(`${basePath}/videos/${videoId}`).get();
    const snap = videoSnap.exists
        ? videoSnap
        : await db.doc(`${basePath}/cached_external_videos/${videoId}`).get();

    if (!snap.exists) {
        return { found: false, videoId, error: "Video not found in database" };
    }

    const data = snap.data()!;
    // Build standard YouTube thumbnail URL from videoId as fallback
    const thumbnailUrl = data.thumbnailUrl
        || (videoId.startsWith('custom-') ? '' : `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`);
    return {
        found: true,
        videoId,
        title: data.title || "(untitled)",
        ownership: data.ownership || "own-published",
        channelTitle: data.channelTitle || undefined,
        thumbnailUrl,
    };
}
