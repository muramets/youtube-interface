// =============================================================================
// useTrendsContextBridge — Sync Trends selection → appContextStore 'trends' slot
// =============================================================================
//
// Maps selected TrendVideo competitor videos to VideoCardContext items
// and pushes them to the 'trends' slot. Each bridge writes to its own slot —
// no priority coordination needed.
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
        publishedAt: video.publishedAt,
        duration: video.duration,
        tags: video.tags,
        description: video.description,
        channelTitle: video.channelTitle,
        ownership: 'competitor',
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
    const clearSlot = useAppContextStore(s => s.clearSlot);

    useEffect(() => {
        if (selectedIds.size === 0) {
            clearSlot('trends');
            return;
        }

        const items = videos
            .filter(v => selectedIds.has(v.id))
            .map(trendVideoToCardContext);
        debug.context(`📊 TrendsBridge: ${selectedIds.size} selected, ${items.length} mapped`);
        setSlot('trends', items);
    }, [selectedIds, videos, setSlot, clearSlot]);

    // Cleanup on unmount — clear context when leaving Trends page
    useEffect(() => {
        return () => clearSlot('trends');
    }, [clearSlot]);
}
