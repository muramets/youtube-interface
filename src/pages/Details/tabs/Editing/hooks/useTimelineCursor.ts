import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import type { TimelineTrack } from '../../../../../core/types/editing';
import { getEffectiveDuration } from '../../../../../core/types/editing';
import { lastTrimDragEndMs } from '../components/TimelineTrackItem';
import { setBrowserPreviewActive } from './useTimelinePlayback';
import { formatDuration } from '../utils/formatDuration';

export interface UseTimelineCursorReturn {
    handleSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
    handleRulerMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
    hoverPx: number | null;
    hoverTimeLabel: string | null;
    cursorPx: number;
    showCursor: boolean;
    handleMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
    handleMouseLeave: () => void;
    selectedTrackId: string | null;
    setSelectedTrackId: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Click-to-seek, hover cursor, playback cursor position,
 * and track selection via keyboard delete.
 */
export function useTimelineCursor(
    tracks: TimelineTrack[],
    pxPerSecond: number,
    totalDuration: number,
    scrollRef: React.RefObject<HTMLDivElement | null>,
    isPlaying: boolean,
    activeTrackIndexRef: React.MutableRefObject<number>,
    findTrackAtPosition: (pos: number) => { index: number; track: TimelineTrack; seekWithinTrack: number; elapsed: number } | null,
    rulerTicks: { px: number; label: string | null; isMajor: boolean }[],
): UseTimelineCursorReturn {
    const playbackPosition = useEditingStore((s) => s.playbackPosition);
    const setPlaybackPosition = useEditingStore((s) => s.setPlaybackPosition);
    const removeTrack = useEditingStore((s) => s.removeTrack);

    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
    const [hoverPx, setHoverPx] = useState<number | null>(null);

    // ── Convert pixel position to seconds ───────────────────────────────
    const pxToSeconds = useCallback((px: number): number => {
        let elapsed = 0;
        let pxAccum = 0;
        for (const t of tracks) {
            const td = getEffectiveDuration(t);
            const displayW = Math.max(60, Math.round(td * pxPerSecond));
            if (px <= pxAccum + displayW) {
                const fraction = displayW > 0 ? (px - pxAccum) / displayW : 0;
                return Math.max(0, Math.min(totalDuration, elapsed + fraction * td));
            }
            elapsed += td;
            pxAccum += displayW;
        }
        return totalDuration;
    }, [tracks, pxPerSecond, totalDuration]);

    // ── Click-to-seek ───────────────────────────────────────────────────
    const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const scrollEl = scrollRef.current;
        if (!scrollEl || pxPerSecond <= 0) return;
        if (Date.now() - lastTrimDragEndMs < 100) return;
        const rect = scrollEl.getBoundingClientRect();
        const clickX = e.clientX - rect.left + scrollEl.scrollLeft;
        const seconds = pxToSeconds(clickX);
        setPlaybackPosition(seconds);

        // Stop browser track preview — timeline takes over
        const ms = useMusicStore.getState();
        if (ms.playingTrackId && !useEditingStore.getState().isPlaying && ms.playbackVolume === null) {
            ms.setPlayingTrack(null);
        }
        setBrowserPreviewActive(false);

        if (isPlaying) {
            const hit = findTrackAtPosition(seconds);
            if (hit) {
                const store = useMusicStore.getState();
                if (hit.index === activeTrackIndexRef.current && store.seekTo && store.duration > 0) {
                    store.seekTo(hit.seekWithinTrack / store.duration);
                } else {
                    activeTrackIndexRef.current = hit.index;
                    useMusicStore.getState().setPlayingTrack(hit.track.trackId, hit.track.variant, hit.seekWithinTrack, hit.track.trimStart, hit.track.trimEnd);
                }
            }
        }
    }, [pxPerSecond, pxToSeconds, setPlaybackPosition, isPlaying, findTrackAtPosition, scrollRef, activeTrackIndexRef]);

    // ── Live ruler scrubbing ────────────────────────────────────────────
    const isScrubbing = useRef(false);

    const scrubFromEvent = useCallback((clientX: number) => {
        const scrollEl = scrollRef.current;
        if (!scrollEl || pxPerSecond <= 0) return;
        const rect = scrollEl.getBoundingClientRect();
        const px = Math.max(0, clientX - rect.left + scrollEl.scrollLeft);
        const seconds = pxToSeconds(px);
        setPlaybackPosition(seconds);
    }, [scrollRef, pxPerSecond, pxToSeconds, setPlaybackPosition]);

    const handleRulerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return; // left-click only
        e.preventDefault();
        isScrubbing.current = true;

        // Stop playback during scrub (keep AudioPlayer in timeline mode)
        if (useEditingStore.getState().isPlaying) {
            useEditingStore.getState().setPlaying(false);
            useMusicStore.getState().setIsPlaying(false);
        }

        // Initial seek
        scrubFromEvent(e.clientX);

        const onMouseMove = (ev: MouseEvent) => {
            if (!isScrubbing.current) return;
            scrubFromEvent(ev.clientX);
        };
        const onMouseUp = () => {
            isScrubbing.current = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [scrubFromEvent]);

    // ── Hover cursor ────────────────────────────────────────────────────
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;
        const rect = scrollEl.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollEl.scrollLeft;
        setHoverPx(x);
    }, [scrollRef]);

    const handleMouseLeave = useCallback(() => {
        setHoverPx(null);
    }, []);

    // Hover time label — hide when near a ruler tick label
    const hoverTimeLabel = useMemo(() => {
        if (hoverPx === null || pxPerSecond <= 0) return null;
        const tooClose = rulerTicks.some(
            (tick) => tick.label !== null && Math.abs(tick.px - hoverPx) < 36
        );
        if (tooClose) return null;
        const seconds = pxToSeconds(hoverPx);
        return formatDuration(seconds);
    }, [hoverPx, pxPerSecond, pxToSeconds, rulerTicks]);

    // ── Playback cursor position in px ──────────────────────────────────
    const cursorPx = useMemo(() => {
        if (totalDuration === 0) return 0;
        let elapsed = 0;
        let px = 0;
        for (const t of tracks) {
            const td = getEffectiveDuration(t);
            const displayW = Math.max(60, Math.round(td * pxPerSecond));
            if (playbackPosition <= elapsed + td) {
                const fraction = td > 0 ? (playbackPosition - elapsed) / td : 0;
                return px + fraction * displayW;
            }
            elapsed += td;
            px += displayW;
        }
        return px;
    }, [tracks, playbackPosition, pxPerSecond, totalDuration]);

    const showCursor = totalDuration > 0;

    // ── Keyboard: Backspace / Delete removes selected track ─────────────
    useEffect(() => {
        if (!selectedTrackId) return;
        if (!tracks.some((t) => t.id === selectedTrackId)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clearing stale selection after track removal
            setSelectedTrackId(null);
            return;
        }
        const onKeyDown = (e: KeyboardEvent) => {
            if (useEditingStore.getState().isLocked) return;
            if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                removeTrack(selectedTrackId);
                setSelectedTrackId(null);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [selectedTrackId, tracks, removeTrack]);

    return {
        handleSeek,
        handleRulerMouseDown,
        hoverPx,
        hoverTimeLabel,
        cursorPx,
        showCursor,
        handleMouseMove,
        handleMouseLeave,
        selectedTrackId,
        setSelectedTrackId,
    };
}
