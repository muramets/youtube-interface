import { useState, useEffect, useMemo } from 'react';
import { TrendService } from '../../../core/services/trendService';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import type { TrendChannel, TrendVideo, TrendSnapshot, TrendChannelRow, TrendSortConfig, TrendChannelTotals, TrendSortKey } from '../../../core/types/trends';

export const useTrendChannelTableData = (channels: TrendChannel[], videos: TrendVideo[]) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const [rows, setRows] = useState<TrendChannelRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [sortConfig, setSortConfig] = useState<TrendSortConfig>({ key: 'delta24h', direction: 'desc' });

    // Computed Totals for the footer/summary
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

    useEffect(() => {
        if (!user?.uid || !currentChannel?.id || channels.length === 0) {
            setRows([]);
            return;
        }

        const loadChannelStats = async () => {
            setIsLoading(true);
            try {
                // Fetch snapshots for ALL visible channels in parallel
                // Note: accurate delta calculation requires video-level history.
                // We assume getTrendSnapshots is efficient enough or we limit concurrency?
                // With ~20 channels it should be fine.

                const visibleChannels = channels.filter(c => c.isVisible);

                const channelPros = visibleChannels.map(async (channel) => {
                    // 1. Get videos for this channel
                    const channelVideos = videos.filter(v => v.channelId === channel.id);

                    if (channelVideos.length === 0) {
                        return {
                            type: 'channel' as const,
                            channel,
                            videoCount: 0,
                            totalViews: 0,
                            delta24h: 0,
                            delta7d: 0,
                            delta30d: 0
                        };
                    }

                    // 2. Fetch History
                    const snapshots = await TrendService.getTrendSnapshots(
                        user.uid,
                        currentChannel.id,
                        channel.id,
                        60 // 30d + buffer
                    );

                    // Helper to find snapshot closest to timestamp
                    const findSnapshot = (targetTs: number) => snapshots.find(s => s.timestamp <= targetTs);

                    const now = Date.now();
                    const oneDayMs = 24 * 60 * 60 * 1000;
                    const snap24h = findSnapshot(now - oneDayMs);
                    const snap7d = findSnapshot(now - (7 * oneDayMs));
                    const snap30d = findSnapshot(now - (30 * oneDayMs));

                    // 3. Aggregate Deltas
                    let sumViews = 0;
                    let sum24h = 0;
                    let sum7d = 0;
                    let sum30d = 0;

                    let hasData24h = false; // Track if we found ANY history to differentiate 0 vs null

                    for (const video of channelVideos) {
                        sumViews += video.viewCount;

                        const calcDelta = (snap: TrendSnapshot | undefined) => {
                            if (!snap) return 0;
                            const past = snap.videoViews[video.id];
                            if (past === undefined) return 0;
                            return video.viewCount - past;
                        };

                        const d24 = calcDelta(snap24h);
                        const d7 = calcDelta(snap7d);
                        const d30 = calcDelta(snap30d);

                        sum24h += d24;
                        sum7d += d7;
                        sum30d += d30;

                        if (snap24h && snap24h.videoViews[video.id] !== undefined) hasData24h = true;
                    }

                    return {
                        type: 'channel' as const,
                        channel,
                        videoCount: channelVideos.length,
                        totalViews: sumViews,
                        // If we have absolutely no history for any video, maybe return null? 
                        // For simpler UI, 0 is often better, but null helps distinguish "no sync" from "no growth"
                        delta24h: hasData24h ? sum24h : null,
                        delta7d: hasData24h ? sum7d : null, // Simplify: if no 24h, likely no 7d
                        delta30d: hasData24h ? sum30d : null
                    };
                });

                const results = await Promise.all(channelPros);
                setRows(results);

                // Smart Default Sort:
                // If any channel has valid 24h delta, sort by delta24h.
                // Otherwise fallback to totalViews.
                const hasDelta24h = results.some(r => r.delta24h !== null);

                if (hasDelta24h) {
                    setSortConfig({ key: 'delta24h', direction: 'desc' });
                } else {
                    setSortConfig({ key: 'totalViews', direction: 'desc' });
                }

            } catch (err) {
                console.error("Failed to load channel stats:", err);
                setError(err as Error);
            } finally {
                setIsLoading(false);
            }
        };

        loadChannelStats();

    }, [channels, videos, user?.uid, currentChannel?.id]);

    return {
        rows: sortedRows,
        totals,
        isLoading,
        error,
        sortConfig,
        onSort: handleSort
    };
};
