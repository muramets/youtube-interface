// =============================================================================
// useTrendSnapshots — Centralized TanStack Query cache for trend snapshots
//
// Each trend channel gets its own cached query, keyed by lastUpdated
// for deterministic invalidation (new sync = new data = cache miss).
//
// Used by:
//   - useVideoDeltaMap (multi-channel, filtered by channelIdHints)
//   - useTrendTableData (single channel)
//   - useTrendChannelTableData (all visible channels)
// =============================================================================

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { TrendService } from '../services/trendService';
import { DELTA_SNAPSHOT_DAYS } from '../../../shared/viewDeltas';
import type { TrendChannel, TrendSnapshot } from '../types/trends';

const GC_TIME = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch and cache trend snapshots for multiple trend channels.
 *
 * Cache invalidation is deterministic: `lastUpdated` is part of the query key.
 * When a sync updates the channel, the key changes and TQ refetches automatically.
 *
 * @param userId       - Firebase user ID (undefined = queries disabled)
 * @param channelId    - User's active channel ID (undefined = queries disabled)
 * @param trendChannels - Trend channels to fetch snapshots for
 */
export function useTrendSnapshots(
    userId: string | undefined,
    channelId: string | undefined,
    trendChannels: TrendChannel[],
): { snapshotMap: Map<string, TrendSnapshot[]>; isLoading: boolean } {
    const enabled = !!userId && !!channelId;

    const results = useQueries({
        queries: trendChannels.map(tc => ({
            queryKey: ['trendSnapshots', userId, channelId, tc.id, tc.lastUpdated] as const,
            queryFn: () => TrendService.getTrendSnapshots(userId!, channelId!, tc.id, DELTA_SNAPSHOT_DAYS),
            enabled,
            staleTime: Infinity,
            gcTime: GC_TIME,
        })),
    });

    const isLoading = results.some(r => r.isLoading);

    // Memoize by dataUpdatedAt — only recomputes when TQ actually fetches new data
    const dataKey = results.map(r => r.dataUpdatedAt).join(',');
    const channelKey = trendChannels.map(tc => tc.id).join(',');

    const snapshotMap = useMemo(() => {
        const map = new Map<string, TrendSnapshot[]>();
        results.forEach((result, i) => {
            if (result.data && i < trendChannels.length) {
                map.set(trendChannels[i].id, result.data);
            }
        });
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataKey, channelKey]);

    return { snapshotMap, isLoading };
}
