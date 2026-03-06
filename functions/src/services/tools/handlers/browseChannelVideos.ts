// =============================================================================
// browseChannelVideos handler — Layer 1: Discovery
//
// Fetches the video list from a YouTube channel's uploads playlist.
// Requires uploadsPlaylistId (from getChannelOverview) — structural dependency
// ensures the user approved the quota cost before this tool runs.
//
// Smart caching (2-level cascade):
//   1. videos/ + cached_external_videos/ (parallel batch reads)
//   2. YouTube API (only for truly missing videoIds)
// =============================================================================

import { db } from "../../../shared/db.js";
import { YouTubeService } from "../../youtube.js";
import { resolveVideosByIds } from "../utils/resolveVideos.js";
import type { ToolContext } from "../types.js";
import type { YouTubeVideoItem } from "../../../types.js";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleBrowseChannelVideos(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    // --- Args validation ---
    const uploadsPlaylistId = args.uploadsPlaylistId as string;
    if (typeof uploadsPlaylistId !== "string" || !uploadsPlaylistId.trim()) {
        return {
            error: "uploadsPlaylistId (string) is required. Call getChannelOverview first to get it.",
        };
    }

    const targetChannelId = typeof args.channelId === "string" ? args.channelId.trim() : undefined;
    const publishedAfter = typeof args.publishedAfter === "string" ? args.publishedAfter : undefined;

    // --- YouTube API key check ---
    if (!ctx.youtubeApiKey) {
        return {
            error: "YouTube API key is not configured. The user needs to set their YouTube Data API key in Settings → API Key.",
        };
    }

    const yt = new YouTubeService(ctx.youtubeApiKey);

    // --- Fetch video list from uploads playlist ---
    ctx.reportProgress?.("Fetching video list from YouTube...");

    let allVideoIds: string[];
    let listQuota: number;
    try {
        const playlist = await yt.getPlaylistVideos(uploadsPlaylistId);
        allVideoIds = playlist.videoIds;
        listQuota = playlist.quotaUsed;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Failed to fetch video list: ${msg}` };
    }

    // --- Smart cache check — find what we already have ---
    // Uses resolveVideosByIds which handles both direct doc IDs and
    // custom videos (custom-XXXX) matched via publishedVideoId field.
    ctx.reportProgress?.("Checking cache for existing videos...");

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;

    const { resolved, missingIds } = await resolveVideosByIds(basePath, allVideoIds);

    const cachedVideoData = new Map<string, Record<string, unknown>>();
    for (const [ytId, entry] of resolved) {
        cachedVideoData.set(ytId, {
            ...entry.data,
            _cached: true,
            _source: entry.source,
        });
    }

    // --- Fetch missing videos from YouTube API (level 2) ---
    let detailsQuota = 0;
    let fetchedFromYouTube = 0;
    if (missingIds.length > 0) {
        ctx.reportProgress?.(`Fetching ${missingIds.length} videos from YouTube...`);

        try {
            const details = await yt.getVideoDetails(missingIds);
            detailsQuota = details.quotaUsed;
            fetchedFromYouTube = details.videos.length;

            // Cache fetched videos in cached_external_videos/
            // Firestore WriteBatch limit = 500 ops, so chunk the writes
            const WRITE_BATCH_SIZE = 500;
            for (let b = 0; b < details.videos.length; b += WRITE_BATCH_SIZE) {
                const chunk = details.videos.slice(b, b + WRITE_BATCH_SIZE);
                const writeBatch = db.batch();
                for (const video of chunk) {
                    const cacheData = youtubeItemToCacheDoc(video);
                    cachedVideoData.set(video.id, { ...cacheData, _cached: false, _source: "youtube_api" });
                    writeBatch.set(
                        db.doc(`${basePath}/cached_external_videos/${video.id}`),
                        cacheData,
                    );
                }
                await writeBatch.commit();
            }
        } catch (err) {
            console.warn(`[browseChannelVideos] Failed to fetch missing videos: ${err}`);
            // Continue with what we have cached
        }
    }

    // --- Build compact response ---
    const videos: Record<string, unknown>[] = [];
    for (const videoId of allVideoIds) {
        const data = cachedVideoData.get(videoId);
        if (!data) continue;

        const publishedAt = String(data.publishedAt ?? "");

        // Apply publishedAfter filter (parse to Date for safe comparison)
        if (publishedAfter && publishedAt) {
            const pubTime = new Date(publishedAt).getTime();
            const afterTime = new Date(publishedAfter).getTime();
            if (!isNaN(pubTime) && !isNaN(afterTime) && pubTime < afterTime) {
                continue;
            }
        }

        videos.push({
            videoId,
            title: data.title || "(untitled)",
            publishedAt,
            viewCount: data.viewCount ?? data.views ?? undefined,
            thumbnailUrl: data.thumbnail ?? data.thumbnailUrl ??
                `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        });
    }

    const totalQuota = listQuota + detailsQuota;

    // --- Own channel sync comparison ---
    // Show inApp vs onYouTube delta when browsing the user's own channel.
    // Detection: videos in videos/ collection have a channelId field — match against targetChannelId.
    // Requires targetChannelId to be passed (from getChannelOverview response).
    const inApp = targetChannelId
        ? [...cachedVideoData.values()].filter(v => v._source === "video_grid" && v.channelId === targetChannelId).length
        : 0;

    return {
        videos,
        totalVideosOnYouTube: allVideoIds.length,
        alreadyCached: allVideoIds.length - missingIds.length,
        fetchedFromYouTube,
        quotaUsed: totalQuota,
        ...(inApp > 0 && {
            ownChannelSync: {
                inApp,
                onYouTube: allVideoIds.length,
                notInApp: allVideoIds.length - inApp,
            },
        }),
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function youtubeItemToCacheDoc(item: YouTubeVideoItem): Record<string, unknown> {
    return {
        title: item.snippet.title,
        description: item.snippet.description ?? "",
        tags: item.snippet.tags ?? [],
        channelId: item.snippet.channelId || undefined,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
        viewCount: parseInt(item.statistics.viewCount ?? "0", 10),
        likeCount: parseInt(item.statistics.likeCount ?? "0", 10),
        source: "channel_discovery",
        cachedAt: Date.now(),
    };
}
