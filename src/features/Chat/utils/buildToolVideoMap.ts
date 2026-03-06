/**
 * Builds a VideoCardContext map from tool call results across chat messages.
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
 */

import type { ChatMessage } from '../../../core/types/chat/chat';
import type { VideoCardContext } from '../../../core/types/appContext';

export function buildToolVideoMap(messages: ChatMessage[]): Map<string, VideoCardContext> {
    const map = new Map<string, VideoCardContext>();

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
            }
        }
    }

    return map;
}

// ---------------------------------------------------------------------------
// Per-tool extractors
// ---------------------------------------------------------------------------

function extractMention(result: Record<string, unknown>, map: Map<string, VideoCardContext>): void {
    if (!result.found || !result.videoId) return;
    const videoId = result.videoId as string;

    mergeInto(map, videoId, {
        title: result.title as string | undefined,
        thumbnailUrl: result.thumbnailUrl as string | undefined,
        ownership: result.ownership as VideoCardContext['ownership'] | undefined,
        channelTitle: result.channelTitle as string | undefined,
    });
}

function extractBrowse(result: Record<string, unknown>, map: Map<string, VideoCardContext>): void {
    const videos = result.videos as Array<Record<string, unknown>> | undefined;
    if (!videos) return;

    for (const v of videos) {
        const videoId = v.videoId as string;
        if (!videoId) continue;

        mergeInto(map, videoId, {
            title: v.title as string | undefined,
            thumbnailUrl: v.thumbnailUrl as string | undefined,
            viewCount: stringifyCount(v.viewCount),
            publishedAt: v.publishedAt as string | undefined,
        });
    }
}

function extractDetails(result: Record<string, unknown>, map: Map<string, VideoCardContext>): void {
    const videos = result.videos as Array<Record<string, unknown>> | undefined;
    if (!videos) return;

    for (const v of videos) {
        const videoId = v.videoId as string;
        if (!videoId) continue;

        mergeInto(map, videoId, {
            title: v.title as string | undefined,
            thumbnailUrl: v.thumbnailUrl as string | undefined,
            ownership: v.ownership as VideoCardContext['ownership'] | undefined,
            channelTitle: v.channelTitle as string | undefined,
            viewCount: stringifyCount(v.viewCount),
            publishedAt: v.publishedAt as string | undefined,
            duration: v.duration as string | undefined,
            description: v.description as string | undefined,
            tags: v.tags as string[] | undefined,
        });
    }
}

// ---------------------------------------------------------------------------
// Merge helper
// ---------------------------------------------------------------------------

type PartialVideo = Partial<Omit<VideoCardContext, 'type' | 'videoId'>>;

/** Merge incoming fields into an existing entry, filling gaps without overwriting. */
function mergeInto(
    map: Map<string, VideoCardContext>,
    videoId: string,
    incoming: PartialVideo,
): void {
    const existing = map.get(videoId);

    if (!existing) {
        map.set(videoId, {
            type: 'video-card',
            videoId,
            title: incoming.title || '(untitled)',
            thumbnailUrl: incoming.thumbnailUrl || '',
            ownership: incoming.ownership || 'competitor',
            channelTitle: incoming.channelTitle,
            viewCount: incoming.viewCount,
            publishedAt: incoming.publishedAt,
            duration: incoming.duration,
            description: incoming.description,
            tags: incoming.tags,
        });
        return;
    }

    // Fill gaps — non-empty incoming values fill empty existing fields
    if (incoming.title && !existing.title) existing.title = incoming.title;
    if (incoming.thumbnailUrl && !existing.thumbnailUrl) existing.thumbnailUrl = incoming.thumbnailUrl;
    if (incoming.ownership && existing.ownership === 'competitor') existing.ownership = incoming.ownership;
    if (incoming.channelTitle && !existing.channelTitle) existing.channelTitle = incoming.channelTitle;
    if (incoming.viewCount && !existing.viewCount) existing.viewCount = incoming.viewCount;
    if (incoming.publishedAt && !existing.publishedAt) existing.publishedAt = incoming.publishedAt;
    if (incoming.duration && !existing.duration) existing.duration = incoming.duration;
    if (incoming.description && !existing.description) existing.description = incoming.description;
    if (incoming.tags?.length && !existing.tags?.length) existing.tags = incoming.tags;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** VideoCardContext.viewCount is string; tool results may return number. */
function stringifyCount(value: unknown): string | undefined {
    if (value == null) return undefined;
    return String(value);
}
