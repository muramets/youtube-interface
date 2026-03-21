/**
 * useFirestoreSync — single source of all global Firestore subscriptions.
 *
 * Called ONCE in App.tsx. Creates exactly one onSnapshot listener per
 * collection/document. All consumer hooks (useVideos, useSettings, usePlaylists)
 * read from TanStack Query cache — zero duplicate listeners.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';
import { VideoService } from '../services/videoService';
import { PlaylistService } from '../services/playlistService';
import { KnowledgeService } from '../services/knowledge/knowledgeService';
import { SettingsService, type GeneralSettings } from '../services/settingsService';
import { terminatingVideoIds } from './useVideos';

export const useFirestoreSync = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const queryClient = useQueryClient();

    const userId = user?.uid ?? '';
    const channelId = currentChannel?.id ?? '';

    // --- Videos: 1 listener instead of 52 ---
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsub = VideoService.subscribeToVideos(userId, channelId, (data) => {
            const filtered = data.filter(v => !terminatingVideoIds.has(v.id));
            queryClient.setQueryData(['videos', userId, channelId], filtered);
        });
        return () => unsub();
    }, [userId, channelId, queryClient]);

    // --- Playlists: 1 listener instead of 19 ---
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsub = PlaylistService.subscribeToPlaylists(userId, channelId, (data) => {
            queryClient.setQueryData(['playlists', userId, channelId], data);
        });
        return () => unsub();
    }, [userId, channelId, queryClient]);

    // --- Settings: 10 listeners instead of 261 ---
    useEffect(() => {
        if (!userId || !channelId) return;

        const unsubs = [
            SettingsService.subscribeToGeneralSettings(userId, channelId, (data) => {
                if (data) queryClient.setQueryData(
                    ['settings', 'general', userId, channelId],
                    (old: GeneralSettings | undefined) => old ? { ...old, ...data } : data,
                );
            }),
            SettingsService.subscribeToSyncSettings(userId, channelId, (data) => {
                if (data) queryClient.setQueryData(['settings', 'sync', userId, channelId], data);
            }),
            SettingsService.subscribeToCloneSettings(userId, channelId, (data) => {
                if (data) queryClient.setQueryData(['settings', 'clone', userId, channelId], data);
            }),
            SettingsService.subscribeToRecommendationOrders(userId, channelId, (data) => {
                if (data) queryClient.setQueryData(['settings', 'recommendationOrders', userId, channelId], data);
            }),
            SettingsService.subscribeToVideoOrder(userId, channelId, (data) => {
                if (data) queryClient.setQueryData(['settings', 'videoOrder', userId, channelId], data);
            }),
            SettingsService.subscribeToPlaylistOrder(userId, channelId, (data) => {
                if (data) queryClient.setQueryData(['settings', 'playlistOrder', userId, channelId], data);
            }),
            SettingsService.subscribeToPackagingSettings(userId, channelId, (data) => {
                if (data) queryClient.setQueryData(['settings', 'packaging', userId, channelId], data);
            }),
            SettingsService.subscribeToUploadDefaults(userId, channelId, (data) => {
                if (data) queryClient.setQueryData(['settings', 'uploadDefaults', userId, channelId], data);
            }),
            SettingsService.subscribeToTrafficSettings(userId, channelId, (data) => {
                if (data) queryClient.setQueryData(['settings', 'traffic', userId, channelId], data);
            }),
            SettingsService.subscribeToPickerSettings(userId, channelId, (data) => {
                if (data) queryClient.setQueryData(['settings', 'picker', userId, channelId], data);
            }),
        ];

        return () => unsubs.forEach(fn => fn());
    }, [userId, channelId, queryClient]);

    // --- Knowledge Items: 1 listener instead of 2 ---
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsub = KnowledgeService.subscribeToAllKnowledgeItems(userId, channelId, (data) => {
            queryClient.setQueryData(['knowledgeItems', userId, channelId, 'all'], data);
        });
        return () => unsub();
    }, [userId, channelId, queryClient]);
};
