import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getDocument } from '../../../../../core/services/firestore';
import { getExternalVideosPath } from '../../../../../core/services/videoService';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';

/**
 * Query-on-demand hook for external video metadata.
 *
 * Instead of fetching the entire external videos collection,
 * this hook fetches ONLY the individual documents needed — based on videoIds from displayedSources.
 *
 * Each document is cached independently via React Query:
 *   queryKey: ['externalVideo', userId, channelId, videoId]
 *   staleTime: Infinity — once fetched, never refetched unless invalidated
 *
 * When switching snapshots: only NEW videoIds trigger fetches; previously seen videos come from cache.
 */

/** Stable query key builder for external invalidation */
export const externalVideoQueryKey = (userId: string, channelId: string, videoId: string) =>
    ['externalVideo', userId, channelId, videoId];

/** Invalidate ALL cached external videos for a channel */
export const externalVideoQueryPrefix = (userId: string, channelId: string) =>
    ['externalVideo', userId, channelId];

/** Stable empty Map returned when no videoIds are requested — prevents re-render loops */
const EMPTY_MAP = new Map<string, VideoDetails>();

export const useExternalVideoLookup = (
    videoIds: string[],
    userId: string,
    channelId: string
) => {
    const enabled = !!userId && !!channelId;
    const basePath = useMemo(
        () => enabled ? getExternalVideosPath(userId, channelId) : '',
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
            queryKey: externalVideoQueryKey(userId, channelId, videoId),
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
