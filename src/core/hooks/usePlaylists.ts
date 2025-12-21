import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { PlaylistService, type Playlist } from '../services/playlistService';
import { SettingsService } from '../services/settingsService';

export const usePlaylists = (userId: string, channelId: string) => {
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => ['playlists', userId, channelId], [userId, channelId]);

    const { data: playlists = [], isLoading, error } = useQuery<Playlist[]>({
        queryKey,
        queryFn: async () => {
            return PlaylistService.fetchPlaylists(userId, channelId);
        },
        staleTime: Infinity,
        enabled: !!userId && !!channelId,
    });

    useEffect(() => {
        if (!userId || !channelId) return;
        const unsubscribe = PlaylistService.subscribeToPlaylists(userId, channelId, (data) => {
            queryClient.setQueryData(queryKey, data);
        });
        return () => unsubscribe();
    }, [userId, channelId, queryClient, queryKey]);

    // Mutations
    const createPlaylistMutation = useMutation({
        mutationFn: async ({ name, videoIds = [] }: { name: string, videoIds?: string[] }) => {
            const id = `playlist-${Date.now()}`;
            const newPlaylist: Playlist = {
                id,
                name,
                videoIds,
                createdAt: Date.now()
            };
            await PlaylistService.createPlaylist(userId, channelId, newPlaylist);
            return id;
        }
    });

    const updatePlaylistMutation = useMutation({
        mutationFn: async ({ playlistId, updates }: { playlistId: string, updates: Partial<Playlist> }) => {
            await PlaylistService.updatePlaylist(userId, channelId, playlistId, updates);
        }
    });

    const deletePlaylistMutation = useMutation({
        mutationFn: async (playlistId: string) => {
            await PlaylistService.deletePlaylist(userId, channelId, playlistId);
        }
    });

    const addVideoToPlaylistMutation = useMutation({
        mutationFn: async ({ playlistId, videoId }: { playlistId: string, videoId: string }) => {
            await PlaylistService.addVideoToPlaylist(userId, channelId, playlistId, videoId);
        }
    });

    const removeVideoFromPlaylistMutation = useMutation({
        mutationFn: async ({ playlistId, videoId }: { playlistId: string, videoId: string }) => {
            await PlaylistService.removeVideoFromPlaylist(userId, channelId, playlistId, videoId);
        }
    });

    const reorderPlaylistsMutation = useMutation({
        mutationFn: async (newOrder: string[]) => {
            await SettingsService.updatePlaylistOrder(userId, channelId, newOrder);
        }
    });

    const reorderPlaylistVideosMutation = useMutation({
        mutationFn: async ({ playlistId, newVideoIds }: { playlistId: string, newVideoIds: string[] }) => {
            await PlaylistService.updatePlaylist(userId, channelId, playlistId, { videoIds: newVideoIds });
        }
    });

    return {
        playlists,
        isLoading,
        error,
        createPlaylist: createPlaylistMutation.mutateAsync,
        updatePlaylist: updatePlaylistMutation.mutateAsync,
        deletePlaylist: deletePlaylistMutation.mutateAsync,
        addVideoToPlaylist: addVideoToPlaylistMutation.mutateAsync,
        removeVideoFromPlaylist: removeVideoFromPlaylistMutation.mutateAsync,
        reorderPlaylists: reorderPlaylistsMutation.mutateAsync,
        reorderPlaylistVideos: reorderPlaylistVideosMutation.mutateAsync
    };
};
