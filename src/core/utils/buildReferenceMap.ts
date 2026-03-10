// =============================================================================
// buildReferenceMap — Single source of truth for video-to-reference-key mapping.
//
// Used by:
//   - persistentContextLayer.ts (system prompt) — to number videos for Gemini
//   - ChatMessageList.tsx (UI) — to resolve "Video #N" / "SV N" tooltips
//
// Both sides MUST use the same iteration order:
//   1. Standalone video-cards → sorted by addedAt for chronological numbering
//   2. Canvas video nodes → continuing counters (ownership-based keys)
//   3. Traffic suggested videos (suggested-1, suggested-2, ...)
// =============================================================================

import type { AppContextItem, VideoCardContext } from '../types/appContext';
import { getCanvasContexts, getVideoCards, getTrafficContexts } from '../types/appContext';
import { OWNERSHIP_CONFIG } from '../config/referencePatterns';

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
 * 1. Standalone video cards → sorted by addedAt for chronological numbering
 * 2. Canvas context nodes (type: video, traffic-source) → continuing counters
 * 3. Traffic suggested videos → "suggested-N"
 */
export function buildReferenceMap(ctx: AppContextItem[]): Map<string, VideoCardContext> {
    const map = new Map<string, VideoCardContext>();
    // Shared counters per refType — standalone and canvas increment the same numbers
    const counters: Record<string, number> = {};

    const nextKey = (ownership: string | undefined): string => {
        const refType = OWNERSHIP_CONFIG[ownership ?? '']?.refType || 'video';
        counters[refType] = (counters[refType] || 0) + 1;
        return `${refType}-${counters[refType]}`;
    };

    // 1. Standalone video cards FIRST — sorted by addedAt for chronological numbering
    const videoCards = [...getVideoCards(ctx)].sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
    for (const vc of videoCards) {
        map.set(nextKey(vc.ownership), vc);
    }

    // 2. Canvas context — ownership-based keys (continuing counters)
    for (const cc of getCanvasContexts(ctx)) {
        for (const node of cc.nodes) {
            if (node.nodeType === 'video') {
                map.set(nextKey(node.ownership), {
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
                map.set(nextKey('competitor'), {
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

    // 3. Traffic suggested videos — keyed as "suggested-N"
    let suggestedIndex = 0;
    for (const tc of getTrafficContexts(ctx)) {
        for (const sv of tc.suggestedVideos) {
            suggestedIndex++;
            map.set(`suggested-${suggestedIndex}`, {
                type: 'video-card',
                videoId: sv.videoId,
                title: sv.title,
                thumbnailUrl: sv.thumbnailUrl ?? '',
                channelTitle: sv.channelTitle,
                viewCount: sv.viewCount,
                publishedAt: sv.publishedAt,
                duration: sv.duration,
                description: sv.description,
                tags: sv.tags,
                // NOTE: ownership is 'competitor' because VideoCardContext only allows
                // 'own-draft' | 'own-published' | 'competitor'. Suggested videos are
                // third-party content, so 'competitor' is the closest fit. The display
                // layer uses refType ('suggested') via REF_TYPE_LABELS for correct labels.
                ownership: 'competitor',
            });
        }
    }


    return map;
}

export interface VideoBadgeInfo {
    /** 1-based index within its reference group */
    index: number;
    /** Short badge prefix from OWNERSHIP_CONFIG (e.g. "D", "C") or empty for published */
    prefix: string;
    /** Reference type key matching REFERENCE_PATTERNS (e.g. 'draft', 'competitor', 'video') */
    refType: string;
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
            refType,
        });
    }

    return badgeMap;
}

/**
 * Builds a flat Map<videoId, VideoCardContext> from context items.
 * Used by MarkdownMessage to resolve `mention://videoId` links to VideoReferenceTooltip.
 * Reuses buildReferenceMap to avoid duplicating type-narrowing logic.
 */
export function buildVideoIdMap(ctx: AppContextItem[]): Map<string, VideoCardContext> {
    const refMap = buildReferenceMap(ctx);
    const idMap = new Map<string, VideoCardContext>();
    for (const video of refMap.values()) {
        if (video.videoId) idMap.set(video.videoId, video);
    }
    return idMap;
}
