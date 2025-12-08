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
    abTestVariants?: string[]; // Array of cover URLs or version IDs
    packagingHistory?: PackagingVersion[];
    currentPackagingVersion?: number;
    ctrRules?: CTRRule[];
    // Retry state for private/unavailable videos
    fetchRetryCount?: number;
    lastFetchAttempt?: number;
    fetchStatus?: 'pending' | 'success' | 'failed';
    isPlaylistOnly?: boolean;
}

export interface CTRRule {
    id: string;
    operator: '<' | '>' | '<=' | '>=' | 'between';
    value: number;
    maxValue?: number; // For 'between' operator
    color: string;
}

export interface PackagingMetrics {
    impressions: number | null;
    ctr: number | null; // Percentage
    views: number | null;
    avdSeconds: number | null; // Average View Duration in seconds
}

export interface ABVariantMetrics {
    variantId: string; // URL or ID of the variant
    watchTimePercentage: number;
}

export interface PackagingCheckin {
    id: string;
    date: number; // Timestamp
    metrics: PackagingMetrics;
    abMetrics?: ABVariantMetrics[];
    diffs?: Partial<PackagingMetrics>; // Difference from previous check-in
    ruleId?: string;
    isFinal?: boolean; // User manually marked as last for version
}

export interface PackagingVersion {
    versionNumber: number;
    startDate: number;
    endDate?: number;
    checkins: PackagingCheckin[];
    configurationSnapshot: {
        title: string;
        description: string;
        tags: string[];
        coverImage: string | null;
        abTestVariants: string[];
        localizations?: Record<string, VideoLocalization>;
    };
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
        // Fetch video details
        const videoResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`
        );
        const videoData = await videoResponse.json();

        if (!videoData.items || videoData.items.length === 0) {
            throw new Error('Video not found');
        }

        const videoItem = videoData.items[0];
        const snippet = videoItem.snippet;
        const contentDetails = videoItem.contentDetails;
        const statistics = videoItem.statistics;

        // Fetch channel details for avatar and subscriber count
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
        };
    } catch (error) {
        console.error('Error fetching video details:', error);
        return null;
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
