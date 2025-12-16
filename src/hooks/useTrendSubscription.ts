import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useTrendStore } from '../stores/trendStore';
import { TrendService } from '../services/trendService';
import { useChannelStore } from '../stores/channelStore';

export const useTrendSubscription = () => {
    const { user, isLoading: isAuthLoading } = useAuth();
    const { currentChannel } = useChannelStore();
    const { setChannels, setIsLoadingChannels } = useTrendStore();

    useEffect(() => {
        // While auth is still loading, keep showing skeleton
        if (isAuthLoading) {
            return;
        }

        if (!user?.uid || !currentChannel?.id) {
            setChannels([]); // Clear channels when no user channel selected
            setIsLoadingChannels(false);
            return;
        }

        // Start loading when subscribing
        setIsLoadingChannels(true);
        let isFirstCallback = true;

        const unsubscribe = TrendService.subscribeToTrendChannels(user.uid, currentChannel.id, (channels) => {
            setChannels(channels);
            // Only set loading to false on first callback
            if (isFirstCallback) {
                setIsLoadingChannels(false);
                isFirstCallback = false;
            }
        });

        return () => unsubscribe();
    }, [user, currentChannel?.id, setChannels, setIsLoadingChannels, isAuthLoading]);
};
