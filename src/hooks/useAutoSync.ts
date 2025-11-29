import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useVideosStore } from '../stores/videosStore';
import { useAuthStore } from '../stores/authStore';
import { useChannelStore } from '../stores/channelStore';
import { useNotificationStore } from '../stores/notificationStore';

export const useAutoSync = () => {
    const { syncSettings, updateSyncSettings, generalSettings } = useSettingsStore();
    const { syncAllVideos } = useVideosStore();
    const { user } = useAuthStore();
    const { currentChannel } = useChannelStore();
    const { addNotification } = useNotificationStore.getState();

    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastAlertRef = useRef<number>(0);

    useEffect(() => {
        const checkAndSync = async () => {
            if (!user || !currentChannel || !syncSettings.autoSync) return;

            const now = Date.now();
            const lastSync = syncSettings.lastGlobalSync || 0;
            const frequencyMs = syncSettings.frequencyHours * 60 * 60 * 1000;
            const nextSyncTime = lastSync + frequencyMs;

            if (now >= nextSyncTime) {
                // Time to sync!
                if (!generalSettings.apiKey) {
                    // Check if we already have a recent "Missing API Key" notification (e.g., last 24h)
                    // to avoid spamming the user every time the interval hits.
                    const { notifications } = useNotificationStore.getState();

                    // Check both the store (persistent) and our local ref (immediate)
                    const hasRecentAlertInStore = notifications.some(n =>
                        n.title === 'Auto-Sync Failed' &&
                        n.message.includes('Missing API Key') &&
                        (now - (n.timestamp || 0)) < 24 * 60 * 60 * 1000 // 24 hours
                    );



                    const hasRecentAlertLocal = (now - lastAlertRef.current) < 24 * 60 * 60 * 1000;

                    if (!hasRecentAlertInStore && !hasRecentAlertLocal) {
                        lastAlertRef.current = now; // Update local ref immediately
                        addNotification({
                            title: 'Auto-Sync Failed',
                            message: 'Missing API Key. Please configure it in Settings.',
                            type: 'error',
                            link: 'settings'
                        });
                    }

                    // IMPORTANT: Update lastGlobalSync even if we failed/skipped due to missing key.
                    // This prevents the system from retrying immediately and getting into a loop.
                    // It will try again after the configured frequencyHours.
                    updateSyncSettings(user.uid, currentChannel.id, {
                        ...syncSettings,
                        lastGlobalSync: Date.now()
                    });
                    return;
                }

                await syncAllVideos(user.uid, currentChannel.id, generalSettings.apiKey);

                // Update last sync time
                updateSyncSettings(user.uid, currentChannel.id, {
                    ...syncSettings,
                    lastGlobalSync: Date.now()
                });
            } else {
                // Schedule next check
                const delay = nextSyncTime - now;
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(checkAndSync, delay);
            }
        };

        // 1. Check on mount / settings change
        checkAndSync();

        // 2. Check on tab focus
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkAndSync();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [
        user,
        currentChannel,
        syncSettings,
        generalSettings.apiKey,
        syncAllVideos,
        updateSyncSettings,
        addNotification
    ]);
};
