import type { PackagingVersion, CTRRule, PackagingCheckin } from '../types/versioning';
import type { GalleryItem, GallerySource } from '../types/gallery';
export type { PackagingVersion, CTRRule, PackagingCheckin };

export interface VideoDetails {
    id: string;
    title: string;
    thumbnail: string;
    channelId: string;
    channelTitle: string;
    channelAvatar: string;
    publishedAt: string;
    viewCount?: string;
    duration?: string;
    isCustom?: boolean;
    customImage?: string;
    createdAt?: number;
    description?: string;
    likeCount?: string;
    subscriberCount?: string;
    embedUrl?: string;
    tags?: string[];
    lastUpdated?: number;
    coverHistory?: CoverVersion[];
    customImageName?: string;
    customImageVersion?: number;
    likedThumbnailVersions?: number[];
    highestVersion?: number;
    notes?: VideoNote[];
    isCloned?: boolean;
    expiresAt?: number;
    clonedFromId?: string;
    fileVersionMap?: Record<string, number>;
    historyCount?: number;
    publishedVideoId?: string;
    mergedVideoData?: VideoDetails;
    videoRender?: string;
    audioRender?: string;
    isDraft?: boolean;
    localizations?: Record<string, VideoLocalization>;
    abTestTitles?: string[];
    abTestThumbnails?: string[];
    abTestResults?: {
        titles: number[];
        thumbnails: number[];
    };
    abTestVariantIndex?: number; // Index of the A/B test variant this video is cloned from (linked clone)
    abTestVariants?: string[]; // Deprecated? Keeping for backward compat if needed, but likely unused in new flow
    packagingHistory?: PackagingVersion[];
    currentPackagingVersion?: number;
    activeVersion?: number | 'draft'; // The packaging version currently active for this video
    packagingRevision?: number; // Incremented on every packaging change to detect stale state
    ctrRules?: CTRRule[];
    // Retry state for private/unavailable videos
    fetchRetryCount?: number;
    lastFetchAttempt?: number;
    fetchStatus?: 'pending' | 'success' | 'failed';
    isPlaylistOnly?: boolean;
    addedToHomeAt?: number; // Timestamp when added to Home Page (not playlist-only)
    // Visual Gallery
    galleryItems?: GalleryItem[]; // Array of gallery images for this video
    gallerySources?: GallerySource[]; // Array of inspiration sources for this video
}






export interface VideoLocalization {
    languageCode: string;
    displayName?: string;
    flag?: string;
    title: string;
    description: string;
    tags: string[];
}

export interface VideoNote {
    id: string;
    text: string;
    timestamp: number;
    userId?: string;
}

export interface CoverVersion {
    url: string;
    version: number;
    timestamp: number;
    originalName?: string;
}

export interface HistoryItem {
    timestamp: number;
    [key: string]: unknown; // Allow flexibility for history items
}

export const extractVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

export const fetchVideoDetails = async (videoId: string, apiKey: string): Promise<VideoDetails | null> => {
    try {
        const videoResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`
        );

        if (videoResponse.status === 404) {
            throw new Error('VIDEO_NOT_FOUND');
        }

        const videoData = await videoResponse.json();

        if (videoData.error) {
            if (videoData.error.code === 403) throw new Error('VIDEO_PRIVATE');
            throw new Error(videoData.error.message || 'API_ERROR');
        }

        if (!videoData.items || videoData.items.length === 0) {
            throw new Error('VIDEO_NOT_FOUND');
        }

        const videoItem = videoData.items[0];
        const snippet = videoItem.snippet;
        const contentDetails = videoItem.contentDetails;
        const statistics = videoItem.statistics;

        // Fetch channel details
        const channelResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${snippet.channelId}&key=${apiKey}`
        );
        const channelData = await channelResponse.json();
        const channelItem = channelData.items?.[0];
        const channelAvatar = channelItem?.snippet?.thumbnails?.default?.url || '';
        const subscriberCount = channelItem?.statistics?.subscriberCount;

        return {
            id: videoId,
            title: snippet.title,
            thumbnail: snippet.thumbnails.maxres?.url || snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url,
            channelId: snippet.channelId,
            channelTitle: snippet.channelTitle,
            channelAvatar: channelAvatar,
            publishedAt: snippet.publishedAt,
            viewCount: statistics.viewCount,
            duration: contentDetails.duration,
            description: snippet.description,
            likeCount: statistics.likeCount,
            subscriberCount: subscriberCount,
            tags: snippet.tags || [],
            fetchStatus: 'success',
            lastFetchAttempt: Date.now()
        };
    } catch (error) {
        console.error('Error fetching video details:', error);
        throw error;
    }
};

interface YouTubeVideoItem {
    id: string;
    snippet: {
        title: string;
        channelId: string;
        channelTitle: string;
        publishedAt: string;
        description: string;
        thumbnails: {
            maxres?: { url: string };
            high?: { url: string };
            medium?: { url: string };
            default?: { url: string };
        };
        tags?: string[];
    };
    contentDetails: {
        duration: string;
    };
    statistics: {
        viewCount: string;
        likeCount: string;
    };
}

interface YouTubeChannelItem {
    id: string;
    snippet: {
        thumbnails: {
            default: { url: string };
        };
    };
    statistics: {
        subscriberCount: string;
    };
}

export const fetchVideosBatch = async (videoIds: string[], apiKey: string): Promise<VideoDetails[]> => {
    if (videoIds.length === 0) return [];

    try {
        // 1. Batch fetch videos (up to 50)
        const idsParam = videoIds.join(',');
        const videoResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${idsParam}&key=${apiKey}`
        );
        const videoData = await videoResponse.json();

        if (!videoData.items || videoData.items.length === 0) return [];

        const videos = videoData.items as YouTubeVideoItem[];

        // 2. Collect unique channel IDs
        const channelIds = new Set<string>();
        videos.forEach((v) => {
            if (v.snippet?.channelId) channelIds.add(v.snippet.channelId);
        });

        // 3. Batch fetch channels
        const channelMap = new Map<string, YouTubeChannelItem>();
        if (channelIds.size > 0) {
            const channelIdsParam = Array.from(channelIds).join(',');
            const channelResponse = await fetch(
                `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIdsParam}&key=${apiKey}`
            );
            const channelData = await channelResponse.json();
            channelData.items?.forEach((c: YouTubeChannelItem) => {
                channelMap.set(c.id, c);
            });
        }

        // 4. Merge data
        return videos.map((videoItem) => {
            const snippet = videoItem.snippet;
            const contentDetails = videoItem.contentDetails;
            const statistics = videoItem.statistics;
            const channelItem = channelMap.get(snippet.channelId);

            return {
                id: videoItem.id,
                title: snippet.title,
                thumbnail: snippet.thumbnails.maxres?.url || snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url || '',
                channelId: snippet.channelId,
                channelTitle: snippet.channelTitle,
                channelAvatar: channelItem?.snippet?.thumbnails?.default?.url || '',
                publishedAt: snippet.publishedAt,
                viewCount: statistics.viewCount,
                duration: contentDetails.duration,
                description: snippet.description,
                likeCount: statistics.likeCount,
                subscriberCount: channelItem?.statistics?.subscriberCount,
                tags: snippet.tags || [],
            };
        });

    } catch (error) {
        console.error('Error fetching videos batch:', error);
        throw error; // Re-throw to handle in store (e.g. quota error)
    }
};
