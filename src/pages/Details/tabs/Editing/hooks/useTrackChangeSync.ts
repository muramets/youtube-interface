import { useEffect } from 'react';
import { useEditingStore } from '../../../../../core/stores/editing/editingStore';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import type { TimelineTrack } from '../../../../../core/types/editing';

/**
 * Keeps AudioPlayer in sync when the timeline's tracks are mutated
 * during playback: trim changes, drag-reorder, and volume edits.
 */
export function useTrackChangeSync(
    tracks: TimelineTrack[],
    cumulativeElapsed: number[],
    isPlaying: boolean,
    activeTrackIndexRef: React.MutableRefObject<number>,
    activeTrackIdRef: React.MutableRefObject<string | null>,
    setPlaybackPosition: (pos: number) => void,
    setPlaying: (v: boolean) => void,
): void {
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
    }, [isPlaying, tracks, cumulativeElapsed, setPlaying, setPlaybackPosition, activeTrackIndexRef, activeTrackIdRef]);

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
    }, [isPlaying, tracks, activeTrackIndexRef]);
}
