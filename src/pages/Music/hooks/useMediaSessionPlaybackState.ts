// =============================================================================
// useMediaSessionPlaybackState — Sync navigator.mediaSession.playbackState
//
// Chrome is strict about MediaSession ownership: without explicit playbackState,
// `navigator.mediaSession.playbackState` stays 'none' and system media keys
// (Magic Keyboard play/next/prev) bypass this tab. Arc / Safari auto-detect
// from <audio>, but stock Chrome does not.
// =============================================================================

import { useEffect } from 'react';

export function useMediaSessionPlaybackState(hasTrack: boolean, isPlaying: boolean): void {
    useEffect(() => {
        if (!('mediaSession' in navigator)) return;
        if (!hasTrack) {
            navigator.mediaSession.playbackState = 'none';
            return;
        }
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }, [hasTrack, isPlaying]);
}
