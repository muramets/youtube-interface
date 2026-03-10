// =============================================================================
// mentionVideo handler — looks up a video by ID for structured mentions
// =============================================================================

import { resolveVideosByIds } from "../utils/resolveVideos.js";
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

    const { resolved } = await resolveVideosByIds(basePath, [videoId]);
    const entry = resolved.get(videoId);

    if (!entry) {
        return { found: false, videoId, error: "Video not found in database" };
    }

    const data = entry.data;
    // Build standard YouTube thumbnail URL from videoId as fallback.
    // Custom videos (docId starts with "custom-") don't have YouTube CDN thumbnails.
    const thumbnailUrl = data.thumbnail
        || (entry.docId.startsWith('custom-') ? '' : `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`);
    // Determine ownership based on resolver source
    const ownership = entry.source === "trend_channel"
        ? "competitor"
        : ((data.ownership as string) || "own-published");
    return {
        found: true,
        videoId,
        title: data.title || "(untitled)",
        ownership,
        channelTitle: data.channelTitle || undefined,
        thumbnailUrl,
    };
}
