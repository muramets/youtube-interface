/**
 * Build a Map<videoId, VideoPreviewData> from a videos array.
 * Used by KnowledgeCard to resolve videoRefs into tooltip data.
 */
import type { VideoDetails } from '../../../core/utils/youtubeApi'
import type { VideoPreviewData } from '../../Video/types'

export function buildVideoRefMap(videos: VideoDetails[]): Map<string, VideoPreviewData> {
    const map = new Map<string, VideoPreviewData>()
    for (const v of videos) {
        const preview: VideoPreviewData = {
            videoId: v.id,
            youtubeVideoId: v.publishedVideoId ?? v.id,
            title: v.title,
            thumbnailUrl: v.thumbnail,
            channelTitle: v.channelTitle,
            viewCount: v.viewCount ? Number(v.viewCount) : undefined,
            publishedAt: v.publishedAt,
            duration: v.duration,
            ownership: v.isDraft ? 'own-draft' : v.isCustom ? 'own-published' : 'own-published',
        }
        map.set(v.id, preview)
        // Also index by publishedVideoId for YouTube IDs
        if (v.publishedVideoId && v.publishedVideoId !== v.id) {
            map.set(v.publishedVideoId, preview)
        }
    }
    return map
}
