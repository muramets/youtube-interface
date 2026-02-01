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
        // Stats are now handled by Cloud Function notification


        try {
            // Initial toast
            const isSingle = targetChannels.length === 1;
            showToast(
                isSingle
                    ? `Syncing ${targetChannels[0].title}...`
                    : `Syncing ${targetChannels.length} channels...`,
                'success'
            );

            // Call Server-Side Sync
            // We pass the list of trend channel IDs if we are syncing specific ones (e.g. selection),
            // OR if we are syncing ALL visible ones.
            // The Cloud Function accepts `targetTrendChannelIds`.
            // If we send nothing, it syncs ALL.
            // But `targetChannels` here might be a subset (Visible Only).
            // So we should strictly pass the IDs of `targetChannels`.

            const targetIds = targetChannels.map(c => c.id);

            await TrendService.syncChannelCloud(currentChannel.id, targetIds);

            // Final success toast
            // Note: The Cloud Function sends the detailed notification.
            // We just confirm the command was accepted/finished.
            showToast(
                'Sync completed successfully',
                'success'
            );

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
