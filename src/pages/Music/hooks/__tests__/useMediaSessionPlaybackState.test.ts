// =============================================================================
// useMediaSessionPlaybackState.test.ts
//
// Chrome requires explicit `navigator.mediaSession.playbackState` to route
// system media keys to the tab. Arc auto-detects from <audio> state, Chrome
// does not — this hook bridges the gap.
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMediaSessionPlaybackState } from '../useMediaSessionPlaybackState';

describe('useMediaSessionPlaybackState', () => {
    beforeEach(() => {
        // jsdom doesn't ship MediaSession — stub just enough for the hook
        (navigator as unknown as { mediaSession: { playbackState: string } }).mediaSession = {
            playbackState: 'none',
        };
    });

    it("sets 'playing' when track is present and isPlaying is true", () => {
        renderHook(() => useMediaSessionPlaybackState(true, true));
        expect(navigator.mediaSession.playbackState).toBe('playing');
    });

    it("sets 'paused' when track is present and isPlaying is false", () => {
        renderHook(() => useMediaSessionPlaybackState(true, false));
        expect(navigator.mediaSession.playbackState).toBe('paused');
    });

    it("sets 'none' when no track is active", () => {
        navigator.mediaSession.playbackState = 'playing'; // simulate leftover state
        renderHook(() => useMediaSessionPlaybackState(false, true));
        expect(navigator.mediaSession.playbackState).toBe('none');
    });

    it('updates state when isPlaying changes', () => {
        const { rerender } = renderHook(
            ({ hasTrack, isPlaying }) => useMediaSessionPlaybackState(hasTrack, isPlaying),
            { initialProps: { hasTrack: true, isPlaying: true } },
        );
        expect(navigator.mediaSession.playbackState).toBe('playing');

        rerender({ hasTrack: true, isPlaying: false });
        expect(navigator.mediaSession.playbackState).toBe('paused');
    });
});
