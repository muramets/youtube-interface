import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import type { TimelineTrack } from '../../../../../core/types/editing';
import { getEffectiveDuration } from '../../../../../core/types/editing';
import { isDraggingTimeline } from './useTimelineDnd';

/** True when the user started a browser track preview (not timeline-driven). */
export let browserPreviewActive = false;
export function setBrowserPreviewActive(v: boolean) { browserPreviewActive = v; }

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

    // Precompute cumulative elapsed durations — avoids slice().reduce() in RAF loop
    const cumulativeElapsed = useMemo(() => {
        const result = new Array<number>(tracks.length + 1);
        result[0] = 0;
        for (let i = 0; i < tracks.length; i++) {
            result[i + 1] = result[i] + getEffectiveDuration(tracks[i]);
        }
        return result;
    }, [tracks]);

    // Helper: ensure a given timeline position (seconds) is scrolled into view
    const scrollToPosition = useCallback((positionS: number) => {
        const el = scrollRef.current;
        if (!el) return;
        // Compute px offset for the position
        let elapsed = 0;
        let px = 0;
        for (const t of tracks) {
            const td = getEffectiveDuration(t);
            const displayW = Math.max(60, Math.round(td * pxPerSecond));
            if (positionS <= elapsed + td) {
                const fraction = td > 0 ? (positionS - elapsed) / td : 0;
                px += fraction * displayW;
                break;
            }
            elapsed += td;
            px += displayW;
        }
        const MARGIN = 60;
        const viewLeft = el.scrollLeft;
        const viewRight = viewLeft + el.clientWidth;
        if (px < viewLeft + MARGIN || px > viewRight - MARGIN) {
            el.scrollTo({ left: px - el.clientWidth / 2, behavior: 'smooth' });
        }
    }, [tracks, pxPerSecond, scrollRef]);

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
                activeTrackIdRef.current = hit.track.id;
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

    // ── Keyboard shortcuts: Space (play/pause) + ArrowUp/Down (track nav) ──
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            // Skip all keyboard shortcuts during active timeline drag
            if (isDraggingTimeline) return;

            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            if (e.code === 'Space') {
                e.preventDefault();
                // If a browser track preview is active (not timeline-driven),
                // toggle that preview instead of starting timeline playback
                const musicPlaying = useMusicStore.getState().isPlaying;
                const timelinePlaying = useEditingStore.getState().isPlaying;
                if (!timelinePlaying && browserPreviewActive) {
                    useMusicStore.getState().setIsPlaying(!musicPlaying);
                    return;
                }
                // Clear browser preview flag — timeline takes over
                browserPreviewActive = false;
                handlePlayPause();
                return;
            }

            if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && tracks.length > 1) {
                e.preventDefault();
                // Arrow navigation activates the timeline — clear browser preview
                browserPreviewActive = false;
                // Stop playback — arrows are for cursor navigation only
                // (keep playbackVolume so AudioPlayer stays in timeline mode)
                if (useEditingStore.getState().isPlaying) {
                    setPlaying(false);
                    useMusicStore.getState().setIsPlaying(false);
                }

                const pos = useEditingStore.getState().playbackPosition;
                // Find current track index
                let currentIdx = 0;
                for (let i = 0; i < tracks.length; i++) {
                    if (pos < cumulativeElapsed[i + 1]) { currentIdx = i; break; }
                    if (i === tracks.length - 1) currentIdx = i;
                }

                if (e.code === 'ArrowDown') {
                    // Jump to next track seam
                    const nextIdx = currentIdx + 1;
                    if (nextIdx < tracks.length) {
                        const newPos = cumulativeElapsed[nextIdx];
                        setPlaybackPosition(newPos);
                        scrollToPosition(newPos);
                    }
                } else {
                    // ArrowUp: if >2s into current track → restart; otherwise → prev track
                    const withinTrack = pos - cumulativeElapsed[currentIdx];
                    const newPos = (withinTrack > 2 || currentIdx === 0)
                        ? cumulativeElapsed[currentIdx]
                        : cumulativeElapsed[currentIdx - 1];
                    setPlaybackPosition(newPos);
                    scrollToPosition(newPos);
                }
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [handlePlayPause, tracks, cumulativeElapsed, setPlaybackPosition, setPlaying, scrollToPosition]);

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
            let idx = activeTrackIndexRef.current;

            // Re-derive index if external code (e.g. AudioPlayer skip) moved playbackPosition
            if (idx >= 0 && idx < tracks.length) {
                const storePos = useEditingStore.getState().playbackPosition;
                if (storePos < cumulativeElapsed[idx] || storePos >= cumulativeElapsed[idx + 1]) {
                    for (let i = 0; i < tracks.length; i++) {
                        if (storePos < cumulativeElapsed[i + 1]) { idx = i; break; }
                    }
                    activeTrackIndexRef.current = idx;
                }
            }

            if (!musicPlaying && idx >= 0) {
                // Distinguish user-pause from track-end:
                // Only advance if the track actually reached its trim-end boundary.
                const currentTrack = tracks[idx];
                const trimEndBoundary = currentTrack.duration - currentTrack.trimEnd;
                if (currentTime < trimEndBoundary - 0.15) {
                    // User paused (track hasn't ended) — stop the loop
                    rafId = requestAnimationFrame(tick);
                    return;
                }

                const nextIdx = idx + 1;
                if (nextIdx < tracks.length) {
                    const next = tracks[nextIdx];
                    activeTrackIndexRef.current = nextIdx;
                    activeTrackIdRef.current = next.id;
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

    // ── Sync playback position when tracks are reordered ────────────────
    useEffect(() => {
        if (!isPlaying) return;
        const activeId = activeTrackIdRef.current;
        if (!activeId) return;

        const newIdx = tracks.findIndex((t) => t.id === activeId);
        if (newIdx < 0) {
            // Active track was removed — stop playback
            setPlaying(false);
            useMusicStore.getState().setIsPlaying(false);
            useMusicStore.getState().setPlaybackVolume(null);
            activeTrackIndexRef.current = -1;
            activeTrackIdRef.current = null;
            return;
        }

        if (newIdx !== activeTrackIndexRef.current) {
            activeTrackIndexRef.current = newIdx;
            // Recompute playback position: cumulative elapsed + offset within track
            const store = useMusicStore.getState();
            const trackOffset = store.currentTime - tracks[newIdx].trimStart;
            setPlaybackPosition(cumulativeElapsed[newIdx] + Math.max(0, trackOffset));
        }
    }, [isPlaying, tracks, cumulativeElapsed, setPlaying, setPlaybackPosition]);

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
