/**
 * Adapter: VideoCardContext → VideoPreviewData.
 *
 * Single conversion point for persisted app context → tooltip data.
 * viewCount: string → number, type/color/addedAt/publishedVideoId stripped.
 */

import type { VideoCardContext } from '../../../core/types/appContext';
import type { VideoPreviewData } from '../../Video/types';

export function toPreviewData(ctx: VideoCardContext): VideoPreviewData {
    return {
        videoId: ctx.videoId,
        title: ctx.title,
        thumbnailUrl: ctx.thumbnailUrl || undefined,
        channelTitle: ctx.channelTitle,
        channelId: ctx.channelId,
        viewCount: ctx.viewCount ? Number(ctx.viewCount) : undefined,
        publishedAt: ctx.publishedAt,
        duration: ctx.duration,
        description: ctx.description,
        tags: ctx.tags,
        ownership: ctx.ownership,
        delta24h: ctx.delta24h,
        delta7d: ctx.delta7d,
        delta30d: ctx.delta30d,
    };
}
