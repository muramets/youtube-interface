import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { ChannelService } from '../services/channelService';

export const useChannels = (userId: string) => {
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => ['channels', userId], [userId]);

    // 1. Standard Query for initial fetch and cache management
    const query = useQuery({
        queryKey,
        queryFn: () => ChannelService.getUserChannels(userId),
        staleTime: Infinity, // We rely on real-time updates, so data is "always fresh" via subscription
        enabled: !!userId,
    });

    // 2. Real-time Subscription
    useEffect(() => {
        if (!userId) return;

        const unsubscribe = ChannelService.subscribeToChannels(userId, (channels) => {
            // Update the query cache directly when real-time data comes in
            queryClient.setQueryData(queryKey, channels);
        });

        return () => unsubscribe();
    }, [userId, queryClient, queryKey]);

    return query;
};
