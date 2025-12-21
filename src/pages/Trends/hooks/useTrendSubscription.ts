import { useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useTrendStore } from '../../../stores/trendStore';
import { TrendService } from '../../../services/trendService';
import { useChannelStore } from '../../../stores/channelStore';

export const useTrendSubscription = () => {
    const { user, isLoading: isAuthLoading } = useAuth();
    const { currentChannel } = useChannelStore();
    const { setChannels, setNiches, setVideoNicheAssignments, setHiddenVideos, setIsLoadingChannels } = useTrendStore();

    useEffect(() => {
        // While auth is still loading, keep showing skeleton
        if (isAuthLoading) {
            return;
        }

        if (!user?.uid || !currentChannel?.id) {
            setChannels([]);
            setNiches([]);
            setVideoNicheAssignments({});
            setIsLoadingChannels(false);
            return;
        }

        // Start loading when subscribing
        setIsLoadingChannels(true);
        let isFirstCallback = true;

        const unsubChannels = TrendService.subscribeToTrendChannels(user.uid, currentChannel.id, (channels) => {
            setChannels(channels);
            // Only set loading to false on first callback
            if (isFirstCallback) {
                setIsLoadingChannels(false);
                isFirstCallback = false;
            }
        });

        const { niches: localNiches, videoNicheAssignments: localAssignments, hiddenVideos: localHidden } = useTrendStore.getState();

        let isFirstNicheSnapshot = true;
        const unsubNiches = TrendService.subscribeToNiches(user.uid, currentChannel.id, async (fsNiches) => {
            if (isFirstNicheSnapshot) {
                isFirstNicheSnapshot = false;
                // If cloud is empty but local has data, migrate
                if (fsNiches.length === 0 && (localNiches.length > 0 || localHidden.length > 0)) {
                    console.log('[useTrendSubscription] Empty Firestore niches detected. Migrating local data...');
                    await TrendService.migrateLocalDataToFirestore(user.uid, currentChannel.id, localNiches, localAssignments, localHidden);
                    return;
                }
            }
            setNiches(fsNiches);
        });

        const unsubAssignments = TrendService.subscribeToNicheAssignments(user.uid, currentChannel.id, (assignments) => {
            setVideoNicheAssignments(assignments);
        });

        const unsubHidden = TrendService.subscribeToHiddenVideos(user.uid, currentChannel.id, (fsHidden) => {
            setHiddenVideos(fsHidden);
        });

        return () => {
            unsubChannels();
            unsubNiches();
            unsubAssignments();
            unsubHidden();
        };
    }, [user, currentChannel?.id, setChannels, setNiches, setVideoNicheAssignments, setHiddenVideos, setIsLoadingChannels, isAuthLoading]);
};
