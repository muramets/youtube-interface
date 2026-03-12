/**
 * Builds a VideoPreviewData map from tool call results across chat messages.
 *
 * Scans all tool calls that return video data and merges them into a single
 * lookup map. Each tool contributes different fields — merge ensures the
 * richest available data for each video.
 *
 * Sources (in processing order):
 *   - mentionVideo:            videoId, title, thumbnailUrl, ownership, channelTitle
 *   - browseChannelVideos:     videoId, title, thumbnailUrl, viewCount, publishedAt
 *   - getMultipleVideoDetails: videoId, title, thumbnailUrl, ownership, channelTitle,
 *                               viewCount, publishedAt, duration, description, tags
 *   - findSimilarVideos:       videoId, title, channelTitle (via dataFreshness),
 *                               viewCount, publishedAt, deltas
 *   - browseTrendVideos:       videoId, title, channelTitle, thumbnailUrl,
 *                               viewCount, publishedAt, deltas
 *   - getNicheSnapshot:        videoId, title, channelTitle (from parent),
 *                               viewCount, publishedAt, deltas
 *   - searchDatabase:          videoId, title, channelTitle, viewCount,
 *                               publishedAt, deltas
 */

import type { ChatMessage } from '../../../core/types/chat/chat';
import type { VideoPreviewData } from '../../Video/types';

export function buildToolVideoMap(messages: ChatMessage[]): Map<string, VideoPreviewData> {
    const map = new Map<string, VideoPreviewData>();

    for (const msg of messages) {
        if (!msg.toolCalls) continue;
        for (const tc of msg.toolCalls) {
            if (!tc.result) continue;

            switch (tc.name) {
                case 'mentionVideo':
                    extractMention(tc.result, map);
                    break;
                case 'browseChannelVideos':
                    extractBrowse(tc.result, map);
                    break;
                case 'getMultipleVideoDetails':
                    extractDetails(tc.result, map);
                    break;
                case 'findSimilarVideos':
                    extractSimilar(tc.result, map);
                    break;
                case 'browseTrendVideos':
                    extractTrendVideos(tc.result, map);
                    break;
                case 'getNicheSnapshot':
                    extractNicheSnapshot(tc.result, map);
                    break;
                case 'searchDatabase':
                    extractSearchDatabase(tc.result, map);
                    break;
            }
        }
    }

    return map;
}

// ---------------------------------------------------------------------------
// Per-tool extractors
// ---------------------------------------------------------------------------

function extractMention(result: Record<string, unknown>, map: Map<string, VideoPreviewData>): void {
    if (!result.found || !result.videoId) return;
    const videoId = result.videoId as string;

    mergeInto(map, videoId, {
        title: result.title as string | undefined,
        thumbnailUrl: result.thumbnailUrl as string | undefined,
        youtubeVideoId: result.youtubeVideoId as string | undefined,
        ownership: result.ownership as VideoPreviewData['ownership'],
        channelTitle: result.channelTitle as string | undefined,
    });
}

function extractBrowse(result: Record<string, unknown>, map: Map<string, VideoPreviewData>): void {
    const videos = result.videos as Array<Record<string, unknown>> | undefined;
    if (!videos) return;

    for (const v of videos) {
        const videoId = v.videoId as string;
        if (!videoId) continue;

        mergeInto(map, videoId, {
            title: v.title as string | undefined,
            thumbnailUrl: v.thumbnailUrl as string | undefined,
            viewCount: v.viewCount as number | undefined,
            publishedAt: v.publishedAt as string | undefined,
        });
    }
}

function extractDetails(result: Record<string, unknown>, map: Map<string, VideoPreviewData>): void {
    const videos = result.videos as Array<Record<string, unknown>> | undefined;
    if (!videos) return;

    for (const v of videos) {
        const videoId = v.videoId as string;
        if (!videoId) continue;

        mergeInto(map, videoId, {
            title: v.title as string | undefined,
            thumbnailUrl: v.thumbnailUrl as string | undefined,
            youtubeVideoId: v.youtubeVideoId as string | undefined,
            ownership: v.ownership as VideoPreviewData['ownership'],
            channelTitle: v.channelTitle as string | undefined,
            viewCount: v.viewCount as number | undefined,
            publishedAt: v.publishedAt as string | undefined,
            duration: v.duration as string | undefined,
            description: v.description as string | undefined,
            tags: v.tags as string[] | undefined,
        });
    }
}

function extractSimilar(result: Record<string, unknown>, map: Map<string, VideoPreviewData>): void {
    const similar = result.similar as Array<Record<string, unknown>> | undefined;
    if (!similar) return;

    const channelNameMap = buildChannelNameMap(result.dataFreshness);

    for (const v of similar) {
        const videoId = v.videoId as string;
        if (!videoId) continue;

        const channelId = v.channelId as string | undefined;
        const channelTitle = (v.channelTitle as string | undefined)
            ?? (channelId ? channelNameMap.get(channelId) : undefined);

        mergeInto(map, videoId, {
            title: v.title as string | undefined,
            thumbnailUrl: v.thumbnailUrl as string | undefined,
            ownership: 'competitor',
            channelTitle,
            viewCount: v.viewCount as number | undefined,
            publishedAt: v.publishedAt as string | undefined,
            delta24h: v.viewDelta24h as number | null | undefined,
            delta7d: v.viewDelta7d as number | null | undefined,
            delta30d: v.viewDelta30d as number | null | undefined,
        });
    }
}

function extractTrendVideos(result: Record<string, unknown>, map: Map<string, VideoPreviewData>): void {
    const videos = result.videos as Array<Record<string, unknown>> | undefined;
    if (!videos) return;

    for (const v of videos) {
        const videoId = v.videoId as string;
        if (!videoId) continue;

        mergeInto(map, videoId, {
            title: v.title as string | undefined,
            thumbnailUrl: v.thumbnailUrl as string | undefined,
            ownership: 'competitor',
            channelTitle: v.channelTitle as string | undefined,
            viewCount: v.viewCount as number | undefined,
            publishedAt: v.publishedAt as string | undefined,
            delta24h: v.viewDelta24h as number | null | undefined,
            delta7d: v.viewDelta7d as number | null | undefined,
            delta30d: v.viewDelta30d as number | null | undefined,
        });
    }
}

function extractNicheSnapshot(result: Record<string, unknown>, map: Map<string, VideoPreviewData>): void {
    const activity = result.competitorActivity as Array<Record<string, unknown>> | undefined;
    if (!activity) return;

    for (const channel of activity) {
        const channelTitle = channel.channelTitle as string | undefined;
        const videos = channel.videos as Array<Record<string, unknown>> | undefined;
        if (!videos) continue;

        for (const v of videos) {
            const videoId = v.videoId as string;
            if (!videoId) continue;

            mergeInto(map, videoId, {
                title: v.title as string | undefined,
                thumbnailUrl: v.thumbnailUrl as string | undefined,
                ownership: 'competitor',
                channelTitle,
                viewCount: v.viewCount as number | undefined,
                publishedAt: v.publishedAt as string | undefined,
                delta24h: v.viewDelta24h as number | null | undefined,
                delta7d: v.viewDelta7d as number | null | undefined,
                delta30d: v.viewDelta30d as number | null | undefined,
            });
        }
    }
}

function extractSearchDatabase(result: Record<string, unknown>, map: Map<string, VideoPreviewData>): void {
    const results = result.results as Array<Record<string, unknown>> | undefined;
    if (!results) return;

    for (const v of results) {
        const videoId = v.videoId as string;
        if (!videoId) continue;

        mergeInto(map, videoId, {
            title: v.title as string | undefined,
            thumbnailUrl: v.thumbnailUrl as string | undefined,
            ownership: 'competitor',
            channelTitle: v.channelTitle as string | undefined,
            viewCount: v.viewCount as number | undefined,
            publishedAt: v.publishedAt as string | undefined,
            delta24h: v.viewDelta24h as number | null | undefined,
            delta7d: v.viewDelta7d as number | null | undefined,
            delta30d: v.viewDelta30d as number | null | undefined,
        });
    }
}

// ---------------------------------------------------------------------------
// Merge helper
// ---------------------------------------------------------------------------

type PartialVideo = Partial<Omit<VideoPreviewData, 'videoId'>>;

/** Merge incoming fields into an existing entry, filling gaps without overwriting. */
function mergeInto(
    map: Map<string, VideoPreviewData>,
    videoId: string,
    incoming: PartialVideo,
): void {
    const existing = map.get(videoId);

    if (!existing) {
        map.set(videoId, {
            videoId,
            youtubeVideoId: incoming.youtubeVideoId,
            title: incoming.title || '(untitled)',
            thumbnailUrl: incoming.thumbnailUrl,
            ownership: incoming.ownership,
            channelTitle: incoming.channelTitle,
            viewCount: incoming.viewCount,
            publishedAt: incoming.publishedAt,
            duration: incoming.duration,
            description: incoming.description,
            tags: incoming.tags,
            delta24h: incoming.delta24h,
            delta7d: incoming.delta7d,
            delta30d: incoming.delta30d,
        });
        return;
    }

    // Fill gaps — non-empty incoming values fill empty existing fields
    if (incoming.title && !existing.title) existing.title = incoming.title;
    if (incoming.youtubeVideoId && !existing.youtubeVideoId) existing.youtubeVideoId = incoming.youtubeVideoId;
    if (incoming.thumbnailUrl && !existing.thumbnailUrl) existing.thumbnailUrl = incoming.thumbnailUrl;
    if (incoming.ownership && !existing.ownership) existing.ownership = incoming.ownership;
    if (incoming.channelTitle && !existing.channelTitle) existing.channelTitle = incoming.channelTitle;
    if (incoming.viewCount != null && existing.viewCount == null) existing.viewCount = incoming.viewCount;
    if (incoming.publishedAt && !existing.publishedAt) existing.publishedAt = incoming.publishedAt;
    if (incoming.duration && !existing.duration) existing.duration = incoming.duration;
    if (incoming.description && !existing.description) existing.description = incoming.description;
    if (incoming.tags?.length && !existing.tags?.length) existing.tags = incoming.tags;
    if (incoming.delta24h != null && existing.delta24h == null) existing.delta24h = incoming.delta24h;
    if (incoming.delta7d != null && existing.delta7d == null) existing.delta7d = incoming.delta7d;
    if (incoming.delta30d != null && existing.delta30d == null) existing.delta30d = incoming.delta30d;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a channelId → channelTitle map from the dataFreshness array in tool results. */
function buildChannelNameMap(dataFreshness: unknown): Map<string, string> {
    const map = new Map<string, string>();
    if (!Array.isArray(dataFreshness)) return map;

    for (const entry of dataFreshness) {
        const channelId = (entry as Record<string, unknown>).channelId as string | undefined;
        const channelTitle = (entry as Record<string, unknown>).channelTitle as string | undefined;
        if (channelId && channelTitle) {
            map.set(channelId, channelTitle);
        }
    }
    return map;
}
