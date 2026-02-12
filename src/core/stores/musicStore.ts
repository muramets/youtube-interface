// =============================================================================
// MUSIC LIBRARY: Zustand Store
// =============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Track, MusicSettings, MusicGenre, MusicTag } from '../types/track';
import type { MusicPlaylist } from '../types/musicPlaylist';
import { TrackService } from '../services/trackService';
import { MusicPlaylistService } from '../services/musicPlaylistService';
import { DEFAULT_GENRES, DEFAULT_TAGS } from '../types/track';

interface MusicState {
    // Track data
    tracks: Track[];
    isLoading: boolean;

    // Selection & playback
    selectedTrackId: string | null;
    playingTrackId: string | null;
    playingVariant: 'vocal' | 'instrumental';
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    /** AudioPlayer registers this callback so TrackCard can request seeks */
    seekTo: ((position: number) => void) | null;

    // Filters
    searchQuery: string;
    genreFilter: string | null;
    tagFilters: string[];
    bpmFilter: [number, number] | null;

    // Music settings (genres & tags management)
    genres: MusicGenre[];
    tags: MusicTag[];
    isSettingsLoaded: boolean;

    // Music playlists
    musicPlaylists: MusicPlaylist[];
    activePlaylistId: string | null; // null = all tracks, 'liked' = liked filter
    playlistGroupOrder: string[];

    // Actions: Subscription
    subscribe: (userId: string, channelId: string) => () => void;
    loadSettings: (userId: string, channelId: string) => Promise<void>;
    saveSettings: (userId: string, channelId: string, settings: MusicSettings) => Promise<void>;

    // Actions: Playlists
    subscribePlaylists: (userId: string, channelId: string) => () => void;
    loadPlaylistSettings: (userId: string, channelId: string) => Promise<void>;
    setActivePlaylist: (id: string | null) => void;
    createPlaylist: (userId: string, channelId: string, name: string, group?: string, trackIds?: string[]) => Promise<MusicPlaylist>;
    updatePlaylist: (userId: string, channelId: string, playlistId: string, updates: Partial<Pick<MusicPlaylist, 'name' | 'group' | 'color' | 'order'>>) => Promise<void>;
    deletePlaylist: (userId: string, channelId: string, playlistId: string) => Promise<void>;
    addTracksToPlaylist: (userId: string, channelId: string, playlistId: string, trackIds: string[]) => Promise<void>;
    removeTracksFromPlaylist: (userId: string, channelId: string, playlistId: string, trackIds: string[]) => Promise<void>;

    // Actions: Selection & Playback
    setSelectedTrackId: (id: string | null) => void;
    setPlayingTrack: (id: string | null, variant?: 'vocal' | 'instrumental') => void;
    setIsPlaying: (isPlaying: boolean) => void;
    toggleVariant: () => void;
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    registerSeek: (fn: ((position: number) => void) | null) => void;

    // Actions: Filters
    setSearchQuery: (query: string) => void;
    setGenreFilter: (genre: string | null) => void;
    toggleTagFilter: (tagId: string) => void;
    setBpmFilter: (range: [number, number] | null) => void;
    clearFilters: () => void;

    // Actions: Settings mutations
    setGenres: (genres: MusicGenre[]) => void;
    setTags: (tags: MusicTag[]) => void;
    toggleLike: (userId: string, channelId: string, trackId: string) => void;
}

export const useMusicStore = create<MusicState>((set) => ({
    // Initial state
    tracks: [],
    isLoading: true,
    selectedTrackId: null,
    playingTrackId: null,
    playingVariant: 'vocal',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    seekTo: null,
    searchQuery: '',
    genreFilter: null,
    tagFilters: [],
    bpmFilter: null,
    genres: DEFAULT_GENRES,
    tags: DEFAULT_TAGS,
    isSettingsLoaded: false,
    musicPlaylists: [],
    activePlaylistId: null,
    playlistGroupOrder: [],

    // Subscribe to real-time track updates
    subscribe: (userId, channelId) => {
        set({ isLoading: true });
        const unsubscribe = TrackService.subscribeToTracks(userId, channelId, (tracks) => {
            set({ tracks, isLoading: false });
        });
        return unsubscribe;
    },

    // Load music settings (genres & tags)
    loadSettings: async (userId, channelId) => {
        try {
            const settings = await TrackService.getMusicSettings(userId, channelId);
            set({
                genres: settings.genres,
                tags: settings.tags,
                isSettingsLoaded: true,
            });
        } catch (error) {
            console.error('[MusicStore] Failed to load settings:', error);
        }
    },

    // Save music settings
    saveSettings: async (userId, channelId, settings) => {
        try {
            await TrackService.saveMusicSettings(userId, channelId, settings);
            set({
                genres: settings.genres,
                tags: settings.tags,
            });
        } catch (error) {
            console.error('[MusicStore] Failed to save settings:', error);
            throw error;
        }
    },

    // Selection & Playback
    setSelectedTrackId: (id) => set({ selectedTrackId: id }),

    setPlayingTrack: (id, variant) => set({
        playingTrackId: id,
        playingVariant: variant || 'vocal',
        isPlaying: id !== null,
    }),

    setIsPlaying: (isPlaying) => set({ isPlaying }),

    toggleVariant: () => set((state) => ({
        playingVariant: state.playingVariant === 'vocal' ? 'instrumental' : 'vocal',
    })),

    setCurrentTime: (time) => set({ currentTime: time }),
    setDuration: (duration) => set({ duration }),
    registerSeek: (fn) => set({ seekTo: fn }),

    // Filters
    setSearchQuery: (query) => set({ searchQuery: query }),

    setGenreFilter: (genre) => set((state) => ({
        genreFilter: state.genreFilter === genre ? null : genre,
    })),

    toggleTagFilter: (tagId) => set((state) => {
        const exists = state.tagFilters.includes(tagId);
        return {
            tagFilters: exists
                ? state.tagFilters.filter((t) => t !== tagId)
                : [...state.tagFilters, tagId],
        };
    }),

    setBpmFilter: (range) => set({ bpmFilter: range }),

    clearFilters: () => set({
        searchQuery: '',
        genreFilter: null,
        tagFilters: [],
        bpmFilter: null,
    }),

    // Settings mutations (local only — call saveSettings to persist)
    setGenres: (genres) => set({ genres }),
    setTags: (tags) => set({ tags }),
    toggleLike: (userId, channelId, trackId) => {
        const track = useMusicStore.getState().tracks.find((t) => t.id === trackId);
        const newLiked = !track?.liked;
        // Optimistic update
        set((state) => ({
            tracks: state.tracks.map((t) =>
                t.id === trackId ? { ...t, liked: newLiked } : t
            ),
        }));
        // Persist to Firestore
        TrackService.updateTrack(userId, channelId, trackId, { liked: newLiked }).catch((err) => {
            console.error('[MusicStore] Failed to persist like:', err);
        });
    },

    // Playlists
    subscribePlaylists: (userId, channelId) => {
        return MusicPlaylistService.subscribeToPlaylists(userId, channelId, (playlists) => {
            set({ musicPlaylists: playlists });
        });
    },

    loadPlaylistSettings: async (userId, channelId) => {
        try {
            const settings = await MusicPlaylistService.fetchSettings(userId, channelId);
            set({ playlistGroupOrder: settings.groupOrder });
        } catch (error) {
            console.error('[MusicStore] Failed to load playlist settings:', error);
        }
    },

    setActivePlaylist: (id) => set({ activePlaylistId: id }),

    createPlaylist: async (userId, channelId, name, group, trackIds) => {
        const now = Date.now();
        const playlist: MusicPlaylist = {
            id: uuidv4(),
            name,
            trackIds: trackIds || [],
            group: group || null,
            order: 0,
            createdAt: now,
            updatedAt: now,
        };
        // Optimistic update
        set((state) => ({ musicPlaylists: [...state.musicPlaylists, playlist] }));
        await MusicPlaylistService.createPlaylist(userId, channelId, playlist);
        return playlist;
    },

    updatePlaylist: async (userId, channelId, playlistId, updates) => {
        // Optimistic update
        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) =>
                p.id === playlistId ? { ...p, ...updates, updatedAt: Date.now() } : p
            ),
        }));
        await MusicPlaylistService.updatePlaylist(userId, channelId, playlistId, {
            ...updates,
            updatedAt: Date.now(),
        });
    },

    deletePlaylist: async (userId, channelId, playlistId) => {
        // Optimistic update
        set((state) => ({
            musicPlaylists: state.musicPlaylists.filter((p) => p.id !== playlistId),
            activePlaylistId: state.activePlaylistId === playlistId ? null : state.activePlaylistId,
        }));
        await MusicPlaylistService.deletePlaylist(userId, channelId, playlistId);
    },

    addTracksToPlaylist: async (userId, channelId, playlistId, trackIds) => {
        // Optimistic update
        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) =>
                p.id === playlistId
                    ? { ...p, trackIds: [...trackIds.filter(id => !p.trackIds.includes(id)), ...p.trackIds] }
                    : p
            ),
        }));
        await MusicPlaylistService.addTracksToPlaylist(userId, channelId, playlistId, trackIds);
    },

    removeTracksFromPlaylist: async (userId, channelId, playlistId, trackIds) => {
        // Optimistic update
        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) =>
                p.id === playlistId
                    ? { ...p, trackIds: p.trackIds.filter(id => !trackIds.includes(id)) }
                    : p
            ),
        }));
        await MusicPlaylistService.removeTracksFromPlaylist(userId, channelId, playlistId, trackIds);
    },
}));
