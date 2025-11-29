import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useChannel } from './ChannelContext';
import { useVideos } from './VideosContext';
import { useSettings } from './SettingsContext';
import { PlaylistService, type Playlist } from '../services/playlistService';

interface PlaylistsContextType {
    playlists: Playlist[];
    isLoading: boolean;
    createPlaylist: (name: string) => Promise<void>;
    deletePlaylist: (id: string) => Promise<void>;
    updatePlaylist: (id: string, updates: Partial<Playlist>) => Promise<void>;
    addVideoToPlaylist: (playlistId: string, videoId: string) => Promise<void>;
    removeVideoFromPlaylist: (playlistId: string, videoId: string) => Promise<void>;
    reorderPlaylistVideos: (playlistId: string, newOrder: string[]) => Promise<void>;
    reorderPlaylists: (newPlaylists: Playlist[]) => Promise<void>;
}

const PlaylistsContext = createContext<PlaylistsContextType | undefined>(undefined);

export const usePlaylists = () => {
    const context = useContext(PlaylistsContext);
    if (!context) {
        throw new Error('usePlaylists must be used within a PlaylistsProvider');
    }
    return context;
};

export const PlaylistsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { currentChannel, loading: channelLoading } = useChannel();
    const { videos } = useVideos();
    const { playlistOrder, updatePlaylistOrder } = useSettings();

    const [rawPlaylists, setRawPlaylists] = useState<Playlist[]>([]);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (rawPlaylists.length === 0) {
            setPlaylists([]);
            return;
        }

        if (playlistOrder.length > 0) {
            const orderMap = new Map(playlistOrder.map((id, index) => [id, index]));
            const sorted = [...rawPlaylists].sort((a, b) => {
                const indexA = orderMap.get(a.id);
                const indexB = orderMap.get(b.id);
                if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
                if (indexA !== undefined) return -1;
                if (indexB !== undefined) return 1;
                return 0; // Keep original order if neither in map
            });
            setPlaylists(sorted);
        } else {
            setPlaylists(rawPlaylists);
        }
    }, [rawPlaylists, playlistOrder]);

    useEffect(() => {
        if (channelLoading) return;

        if (!user || !currentChannel) {
            setPlaylists([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        const unsubscribe = PlaylistService.subscribeToPlaylists(
            user.uid,
            currentChannel.id,
            (data) => {
                setRawPlaylists(data);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user, currentChannel, channelLoading]);

    const createPlaylist = async (name: string) => {
        if (!user || !currentChannel) return;
        const now = Date.now();
        const id = `playlist-${now}`;
        const newPlaylist: Playlist = {
            id,
            name,
            videoIds: [],
            createdAt: now,
            updatedAt: now
        };
        await PlaylistService.createPlaylist(user.uid, currentChannel.id, newPlaylist);
    };

    const deletePlaylist = async (id: string) => {
        if (!user || !currentChannel) return;
        await PlaylistService.deletePlaylist(user.uid, currentChannel.id, id);
    };

    const updatePlaylist = async (id: string, updates: Partial<Playlist>) => {
        if (!user || !currentChannel) return;
        await PlaylistService.updatePlaylist(user.uid, currentChannel.id, id, updates);
    };

    const addVideoToPlaylist = async (playlistId: string, videoId: string) => {
        if (!user || !currentChannel) return;
        const playlist = playlists.find(p => p.id === playlistId);
        if (!playlist) return;
        if (playlist.videoIds.includes(videoId)) return;

        const video = videos.find(v => v.id === videoId);
        let newCover = playlist.coverImage;
        if (!newCover && video) {
            newCover = video.thumbnail;
        }

        await PlaylistService.updatePlaylist(user.uid, currentChannel.id, playlistId, {
            videoIds: [...playlist.videoIds, videoId],
            coverImage: newCover
        });
    };

    const removeVideoFromPlaylist = async (playlistId: string, videoId: string) => {
        if (!user || !currentChannel) return;
        const playlist = playlists.find(p => p.id === playlistId);
        if (!playlist) return;

        const newVideoIds = playlist.videoIds.filter(id => id !== videoId);
        let newCover = playlist.coverImage;

        if (newVideoIds.length === 0) {
            newCover = ''; // Reset cover if empty
        }

        await PlaylistService.updatePlaylist(user.uid, currentChannel.id, playlistId, {
            videoIds: newVideoIds,
            coverImage: newCover
        });
    };

    const reorderPlaylistVideos = async (playlistId: string, newOrder: string[]) => {
        if (!user || !currentChannel) return;
        await PlaylistService.updatePlaylist(user.uid, currentChannel.id, playlistId, {
            videoIds: newOrder
        });
    };

    const reorderPlaylists = async (newPlaylists: Playlist[]) => {
        const newOrder = newPlaylists.map(p => p.id);
        // Optimistic update
        setPlaylists(newPlaylists);
        await updatePlaylistOrder(newOrder);
    };

    return (
        <PlaylistsContext.Provider value={{
            playlists,
            isLoading,
            createPlaylist,
            deletePlaylist,
            updatePlaylist,
            addVideoToPlaylist,
            removeVideoFromPlaylist,
            reorderPlaylistVideos,
            reorderPlaylists
        }}>
            {children}
        </PlaylistsContext.Provider>
    );
};
