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
    coverHistory?: { url: string; version: number; timestamp: number; originalName?: string }[];
    customImageName?: string;
    customImageVersion?: number;
    highestVersion?: number;
    notes?: VideoNote[];
}

export interface VideoNote {
    id: string;
    text: string;
    timestamp: number;
    userId?: string;
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
