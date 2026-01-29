import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { VideoService } from '../../../../../core/services/videoService';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';

import { subscribeToCollection } from '../../../../../core/services/firestore';
import { getSuggestedVideosPath } from '../../../../../core/services/videoService';

export const useSuggestedVideos = (userId: string, channelId: string) => {
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => ['suggestedVideos', userId, channelId], [userId, channelId]);

    const EMPTY_VIDEOS = useMemo(() => [] as VideoDetails[], []);
    const { data: rawVideos, isLoading, error } = useQuery<VideoDetails[]>({
        queryKey,
        queryFn: async () => {
            return VideoService.fetchSuggestedVideos(userId, channelId);
        },
        staleTime: Infinity,
        enabled: !!userId && !!channelId,
    });

    const suggestedVideos = rawVideos || EMPTY_VIDEOS;

    useEffect(() => {
        if (!userId || !channelId) return;

        // Using generic subscribeToCollection because VideoService doesn't have a specific subscribe methods for this yet
        // and we want to keep VideoService clean if possible, OR we could add subscribeSuggestedVideos to VideoService.
        // Let's use the primitive for now as it's cleaner than adding another method to the large service object if not reused elsewhere.
        // Actually, importing subscribeToCollection directly is fine.
        const unsubscribe = subscribeToCollection<VideoDetails>(
            getSuggestedVideosPath(userId, channelId),
            (data) => {
                queryClient.setQueryData(queryKey, data);
            }
        );

        return () => {
            unsubscribe();
        }
    }, [userId, channelId, queryClient, queryKey]);

    return {
        suggestedVideos,
        isLoading,
        error
    };
};
