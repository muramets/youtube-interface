import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useVideosStore } from '../stores/videosStore';
import { usePlaylistsStore } from '../stores/playlistsStore';
import { useChannelStore } from '../stores/channelStore';
import { useAutoSync } from './useAutoSync';
import { useNotificationStore } from '../stores/notificationStore';

export const useStoreInitialization = () => {
    const { user, initializeAuth } = useAuthStore();
    const { currentChannel } = useChannelStore();
    const {
        subscribeToGeneralSettings,
        subscribeToSyncSettings,
        subscribeToCloneSettings,
        subscribeToRecommendationOrders,
        subscribeToVideoOrder,
        subscribeToPlaylistOrder
    } = useSettingsStore();
    const { subscribeToVideos } = useVideosStore();
    const { subscribeToPlaylists } = usePlaylistsStore();

    // Initialize Auto Sync
    useAutoSync();

    // 1. Initialize Auth
    useEffect(() => {
        const unsubscribe = initializeAuth();
        return () => unsubscribe();
    }, [initializeAuth]);

    // 2. Subscribe to Channels when User is logged in
    useEffect(() => {
        if (user) {
            const unsubscribeChannels = useChannelStore.getState().subscribeToChannels(user.uid);
            return () => unsubscribeChannels();
        }
    }, [user]); // subscribeToChannel removed from dependencies

    // 3. Subscribe to Data when User and Channel are ready
    useEffect(() => {
        if (user && currentChannel) {
            const unsubGeneral = subscribeToGeneralSettings(user.uid, currentChannel.id);
            const unsubSync = subscribeToSyncSettings(user.uid, currentChannel.id);
            const unsubClone = subscribeToCloneSettings(user.uid, currentChannel.id);
            const unsubRecs = subscribeToRecommendationOrders(user.uid, currentChannel.id);
            const unsubVideoOrder = subscribeToVideoOrder(user.uid, currentChannel.id);
            const unsubPlaylistOrder = subscribeToPlaylistOrder(user.uid, currentChannel.id);

            const unsubVideos = subscribeToVideos(user.uid, currentChannel.id);
            const unsubPlaylists = subscribeToPlaylists(user.uid, currentChannel.id);
            const unsubNotifications = useNotificationStore.getState().subscribeToNotifications(user.uid, currentChannel.id);

            return () => {
                unsubGeneral();
                unsubSync();
                unsubClone();
                unsubRecs();
                unsubVideoOrder();
                unsubPlaylistOrder();
                unsubVideos();
                unsubPlaylists();
                unsubNotifications();
            };
        }
    }, [
        user,
        currentChannel,
        subscribeToGeneralSettings,
        subscribeToSyncSettings,
        subscribeToCloneSettings,
        subscribeToRecommendationOrders,
        subscribeToVideoOrder,
        subscribeToPlaylistOrder,
        subscribeToVideos,
        subscribeToPlaylists
    ]);
    // 4. Apply Theme
    const { generalSettings } = useSettingsStore();
    useEffect(() => {
        const applyTheme = () => {
            const theme = generalSettings.theme;
            const isDark = theme === 'dark' || (theme === 'device' && window.matchMedia('(prefers-color-scheme: dark)').matches);

            if (isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        applyTheme();

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (generalSettings.theme === 'device') {
                applyTheme();
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [generalSettings.theme]);
};
