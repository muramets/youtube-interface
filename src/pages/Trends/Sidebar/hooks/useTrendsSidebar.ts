import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTrendStore } from '../../../../core/stores/trendStore';
import { TrendService } from '../../../../core/services/trendService';
import { useAuth } from '../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { useChannels } from '../../../../core/hooks/useChannels';
import { useApiKey } from '../../../../core/hooks/useApiKey';
import { useUIStore } from '../../../../core/stores/uiStore';
import { useNotificationStore } from '../../../../core/stores/notificationStore';
import type { TrendChannel } from '../../../../core/types/trends';

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

    /**
     * Handle channel click in sidebar.
     * 
     * BEHAVIORS:
     * - Click any channel: ALWAYS go to ROOT (from channelRootFilters)
     * - Click same channel from ROOT: Reset to empty (clear all filters)
     * 
     * TRASH is ONLY accessible via clicking "Untracked" niche.
     */
    const handleChannelClick = (channelId: string) => {
        // Step 1: Save current state before switching
        const currentNicheFilter = trendsFilters.find(f => f.type === 'niche');
        const isUnassigned = currentNicheFilter && (currentNicheFilter.value as string[]).includes('UNASSIGNED');

        if (currentNicheFilter && !isUnassigned) {
            // In a real niche (including TRASH) → save to nicheFilters
            const activeIds = currentNicheFilter.value as string[];
            if (activeIds.length === 1) {
                setNicheFilters(activeIds[0], trendsFilters);
            }
        } else if (selectedChannelId) {
            // In ROOT or UNASSIGNED → save to channelRootFilters
            setChannelRootFilters(selectedChannelId, trendsFilters);
        }

        // Step 2: Switch channel
        setSelectedChannelId(channelId);

        // Step 3: ALWAYS restore ROOT for target channel
        if (selectedChannelId === channelId) {
            // Same channel: check if coming from niche or already in ROOT
            const wasInRealNiche = currentNicheFilter && !isUnassigned;
            if (wasInRealNiche) {
                // Coming from niche → restore ROOT filters
                const rootFilters = useTrendStore.getState().channelRootFilters[channelId];
                setTrendsFilters(rootFilters?.length > 0 ? rootFilters : []);
            } else {
                // Already in ROOT → reset to empty
                setTrendsFilters([]);
            }
        } else {
            // Different channel: restore ROOT filters for target channel
            const rootFilters = useTrendStore.getState().channelRootFilters[channelId];
            setTrendsFilters(rootFilters?.length > 0 ? rootFilters : []);
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

        // Check if this channel has a broken avatar that needs refresh
        const brokenAvatarChannelIds = useTrendStore.getState().brokenAvatarChannelIds;
        const needsAvatarRefresh = brokenAvatarChannelIds.has(channelId);

        showToast(`Syncing all videos for ${channel.title}...`, 'success');

        try {
            // Force full sync (true) to update view counts for existing videos
            // Also refresh avatar if it was broken
            const { totalNewVideos, totalQuotaUsed, quotaBreakdown, newAvatarUrl } = await TrendService.syncChannelVideos(
                user.uid,
                currentChannel.id,
                channel,
                apiKey,
                true,
                needsAvatarRefresh
            );

            // Clear broken avatar flag if we got a new avatar
            if (newAvatarUrl) {
                useTrendStore.getState().clearBrokenAvatar(channelId);
            }

            showToast(`${channel.title} sync complete. Processed ${totalNewVideos} videos.`, 'success');

            await addNotification({
                title: `${channel.title} Visual Data Updated`,
                message: `Updated ${totalNewVideos} videos.`,
                type: 'success',
                meta: totalQuotaUsed.toString(),
                avatarUrl: newAvatarUrl || channel.avatarUrl,
                quotaBreakdown
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(`Sync failed: ${message}`, 'error');
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
