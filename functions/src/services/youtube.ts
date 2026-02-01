import axios from "axios";
import { YouTubePlaylistResponse, YouTubeVideoResponse, YouTubePlaylistItem, YouTubeVideoItem } from "../types";

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
                // request snippet AND statistics
                const statsRes: axios.AxiosResponse<YouTubeVideoResponse> = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
                    params: {
                        part: 'snippet,statistics',
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
