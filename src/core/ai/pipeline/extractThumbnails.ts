// =============================================================================
// extractThumbnails — Collect deduplicated thumbnail URLs from context
//
// Pure function — no I/O, no side effects.
// Extracts thumbnail URLs from all context types (video cards, suggested
// traffic, canvas nodes) for attaching as images to the Gemini request.
// =============================================================================

import type { AppContextItem } from '../../types/appContext';
import { getVideoCards, getTrafficContexts, getCanvasContexts } from '../../types/appContext';

/**
 * Extract and deduplicate all thumbnail URLs from the given context items.
 *
 * @param context - Persisted context items (accumulated from conversation)
 * @returns Deduplicated array of thumbnail URLs
 */
export function extractThumbnails(context: AppContextItem[] | undefined): string[] {
    if (!context) return [];

    const urls: string[] = [];

    // Video cards
    getVideoCards(context)
        .forEach(c => { if (c.thumbnailUrl) urls.push(c.thumbnailUrl); });

    // Suggested traffic: source video + suggested videos
    getTrafficContexts(context)
        .forEach(tc => {
            if (tc.sourceVideo.thumbnailUrl) urls.push(tc.sourceVideo.thumbnailUrl);
            tc.suggestedVideos.forEach(sv => {
                if (sv.thumbnailUrl) urls.push(sv.thumbnailUrl);
            });
        });

    // Canvas selection: video thumbnails + image downloadUrls
    getCanvasContexts(context)
        .forEach(cc => {
            cc.nodes.forEach(node => {
                if (node.nodeType === 'video' || node.nodeType === 'traffic-source') {
                    if (node.thumbnailUrl) urls.push(node.thumbnailUrl);
                }
                if (node.nodeType === 'image') {
                    if (node.imageUrl) urls.push(node.imageUrl);
                }
            });
        });

    // Deduplicate — same video can appear in multiple context sources
    return [...new Set(urls)];
}
