import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useTrendStore } from '../stores/trendStore';
import { TrendService } from '../services/trendService';

export const useTrendSubscription = () => {
    const { user } = useAuth();
    const { setChannels } = useTrendStore();

    useEffect(() => {
        if (!user?.uid) return;

        const unsubscribe = TrendService.subscribeToTrendChannels(user.uid, (channels) => {
            setChannels(channels);
        });

        return () => unsubscribe();
    }, [user, setChannels]);
};
