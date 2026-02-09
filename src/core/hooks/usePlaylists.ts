import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { PlaylistService, type Playlist, type PlaylistSettings } from '../services/playlistService';
import { SettingsService } from '../services/settingsService';

export const usePlaylists = (userId: string, channelId: string) => {
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => ['playlists', userId, channelId], [userId, channelId]);
    const settingsKey = useMemo(() => ['playlistSettings', userId, channelId], [userId, channelId]);

    // Stable empty array reference
    const EMPTY_PLAYLISTS: Playlist[] = useMemo(() => [], []);

    const { data: rawPlaylists, isLoading, error } = useQuery<Playlist[]>({
        queryKey,
        queryFn: async () => {
            return PlaylistService.fetchPlaylists(userId, channelId);
        },
        staleTime: Infinity,
        enabled: !!userId && !!channelId,
    });

    const playlists = rawPlaylists || EMPTY_PLAYLISTS;

    const { data: playlistSettings } = useQuery<PlaylistSettings>({
        queryKey: settingsKey,
        queryFn: async () => {
            return PlaylistService.fetchPlaylistSettings(userId, channelId);
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
        mutationFn: async ({ name, videoIds = [], group }: { name: string, videoIds?: string[], group?: string }) => {
            const now = Date.now();
            const id = `playlist-${now}`;
            const newPlaylist: Playlist = {
                id,
                name,
                videoIds,
                createdAt: now,
                updatedAt: now,
                order: 0, // New playlists go to top
                // Only include group if defined (Firestore doesn't accept undefined)
                ...(group ? { group } : {}),
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

    const addVideosToPlaylistMutation = useMutation({
        mutationFn: async ({ playlistId, videoIds }: { playlistId: string, videoIds: string[] }) => {
            await PlaylistService.addVideosToPlaylist(userId, channelId, playlistId, videoIds);
        }
    });

    const removeVideosFromPlaylistMutation = useMutation({
        mutationFn: async ({ playlistId, videoIds }: { playlistId: string, videoIds: string[] }) => {
            await PlaylistService.removeVideosFromPlaylist(userId, channelId, playlistId, videoIds);
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

    // --- Group-related mutations ---
    const reorderGroupOrderMutation = useMutation({
        mutationFn: async (newOrder: string[]) => {
            await PlaylistService.updatePlaylistSettings(userId, channelId, { groupOrder: newOrder });
            // Optimistic update
            queryClient.setQueryData(settingsKey, (old: PlaylistSettings | undefined) => ({
                ...old,
                groupOrder: newOrder
            }));
        }
    });

    const reorderPlaylistsInGroupMutation = useMutation({
        mutationFn: async (orderedIds: string[]) => {
            await PlaylistService.reorderPlaylistsInGroup(userId, channelId, orderedIds);
        }
    });

    const movePlaylistToGroupMutation = useMutation({
        mutationFn: async ({ playlistId, newGroup, orderedIds }: { playlistId: string, newGroup: string, orderedIds: string[] }) => {
            await PlaylistService.movePlaylistToGroup(userId, channelId, playlistId, newGroup, orderedIds);
        }
    });

    const batchNormalizeOrdersMutation = useMutation({
        mutationFn: async (orderUpdates: { id: string; order: number }[]) => {
            await PlaylistService.batchNormalizeOrders(userId, channelId, orderUpdates);
        }
    });

    const renameGroupMutation = useMutation({
        mutationFn: async ({ oldName, newName }: { oldName: string, newName: string }) => {
            await PlaylistService.renameGroup(userId, channelId, oldName, newName);
        },
        onMutate: async ({ oldName, newName }) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey });
            await queryClient.cancelQueries({ queryKey: settingsKey });

            // Snapshot previous value
            const previousPlaylists = queryClient.getQueryData<Playlist[]>(queryKey);
            const previousSettings = queryClient.getQueryData<PlaylistSettings>(settingsKey);

            // Optimistic update for Playlists
            if (previousPlaylists) {
                queryClient.setQueryData<Playlist[]>(queryKey, (old) => {
                    return old ? old.map(p =>
                        p.group === oldName ? { ...p, group: newName } : p
                    ) : [];
                });
            }

            // Optimistic update for Settings (Group Order)
            if (previousSettings) {
                queryClient.setQueryData<PlaylistSettings>(settingsKey, (old) => {
                    if (!old) return { groupOrder: [] };
                    return {
                        ...old,
                        groupOrder: (old.groupOrder || []).map(g => g === oldName ? newName : g)
                    };
                });
            }

            return { previousPlaylists, previousSettings };
        },
        onError: (_err, _newTodo, context) => {
            if (context?.previousPlaylists) {
                queryClient.setQueryData(queryKey, context.previousPlaylists);
            }
            if (context?.previousSettings) {
                queryClient.setQueryData(settingsKey, context.previousSettings);
            }
        },
        onSettled: () => {
            // We usually invalidate here, but since the subscription will fire, 
            // explicit invalidation might be redundant or cause double-fetches.
            // However, to be safe against subscription lag:
            // queryClient.invalidateQueries({ queryKey });
            // queryClient.invalidateQueries({ queryKey: settingsKey });
        }
    });

    const deleteGroupMutation = useMutation({
        mutationFn: async (groupName: string) => {
            // Move all playlists in the group to "Ungrouped"
            const playlistsInGroup = playlists.filter(p => p.group === groupName);
            for (const p of playlistsInGroup) {
                await PlaylistService.updatePlaylist(userId, channelId, p.id, { group: undefined });
            }
            // Remove from group order
            const currentOrder = playlistSettings?.groupOrder || [];
            const newOrder = currentOrder.filter(g => g !== groupName);
            await PlaylistService.updatePlaylistSettings(userId, channelId, { groupOrder: newOrder });
        },
        onMutate: async (groupName: string) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey });
            await queryClient.cancelQueries({ queryKey: settingsKey });

            // Snapshot previous values for rollback
            const previousPlaylists = queryClient.getQueryData<Playlist[]>(queryKey);
            const previousSettings = queryClient.getQueryData<PlaylistSettings>(settingsKey);

            // Optimistic update: ungroup all playlists in deleted group
            if (previousPlaylists) {
                queryClient.setQueryData<Playlist[]>(queryKey, (old) => {
                    return old ? old.map(p =>
                        p.group === groupName ? { ...p, group: undefined } : p
                    ) : [];
                });
            }

            // Optimistic update: remove group from groupOrder
            if (previousSettings) {
                queryClient.setQueryData<PlaylistSettings>(settingsKey, (old) => {
                    if (!old) return { groupOrder: [] };
                    return {
                        ...old,
                        groupOrder: (old.groupOrder || []).filter(g => g !== groupName)
                    };
                });
            }

            return { previousPlaylists, previousSettings };
        },
        onError: (_err, _groupName, context) => {
            if (context?.previousPlaylists) {
                queryClient.setQueryData(queryKey, context.previousPlaylists);
            }
            if (context?.previousSettings) {
                queryClient.setQueryData(settingsKey, context.previousSettings);
            }
        },
    });

    return useMemo(() => ({
        // Manual cache update for optimistic DnD
        updateCache: (newPlaylists: Playlist[]) => queryClient.setQueryData(queryKey, newPlaylists),
        playlists,
        isLoading,
        error,
        playlistSettings,
        groupOrder: playlistSettings?.groupOrder || [],
        createPlaylist: createPlaylistMutation.mutateAsync,
        updatePlaylist: updatePlaylistMutation.mutateAsync,
        deletePlaylist: deletePlaylistMutation.mutateAsync,
        addVideosToPlaylist: addVideosToPlaylistMutation.mutateAsync,
        removeVideosFromPlaylist: removeVideosFromPlaylistMutation.mutateAsync,
        reorderPlaylists: reorderPlaylistsMutation.mutateAsync,
        reorderPlaylistVideos: reorderPlaylistVideosMutation.mutateAsync,
        // Group operations
        reorderGroupOrder: reorderGroupOrderMutation.mutateAsync,
        reorderPlaylistsInGroup: reorderPlaylistsInGroupMutation.mutateAsync,
        movePlaylistToGroup: movePlaylistToGroupMutation.mutateAsync,
        batchNormalizeOrders: batchNormalizeOrdersMutation.mutateAsync,
        renameGroup: renameGroupMutation.mutateAsync,
        deleteGroup: deleteGroupMutation.mutateAsync,
    }), [
        playlists,
        isLoading,
        error,
        playlistSettings,
        createPlaylistMutation.mutateAsync,
        updatePlaylistMutation.mutateAsync,
        deletePlaylistMutation.mutateAsync,
        addVideosToPlaylistMutation.mutateAsync,
        removeVideosFromPlaylistMutation.mutateAsync,
        reorderPlaylistsMutation.mutateAsync,
        reorderPlaylistVideosMutation.mutateAsync,
        reorderGroupOrderMutation.mutateAsync,
        reorderPlaylistsInGroupMutation.mutateAsync,
        movePlaylistToGroupMutation.mutateAsync,
        batchNormalizeOrdersMutation.mutateAsync,
        renameGroupMutation.mutateAsync,
        deleteGroupMutation.mutateAsync,
        queryClient,
        queryKey,
    ]);
};
