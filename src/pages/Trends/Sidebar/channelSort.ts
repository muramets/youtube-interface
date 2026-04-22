import type { TrendChannel } from '../../../core/types/trends';

/**
 * Shared ordering rule for trend channels in the sidebar.
 *
 * 1. Pinned (isFavorite) channels always on top.
 * 2. Within each bucket — by totalViewCount descending.
 *
 * `viewCountFallback` is used when a channel has no persisted `totalViewCount` yet
 * (e.g. in the expanded sidebar we compute views from currently loaded videos).
 * In contexts without that data (collapsed sidebar), omit the fallback.
 */
export function sortTrendChannels(
    channels: TrendChannel[],
    viewCountFallback?: (id: string) => number
): TrendChannel[] {
    return [...channels].sort((a, b) => {
        const favA = a.isFavorite ? 1 : 0;
        const favB = b.isFavorite ? 1 : 0;
        if (favA !== favB) return favB - favA;
        const viewsA = a.totalViewCount ?? viewCountFallback?.(a.id) ?? 0;
        const viewsB = b.totalViewCount ?? viewCountFallback?.(b.id) ?? 0;
        return viewsB - viewsA;
    });
}
