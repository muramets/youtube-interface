import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTrendStore } from '../../../../stores/trendStore';
import { TrendService } from '../../../../services/trendService';
import { useAuth } from '../../../../hooks/useAuth';
import { useChannelStore } from '../../../../stores/channelStore';
import { useChannels } from '../../../../hooks/useChannels';
import { useApiKey } from '../../../../hooks/useApiKey';
import { useUIStore } from '../../../../stores/uiStore';
import { useNotificationStore } from '../../../../stores/notificationStore';
import type { TrendChannel } from '../../../../types/trends';

interface MenuState {
    anchorEl: HTMLElement | null;
    channelId: string | null;
}

export const useTrendsSidebar = () => {
    const { channels, selectedChannelId, setSelectedChannelId, setAddChannelModalOpen, isLoadingChannels, trendsFilters, removeTrendsFilter, setChannelRootFilters, setTrendsFilters, setNicheFilters } = useTrendStore();
    const { user, isLoading: isAuthLoading } = useAuth();
    const { currentChannel } = useChannelStore();
    const { isLoading: isChannelsLoading } = useChannels(user?.uid || '');
    const { apiKey, hasApiKey } = useApiKey();
    const { showToast } = useUIStore();
    const { addNotification } = useNotificationStore();
    const navigate = useNavigate();
    const location = useLocation();

    const [menuState, setMenuState] = useState<MenuState>({ anchorEl: null, channelId: null });
    const [channelToDelete, setChannelToDelete] = useState<TrendChannel | null>(null);

    const isOnTrendsPage = location.pathname === '/trends';

    const handleTrendsClick = () => {
        // Clear any active niche filters when going to main trends
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        if (nicheFilter) {
            removeTrendsFilter(nicheFilter.id);
        }
        setSelectedChannelId(null);
        navigate('/trends');
    };

    const handleChannelClick = (channelId: string) => {
        // 1. Save Current Niche State (if active)
        // We do this REGARDLESS of whether we stay or switch, to ensure state is persisted.
        const currentNicheFilter = trendsFilters.find(f => f.type === 'niche');
        if (currentNicheFilter) {
            const activeIds = currentNicheFilter.value as string[];
            if (activeIds.length === 1) {
                setNicheFilters(activeIds[0], trendsFilters);
            }
        } else if (selectedChannelId) {
            // Save Root State as well (if we are in Root and switching/refreshing)
            setChannelRootFilters(selectedChannelId, trendsFilters);
        }

        // 2. Switch Channel (Loads last state from store)
        setSelectedChannelId(channelId);

        // 3. Force Target to Root View
        // The store might have auto-loaded a Niche view for this channel.
        // We override that because clicking the Channel Name explicitly implies "Go to Root".

        // We access the store state directly to ensure we check the freshest state 
        // after the setSelectedChannelId update above.
        const rootFilters = useTrendStore.getState().channelRootFilters[channelId];
        if (rootFilters) {
            setTrendsFilters(rootFilters);
        } else {
            // If no root filters saved, verify if we need to clean up a potential Niche filter
            // that might have been loaded by default.
            const currentStoreFilters = useTrendStore.getState().trendsFilters;
            const hasNiche = currentStoreFilters.some(f => f.type === 'niche');
            if (hasNiche) {
                setTrendsFilters([]);
            }
        }

        navigate('/trends');
    };

    const handleToggleVisibility = async (e: React.MouseEvent, channelId: string, currentVisibility: boolean) => {
        e.stopPropagation();
        if (user && currentChannel) {
            await TrendService.toggleVisibility(user.uid, currentChannel.id, channelId, !currentVisibility);
        }
    };

    const handleRemoveChannel = async () => {
        if (user && currentChannel && channelToDelete) {
            await TrendService.removeTrendChannel(user.uid, currentChannel.id, channelToDelete.id);
            if (selectedChannelId === channelToDelete.id) {
                setSelectedChannelId(null);
                navigate('/trends');
            }
            setChannelToDelete(null);
        }
    };

    const handleSyncChannel = async () => {
        const channelId = menuState.channelId;
        setMenuState({ anchorEl: null, channelId: null });

        if (!user || !currentChannel || !channelId) return;

        const channel = channels.find(c => c.id === channelId);
        if (!channel) return;

        if (!hasApiKey) {
            showToast('API Key not found. Please set it in Settings.', 'error');
            return;
        }

        showToast(`Syncing all videos for ${channel.title}...`, 'success');

        try {
            // Force full sync (true) to update view counts for existing videos
            const { totalNewVideos, totalQuotaUsed, quotaBreakdown } = await TrendService.syncChannelVideos(user.uid, currentChannel.id, channel, apiKey, true);

            showToast(`${channel.title} sync complete. Processed ${totalNewVideos} videos.`, 'success');

            await addNotification({
                title: `${channel.title} Visual Data Updated`,
                message: `Updated ${totalNewVideos} videos.`,
                type: 'success',
                meta: totalQuotaUsed.toString(),
                avatarUrl: channel.avatarUrl,
                quotaBreakdown
            });
        } catch (error: any) {
            console.error('Sync failed:', error);
            showToast(`Sync failed: ${error.message}`, 'error');
        }
    };

    // Show skeleton while any loading is in progress
    // Same pattern as Header: auth loading OR (user exists AND channels still loading)
    const isLoading = isAuthLoading || (!!user && isChannelsLoading && !currentChannel) || isLoadingChannels;

    // Background Migration: Ensure all channels have totalViewCount
    useEffect(() => {
        if (!user || !currentChannel || channels.length === 0) return;

        channels.forEach(channel => {
            if (channel.totalViewCount === undefined) {
                // Determine if we should trigger migration
                // We fire-and-forget this async task. 
                // It updates Firestore, which will push a new update to 'channels', 
                // causing this effect to re-run (but then totalViewCount will be defined).
                console.log(`[useTrendsSidebar] Migrating stats for ${channel.title}...`);
                TrendService.recalcChannelStats(user.uid, currentChannel.id, channel.id)
                    .catch(err => console.error('Migration failed:', err));
            }
        });
    }, [channels, user, currentChannel]);

    return {
        // State
        channels,
        selectedChannelId,
        isOnTrendsPage,
        menuState,
        channelToDelete,
        isLoadingChannels: isLoading,

        // Actions
        setMenuState,
        setChannelToDelete,
        setAddChannelModalOpen,

        // Handlers
        handleTrendsClick,
        handleChannelClick,
        handleToggleVisibility,
        handleRemoveChannel,
        handleSyncChannel
    };
};
