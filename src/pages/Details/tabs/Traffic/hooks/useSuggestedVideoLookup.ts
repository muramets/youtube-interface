import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getDocument } from '../../../../../core/services/firestore';
import { getSuggestedVideosPath } from '../../../../../core/services/videoService';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';

/**
 * Query-on-demand hook for suggested video metadata.
 *
 * Instead of fetching the entire suggestedVideos collection (4650 docs, 3.7s Firestore SDK freeze),
 * this hook fetches ONLY the individual documents needed — based on videoIds from displayedSources.
 *
 * Each document is cached independently via React Query:
 *   queryKey: ['suggestedVideo', userId, channelId, videoId]
 *   staleTime: Infinity — once fetched, never refetched unless invalidated
 *
 * When switching snapshots: only NEW videoIds trigger fetches; previously seen videos come from cache.
 */

/** Stable query key builder for external invalidation */
export const suggestedVideoQueryKey = (userId: string, channelId: string, videoId: string) =>
    ['suggestedVideo', userId, channelId, videoId];

/** Invalidate ALL cached suggested videos for a channel */
export const suggestedVideoQueryPrefix = (userId: string, channelId: string) =>
    ['suggestedVideo', userId, channelId];

/** Stable empty Map returned when no videoIds are requested — prevents re-render loops */
const EMPTY_MAP = new Map<string, VideoDetails>();

export const useSuggestedVideoLookup = (
    videoIds: string[],
    userId: string,
    channelId: string
) => {
    const enabled = !!userId && !!channelId;
    const basePath = useMemo(
        () => enabled ? getSuggestedVideosPath(userId, channelId) : '',
        [userId, channelId, enabled]
    );

    // Deduplicate and stabilize the videoIds list
    const uniqueIds = useMemo(() => {
        const set = new Set(videoIds);
        return Array.from(set).sort(); // sort for stable query order
    }, [videoIds]);

    // Per-document queries — each cached independently
    const queries = useQueries({
        queries: uniqueIds.map(videoId => ({
            queryKey: suggestedVideoQueryKey(userId, channelId, videoId),
            queryFn: async (): Promise<VideoDetails | null> => {
                return getDocument<VideoDetails>(`${basePath}/${videoId}`);
            },
            staleTime: Infinity,
            enabled,
        })),
    });

    // Build a Map<videoId, VideoDetails> from results.
    // EMPTY_MAP is a stable reference for the empty case (no re-render loops).
    // React Query v5 maintains referential stability on useQueries results —
    // individual query.data refs stay the same when data hasn't changed,
    // so this useMemo only recalculates when actual data changes.
    const videoMap = useMemo(() => {
        if (uniqueIds.length === 0) return EMPTY_MAP;

        const map = new Map<string, VideoDetails>();
        queries.forEach((q, i) => {
            if (q.data) {
                map.set(uniqueIds[i], q.data);
            }
        });
        return map;
    }, [queries, uniqueIds]);

    const isLoading = queries.some(q => q.isLoading);

    return { videoMap, isLoading };
};
