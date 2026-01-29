import { useState } from 'react';
import { useTrendStore } from '../../../core/stores/trendStore';
import { TrendService } from '../../../core/services/trendService';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useApiKey } from '../../../core/hooks/useApiKey';
import { useUIStore } from '../../../core/stores/uiStore';
import { useNotificationStore } from '../../../core/stores/notificationStore';

interface UseTrendsSyncReturn {
    handleSync: () => Promise<void>;
    isSyncing: boolean;
    canSync: boolean;
    syncTooltip: string;
}

export const useTrendsSync = (): UseTrendsSyncReturn => {
    const {
        channels,
        selectedChannelId,
        brokenAvatarChannelIds,
        clearBrokenAvatar
    } = useTrendStore();

    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { apiKey, hasApiKey } = useApiKey();
    const { showToast } = useUIStore();
    const { addNotification } = useNotificationStore();

    const [isSyncing, setIsSyncing] = useState(false);

    // Determine targets
    const visibleChannels = channels.filter(c => c.isVisible);
    const targetChannels = selectedChannelId
        ? channels.filter(c => c.id === selectedChannelId)
        : visibleChannels;

    const canSync = hasApiKey && targetChannels.length > 0;

    // Tooltip logic
    const syncTooltip = !hasApiKey
        ? "API Key missing"
        : isSyncing
            ? "Syncing..."
            : selectedChannelId
                ? `Sync ${targetChannels[0]?.title || 'Channel'}`
                : targetChannels.length > 0
                    ? `Sync all visible channels (${targetChannels.length})`
                    : "No visible channels to sync";

    const handleSync = async () => {
        if (!user || !currentChannel || !canSync || isSyncing) return;

        setIsSyncing(true);
        let totalNewVideos = 0;
        let totalQuotaUsed = 0;
        const totalQuotaBreakdown = { list: 0, details: 0 };
        const syncedChannelNames: string[] = [];

        try {
            // Initial toast
            const isSingle = targetChannels.length === 1;
            showToast(
                isSingle
                    ? `Syncing ${targetChannels[0].title}...`
                    : `Syncing ${targetChannels.length} channels...`,
                'success'
            );

            // Process sequentially to be safe with rate limits
            for (const channel of targetChannels) {
                const needsAvatarRefresh = brokenAvatarChannelIds.has(channel.id);

                // Call atomic sync service
                const stats = await TrendService.syncChannelVideos(
                    user.uid,
                    currentChannel.id,
                    channel,
                    apiKey,
                    true, // force full sync
                    needsAvatarRefresh
                );

                // Aggregate stats
                totalNewVideos += stats.totalNewVideos;
                totalQuotaUsed += stats.totalQuotaUsed;
                totalQuotaBreakdown.list += stats.quotaBreakdown.list;
                totalQuotaBreakdown.details += stats.quotaBreakdown.details;
                syncedChannelNames.push(channel.title);

                // Clear broken avatar flag if refreshed
                if (stats.newAvatarUrl) {
                    clearBrokenAvatar(channel.id);
                }
            }

            // Final success toast
            showToast(
                isSingle
                    ? `Sync complete. Processed ${totalNewVideos} videos.`
                    : `Sync complete. Processed ${totalNewVideos} videos from ${targetChannels.length} channels.`,
                'success'
            );

            // Detailed notification
            await addNotification({
                title: isSingle
                    ? `${targetChannels[0].title} Visual Data Updated`
                    : `Bulk Sync Complete`,
                message: isSingle
                    ? `Updated ${totalNewVideos} videos.`
                    : `Synced ${targetChannels.length} channels. Processed ${totalNewVideos} total videos.`,
                type: 'success',
                meta: totalQuotaUsed.toString(),
                avatarUrl: isSingle ? targetChannels[0].avatarUrl : undefined,
                quotaBreakdown: totalQuotaBreakdown
            });

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(`Sync failed: ${message}`, 'error');
            console.error('[useTrendsSync] Error:', error);
        } finally {
            setIsSyncing(false);
        }
    };

    return {
        handleSync,
        isSyncing,
        canSync,
        syncTooltip
    };
};
