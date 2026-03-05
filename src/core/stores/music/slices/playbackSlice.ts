// =============================================================================
// PLAYBACK SLICE — Selection, playback state, queue, volume, repeat
// =============================================================================

import type { StateCreator } from 'zustand';
import type { MusicState } from '../musicStore';

export interface PlaybackSlice {
    // State
    selectedTrackId: string | null;
    playingTrackId: string | null;
    playingVariant: 'vocal' | 'instrumental';
    isPlaying: boolean;
    repeatMode: 'off' | 'all' | 'one';
    currentTime: number;
    duration: number;
    pendingSeekSeconds: number | null;
    playingTrimStart: number;
    playingTrimEnd: number;
    playbackVolume: number | null;
    playbackSource: 'library' | 'timeline' | 'browser-preview' | null;
    trackEndedSignal: number;
    seekTo: ((position: number) => void) | null;
    playbackQueue: string[];
    /** Identifies which view built the current queue (e.g. 'library', 'playlist:id', 'shared:ownerChannel') */
    playbackQueueContextId: string | null;

    // Actions
    setSelectedTrackId: (id: string | null) => void;
    setPlayingTrack: (id: string | null, variant?: 'vocal' | 'instrumental', seekPosition?: number, trimStart?: number, trimEnd?: number, knownDuration?: number) => void;
    setIsPlaying: (isPlaying: boolean) => void;
    toggleVariant: () => void;
    cycleRepeatMode: () => void;
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    registerSeek: (fn: ((position: number) => void) | null) => void;
    setPlaybackQueue: (queue: string[], contextId?: string) => void;
    setPlaybackVolume: (vol: number | null) => void;
    setPlaybackSource: (source: 'library' | 'timeline' | 'browser-preview' | null) => void;
    signalTrackEnded: () => void;
    /** Clears pendingSeekSeconds and sets currentTime atomically after audio loads. */
    resolvePendingSeek: (seconds: number) => void;
    /** Updates a cached audio URL in the track list after a Firebase Storage token refresh. */
    refreshTrackUrl: (trackId: string, field: 'vocalUrl' | 'instrumentalUrl', url: string) => void;
}

export const createPlaybackSlice: StateCreator<MusicState, [], [], PlaybackSlice> = (set, get) => ({
    // Initial state
    selectedTrackId: null,
    playingTrackId: null,
    playingVariant: 'vocal',
    isPlaying: false,
    repeatMode: 'off',
    currentTime: 0,
    duration: 0,
    pendingSeekSeconds: null,
    playingTrimStart: 0,
    playingTrimEnd: 0,
    playbackVolume: null,
    playbackSource: null,
    trackEndedSignal: 0,
    seekTo: null,
    playbackQueue: [],
    playbackQueueContextId: null,

    // Actions
    setSelectedTrackId: (id) => set({ selectedTrackId: id }),

    setPlayingTrack: (id, variant, seekPosition, trimStart, trimEnd, knownDuration) => {
        const state = get();
        set({
            playingTrackId: id,
            playingVariant: variant || 'vocal',
            isPlaying: id !== null,
            selectedTrackId: null,
            pendingSeekSeconds: seekPosition ?? null,
            playingTrimStart: trimStart ?? 0,
            playingTrimEnd: trimEnd ?? 0,
            playbackVolume: id === null ? null : state.playbackVolume,
            playbackSource: id === null ? null : state.playbackSource,
            // Optimistic progress: set currentTime and duration immediately so the
            // waveform shows the correct fill while the audio engine loads.
            // The audio engine's onTimeUpdate/onDurationChange are gated by
            // pendingSeekSeconds, so these values won't be overwritten until the
            // seek resolves.
            ...(id === null
                ? { currentTime: 0, duration: 0 }
                : {
                    currentTime: seekPosition ?? 0,
                    ...(knownDuration != null ? { duration: knownDuration } : {}),
                }
            ),
        });
    },

    setIsPlaying: (isPlaying) => set({ isPlaying }),

    toggleVariant: () => set((state) => ({
        playingVariant: state.playingVariant === 'vocal' ? 'instrumental' : 'vocal',
    })),

    cycleRepeatMode: () => set((state) => ({
        repeatMode: state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off',
    })),

    setCurrentTime: (time) => set({ currentTime: time }),
    setDuration: (duration) => set({ duration }),
    registerSeek: (fn) => set({ seekTo: fn }),
    setPlaybackQueue: (queue, contextId) => set({
        playbackQueue: queue,
        ...(contextId !== undefined ? { playbackQueueContextId: contextId } : {}),
    }),
    setPlaybackVolume: (vol) => set({ playbackVolume: vol }),
    setPlaybackSource: (source) => set({ playbackSource: source }),
    signalTrackEnded: () => set((s) => ({ trackEndedSignal: s.trackEndedSignal + 1 })),

    resolvePendingSeek: (seconds) => set({ pendingSeekSeconds: null, currentTime: seconds }),

    refreshTrackUrl: (trackId, field, url) => set((s) => ({
        tracks: s.tracks.map((t) => t.id === trackId ? { ...t, [field]: url } : t),
    })),
});
