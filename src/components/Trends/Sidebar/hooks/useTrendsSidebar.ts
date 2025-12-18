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
    const { channels, selectedChannelId, setSelectedChannelId, setAddChannelModalOpen, isLoadingChannels, trendsFilters, removeTrendsFilter } = useTrendStore();
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
        setSelectedChannelId(null);
        navigate('/trends');
    };

    const handleChannelClick = (channelId: string) => {
        // Clear any active niche filters (including TRASH) when switching channels
        // so the user sees the full channel content by default
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        if (nicheFilter) {
            removeTrendsFilter(nicheFilter.id);
        }
        setSelectedChannelId(channelId);
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
            const { totalNewVideos, totalQuotaUsed } = await TrendService.syncChannelVideos(user.uid, currentChannel.id, channel, apiKey, true);

            const message = `Full sync complete. Processed ${totalNewVideos} videos. Quota used: ${totalQuotaUsed}`;
            showToast(message, 'success');

            await addNotification({
                title: 'Channel Synced',
                message: `${message} for ${channel.title}`,
                type: 'success',
                meta: 'Quota',
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
