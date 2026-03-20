// =============================================================================
// extractMentionedVideos — resolve @-mentioned video IDs from message text
//
// Parses vid:// links from markdown, looks up each in the videoCatalog,
// and returns matched VideoPreviewData entries for Firestore persistence.
// =============================================================================

import type { VideoPreviewData } from '../../Video/types';

/** Matches [any text](vid://VIDEOID) in markdown — captures the video ID. */
const VID_LINK_RE = /\]\(vid:\/\/([^)]+)\)/g;

/**
 * Extract video preview data for all vid:// mentions in a markdown string.
 *
 * @param text - Markdown message text (may contain `[Title](vid://videoId)` links)
 * @param catalog - Current videoCatalog (own + trend videos, already in memory)
 * @returns Array of VideoPreviewData for matched videos (empty if none found)
 */
export function extractMentionedVideos(
    text: string,
    catalog: VideoPreviewData[],
): VideoPreviewData[] {
    if (!text || !catalog.length) return [];

    // Collect unique video IDs from vid:// links
    const ids = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = VID_LINK_RE.exec(text)) !== null) {
        ids.add(match[1]);
    }
    if (ids.size === 0) return [];

    // Build a quick lookup from catalog (keyed by videoId + youtubeVideoId)
    const catalogMap = new Map<string, VideoPreviewData>();
    for (const v of catalog) {
        catalogMap.set(v.videoId, v);
        if (v.youtubeVideoId && v.youtubeVideoId !== v.videoId) {
            catalogMap.set(v.youtubeVideoId, v);
        }
    }

    // Resolve each mentioned ID
    const result: VideoPreviewData[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
        const video = catalogMap.get(id);
        if (video && !seen.has(video.videoId)) {
            seen.add(video.videoId);
            result.push(video);
        }
    }
    return result;
}
