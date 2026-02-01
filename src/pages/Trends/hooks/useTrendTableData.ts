import { useState, useEffect, useMemo } from 'react';
import { TrendService } from '../../../core/services/trendService';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import type { TrendVideo, TrendSnapshot, TrendVideoRow, TrendVideoTotals, TrendSortKey, TrendSortConfig } from '../../../core/types/trends';

export const useTrendTableData = (channelId: string, videos: TrendVideo[]) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const [rows, setRows] = useState<TrendVideoRow[]>([]);
    const [totals, setTotals] = useState<TrendVideoTotals | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Default sort: delta24h DESC (initially)
    // We will smart-update this if no delta data is found
    const [sortConfig, setSortConfig] = useState<TrendSortConfig>({ key: 'delta24h', direction: 'desc' });

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

            // Handle null values for deltas (put them at bottom usually, or top if asc? let's stick to simple comparison)
            // If we want nulls always last:
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

    useEffect(() => {
        if (!user?.uid || !currentChannel?.id || !channelId) return;

        const loadSnapshots = async () => {
            setIsLoading(true);
            try {
                // Fetch last 60 days of history to cover 30d delta safely
                const snapshots = await TrendService.getTrendSnapshots(
                    user.uid,
                    currentChannel.id,
                    channelId,
                    60
                );

                // Helper to find snapshot closest to target timestamp (searching backwards)
                const findSnapshot = (targetTs: number): TrendSnapshot | undefined => {
                    // Snapshots are sorted DESC (newest first). 
                    // We want the newest snapshot that is OLDER than targetTs? 
                    // Or closest strictly?
                    // targetTs is "Now minus 24h". We want a snapshot FROM around that time.

                    // Simple logic: Find first snapshot where timestamp <= targetTs
                    return snapshots.find(s => s.timestamp <= targetTs);
                };

                const now = Date.now();
                const oneDayMs = 24 * 60 * 60 * 1000;

                const snap24h = findSnapshot(now - oneDayMs);
                const snap7d = findSnapshot(now - (7 * oneDayMs));
                const snap30d = findSnapshot(now - (30 * oneDayMs));

                const processedRows: TrendVideoRow[] = videos.map(video => {
                    // Function to calculate delta safely
                    const getDelta = (snap: TrendSnapshot | undefined) => {
                        if (!snap) return null;
                        const pastViews = snap.videoViews[video.id];
                        if (pastViews === undefined) return null; // Video didn't exist then
                        return video.viewCount - pastViews;
                    };

                    return {
                        type: 'video',
                        video,
                        delta24h: getDelta(snap24h),
                        delta7d: getDelta(snap7d),
                        delta30d: getDelta(snap30d)
                    };
                });

                // Sort by default: most recent published or most views? 
                // Let's keep original video order which is usually Published Date DESC
                setRows(processedRows);

                // Calculate Totals
                const newTotals: TrendVideoTotals = processedRows.reduce((acc, row) => ({
                    type: 'video',
                    viewCount: acc.viewCount + row.video.viewCount,
                    delta24h: acc.delta24h + (row.delta24h || 0),
                    delta7d: acc.delta7d + (row.delta7d || 0),
                    delta30d: acc.delta30d + (row.delta30d || 0),
                }), { type: 'video' as const, viewCount: 0, delta24h: 0, delta7d: 0, delta30d: 0 });

                setTotals(newTotals);

                // Smart Default Sort:
                // If we are on the initial load (or reset), check if we have ANY 24h data.
                // If NO data exists for 24h (all null), default to Published Date.
                // Otherwise default to 24h Delta.
                const hasDelta24h = processedRows.some(r => r.delta24h !== null);

                // Only override if we haven't manually interacted yet (tracked via state? or just every load?)
                // User requirement: "if no data ... then sorting by default should switch"
                // This implies whenever we load a channel, we should check.
                if (!hasDelta24h) {
                    setSortConfig({ key: 'publishedAt', direction: 'desc' });
                } else {
                    // Reset to delta24h only if we think it's appropriate? 
                    // Let's assume we reset to "Best Default" on channel load
                    setSortConfig({ key: 'delta24h', direction: 'desc' });
                }
            } catch (err) {
                console.error("Failed to load trend snapshots:", err);
                setError(err as Error);
            } finally {
                setIsLoading(false);
            }
        };

        loadSnapshots();
    }, [channelId, videos, user?.uid, currentChannel?.id]);

    return {
        rows: sortedRows,
        totals,
        isLoading,
        error,
        sortConfig,
        onSort: handleSort
    };
};
