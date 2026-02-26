// =============================================================================
// buildReferenceMap — Single source of truth for video-to-reference-key mapping.
//
// Used by:
//   - chatStore.ts (system prompt) — to number videos for Gemini
//   - ChatMessageList.tsx (UI) — to resolve "Video #N" tooltips
//
// Both sides MUST use the same iteration order:
//   1. Canvas video nodes (sequential: video-1, video-2, ...)
//   2. Standalone video-cards, grouped by ownership (draft-1, published-1, competitor-1, ...)
// =============================================================================

import type { AppContextItem, VideoCardContext } from '../types/appContext';
import { getCanvasContexts, getVideoCards } from '../types/appContext';
import { OWNERSHIP_CONFIG } from '../../features/Chat/utils/referencePatterns';

export interface VideoReference {
    /** Reference key, e.g. "video-1", "draft-2", "competitor-1" */
    key: string;
    /** The video card data for tooltip rendering */
    video: VideoCardContext;
}

/**
 * Builds a Map<referenceKey, VideoCardContext> from context items.
 *
 * Iteration order matches the system prompt numbering exactly:
 * 1. Canvas context nodes (type: video, traffic-source) → keyed as "video-N"
 * 2. Standalone video cards → keyed per ownership group ("draft-N", "published-N", "competitor-N")
 */
export function buildReferenceMap(ctx: AppContextItem[]): Map<string, VideoCardContext> {
    const map = new Map<string, VideoCardContext>();
    let canvasVideoIndex = 0;

    // 1. Canvas context — sequential "video-N" keys
    for (const cc of getCanvasContexts(ctx)) {
        for (const node of cc.nodes) {
            if (node.nodeType === 'video') {
                canvasVideoIndex++;
                map.set(`video-${canvasVideoIndex}`, {
                    type: 'video-card',
                    videoId: node.videoId,
                    title: node.title,
                    description: node.description,
                    tags: node.tags,
                    thumbnailUrl: node.thumbnailUrl,
                    channelTitle: node.channelTitle,
                    viewCount: node.viewCount ?? undefined,
                    publishedAt: node.publishedAt,
                    duration: node.duration,
                    ownership: node.ownership,
                });
            } else if (node.nodeType === 'traffic-source' && node.title) {
                canvasVideoIndex++;
                map.set(`video-${canvasVideoIndex}`, {
                    type: 'video-card',
                    videoId: node.videoId || '',
                    title: node.title,
                    thumbnailUrl: node.thumbnailUrl ?? '',
                    channelTitle: node.channelTitle,
                    viewCount: node.views != null ? String(node.views) : undefined,
                    ownership: 'competitor',
                });
            }
        }
    }

    // 2. Standalone video cards — keyed per ownership group
    const videoCards = getVideoCards(ctx);
    const groupCounters: Record<string, number> = {};
    for (const vc of videoCards) {
        const refType = OWNERSHIP_CONFIG[vc.ownership ?? '']?.refType || 'video';
        groupCounters[refType] = (groupCounters[refType] || 0) + 1;
        map.set(`${refType}-${groupCounters[refType]}`, vc);
    }

    return map;
}

export interface VideoBadgeInfo {
    /** 1-based index within its reference group */
    index: number;
    /** Short badge prefix from OWNERSHIP_CONFIG (e.g. "D", "P", "C") or empty for canvas */
    prefix: string;
}

/**
 * Derives badge info (index + prefix) per videoId from the reference map.
 * Use in ContextAccordion to show consistent numbering on video chips.
 */
export function buildVideoBadgeMap(ctx: AppContextItem[]): Map<string, VideoBadgeInfo> {
    const refMap = buildReferenceMap(ctx);
    const badgeMap = new Map<string, VideoBadgeInfo>();

    for (const [key, video] of refMap) {
        const match = key.match(/^(.+)-(\d+)$/);
        if (!match) continue;
        const [, refType, indexStr] = match;
        const config = Object.values(OWNERSHIP_CONFIG).find(c => c.refType === refType);
        badgeMap.set(video.videoId, {
            index: parseInt(indexStr),
            prefix: config?.badgePrefix || '',
        });
    }

    return badgeMap;
}
