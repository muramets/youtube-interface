// =============================================================================
// mentionVideo handler — looks up a video by ID for structured mentions
// =============================================================================

import { resolveVideosByIds } from "../utils/resolveVideos.js";
import { resolveThumbnailUrl } from "../utils/resolveThumbnailUrl.js";
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
    const thumbnailUrl = resolveThumbnailUrl(videoId, data.thumbnail as string | undefined);
    // Determine ownership: isCustom = own video, channelTitle match = own published YouTube video
    const ownership = data.isCustom
        ? (data.publishedVideoId ? "own-published" : "own-draft")
        : (ctx.channelName && data.channelTitle === ctx.channelName)
            ? "own-published"
            : "competitor";
    // YouTube-embeddable ID: for custom videos use publishedVideoId, for drafts — undefined.
    const youtubeVideoId = data.isCustom
        ? (data.publishedVideoId as string | undefined)
        : videoId;

    return {
        found: true,
        videoId,
        ...(youtubeVideoId && youtubeVideoId !== videoId ? { youtubeVideoId } : {}),
        title: data.title || "(untitled)",
        ownership,
        channelTitle: data.channelTitle || undefined,
        thumbnailUrl,
    };
}
