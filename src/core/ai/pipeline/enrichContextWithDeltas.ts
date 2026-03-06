// =============================================================================
// enrichContextWithDeltas — Enrichment middleware for AppContextItems
//
// Post-processing step that adds delta view data (24h/7d/30d) to
// VideoCardContext items before they are sent to Gemini.
//
// Called imperatively from chatStore.sendMessage() — no React dependency.
// Reads trendChannels from Zustand store, computes deltas via pure function.
// =============================================================================

import type { AppContextItem, VideoCardContext } from '../../types/appContext';
import { computeVideoDeltas } from '../../utils/computeVideoDeltas';
import { useTrendStore } from '../../stores/trends/trendStore';
import { useChannelStore } from '../../stores/channelStore';
import { debug } from '../../utils/debug';

/**
 * Enrich VideoCardContext items with delta view stats from Trend Snapshots.
 * Items without matching snapshot data are returned unchanged.
 *
 * Extracts channelId from video-card items to narrow snapshot lookups
 * (channelIdHints optimization — fewer Firestore reads).
 *
 * @param items - Raw context items from appContextStore
 * @param userId - Firebase user ID
 * @returns Enriched copy of items (never mutates originals)
 */
export async function enrichContextWithDeltas(
    items: AppContextItem[],
    userId: string,
): Promise<AppContextItem[]> {
    // Collect video IDs from all video-card items
    const videoCards = items.filter(
        (i): i is VideoCardContext => i.type === 'video-card',
    );

    if (videoCards.length === 0) return items;

    const videoIds = videoCards.map(v => v.videoId);

    // Extract channelId hints from video-card items to narrow snapshot lookups
    const channelIds = videoCards
        .map(v => v.channelId)
        .filter((id): id is string => !!id);
    const channelIdHints = channelIds.length > 0 ? new Set(channelIds) : undefined;

    // Read stores imperatively (safe outside React)
    const trendChannels = useTrendStore.getState().channels;
    const currentChannel = useChannelStore.getState().currentChannel;

    if (trendChannels.length === 0 || !currentChannel?.id) {
        debug.context('[enrichContextWithDeltas] No trend channels or channel — skipping enrichment');
        return items;
    }

    try {
        const deltaMap = await computeVideoDeltas(
            videoIds,
            trendChannels,
            userId,
            currentChannel.id,
            channelIdHints,
        );

        if (deltaMap.size === 0) {
            debug.context('[enrichContextWithDeltas] No delta data found — returning items as-is');
            return items;
        }

        debug.context(`[enrichContextWithDeltas] Enriching ${deltaMap.size}/${videoCards.length} videos with delta data`);

        // Return enriched copy
        return items.map(item => {
            if (item.type !== 'video-card') return item;

            const deltas = deltaMap.get(item.videoId);
            if (!deltas) return item;

            return {
                ...item,
                delta24h: deltas.delta24h,
                delta7d: deltas.delta7d,
                delta30d: deltas.delta30d,
            };
        });
    } catch (error) {
        console.error('[enrichContextWithDeltas] Error during enrichment:', error);
        return items; // Graceful fallback — return unenriched items
    }
}
