import axios from "axios";
import { YouTubePlaylistResponse, YouTubeVideoResponse, YouTubeChannelResponse, YouTubePlaylistItem, YouTubeVideoItem, YouTubeCommentThreadResponse } from "../types";

export interface CommentThreadResult {
    author: string;
    authorChannelId?: string;
    text: string;
    likeCount: number;
    publishedAt: string;
    replyCount: number;
    topReplies?: Array<{
        author: string;
        text: string;
        likeCount: number;
        publishedAt: string;
    }>;
}

export class YouTubeService {
    constructor(private apiKey: string) { }

    /**
     * Fetches all video IDs from a specific playlist (e.g., Uploads playlist).
     * Handles pagination automatically.
     */
    async getPlaylistVideos(playlistId: string): Promise<{ videoIds: string[], quotaUsed: number }> {
        const videoIds: string[] = [];
        let nextPageToken: string | undefined = undefined;
        let quotaUsed = 0;

        do {
            try {
                const res: axios.AxiosResponse<YouTubePlaylistResponse> = await axios.get(`https://www.googleapis.com/youtube/v3/playlistItems`, {
                    params: {
                        part: 'contentDetails',
                        playlistId: playlistId,
                        maxResults: 50,
                        key: this.apiKey,
                        pageToken: nextPageToken
                    }
                });

                quotaUsed++; // 1 unit per page

                const items = res.data.items || [];
                if (items.length > 0) {
                    const ids = items.map((i: YouTubePlaylistItem) => i.contentDetails.videoId);
                    videoIds.push(...ids);
                }

                nextPageToken = res.data.nextPageToken;
            } catch (error) {
                console.error(`Error fetching playlist page for ${playlistId}:`, error);
                throw error;
            }
        } while (nextPageToken);

        return { videoIds, quotaUsed };
    }

    /**
     * Fetches details (snippet + statistics) for a list of video IDs.
     * Batches requests in chunks of 50.
     */
    async getVideoDetails(videoIds: string[]): Promise<{ videos: YouTubeVideoItem[], quotaUsed: number }> {
        if (videoIds.length === 0) return { videos: [], quotaUsed: 0 };

        const videos: YouTubeVideoItem[] = [];
        let quotaUsed = 0;
        const chunkSize = 50;

        for (let i = 0; i < videoIds.length; i += chunkSize) {
            const chunk = videoIds.slice(i, i + chunkSize);
            const idsString = chunk.join(',');

            try {
                // request snippet, statistics, AND contentDetails (duration)
                const statsRes: axios.AxiosResponse<YouTubeVideoResponse> = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
                    params: {
                        part: 'snippet,statistics,contentDetails',
                        id: idsString,
                        key: this.apiKey
                    }
                });

                quotaUsed++; // 1 unit per batch

                if (statsRes.data.items) {
                    videos.push(...statsRes.data.items);
                }
            } catch (error) {
                console.error(`Error fetching video details chunk:`, error);
                // Don't throw entire process if one chunk fails? 
                // Better to throw so we know sync failed.
                throw error;
            }
        }

        return { videos, quotaUsed };
    }

    /**
     * Fetches channel info: title, subscriber count, video count, uploads playlist ID.
     * Uses channels.list with snippet + statistics + contentDetails (1 quota unit).
     */
    async getChannelInfo(channelId: string): Promise<{
        id: string;
        title: string;
        handle?: string;
        subscriberCount: number;
        videoCount: number;
        uploadsPlaylistId: string;
        avatarUrl?: string;
        quotaUsed: number;
    }> {
        const res: axios.AxiosResponse<YouTubeChannelResponse> = await axios.get(
            `https://www.googleapis.com/youtube/v3/channels`,
            {
                params: {
                    part: "snippet,statistics,contentDetails",
                    id: channelId,
                    key: this.apiKey,
                },
            },
        );

        const item = res.data.items?.[0];
        if (!item) {
            throw new Error(`Channel not found: ${channelId}`);
        }

        return {
            id: item.id,
            title: item.snippet.title,
            handle: item.snippet.customUrl,
            subscriberCount: parseInt(item.statistics.subscriberCount ?? "0", 10),
            videoCount: parseInt(item.statistics.videoCount ?? "0", 10),
            uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
            avatarUrl: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
            quotaUsed: 1,
        };
    }

    /**
     * Resolves a YouTube channel URL, @handle, or raw channel ID to a channelId.
     *
     * Supported formats:
     * - youtube.com/channel/UCxxx → extract from URL (0 API units)
     * - youtube.com/@handle, @handle → channels.list(forHandle) (1 unit)
     * - youtube.com/c/Name, youtube.com/user/Name → treated as handle (1 unit)
     * - Raw UCxxx (≥20 chars starting with UC) → returned as-is (0 units)
     * - Bare string → treated as handle (1 unit)
     */
    async resolveChannelId(input: string): Promise<{ channelId: string; quotaUsed: number }> {
        const trimmed = input.trim();
        if (!trimmed) throw new Error("Empty channel input");

        let channelId = "";
        let handle = "";

        // Try to parse as URL
        try {
            const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
            const pathname = url.pathname;

            // @handle format: youtube.com/@handle
            const handleMatch = pathname.match(/\/@([^/]+)/);
            if (handleMatch) {
                handle = "@" + handleMatch[1];
            }
            // Channel ID format: youtube.com/channel/UCxxx
            else if (pathname.includes("/channel/")) {
                const idMatch = pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
                if (idMatch) channelId = idMatch[1];
            }
            // Custom URL: youtube.com/c/Name
            else if (pathname.includes("/c/")) {
                const customMatch = pathname.match(/\/c\/([^/]+)/);
                if (customMatch) handle = "@" + customMatch[1];
            }
            // User format: youtube.com/user/Name
            else if (pathname.includes("/user/")) {
                const userMatch = pathname.match(/\/user\/([^/]+)/);
                if (userMatch) handle = "@" + userMatch[1];
            }
        } catch {
            // Not a valid URL — fall through to direct parsing
        }

        // Direct input fallback
        if (!channelId && !handle) {
            if (trimmed.startsWith("@")) {
                handle = trimmed;
            } else if (trimmed.startsWith("UC") && trimmed.length >= 20) {
                channelId = trimmed;
            } else {
                handle = "@" + trimmed;
            }
        }

        // If we already have a channelId, return immediately (0 units)
        if (channelId) {
            return { channelId, quotaUsed: 0 };
        }

        // Resolve handle via YouTube API (1 unit)
        const res: axios.AxiosResponse<YouTubeChannelResponse> = await axios.get(
            `https://www.googleapis.com/youtube/v3/channels`,
            {
                params: {
                    part: "id",
                    forHandle: handle,
                    key: this.apiKey,
                },
            },
        );

        const resolved = res.data.items?.[0]?.id;
        if (!resolved) {
            throw new Error(`Channel not found for handle: ${handle}`);
        }

        return { channelId: resolved, quotaUsed: 1 };
    }

    /**
     * Fetches comment threads for a video (single page).
     * Handler controls pagination by passing pageToken for subsequent calls.
     */
    async getCommentThreads(videoId: string, options?: {
        order?: "relevance" | "time";
        maxResults?: number;
        pageToken?: string;
    }): Promise<{
        comments: CommentThreadResult[];
        totalResults: number;
        nextPageToken?: string;
        quotaUsed: number;
    }> {
        const res: axios.AxiosResponse<YouTubeCommentThreadResponse> = await axios.get(
            `https://www.googleapis.com/youtube/v3/commentThreads`,
            {
                params: {
                    part: "snippet,replies",
                    videoId,
                    order: options?.order ?? "relevance",
                    maxResults: options?.maxResults ?? 100,
                    textFormat: "plainText",
                    key: this.apiKey,
                    ...(options?.pageToken ? { pageToken: options.pageToken } : {}),
                },
            },
        );

        const items = res.data.items ?? [];
        const comments: CommentThreadResult[] = items.map(thread => {
            const topSnippet = thread.snippet.topLevelComment.snippet;
            const topReplies = thread.replies?.comments?.map(reply => ({
                author: reply.snippet.authorDisplayName,
                text: reply.snippet.textDisplay,
                likeCount: reply.snippet.likeCount,
                publishedAt: reply.snippet.publishedAt,
            }));

            return {
                author: topSnippet.authorDisplayName,
                authorChannelId: topSnippet.authorChannelId?.value,
                text: topSnippet.textDisplay,
                likeCount: topSnippet.likeCount,
                publishedAt: topSnippet.publishedAt,
                replyCount: thread.snippet.totalReplyCount,
                ...(topReplies && topReplies.length > 0 ? { topReplies } : {}),
            };
        });

        return {
            comments,
            totalResults: res.data.pageInfo.totalResults,
            ...(res.data.nextPageToken ? { nextPageToken: res.data.nextPageToken } : {}),
            quotaUsed: 1,
        };
    }

    /**
     * Batch-fetches subscriber counts for multiple channels in a single API call.
     * Supports up to 50 channels per request (YouTube API limit).
     */
    async getChannelSubscriberCounts(channelIds: string[]): Promise<{ counts: Map<string, number>, quotaUsed: number }> {
        if (channelIds.length === 0) return { counts: new Map(), quotaUsed: 0 };

        const counts = new Map<string, number>();
        let quotaUsed = 0;
        const chunkSize = 50;

        for (let i = 0; i < channelIds.length; i += chunkSize) {
            const chunk = channelIds.slice(i, i + chunkSize);
            const idsString = chunk.join(",");

            const res: axios.AxiosResponse<YouTubeChannelResponse> = await axios.get(
                `https://www.googleapis.com/youtube/v3/channels`,
                {
                    params: {
                        part: "statistics",
                        id: idsString,
                        key: this.apiKey,
                    },
                },
            );

            quotaUsed++;

            for (const item of res.data.items ?? []) {
                counts.set(item.id, parseInt(item.statistics.subscriberCount ?? "0", 10));
            }
        }

        return { counts, quotaUsed };
    }

    /**
     * Fetches the channel's avatar URL.
     */
    async getChannelAvatar(channelId: string): Promise<{ avatarUrl?: string, quotaUsed: number }> {
        try {
            const res = await axios.get(`https://www.googleapis.com/youtube/v3/channels`, {
                params: {
                    part: 'snippet',
                    id: channelId,
                    key: this.apiKey
                }
            });

            const item = res.data.items?.[0];
            const avatarUrl = item?.snippet?.thumbnails?.medium?.url || item?.snippet?.thumbnails?.default?.url;

            return { avatarUrl, quotaUsed: 1 };
        } catch (error) {
            console.error(`Error fetching avatar for ${channelId}:`, error);
            return { quotaUsed: 0 };
        }
    }
}
