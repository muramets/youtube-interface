// =============================================================================
// usePlaybackNavigation.test.ts — Skip/auto-advance behavior
//
// Verifies the orphaned-track safety net: when the currently playing track is
// not in the queue (e.g. user unliked while playing from "Liked" playlist),
// Skip must recover by playing the first track in the queue instead of
// silently doing nothing.
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import type { Track } from '../../../../core/types/music/track';
import { useMusicStore } from '../../../../core/stores/music/musicStore';
import { usePlaybackNavigation } from '../usePlaybackNavigation';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTrack(id: string, overrides: Partial<Track> = {}): Track {
    return {
        id,
        title: `Track ${id}`,
        genre: 'pop',
        tags: [],
        duration: 180,
        vocalUrl: `https://example.com/${id}.mp3`,
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
    };
}

const A = makeTrack('a');
const B = makeTrack('b');
const C = makeTrack('c');
const ORPHAN = makeTrack('orphan');

// ---------------------------------------------------------------------------
// Store reset between tests
// ---------------------------------------------------------------------------

const initialState = useMusicStore.getState();

beforeEach(() => {
    useMusicStore.setState(initialState, true);
});

// ---------------------------------------------------------------------------
// renderHook wrapper: usePlaybackNavigation needs audioRef + prevAudioUrlRef
// ---------------------------------------------------------------------------

function renderNav(tracks: Track[]) {
    return renderHook(() => {
        const audioRef = useRef<HTMLAudioElement | null>(null);
        const prevAudioUrlRef = useRef<string | null>(null);
        return {
            nav: usePlaybackNavigation(audioRef, tracks, prevAudioUrlRef),
            prevAudioUrlRef,
        };
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePlaybackNavigation.handleNext', () => {
    it('advances to the next track in the queue', () => {
        useMusicStore.setState({
            playingTrackId: A.id,
            playbackQueue: [A.id, B.id, C.id],
            repeatMode: 'off',
        });

        const { result } = renderNav([A, B, C]);
        act(() => result.current.nav.handleNext());

        expect(useMusicStore.getState().playingTrackId).toBe(B.id);
    });

    it('recovers to the first queue track when playing track is orphaned (indexOf === -1)', () => {
        // Simulates: user played a track from "Liked" playlist, then unliked
        // it mid-playback — queue rebuilt without it but playingTrackId still
        // points to the orphan.
        useMusicStore.setState({
            playingTrackId: ORPHAN.id,
            playbackQueue: [A.id, B.id, C.id],
            repeatMode: 'off',
        });

        const { result } = renderNav([A, B, C, ORPHAN]);
        act(() => result.current.nav.handleNext());

        expect(useMusicStore.getState().playingTrackId).toBe(A.id);
    });

    it('does nothing when queue is empty', () => {
        useMusicStore.setState({
            playingTrackId: A.id,
            playbackQueue: [],
            repeatMode: 'off',
        });

        const { result } = renderNav([A]);
        act(() => result.current.nav.handleNext());

        expect(useMusicStore.getState().playingTrackId).toBe(A.id);
    });

    it('stops at end of queue when repeatMode is off', () => {
        useMusicStore.setState({
            playingTrackId: C.id,
            playbackQueue: [A.id, B.id, C.id],
            repeatMode: 'off',
        });

        const { result } = renderNav([A, B, C]);
        act(() => result.current.nav.handleNext());

        expect(useMusicStore.getState().playingTrackId).toBe(C.id);
    });

    it('wraps to first track at end of queue when repeatMode is all', () => {
        useMusicStore.setState({
            playingTrackId: C.id,
            playbackQueue: [A.id, B.id, C.id],
            repeatMode: 'all',
        });

        const { result } = renderNav([A, B, C]);
        act(() => result.current.nav.handleNext());

        expect(useMusicStore.getState().playingTrackId).toBe(A.id);
    });

    it('clears prevAudioUrlRef when switching tracks so audio engine reloads src', () => {
        useMusicStore.setState({
            playingTrackId: A.id,
            playbackQueue: [A.id, B.id],
            repeatMode: 'off',
        });

        const { result } = renderNav([A, B]);
        result.current.prevAudioUrlRef.current = 'stale-url';

        act(() => result.current.nav.handleNext());

        expect(result.current.prevAudioUrlRef.current).toBeNull();
    });
});

describe('usePlaybackNavigation.handlePrevious', () => {
    it('goes back to the previous track in the queue', () => {
        useMusicStore.setState({
            playingTrackId: B.id,
            playbackQueue: [A.id, B.id, C.id],
            currentTime: 1,
        });

        const { result } = renderNav([A, B, C]);
        act(() => result.current.nav.handlePrevious());

        expect(useMusicStore.getState().playingTrackId).toBe(A.id);
    });
});
