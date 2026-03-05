// =============================================================================
// getChannelOverview handler — Layer 1: Discovery
//
// Resolves a YouTube channel (URL, @handle, or raw ID) and returns metadata:
// title, subscriberCount, videoCount, uploadsPlaylistId, quotaEstimate.
//
// Always safe — costs 1-2 API units. Returns QUOTA_GATE _systemNote
// so the LLM asks the user before calling browseChannelVideos.
// =============================================================================

import { YouTubeService } from "../../youtube.js";
import type { ToolContext } from "../types.js";

export async function handleGetChannelOverview(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    // --- Args validation ---
    const channelInput = args.channelId as string;
    if (typeof channelInput !== "string" || !channelInput.trim()) {
        return { error: "channelId (string) is required. Accepts: channel URL, @handle, or raw channel ID." };
    }

    // --- YouTube API key check ---
    if (!ctx.youtubeApiKey) {
        return {
            error: "YouTube API key is not configured. The user needs to set their YouTube Data API key in Settings → API Key.",
        };
    }

    const yt = new YouTubeService(ctx.youtubeApiKey);

    // --- Resolve channel ---
    ctx.reportProgress?.("Resolving channel...");

    let channelId: string;
    let resolveQuota: number;
    try {
        const resolved = await yt.resolveChannelId(channelInput);
        channelId = resolved.channelId;
        resolveQuota = resolved.quotaUsed;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Failed to resolve channel: ${msg}` };
    }

    // --- Get channel info ---
    ctx.reportProgress?.("Loading channel info...");

    let channelInfo: Awaited<ReturnType<YouTubeService["getChannelInfo"]>>;
    try {
        channelInfo = await yt.getChannelInfo(channelId);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Failed to get channel info: ${msg}` };
    }

    // --- Estimate quota for browseChannelVideos ---
    const listPages = Math.ceil(channelInfo.videoCount / 50);
    const detailBatches = Math.ceil(channelInfo.videoCount / 50);
    const estimatedQuota = listPages + detailBatches;

    return {
        _systemNote: `QUOTA_GATE: ${channelInfo.videoCount} videos, up to ~${estimatedQuota} units (less if some already cached). Ask user before calling browseChannelVideos.`,
        channelId: channelInfo.id,
        channelTitle: channelInfo.title,
        handle: channelInfo.handle,
        videoCount: channelInfo.videoCount,
        subscriberCount: channelInfo.subscriberCount,
        uploadsPlaylistId: channelInfo.uploadsPlaylistId,
        quotaCost: estimatedQuota,
        quotaUsed: resolveQuota + channelInfo.quotaUsed,
    };
}
