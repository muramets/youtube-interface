import { useState, useMemo } from 'react';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useTrendStore } from '../../../core/stores/trends/trendStore';
import { useTrendSnapshots } from '../../../core/hooks/useTrendSnapshots';
import { calculateViewDeltas } from '../../../../shared/viewDeltas';
import { debug } from '../../../core/utils/debug';
import type { TrendVideo, TrendVideoRow, TrendVideoTotals, TrendSortKey, TrendSortConfig } from '../../../core/types/trends';

export const useTrendTableData = (channelId: string, videos: TrendVideo[]) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { channels: trendChannels } = useTrendStore();

    const [sortConfig, setSortConfig] = useState<TrendSortConfig>({ key: 'delta24h', direction: 'desc' });

    // Find TrendChannel object for cache key (lastUpdated)
    const channelsForQuery = useMemo(() => {
        const tc = trendChannels.find(c => c.id === channelId);
        return tc ? [tc] : [];
    }, [trendChannels, channelId]);

    // Cached snapshots via TanStack Query
    const { snapshotMap, isLoading } = useTrendSnapshots(
        user?.uid,
        currentChannel?.id,
        channelsForQuery,
    );

    // Derive rows + totals from cached snapshots
    const { rows, totals } = useMemo(() => {
        const snapshots = snapshotMap.get(channelId);
        if (!snapshots || snapshots.length === 0 || videos.length === 0) {
            return { rows: [] as TrendVideoRow[], totals: null as TrendVideoTotals | null };
        }

        debug.trendsGroup.start(`Trend Table Delta — channel=${channelId}, ${videos.length} videos`);
        debug.trends(`Snapshots from cache: ${snapshots.length}`);
        if (snapshots.length > 0) {
            const newest = snapshots[0];
            const oldest = snapshots[snapshots.length - 1];
            debug.trends(`Newest snapshot: ts=${newest.timestamp} (${new Date(newest.timestamp).toISOString()}), videoViews keys=${Object.keys(newest.videoViews || {}).length}`);
            debug.trends(`Oldest snapshot: ts=${oldest.timestamp} (${new Date(oldest.timestamp).toISOString()}), videoViews keys=${Object.keys(oldest.videoViews || {}).length}`);
        }

        const videoIds = videos.map(v => v.id);
        const deltaMap = calculateViewDeltas(snapshots, videoIds);

        const processedRows: TrendVideoRow[] = videos.map((video, idx) => {
            const deltas = deltaMap.get(video.id);

            if (idx < 3) {
                debug.trends(`  Video[${idx}] id=${video.id} title="${video.title?.slice(0, 40)}" current=${video.viewCount} delta24h=${deltas?.delta24h ?? 'N/A'}`);
            }

            return {
                type: 'video',
                video,
                delta24h: deltas?.delta24h ?? null,
                delta7d: deltas?.delta7d ?? null,
                delta30d: deltas?.delta30d ?? null,
            };
        });

        const newTotals: TrendVideoTotals = processedRows.reduce((acc, row) => ({
            type: 'video' as const,
            viewCount: acc.viewCount + row.video.viewCount,
            delta24h: acc.delta24h + (row.delta24h || 0),
            delta7d: acc.delta7d + (row.delta7d || 0),
            delta30d: acc.delta30d + (row.delta30d || 0),
        }), { type: 'video' as const, viewCount: 0, delta24h: 0, delta7d: 0, delta30d: 0 });

        debug.trends(`Totals: delta24h=${newTotals.delta24h}, delta7d=${newTotals.delta7d}, delta30d=${newTotals.delta30d}`);
        const nonNullCount = processedRows.filter(r => r.delta24h !== null).length;
        debug.trends(`Videos with 24h data: ${nonNullCount}/${processedRows.length}`);
        debug.trendsGroup.end();

        return { rows: processedRows, totals: newTotals };
    }, [snapshotMap, channelId, videos]);

    // Smart Default Sort: adjust state during render (React-recommended pattern)
    // Resets sort when underlying data changes (channel switch, new sync)
    const sortResetKey = `${channelId}:${snapshotMap.get(channelId)?.length ?? 0}`;
    const [prevSortResetKey, setPrevSortResetKey] = useState(sortResetKey);
    if (sortResetKey !== prevSortResetKey && !isLoading && rows.length > 0) {
        setPrevSortResetKey(sortResetKey);
        const hasDelta24h = rows.some(r => r.delta24h !== null);
        setSortConfig(hasDelta24h
            ? { key: 'delta24h', direction: 'desc' }
            : { key: 'publishedAt', direction: 'desc' }
        );
    }

    const sortedRows = useMemo(() => {
        if (rows.length === 0) return [];

        return [...rows].sort((a, b) => {
            const { key, direction } = sortConfig;
            let valA: string | number | null | undefined;
            let valB: string | number | null | undefined;

            switch (key) {
                case 'title':
                    valA = a.video.title;
                    valB = b.video.title;
                    break;
                case 'publishedAt':
                    valA = new Date(a.video.publishedAt).getTime();
                    valB = new Date(b.video.publishedAt).getTime();
                    break;
                case 'viewCount':
                    valA = a.video.viewCount;
                    valB = b.video.viewCount;
                    break;
                case 'delta24h':
                    valA = a.delta24h;
                    valB = b.delta24h;
                    break;
                case 'delta7d':
                    valA = a.delta7d;
                    valB = b.delta7d;
                    break;
                case 'delta30d':
                    valA = a.delta30d;
                    valB = b.delta30d;
                    break;
                default:
                    return 0;
            }

            if (valA === null && valB === null) return 0;
            if (valA === null) return 1;
            if (valB === null) return -1;

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;

            // Tie-breaker: Published Date Desc
            return new Date(b.video.publishedAt).getTime() - new Date(a.video.publishedAt).getTime();
        });
    }, [rows, sortConfig]);

    const handleSort = (key: TrendSortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    return {
        rows: sortedRows,
        totals,
        isLoading,
        error: null as Error | null,
        sortConfig,
        onSort: handleSort
    };
};
