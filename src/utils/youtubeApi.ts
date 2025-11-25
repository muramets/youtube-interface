export interface VideoDetails {
    id: string;
    title: string;
    thumbnail: string;
    channelTitle: string;
    channelAvatar: string;
    publishedAt: string;
    viewCount?: string;
    duration?: string;
    isCustom?: boolean;
    customImage?: string;
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

        // Fetch channel details for avatar
        const channelResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${snippet.channelId}&key=${apiKey}`
        );
        const channelData = await channelResponse.json();
        const channelAvatar = channelData.items?.[0]?.snippet?.thumbnails?.default?.url || '';

        return {
            id: videoId,
            title: snippet.title,
            thumbnail: snippet.thumbnails.maxres?.url || snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url,
            channelTitle: snippet.channelTitle,
            channelAvatar: channelAvatar,
            publishedAt: snippet.publishedAt,
            viewCount: statistics.viewCount,
            duration: contentDetails.duration,
        };
    } catch (error) {
        console.error('Error fetching video details:', error);
        return null;
    }
};
