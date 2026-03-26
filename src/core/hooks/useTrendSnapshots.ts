// =============================================================================
// useTrendSnapshots — Centralized TanStack Query cache for trend snapshots
//
// One cache slot per trend channel (keyed by channel ID, not lastUpdated).
// Data persists in memory for the lifetime of the browser tab (gcTime: Infinity).
// When a sync updates lastUpdated, the slot is invalidated and refetched in-place.
//
// Used by:
//   - useVideoDeltaMap (multi-channel, filtered by channelIdHints)
//   - useTrendTableData (single channel)
//   - useTrendChannelTableData (all visible channels)
//   - useVideosCatalog (via useVideoDeltaMap — KI/Chat tooltip enrichment)
// =============================================================================

import { useEffect, useMemo, useRef } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { TrendService } from '../services/trendService';
import { DELTA_SNAPSHOT_DAYS } from '../../../shared/viewDeltas';
import type { TrendChannel, TrendSnapshot } from '../types/trends';

/**
 * Fetch and cache trend snapshots for multiple trend channels.
 *
 * Cache strategy:
 * - queryKey excludes lastUpdated → one slot per channel, zero orphaned entries
 * - gcTime: Infinity → data lives until tab close (snapshots are immutable between syncs)
 * - staleTime: Infinity → no auto-refetch on mount/focus
 * - Invalidation: useEffect tracks lastUpdated changes via useRef, calls invalidateQueries on sync
 *
 * @param userId       - Firebase user ID (undefined = queries disabled)
 * @param channelId    - User's active channel ID (undefined = queries enabled)
 * @param trendChannels - Trend channels to fetch snapshots for
 */
export function useTrendSnapshots(
    userId: string | undefined,
    channelId: string | undefined,
    trendChannels: TrendChannel[],
): { snapshotMap: Map<string, TrendSnapshot[]>; isLoading: boolean } {
    const enabled = !!userId && !!channelId;
    const queryClient = useQueryClient();

    // Track lastUpdated per channel to detect sync changes
    const lastUpdatedRef = useRef(new Map<string, number>());

    useEffect(() => {
        for (const tc of trendChannels) {
            const prev = lastUpdatedRef.current.get(tc.id);
            if (prev !== undefined && prev !== tc.lastUpdated) {
                queryClient.invalidateQueries({
                    queryKey: ['trendSnapshots', userId, channelId, tc.id],
                });
            }
            lastUpdatedRef.current.set(tc.id, tc.lastUpdated);
        }
    }, [trendChannels, userId, channelId, queryClient]);

    const results = useQueries({
        queries: trendChannels.map(tc => ({
            queryKey: ['trendSnapshots', userId, channelId, tc.id] as const,
            queryFn: () => TrendService.getTrendSnapshots(userId!, channelId!, tc.id, DELTA_SNAPSHOT_DAYS),
            enabled,
            staleTime: Infinity,
            gcTime: Infinity,
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
