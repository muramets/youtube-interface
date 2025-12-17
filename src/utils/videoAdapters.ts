import type { TrendVideo } from '../types/trends';
import type { VideoDetails } from './youtubeApi';

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
        duration: video.duration,
        description: video.description,
        tags: video.tags,
        // Default/Empty values for required fields missing in TrendVideo
        isCustom: false,
        createdAt: Date.now()
    };
};
