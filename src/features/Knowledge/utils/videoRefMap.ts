import type { VideoPreviewData } from '../../Video/types'

const EMPTY_MAP = new Map<string, VideoPreviewData>()

/**
 * Build a lookup Map from a VideoPreviewData catalog.
 * Keys by both `videoId` and `youtubeVideoId` (if different) for dual-key lookup.
 *
 * Used by KnowledgePage, WatchPage, KnowledgeItemModal, and RichTextEditor
 * to resolve vid:// links into tooltip data.
 */
export function buildCatalogVideoMap(catalog: VideoPreviewData[] | undefined): Map<string, VideoPreviewData> {
    if (!catalog?.length) return EMPTY_MAP
    const map = new Map<string, VideoPreviewData>()
    for (const v of catalog) {
        map.set(v.videoId, v)
        if (v.youtubeVideoId && v.youtubeVideoId !== v.videoId) {
            map.set(v.youtubeVideoId, v)
        }
    }
    return map
}
