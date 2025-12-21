import { useMemo } from 'react';
import { useTrendStore, type TrendsFilterItem } from '../../../core/stores/trendStore';
import type { TrendVideo } from '../../../core/types/trends';
import { applyNumericFilter } from '../../../core/utils/filterUtils';

interface UseFilteredVideosParams {
    videos: TrendVideo[];
    trendsFilters: TrendsFilterItem[];
    hiddenVideos: { id: string }[];
    selectedChannelId: string | null;
    globalPercentileMap: Map<string, string>;
}

/**
 * Hook for filtering videos based on active filters.
 * 
 * Extracts complex filtering logic from TrendsPage for:
 * - Better readability
 * - Potential reuse in other components
 * - Easier unit testing
 */
export const useFilteredVideos = ({
    videos,
    trendsFilters,
    hiddenVideos,
    selectedChannelId,
    globalPercentileMap
}: UseFilteredVideosParams): TrendVideo[] => {
    const { videoNicheAssignments, niches } = useTrendStore();

    return useMemo(() => {
        // First check if we are in "Trash Mode"
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        const selectedNicheIds = (nicheFilter?.value as string[]) || [];
        const isTrashMode = selectedNicheIds.includes('TRASH');

        // Create Set of hidden IDs for fast lookup
        const hiddenIds = new Set(hiddenVideos.map(hv => hv.id));

        // Base pool of videos: Either Hidden videos OR Visible videos
        let candidateVideos = isTrashMode
            ? videos.filter(v => hiddenIds.has(v.id))
            : videos.filter(v => !hiddenIds.has(v.id));

        /**
         * GLOBAL NICHE CHANNEL FILTER BYPASS:
         * 
         * When viewing a GLOBAL niche, we skip the channel filter because:
         * - Global niches are cross-channel collections (videos from any channel)
         * - selectedChannelId is cleared to null when clicking a global niche
         * - But even if selectedChannelId was somehow set, we still skip the filter
         * 
         * LOCAL niches always respect the selectedChannelId filter because:
         * - They belong to a specific channel
         * - Their videos should only be visible in that channel's context
         */
        const isViewingGlobalNiche = nicheFilter &&
            !selectedNicheIds.includes('TRASH') &&
            !selectedNicheIds.includes('UNASSIGNED') &&
            selectedNicheIds.length > 0;
        const activeNiche = isViewingGlobalNiche
            ? niches.find(n => selectedNicheIds.includes(n.id))
            : null;
        const isGlobalNicheActive = activeNiche?.type === 'global';

        // Apply channel filter only for local niches or non-niche views
        if (selectedChannelId && !isGlobalNicheActive) {
            candidateVideos = candidateVideos.filter(v => v.channelId === selectedChannelId);
        }

        if (trendsFilters.length === 0 && !isTrashMode) return candidateVideos;

        return candidateVideos.filter(video => {
            return trendsFilters.every(filter => {
                if (filter.type === 'date') {
                    const [start, end] = filter.value;
                    return video.publishedAtTimestamp >= start && video.publishedAtTimestamp <= end;
                }
                if (filter.type === 'views') {
                    return applyNumericFilter(video.viewCount, filter.operator, filter.value);
                }
                if (filter.type === 'percentile') {
                    const videoGroup = globalPercentileMap.get(video.id);
                    const excludedGroups: string[] = filter.value;
                    return !excludedGroups.includes(videoGroup || '');
                }
                if (filter.type === 'niche') {
                    const selectedIds = filter.value as string[];

                    if (isTrashMode) return true; // Already filtered by candidateVideos

                    const assignments = videoNicheAssignments[video.id] || [];
                    const assignedNicheIds = assignments.length > 0
                        ? assignments.map(a => a.nicheId)
                        : (video.nicheId ? [video.nicheId] : []);

                    // Handle UNASSIGNED special case
                    const hasUnassignedFilter = selectedIds.includes('UNASSIGNED');
                    const isUnassigned = assignedNicheIds.length === 0;

                    if (hasUnassignedFilter && isUnassigned) return true;

                    // Regular niche matching
                    const regularNicheIds = selectedIds.filter(id => id !== 'UNASSIGNED');
                    return regularNicheIds.some(id => assignedNicheIds.includes(id));
                }
                return true;
            });
        });
    }, [videos, trendsFilters, globalPercentileMap, hiddenVideos, videoNicheAssignments, selectedChannelId, niches]);
};
