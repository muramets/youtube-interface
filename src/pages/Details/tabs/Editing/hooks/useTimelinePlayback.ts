import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import type { TimelineTrack } from '../../../../../core/types/editing';
import { getEffectiveDuration } from '../../../../../core/types/editing';

export interface UseTimelinePlaybackReturn {
    handlePlayPause: () => void;
    cursorRulerRef: React.RefObject<HTMLDivElement | null>;
    cursorLaneRef: React.RefObject<HTMLDivElement | null>;
    activeTrackIndexRef: React.MutableRefObject<number>;
    /** Locate which track + offset for a given timeline position (seconds) */
    findTrackAtPosition: (positionS: number) => { index: number; track: TimelineTrack; seekWithinTrack: number; elapsed: number } | null;
}

/**
 * Playback engine: play/pause toggle, cursor sync RAF loop,
 * spacebar shortcut, track auto-advance, and trim-change sync.
 */
export function useTimelinePlayback(
    tracks: TimelineTrack[],
    pxPerSecond: number,
): UseTimelinePlaybackReturn {
    const setPlaybackPosition = useEditingStore((s) => s.setPlaybackPosition);
    const isPlaying = useEditingStore((s) => s.isPlaying);
    const setPlaying = useEditingStore((s) => s.setPlaying);

    // Direct DOM refs for cursor elements (bypass React re-render for 60fps)
    const cursorRulerRef = useRef<HTMLDivElement>(null);
    const cursorLaneRef = useRef<HTMLDivElement>(null);

    // Track the index of the currently playing timeline track
    const activeTrackIndexRef = useRef(-1);

    const totalDuration = tracks.reduce((sum, t) => sum + getEffectiveDuration(t), 0);

    // Precompute cumulative elapsed durations — avoids slice().reduce() in RAF loop
    const cumulativeElapsed = useMemo(() => {
        const result = new Array<number>(tracks.length + 1);
        result[0] = 0;
        for (let i = 0; i < tracks.length; i++) {
            result[i + 1] = result[i] + getEffectiveDuration(tracks[i]);
        }
        return result;
    }, [tracks]);

    // Helper: find which track + offset for a given timeline position
    const findTrackAtPosition = useCallback((positionS: number) => {
        for (let i = 0; i < tracks.length; i++) {
            const td = getEffectiveDuration(tracks[i]);
            if (positionS < cumulativeElapsed[i] + td) {
                return { index: i, track: tracks[i], seekWithinTrack: (positionS - cumulativeElapsed[i]) + tracks[i].trimStart, elapsed: cumulativeElapsed[i] };
            }
        }
        return null;
    }, [tracks, cumulativeElapsed]);

    // ── Play / Pause toggle ─────────────────────────────────────────────
    const handlePlayPause = useCallback(() => {
        if (totalDuration <= 0) return;
        const { isPlaying: playing, playbackPosition: position } = useEditingStore.getState();

        if (!playing) {
            const hit = findTrackAtPosition(position);
            if (hit) {
                activeTrackIndexRef.current = hit.index;
                // Apply track volume × master volume to audio playback
                const masterVol = useEditingStore.getState().volume;
                useMusicStore.getState().setPlaybackVolume(hit.track.volume * masterVol);
                const store = useMusicStore.getState();
                if (store.playingTrackId === hit.track.trackId && store.seekTo && store.duration > 0) {
                    store.seekTo(hit.seekWithinTrack / store.duration);
                    store.setIsPlaying(true);
                } else {
                    store.setPlayingTrack(hit.track.trackId, hit.track.variant, hit.seekWithinTrack, hit.track.trimStart, hit.track.trimEnd);
                }
                setPlaying(true);
            }
        } else {
            setPlaying(false);
            useMusicStore.getState().setIsPlaying(false);
            useMusicStore.getState().setPlaybackVolume(null);
        }
    }, [totalDuration, setPlaying, findTrackAtPosition]);

    // ── Spacebar shortcut for play/pause ─────────────────────────────────
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            e.preventDefault();
            handlePlayPause();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [handlePlayPause]);

    // ── Cursor sync: musicStore.currentTime → editing playbackPosition ──
    useEffect(() => {
        if (!isPlaying) return;

        let rafId: number;
        let frameCount = 0;
        let lastPos = -1;

        // Helper: compute cursor pixel position from timeline seconds
        const posToPixel = (pos: number): number => {
            let px = 0;
            for (let i = 0; i < tracks.length; i++) {
                const td = getEffectiveDuration(tracks[i]);
                const displayW = Math.max(60, Math.round(td * pxPerSecond));
                if (pos <= cumulativeElapsed[i] + td) {
                    const fraction = td > 0 ? (pos - cumulativeElapsed[i]) / td : 0;
                    return px + fraction * displayW;
                }
                px += displayW;
            }
            return px;
        };

        const tick = () => {
            const store = useMusicStore.getState();
            const { currentTime, isPlaying: musicPlaying, duration: audioDuration, pendingSeekSeconds } = store;
            const idx = activeTrackIndexRef.current;

            if (!musicPlaying && idx >= 0) {
                const nextIdx = idx + 1;
                if (nextIdx < tracks.length) {
                    activeTrackIndexRef.current = nextIdx;
                    const next = tracks[nextIdx];
                    // Apply volume for the new track
                    const masterVol = useEditingStore.getState().volume;
                    useMusicStore.getState().setPlaybackVolume(next.volume * masterVol);
                    useMusicStore.getState().setPlayingTrack(next.trackId, next.variant, next.trimStart, next.trimStart, next.trimEnd);
                    const elapsed = cumulativeElapsed[nextIdx];
                    setPlaybackPosition(elapsed);
                } else {
                    setPlaying(false);
                    setPlaybackPosition(totalDuration);
                    useMusicStore.getState().setPlaybackVolume(null);
                    return;
                }
            } else if (idx >= 0 && idx < tracks.length) {
                if (audioDuration <= 0 || pendingSeekSeconds !== null) {
                    rafId = requestAnimationFrame(tick);
                    return;
                }
                const currentTrack = tracks[idx];
                const elapsed = cumulativeElapsed[idx];
                const newPos = elapsed + (currentTime - currentTrack.trimStart);
                lastPos = newPos;

                // GPU-composited transform for sub-pixel smooth movement
                const pxVal = posToPixel(newPos);
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

    // ── Sync trim changes to AudioPlayer ────────────────────────────────
    useEffect(() => {
        const store = useMusicStore.getState();
        const { playingTrackId } = store;
        if (!playingTrackId) return;

        const t = tracks.find((tr) => tr.trackId === playingTrackId);
        if (!t) return;

        if (store.playingTrimStart !== t.trimStart || store.playingTrimEnd !== t.trimEnd) {
            useMusicStore.setState({ playingTrimStart: t.trimStart, playingTrimEnd: t.trimEnd });

            if (isPlaying) {
                const lastAvailable = t.duration - t.trimEnd;

                if (store.currentTime < t.trimStart && store.seekTo && store.duration > 0) {
                    store.seekTo(t.trimStart / store.duration);
                } else if (store.currentTime > lastAvailable && store.seekTo && store.duration > 0) {
                    store.seekTo(lastAvailable / store.duration);
                    setPlaying(false);
                    useMusicStore.getState().setIsPlaying(false);
                    const idx = tracks.indexOf(t);
                    const elapsed = cumulativeElapsed[idx >= 0 ? idx : 0];
                    setPlaybackPosition(elapsed + (lastAvailable - t.trimStart));
                }
            }
        }
    }, [isPlaying, tracks, setPlaying, setPlaybackPosition, cumulativeElapsed]);

    // ── Sync editing volume changes to AudioPlayer during playback ──────
    useEffect(() => {
        if (!isPlaying) return;

        const unsub = useEditingStore.subscribe((state, prev) => {
            const idx = activeTrackIndexRef.current;
            if (idx < 0 || idx >= tracks.length) return;

            const currentTrack = tracks[idx];
            // Check if master volume or current track's volume changed
            const masterChanged = state.volume !== prev.volume;
            const trackChanged = state.tracks !== prev.tracks;

            if (masterChanged || trackChanged) {
                const freshTrack = trackChanged
                    ? state.tracks.find((t) => t.id === currentTrack.id)
                    : currentTrack;
                const vol = (freshTrack?.volume ?? currentTrack.volume) * state.volume;
                useMusicStore.getState().setPlaybackVolume(vol);
            }
        });

        return unsub;
    }, [isPlaying, tracks]);

    return {
        handlePlayPause,
        cursorRulerRef,
        cursorLaneRef,
        activeTrackIndexRef,
        findTrackAtPosition,
    };
}
