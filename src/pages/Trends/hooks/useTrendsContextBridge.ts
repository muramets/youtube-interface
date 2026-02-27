// =============================================================================
// useTrendsContextBridge — Sync Trends selection → appContextStore 'trends' slot
// =============================================================================
//
// Maps selected TrendVideo competitor videos to VideoCardContext items
// and pushes them to the 'trends' slot.
//
// Sticky behavior: deselecting does NOT remove context. Only explicit removal
// via the ✕ button in chat input clears items. Respects global `isBridgePaused`.
// =============================================================================

import { useEffect } from 'react';
import { useAppContextStore } from '../../../core/stores/appContextStore';
import type { TrendVideo } from '../../../core/types/trends';
import type { VideoCardContext } from '../../../core/types/appContext';
import { debug } from '../../../core/utils/debug';

/** Converts a TrendVideo (competitor data model) to a VideoCardContext for AI chat. */
function trendVideoToCardContext(video: TrendVideo): VideoCardContext {
    return {
        type: 'video-card',
        videoId: video.id,
        title: video.title,
        thumbnailUrl: video.thumbnail,
        viewCount: String(video.viewCount),
        ownership: 'competitor',
        ...(video.publishedAt ? { publishedAt: video.publishedAt } : {}),
        ...(video.duration ? { duration: video.duration } : {}),
        ...(video.tags ? { tags: video.tags } : {}),
        ...(video.description ? { description: video.description } : {}),
        ...(video.channelTitle ? { channelTitle: video.channelTitle } : {}),
    };
}

/**
 * Sync Trends page selection → appContextStore 'trends' slot.
 *
 * @param selectedIds - Set of selected TrendVideo IDs
 * @param videos - Full list of filtered TrendVideo items to pick from
 */
export function useTrendsContextBridge(
    selectedIds: Set<string>,
    videos: TrendVideo[],
): void {
    const setSlot = useAppContextStore(s => s.setSlot);
    const isBridgePaused = useAppContextStore(s => s.isBridgePaused);

    useEffect(() => {
        if (isBridgePaused) return;

        // Sticky: deselect = no-op, context stays
        if (selectedIds.size === 0) return;

        const newItems = videos
            .filter(v => selectedIds.has(v.id))
            .map(trendVideoToCardContext);

        // Dedup: merge with existing slot items by videoId
        const existing = useAppContextStore.getState().slots.trends;
        const existingIds = new Set(existing.map(i => i.type === 'video-card' ? i.videoId : ''));
        const toAdd = newItems.filter(i => !existingIds.has(i.videoId));

        if (toAdd.length > 0) {
            debug.context(`📊 TrendsBridge: adding ${toAdd.length} new items (${existing.length} existing)`);
            setSlot('trends', [...existing, ...toAdd]);
        }
    }, [selectedIds, videos, setSlot, isBridgePaused]);
}
