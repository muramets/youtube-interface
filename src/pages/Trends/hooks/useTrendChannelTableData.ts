import { useState, useMemo } from 'react';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useTrendSnapshots } from '../../../core/hooks/useTrendSnapshots';
import { calculateViewDeltas } from '../../../../shared/viewDeltas';
import type { TrendChannel, TrendVideo, TrendChannelRow, TrendSortConfig, TrendChannelTotals, TrendSortKey } from '../../../core/types/trends';

export const useTrendChannelTableData = (channels: TrendChannel[], videos: TrendVideo[]) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const [sortConfig, setSortConfig] = useState<TrendSortConfig>({ key: 'delta24h', direction: 'desc' });

    const visibleChannels = useMemo(() => channels.filter(c => c.isVisible), [channels]);

    // Cached snapshots for all visible channels via TanStack Query
    const { snapshotMap, isLoading } = useTrendSnapshots(
        user?.uid,
        currentChannel?.id,
        visibleChannels,
    );

    // Derive rows from cached snapshots + videos
    const rows = useMemo((): TrendChannelRow[] => {
        if (visibleChannels.length === 0) return [];

        return visibleChannels.map(channel => {
            const channelVideos = videos.filter(v => v.channelId === channel.id);

            if (channelVideos.length === 0) {
                return {
                    type: 'channel' as const,
                    channel,
                    videoCount: 0,
                    totalViews: 0,
                    delta24h: 0,
                    delta7d: 0,
                    delta30d: 0,
                };
            }

            const snapshots = snapshotMap.get(channel.id) ?? [];
            const videoIds = channelVideos.map(v => v.id);
            const deltaMap = snapshots.length > 0
                ? calculateViewDeltas(snapshots, videoIds)
                : new Map();

            let sumViews = 0;
            let sum24h = 0;
            let sum7d = 0;
            let sum30d = 0;
            let hasData = false;

            for (const video of channelVideos) {
                // totalViews column: still uses video.viewCount (API-synced, not snapshot)
                // This is an intentional split — see docs/features/video-view-deltas.md
                sumViews += video.viewCount;

                const deltas = deltaMap.get(video.id);
                if (deltas) {
                    hasData = true;
                    sum24h += deltas.delta24h ?? 0;
                    sum7d += deltas.delta7d ?? 0;
                    sum30d += deltas.delta30d ?? 0;
                }
            }

            return {
                type: 'channel' as const,
                channel,
                videoCount: channelVideos.length,
                totalViews: sumViews,
                delta24h: hasData ? sum24h : null,
                delta7d: hasData ? sum7d : null,
                delta30d: hasData ? sum30d : null,
            };
        });
    }, [visibleChannels, videos, snapshotMap]);

    // Computed Totals
    const totals = useMemo(() => {
        return rows.reduce((acc, row) => ({
            type: 'channel',
            videoCount: acc.videoCount + row.videoCount,
            totalViews: acc.totalViews + row.totalViews,
            delta24h: acc.delta24h + (row.delta24h || 0),
            delta7d: acc.delta7d + (row.delta7d || 0),
            delta30d: acc.delta30d + (row.delta30d || 0),
        } as TrendChannelTotals), { type: 'channel' as const, videoCount: 0, totalViews: 0, delta24h: 0, delta7d: 0, delta30d: 0 } as TrendChannelTotals);
    }, [rows]);

    // Smart Default Sort: adjust state during render (React-recommended pattern)
    const sortResetKey = visibleChannels.map(c => `${c.id}:${snapshotMap.get(c.id)?.length ?? 0}`).join(',');
    const [prevSortResetKey, setPrevSortResetKey] = useState(sortResetKey);
    if (sortResetKey !== prevSortResetKey && !isLoading && rows.length > 0) {
        setPrevSortResetKey(sortResetKey);
        const hasDelta24h = rows.some(r => r.delta24h !== null);
        setSortConfig(hasDelta24h
            ? { key: 'delta24h', direction: 'desc' }
            : { key: 'totalViews', direction: 'desc' }
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
                    valA = a.channel.title;
                    valB = b.channel.title;
                    break;
                case 'videoCount':
                    valA = a.videoCount;
                    valB = b.videoCount;
                    break;
                case 'totalViews':
                    valA = a.totalViews;
                    valB = b.totalViews;
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

            return 0;
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
