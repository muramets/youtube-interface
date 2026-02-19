import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useEditingStore } from '../../../../../core/stores/editing/editingStore';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import type { TimelineTrack } from '../../../../../core/types/editing';
import { getEffectiveDuration } from '../../../../../core/types/editing';
import { cumulativeElapsedArray, positionToPixel, findTrackAtPosition as findTrackAtPos } from '../utils/timelineUtils';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useTrackChangeSync } from './useTrackChangeSync';

export interface UseTimelinePlaybackReturn {
    handlePlayPause: () => void;
    cursorRulerRef: React.RefObject<HTMLDivElement | null>;
    cursorLaneRef: React.RefObject<HTMLDivElement | null>;
    activeTrackIndexRef: React.MutableRefObject<number>;
    /** Locate which track + offset for a given timeline position (seconds) */
    findTrackAtPosition: (positionS: number) => { index: number; track: TimelineTrack; seekWithinTrack: number; elapsed: number } | null;
}

/**
 * Playback engine: play/pause toggle and cursor sync RAF loop.
 * Keyboard shortcuts are handled by useKeyboardShortcuts.
 * Track mutation sync is handled by useTrackChangeSync.
 */
export function useTimelinePlayback(
    tracks: TimelineTrack[],
    pxPerSecond: number,
    scrollRef: React.RefObject<HTMLDivElement | null>,
): UseTimelinePlaybackReturn {
    const setPlaybackPosition = useEditingStore((s) => s.setPlaybackPosition);
    const isPlaying = useEditingStore((s) => s.isPlaying);
    const setPlaying = useEditingStore((s) => s.setPlaying);

    // Direct DOM refs for cursor elements (bypass React re-render for 60fps)
    const cursorRulerRef = useRef<HTMLDivElement>(null);
    const cursorLaneRef = useRef<HTMLDivElement>(null);

    // Track the index and unique ID of the currently playing timeline track
    const activeTrackIndexRef = useRef(-1);
    const activeTrackIdRef = useRef<string | null>(null);

    const totalDuration = tracks.reduce((sum, t) => sum + getEffectiveDuration(t), 0);

    const cumulativeElapsed = useMemo(() => cumulativeElapsedArray(tracks), [tracks]);

    // Helper: ensure a given timeline position (seconds) is scrolled into view
    const scrollToPosition = useCallback((positionS: number) => {
        const el = scrollRef.current;
        if (!el) return;
        const px = positionToPixel(tracks, positionS, pxPerSecond, cumulativeElapsed);
        const MARGIN = 60;
        const viewLeft = el.scrollLeft;
        const viewRight = viewLeft + el.clientWidth;
        if (px < viewLeft + MARGIN || px > viewRight - MARGIN) {
            el.scrollTo({ left: px - el.clientWidth / 2, behavior: 'smooth' });
        }
    }, [tracks, pxPerSecond, scrollRef, cumulativeElapsed]);

    // Helper: find which track + offset for a given timeline position
    const findTrackAtPosition = useCallback(
        (positionS: number) => findTrackAtPos(tracks, positionS, cumulativeElapsed),
        [tracks, cumulativeElapsed],
    );

    // ── Play / Pause toggle ─────────────────────────────────────────────
    const handlePlayPause = useCallback(() => {
        if (totalDuration <= 0) return;
        const { isPlaying: playing, playbackPosition: position } = useEditingStore.getState();
        const musicState = useMusicStore.getState();

        // Detect if timeline playback is already active via AudioPlayer
        // (e.g. user left Editing tab but audio kept playing)
        const timelineAlreadyPlaying = musicState.playbackSource === 'timeline' && musicState.isPlaying;

        if (playing || timelineAlreadyPlaying) {
            // ── Pause ──
            setPlaying(false);
            useMusicStore.getState().setIsPlaying(false);
            useMusicStore.getState().setPlaybackVolume(null);
            useMusicStore.getState().setPlaybackSource(null);
        } else {
            // ── Start ──
            const hit = findTrackAtPosition(position);
            if (hit) {
                activeTrackIndexRef.current = hit.index;
                activeTrackIdRef.current = hit.track.id;
                // Apply track volume × master volume to audio playback
                const masterVol = useEditingStore.getState().volume;
                useMusicStore.getState().setPlaybackVolume(hit.track.volume * masterVol);
                useMusicStore.getState().setPlaybackSource('timeline');
                const store = useMusicStore.getState();
                // Fast-seek only when audio is already loaded and playing.
                // Without the isPlaying check, stale store.duration from a previous
                // session would incorrectly route through seekTo, skipping setPlayingTrack
                // and leaving the audio engine uninitialised.
                if (store.isPlaying && store.playingTrackId === hit.track.trackId && store.seekTo && store.duration > 0) {
                    store.seekTo(hit.seekWithinTrack / store.duration);
                    store.setIsPlaying(true);
                } else {
                    store.setPlayingTrack(hit.track.trackId, hit.track.variant, hit.seekWithinTrack, hit.track.trimStart, hit.track.trimEnd);
                }
                setPlaying(true);
            }
        }
    }, [totalDuration, setPlaying, findTrackAtPosition]);

    // ── Keyboard shortcuts (Space, ArrowUp/Down) ────────────────────────
    useKeyboardShortcuts(
        tracks, cumulativeElapsed, handlePlayPause,
        setPlaybackPosition, setPlaying, scrollToPosition,
    );

    // ── Cursor sync: musicStore.currentTime → editing playbackPosition ──
    useEffect(() => {
        if (!isPlaying) return;

        let rafId: number;
        let frameCount = 0;
        let lastPos = -1;

        const tick = () => {
            const store = useMusicStore.getState();
            const { currentTime, isPlaying: musicPlaying, duration: audioDuration, pendingSeekSeconds } = store;
            let idx = activeTrackIndexRef.current;

            // Re-derive index if needed: on initial mount (idx === -1) or when
            // external code (e.g. AudioPlayer auto-advance) moved playbackPosition
            const storePos = useEditingStore.getState().playbackPosition;
            let needsReDerive = idx < 0;
            if (!needsReDerive && idx >= 0 && idx < tracks.length) {
                needsReDerive = storePos < cumulativeElapsed[idx] || storePos >= cumulativeElapsed[idx + 1];
            }
            if (needsReDerive && tracks.length > 0) {
                for (let i = 0; i < tracks.length; i++) {
                    if (storePos < cumulativeElapsed[i + 1]) { idx = i; break; }
                }
                if (idx < 0) idx = tracks.length - 1;
                activeTrackIndexRef.current = idx;
                activeTrackIdRef.current = tracks[idx]?.id ?? null;
            }

            // Cursor sync — only update while music is actively playing.
            if (musicPlaying && idx >= 0 && idx < tracks.length) {
                if (audioDuration <= 0 || pendingSeekSeconds !== null) {
                    rafId = requestAnimationFrame(tick);
                    return;
                }
                const currentTrack = tracks[idx];
                const elapsed = cumulativeElapsed[idx];
                const newPos = elapsed + (currentTime - currentTrack.trimStart);
                lastPos = newPos;

                // GPU-composited transform for sub-pixel smooth movement
                const pxVal = positionToPixel(tracks, newPos, pxPerSecond, cumulativeElapsed);
                const tx = `translateX(${pxVal}px)`;
                if (cursorRulerRef.current) cursorRulerRef.current.style.transform = tx;
                if (cursorLaneRef.current) cursorLaneRef.current.style.transform = tx;

                // Throttle store updates to ~4/sec to avoid React overwriting DOM
                frameCount++;
                if (frameCount % 15 === 0) {
                    setPlaybackPosition(newPos);
                }
            }

            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(rafId);
            if (lastPos >= 0) {
                setPlaybackPosition(lastPos);
            }
        };
    }, [isPlaying, tracks, totalDuration, setPlaybackPosition, setPlaying, pxPerSecond, cumulativeElapsed]);

    // ── Track mutation sync (trim, reorder, volume) ─────────────────────
    useTrackChangeSync(
        tracks, cumulativeElapsed, isPlaying,
        activeTrackIndexRef, activeTrackIdRef,
        setPlaybackPosition, setPlaying,
    );

    return {
        handlePlayPause,
        cursorRulerRef,
        cursorLaneRef,
        activeTrackIndexRef,
        findTrackAtPosition,
    };
}
