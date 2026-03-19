import type { VideoPreviewData } from '../../../../../features/Video/types'
import type { KiPreviewData } from '../types'

const EMPTY_VIDEO_MAP = new Map<string, VideoPreviewData>()
const EMPTY_KI_MAP = new Map<string, KiPreviewData>()

/**
 * Build a lookup Map from a VideoPreviewData catalog.
 * Keys by both `videoId` and `youtubeVideoId` (if different) for dual-key lookup.
 */
export function buildCatalogVideoMap(catalog: VideoPreviewData[] | undefined): Map<string, VideoPreviewData> {
    if (!catalog?.length) return EMPTY_VIDEO_MAP
    const map = new Map<string, VideoPreviewData>()
    for (const v of catalog) {
        map.set(v.videoId, v)
        if (v.youtubeVideoId && v.youtubeVideoId !== v.videoId) {
            map.set(v.youtubeVideoId, v)
        }
    }
    return map
}

/**
 * Build a lookup Map from a KiPreviewData catalog.
 */
export function buildCatalogKiMap(catalog: KiPreviewData[] | undefined): Map<string, KiPreviewData> {
    if (!catalog?.length) return EMPTY_KI_MAP
    const map = new Map<string, KiPreviewData>()
    for (const ki of catalog) {
        map.set(ki.id, ki)
    }
    return map
}
