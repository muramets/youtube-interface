import { useState, useEffect, useMemo } from 'react';
import { TrendService } from '../../../core/services/trendService';
import { useTrendStore } from '../../../core/stores/trendStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import type { TrendSnapshot } from '../../../core/types/trends';

export interface VideoDeltaStats {
    delta24h: number | null;
    delta7d: number | null;
    delta30d: number | null;
}

export interface PlaylistDeltaStats {
    // Aggregate totals for playlist header
    totals: {
        delta24h: number | null;
        delta7d: number | null;
        delta30d: number | null;
    };
    // Per-video deltas for VideoCard
    perVideo: Map<string, VideoDeltaStats>;
    videosWithData: number;
    isLoading: boolean;
}

/**
 * Hook to calculate aggregated view deltas for playlist videos.
 * Uses trend snapshots to compute 24h/7d/30d view changes.
 * 
 * Returns both aggregate totals (for header) and per-video deltas (for cards).
 * Only works for YouTube videos that exist in trend channels.
 */
export const usePlaylistDeltaStats = (playlistVideos: VideoDetails[]): PlaylistDeltaStats => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { channels: trendChannels } = useTrendStore();

    const [stats, setStats] = useState<PlaylistDeltaStats>({
        totals: { delta24h: null, delta7d: null, delta30d: null },
        perVideo: new Map(),
        videosWithData: 0,
        isLoading: false,
    });

    // Extract YouTube video IDs (11-character pattern)
    const youtubeVideoIds = useMemo(() => {
        return playlistVideos
            .filter(v => v.id && /^[a-zA-Z0-9_-]{11}$/.test(v.id))
            .map(v => v.id);
    }, [playlistVideos]);

    // Extract unique channelIds from playlist videos for filtering trend channels
    const playlistChannelIds = useMemo(() => {
        return new Set(
            playlistVideos
                .map(v => v.channelId)
                .filter((id): id is string => !!id)
        );
    }, [playlistVideos]);

    useEffect(() => {
        if (!user?.uid || !currentChannel?.id || youtubeVideoIds.length === 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset stats on dependency change
            setStats({ totals: { delta24h: null, delta7d: null, delta30d: null }, perVideo: new Map(), videosWithData: 0, isLoading: false });
            return;
        }

        // No trend channels = no data
        if (trendChannels.length === 0) {
            return;
        }

        const loadDeltaStats = async () => {
            setStats(prev => ({ ...prev, isLoading: true }));

            try {
                const now = Date.now();
                const oneDayMs = 24 * 60 * 60 * 1000;

                // We need to find snapshots that contain our video IDs
                // Each trend channel has its own snapshots
                const videoIdSet = new Set(youtubeVideoIds);

                // Track deltas per video
                const videoDeltas: Map<string, { current: number; past24h?: number; past7d?: number; past30d?: number }> = new Map();

                // Optimization: Only fetch snapshots for trend channels
                // whose videos are actually in this playlist
                const relevantTrendChannels = trendChannels.filter(
                    channel => playlistChannelIds.has(channel.id)
                );

                if (relevantTrendChannels.length === 0) {
                    setStats({ totals: { delta24h: null, delta7d: null, delta30d: null }, perVideo: new Map(), videosWithData: 0, isLoading: false });
                    return;
                }

                // Fetch snapshots for each relevant trend channel (in parallel)
                const snapshotPromises = relevantTrendChannels.map(async (channel) => {
                    try {
                        const snapshots = await TrendService.getTrendSnapshots(
                            user.uid,
                            currentChannel.id,
                            channel.id,
                            32 // Optimized: 32 days (covers 30d delta + buffer)
                        );

                        if (snapshots.length === 0) return;

                        // Get the most recent snapshot for current views
                        const latestSnapshot = snapshots[0]; // Already sorted DESC

                        // Find historical snapshots
                        const findSnapshot = (targetTs: number): TrendSnapshot | undefined => {
                            return snapshots.find(s => s.timestamp <= targetTs);
                        };

                        const snap24h = findSnapshot(now - oneDayMs);
                        const snap7d = findSnapshot(now - (7 * oneDayMs));
                        const snap30d = findSnapshot(now - (30 * oneDayMs));

                        // Check each video in our playlist
                        for (const videoId of videoIdSet) {
                            const currentViews = latestSnapshot.videoViews[videoId];
                            if (currentViews === undefined) continue;

                            // Initialize if not exists
                            if (!videoDeltas.has(videoId)) {
                                videoDeltas.set(videoId, { current: currentViews });
                            }

                            const entry = videoDeltas.get(videoId)!;

                            // Update past values if found
                            if (snap24h?.videoViews[videoId] !== undefined) {
                                entry.past24h = snap24h.videoViews[videoId];
                            }
                            if (snap7d?.videoViews[videoId] !== undefined) {
                                entry.past7d = snap7d.videoViews[videoId];
                            }
                            if (snap30d?.videoViews[videoId] !== undefined) {
                                entry.past30d = snap30d.videoViews[videoId];
                            }
                        }
                    } catch (err) {
                        console.warn(`[usePlaylistDeltaStats] Failed to fetch snapshots for channel ${channel.id}:`, err);
                    }
                });

                await Promise.all(snapshotPromises);

                // Build per-video delta map and aggregate totals
                const perVideoMap: Map<string, VideoDeltaStats> = new Map();
                let total24h = 0;
                let total7d = 0;
                let total30d = 0;
                let count24h = 0;
                let count7d = 0;
                let count30d = 0;

                for (const [videoId, entry] of videoDeltas.entries()) {
                    const delta24h = entry.past24h !== undefined ? entry.current - entry.past24h : null;
                    const delta7d = entry.past7d !== undefined ? entry.current - entry.past7d : null;
                    const delta30d = entry.past30d !== undefined ? entry.current - entry.past30d : null;

                    perVideoMap.set(videoId, { delta24h, delta7d, delta30d });

                    if (delta24h !== null) {
                        total24h += delta24h;
                        count24h++;
                    }
                    if (delta7d !== null) {
                        total7d += delta7d;
                        count7d++;
                    }
                    if (delta30d !== null) {
                        total30d += delta30d;
                        count30d++;
                    }
                }

                setStats({
                    totals: {
                        delta24h: count24h > 0 ? total24h : null,
                        delta7d: count7d > 0 ? total7d : null,
                        delta30d: count30d > 0 ? total30d : null,
                    },
                    perVideo: perVideoMap,
                    videosWithData: videoDeltas.size,
                    isLoading: false,
                });
            } catch (error) {
                console.error('[usePlaylistDeltaStats] Error:', error);
                setStats(prev => ({ ...prev, isLoading: false }));
            }
        };

        loadDeltaStats();
    }, [user?.uid, currentChannel?.id, youtubeVideoIds, trendChannels, playlistChannelIds]);

    return stats;
};
