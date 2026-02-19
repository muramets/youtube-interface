import { useMemo } from 'react';
import { useTrendStore } from '../../../core/stores/trends/trendStore';
import type { TrendNiche } from '../../../core/types/trends';

/**
 * Channel statistics for a niche — how many videos from each channel belong to this niche.
 */
export interface ChannelStat {
    channelId: string;
    channelTitle: string;
    videoCount: number;
}

/**
 * Niche with metadata for display in merge UI.
 */
export interface NicheWithMeta {
    niche: TrendNiche;
    channelTitle: string;
    videoCount: number;
}

/**
 * Hook for analyzing niche composition and finding related niches.
 * 
 * Used by NicheContextMenu to determine:
 * - Whether a global niche has videos from multiple channels (for split modal)
 * - Whether there are other local niches with the same name (for merge modal)
 */
export const useNicheAnalysis = () => {
    const { videos, videoNicheAssignments, niches, channels } = useTrendStore();

    /**
     * Compute channel stats for a given niche.
     * Returns list of channels that have videos assigned to this niche.
     * 
     * BUSINESS LOGIC:
     * - Used when converting Global → Local to determine if split modal is needed
     * - If stats.length > 1, the niche has videos from multiple channels
     */
    const computeChannelStats = useMemo(() => {
        return (nicheId: string): ChannelStat[] => {
            const statsMap = new Map<string, ChannelStat>();

            // Find all videos assigned to this niche
            Object.entries(videoNicheAssignments).forEach(([videoId, assignments]) => {
                const isAssigned = assignments.some(a => a.nicheId === nicheId);
                if (isAssigned) {
                    const video = videos.find(v => v.id === videoId);
                    if (video) {
                        const existing = statsMap.get(video.channelId);
                        const channel = channels.find(c => c.id === video.channelId);
                        const channelTitle = channel?.title || video.channelTitle || 'Unknown Channel';

                        if (existing) {
                            existing.videoCount++;
                        } else {
                            statsMap.set(video.channelId, {
                                channelId: video.channelId,
                                channelTitle,
                                videoCount: 1
                            });
                        }
                    }
                }
            });

            return Array.from(statsMap.values());
        };
    }, [videos, videoNicheAssignments, channels]);

    /**
     * Find other local niches with the same name (case-insensitive).
     * 
     * BUSINESS LOGIC:
     * - Used when converting Local → Global to determine if merge modal is needed
     * - If matching niches exist, user may want to merge them
     */
    const findMatchingNiches = useMemo(() => {
        return (nicheName: string, excludeNicheId: string): NicheWithMeta[] => {
            const normalizedName = nicheName.toLowerCase().trim();

            return niches
                .filter(n =>
                    n.id !== excludeNicheId &&
                    n.type === 'local' &&
                    n.name.toLowerCase().trim() === normalizedName
                )
                .map(n => {
                    // Count videos for this niche
                    let videoCount = 0;
                    Object.values(videoNicheAssignments).forEach(assignments => {
                        if (assignments.some(a => a.nicheId === n.id)) {
                            videoCount++;
                        }
                    });

                    const channel = channels.find(c => c.id === n.channelId);

                    return {
                        niche: n,
                        channelTitle: channel?.title || 'Unknown Channel',
                        videoCount
                    };
                });
        };
    }, [niches, videoNicheAssignments, channels]);

    /**
     * Check if a niche is global.
     */
    const isGlobalNiche = useMemo(() => {
        return (nicheId: string): boolean => {
            const niche = niches.find(n => n.id === nicheId);
            return niche?.type === 'global';
        };
    }, [niches]);

    return {
        computeChannelStats,
        findMatchingNiches,
        isGlobalNiche
    };
};
