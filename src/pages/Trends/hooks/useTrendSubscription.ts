import { useEffect } from 'react';
import { useAuth } from '../../../core/hooks/useAuth';
import { useTrendStore } from '../../../core/stores/trendStore';
import { TrendService } from '../../../core/services/trendService';
import { useChannelStore } from '../../../core/stores/channelStore';
import { ChannelService } from '../../../core/services/channelService';

export const useTrendSubscription = () => {
    const { user, isLoading: isAuthLoading } = useAuth();
    const { currentChannel, setCurrentChannel } = useChannelStore();
    const { setChannels, setNiches, setVideoNicheAssignments, setHiddenVideos, setIsLoadingChannels, niches } = useTrendStore();

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

    /**
     * Migration: Populate targetNicheNames for current channel if missing.
     * This runs when niches are loaded and currentChannel has targetNicheIds but no targetNicheNames.
     */
    useEffect(() => {
        if (!user?.uid || !currentChannel || niches.length === 0) return;

        const hasIds = currentChannel.targetNicheIds && currentChannel.targetNicheIds.length > 0;
        const hasNames = currentChannel.targetNicheNames && currentChannel.targetNicheNames.length > 0;

        // Only migrate if we have IDs but no names
        if (hasIds && !hasNames) {
            const names = currentChannel.targetNicheIds!
                .map(id => niches.find(n => n.id === id)?.name)
                .filter((name): name is string => name !== undefined);

            if (names.length > 0) {
                console.log('[useTrendSubscription] Migrating targetNicheNames for channel:', currentChannel.name);

                // Update Firestore
                ChannelService.updateChannel(user.uid, currentChannel.id, { targetNicheNames: names });

                // Update local state
                setCurrentChannel({ ...currentChannel, targetNicheNames: names });
            }
        }
    }, [user?.uid, currentChannel?.id, currentChannel?.targetNicheIds, niches, setCurrentChannel]);
};

