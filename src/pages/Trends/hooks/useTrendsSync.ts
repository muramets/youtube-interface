import { useState, useEffect, useRef } from 'react';
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
    const { hasApiKey } = useApiKey();
    const { showToast } = useUIStore();
    const { notifications } = useNotificationStore();

    const [isSyncing, setIsSyncing] = useState(false);

    // Snapshot of notification IDs that existed BEFORE sync was triggered.
    // Only notifications arriving AFTER this snapshot are treated as sync results.
    const preSyncNotificationIdsRef = useRef<Set<string>>(new Set());

    // --- Sync Completion Listener ---
    // Watch for "Manual Sync Complete" notifications from the Cloud Function
    useEffect(() => {
        if (!isSyncing) return;

        const syncNotification = notifications.find(
            n => n.title === 'Manual Sync Complete' && !preSyncNotificationIdsRef.current.has(n.id)
        );

        if (syncNotification) {
            // Add to set to prevent duplicate toasts on re-renders
            preSyncNotificationIdsRef.current.add(syncNotification.id);
            showToast(syncNotification.message, 'success');
            // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to external Firestore notification
            setIsSyncing(false);
        }
    }, [notifications, isSyncing, showToast]);

    // Determine targets
    const visibleChannels = channels.filter(c => c.isVisible);
    const targetChannels = selectedChannelId
        ? channels.filter(c => c.id === selectedChannelId)
        : visibleChannels;

    // Local canSync based on API key and targets
    const localCanSync = hasApiKey && targetChannels.length > 0;

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
        if (!user || !currentChannel || !localCanSync || isSyncing) return;

        // Snapshot all current notification IDs so the listener ignores pre-existing ones
        preSyncNotificationIdsRef.current = new Set(notifications.map(n => n.id));

        setIsSyncing(true);

        // Immediate feedback
        showToast('Sync started — we\'ll notify you when it\'s done', 'success');

        const targetIds = targetChannels.map(c => c.id);
        const needsAvatarRefresh = targetChannels.some(c => brokenAvatarChannelIds.has(c.id));

        // Fire-and-forget: dispatch cloud function without awaiting
        TrendService.syncChannelCloud(currentChannel.id, targetIds, needsAvatarRefresh)
            .then(() => {
                // Clear broken avatar flags on successful dispatch
                if (needsAvatarRefresh) {
                    targetChannels.forEach(c => {
                        if (brokenAvatarChannelIds.has(c.id)) clearBrokenAvatar(c.id);
                    });
                }
            })
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                showToast(`Sync failed: ${message}`, 'error');
                console.error('[useTrendsSync] Error:', error);
                setIsSyncing(false);
            });
    };

    return {
        handleSync,
        isSyncing,
        canSync: localCanSync,
        syncTooltip
    };
};
