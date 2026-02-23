import { useMemo } from 'react';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import { useVideoDeltaMap } from '../../../core/hooks/useVideoDeltaMap';

// Re-export from shared location for backward-compatible imports
export type { VideoDeltaStats } from '../../../core/types/videoDeltaStats';
import type { VideoDeltaStats } from '../../../core/types/videoDeltaStats';

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
 * 
 * Thin wrapper around useVideoDeltaMap — adds channelId filtering optimization
 * and aggregate totals for the playlist header.
 */
export const usePlaylistDeltaStats = (playlistVideos: VideoDetails[]): PlaylistDeltaStats => {
    // Extract YouTube video IDs (11-character pattern)
    const videoIds = useMemo(() => {
        return playlistVideos
            .filter(v => v.id && /^[a-zA-Z0-9_-]{11}$/.test(v.id))
            .map(v => v.id);
    }, [playlistVideos]);

    // Extract unique channelIds from playlist videos for filtering trend channels
    const channelIdHints = useMemo(() => {
        const ids = playlistVideos
            .map(v => v.channelId)
            .filter((id): id is string => !!id);
        return ids.length > 0 ? new Set(ids) : undefined;
    }, [playlistVideos]);

    // Delegate core delta computation to shared hook
    const { perVideo, isLoading } = useVideoDeltaMap(videoIds, channelIdHints);

    // Aggregate totals for playlist header
    const result = useMemo<PlaylistDeltaStats>(() => {
        let total24h = 0;
        let total7d = 0;
        let total30d = 0;
        let count24h = 0;
        let count7d = 0;
        let count30d = 0;

        for (const stats of perVideo.values()) {
            if (stats.delta24h !== null) { total24h += stats.delta24h; count24h++; }
            if (stats.delta7d !== null) { total7d += stats.delta7d; count7d++; }
            if (stats.delta30d !== null) { total30d += stats.delta30d; count30d++; }
        }

        return {
            totals: {
                delta24h: count24h > 0 ? total24h : null,
                delta7d: count7d > 0 ? total7d : null,
                delta30d: count30d > 0 ? total30d : null,
            },
            perVideo,
            videosWithData: perVideo.size,
            isLoading,
        };
    }, [perVideo, isLoading]);

    return result;
};
