import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useTrendStore } from '../stores/trendStore';
import { TrendService } from '../services/trendService';
import { useChannelStore } from '../stores/channelStore';

export const useTrendSubscription = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { setChannels } = useTrendStore();

    useEffect(() => {
        if (!user?.uid || !currentChannel?.id) {
            setChannels([]); // Clear channels when no user channel selected
            return;
        }

        const unsubscribe = TrendService.subscribeToTrendChannels(user.uid, currentChannel.id, (channels) => {
            setChannels(channels);
        });

        return () => unsubscribe();
    }, [user, currentChannel?.id, setChannels]);
};
