import { create } from 'zustand';
import { useMusicStore } from './musicStore';
import type {
    EditingState,
    TimelineTrack,
    RenderResolution,
} from '../types/editing';
import { getEffectiveDuration } from '../types/editing';
import type { Track } from '../types/track';
import type { EditingSession } from '../types/editingSession';
import { hydrateTrack } from '../types/editingSession';

interface EditingActions {
    // Timeline
    addTrack: (track: TimelineTrack) => void;
    insertTrackAt: (track: TimelineTrack, index: number) => void;
    removeTrack: (trackId: string) => void;
    reorderTracks: (tracks: TimelineTrack[]) => void;
    toggleTrackVariant: (trackId: string, musicTracks: Track[]) => void;
    setTrackVolume: (trackId: string, volume: number) => void;
    setTrackTrim: (trackId: string, trimStart: number, trimEnd: number) => void;

    // Image
    setImage: (url: string, width: number, height: number) => void;
    setImageStoragePath: (path: string | null) => void;
    clearImage: () => void;

    // Render settings
    setResolution: (resolution: RenderResolution) => void;
    setLoopCount: (count: number) => void;
    setVolume: (volume: number) => void;

    // Playback
    setPlaybackPosition: (seconds: number) => void;
    setPlaying: (playing: boolean) => void;

    // Persistence
    setVideoId: (videoId: string) => void;
    loadFromSession: (session: EditingSession, musicTracks: Track[]) => void;

    // Track Browser
    toggleBrowser: () => void;
    setBrowserOpen: (open: boolean) => void;

    // Lock
    setLocked: (locked: boolean) => void;
    toggleLocked: () => void;

    // Computed
    getTotalDuration: () => number;

    // Reset
    reset: () => void;
}

const initialState: EditingState = {
    videoId: null,
    tracks: [],
    imageUrl: null,
    imageStoragePath: null,
    imageWidth: null,
    imageHeight: null,
    resolution: '1080p',
    loopCount: 1,
    volume: 1,
    playbackPosition: 0,
    isPlaying: false,
    isBrowserOpen: true,
    isLocked: false,
};

export const useEditingStore = create<EditingState & EditingActions>((set, get) => ({
    ...initialState,

    // ── Timeline ───────────────────────────────────────────────────────
    addTrack: (track) =>
        set((s) => ({ tracks: [...s.tracks, track] })),

    insertTrackAt: (track, index) =>
        set((s) => {
            const next = [...s.tracks];
            next.splice(index, 0, track);
            return { tracks: next };
        }),

    removeTrack: (id) =>
        set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),

    reorderTracks: (tracks) => set({ tracks }),

    toggleTrackVariant: (id, musicTracks) =>
        set((s) => ({
            tracks: s.tracks.map((t) => {
                if (t.id !== id) return t;
                const newVariant = t.variant === 'vocal' ? 'instrumental' as const : 'vocal' as const;
                const source = musicTracks.find((st) => st.id === t.trackId);
                if (!source) return t; // source track gone — don't toggle blindly
                const isVocal = newVariant === 'vocal';
                const newUrl = isVocal ? source.vocalUrl : source.instrumentalUrl;
                if (!newUrl) return t; // variant unavailable — keep current
                return {
                    ...t,
                    variant: newVariant,
                    audioUrl: newUrl,
                    peaks: isVocal ? source.vocalPeaks : source.instrumentalPeaks,
                };
            }),
        })),

    setTrackVolume: (id, volume) =>
        set((s) => ({
            tracks: s.tracks.map((t) =>
                t.id === id ? { ...t, volume: Math.max(0, Math.min(1, volume)) } : t
            ),
        })),

    setTrackTrim: (id, trimStart, trimEnd) =>
        set((s) => ({
            tracks: s.tracks.map((t) => {
                if (t.id !== id) return t;
                const ts = Math.max(0, Math.min(trimStart, t.duration - trimEnd - 2));
                const te = Math.max(0, Math.min(trimEnd, t.duration - ts - 2));
                return { ...t, trimStart: ts, trimEnd: te };
            }),
        })),

    // ── Image ──────────────────────────────────────────────────────────
    setImage: (url, width, height) =>
        set({ imageUrl: url, imageWidth: width, imageHeight: height }),

    setImageStoragePath: (path) => set({ imageStoragePath: path }),

    clearImage: () =>
        set({ imageUrl: null, imageStoragePath: null, imageWidth: null, imageHeight: null }),

    // ── Render Settings ────────────────────────────────────────────────
    setResolution: (resolution) => set({ resolution }),

    setLoopCount: (count) => set({ loopCount: Math.max(1, count) }),

    setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),

    // ── Playback ────────────────────────────────────────────────────────
    setPlaybackPosition: (seconds) => set({ playbackPosition: Math.max(0, seconds) }),

    setPlaying: (playing) => set({ isPlaying: playing }),

    // ── Track Browser ──────────────────────────────────────────────────
    toggleBrowser: () =>
        set((s) => ({ isBrowserOpen: !s.isBrowserOpen })),

    setBrowserOpen: (open) => set({ isBrowserOpen: open }),

    // ── Lock ───────────────────────────────────────────────────────────
    setLocked: (locked) => set({ isLocked: locked }),
    toggleLocked: () => set((s) => ({ isLocked: !s.isLocked })),

    // ── Computed ────────────────────────────────────────────────────────
    getTotalDuration: () => {
        const { tracks, loopCount } = get();
        const tracksDuration = tracks.reduce((sum, t) => sum + getEffectiveDuration(t), 0);
        return tracksDuration * loopCount;
    },

    // ── Persistence ────────────────────────────────────────────────────
    setVideoId: (videoId) => set({ videoId }),

    loadFromSession: (session, musicTracks) => {
        const hydrated = session.tracks
            .map((s) => hydrateTrack(s, musicTracks))
            .filter((t): t is TimelineTrack => t !== null);

        // Restore playback state if audio is still playing a track from this timeline
        const music = useMusicStore.getState();
        let playbackPosition = 0;
        let isPlaying = false;

        if (music.isPlaying && music.playingTrackId) {
            const idx = hydrated.findIndex((t) => t.id === music.playingTrackId);
            if (idx >= 0) {
                const elapsed = hydrated.slice(0, idx).reduce(
                    (sum, t) => sum + getEffectiveDuration(t), 0,
                );
                playbackPosition = elapsed + Math.max(0, music.currentTime - hydrated[idx].trimStart);
                isPlaying = true;
            }
        }

        set({
            tracks: hydrated,
            imageUrl: session.imageUrl,
            imageStoragePath: session.imageStoragePath,
            imageWidth: session.imageWidth,
            imageHeight: session.imageHeight,
            resolution: session.resolution,
            loopCount: session.loopCount,
            volume: session.volume,
            isLocked: session.isLocked ?? false,
            playbackPosition,
            isPlaying,
        });
    },

    // ── Reset ──────────────────────────────────────────────────────────
    reset: () => set(initialState),
}));
