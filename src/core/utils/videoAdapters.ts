import type { TrendVideo } from '../types/trends';
import type { VideoDetails } from './youtubeApi';
import type { VideoCardContext } from '../types/appContext';

export const trendVideoToVideoDetails = (video: TrendVideo, channelAvatar: string = ''): VideoDetails => {
    return {
        id: video.id,
        title: video.title,
        thumbnail: video.thumbnail,
        channelId: video.channelId,
        channelTitle: video.channelTitle || '',
        channelAvatar: channelAvatar,
        publishedAt: video.publishedAt,
        viewCount: video.viewCount.toString(),
        duration: video.duration || 'PT0S',
        description: video.description || '',
        tags: video.tags || [],
        // Default/Empty values for required fields missing in TrendVideo
        isCustom: false,
        createdAt: Date.now()
    };
};

/**
 * Convert a TrendVideo to a VideoCardContext for canvas nodes.
 * Ownership is determined by comparing channelTitle to the user's own channel name.
 */
export const trendVideoToVideoCardContext = (
    video: TrendVideo,
    ownChannelName?: string,
): VideoCardContext => {
    const isOwnChannel = ownChannelName != null && video.channelTitle === ownChannelName;
    return {
        type: 'video-card',
        ownership: isOwnChannel ? 'own-published' : 'competitor',
        videoId: video.id,
        publishedVideoId: video.id, // trend videos always have a YouTube ID
        title: video.title,
        description: video.description || '',
        tags: video.tags || [],
        thumbnailUrl: video.thumbnail,
        ...(video.viewCount ? { viewCount: video.viewCount.toString() } : {}),
        ...(video.publishedAt ? { publishedAt: video.publishedAt } : {}),
        ...(video.duration ? { duration: video.duration } : {}),
        ...(!isOwnChannel && video.channelTitle ? { channelTitle: video.channelTitle } : {}),
    };
};
