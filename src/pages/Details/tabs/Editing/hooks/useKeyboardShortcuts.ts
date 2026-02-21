import { useEffect } from 'react';
import { useEditingStore } from '../../../../../core/stores/editing/editingStore';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import type { TimelineTrack } from '../../../../../core/types/editing';
import { isDraggingTimeline } from './useTimelineDnd';

/**
 * Keyboard shortcuts for the editing timeline:
 * - Space: play/pause toggle (respects browser-preview mode)
 * - ArrowUp/Down: track navigation
 *
 * IMPORTANT: The Space handler is registered in the **capture phase**
 * (`{ capture: true }`) so it always fires BEFORE AudioPlayer's bubble-phase
 * listener. This lets the timeline call `stopImmediatePropagation()` to
 * prevent AudioPlayer from seeing the event — no state-coordination needed.
 */
export function useKeyboardShortcuts(
    tracks: TimelineTrack[],
    cumulativeElapsed: number[],
    handlePlayPause: () => void,
    setPlaybackPosition: (pos: number) => void,
    setPlaying: (v: boolean) => void,
    scrollToPosition: (positionS: number) => void,
): void {
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            // Skip all keyboard shortcuts during active timeline drag
            if (isDraggingTimeline) return;

            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            if (e.code === 'Space') {
                e.preventDefault();
                // Stop the event from reaching AudioPlayer's bubble-phase listener.
                e.stopImmediatePropagation();

                const musicState = useMusicStore.getState();
                const musicPlaying = musicState.isPlaying;
                const timelinePlaying = useEditingStore.getState().isPlaying;
                if (!timelinePlaying && musicState.playbackSource === 'browser-preview') {
                    musicState.setIsPlaying(!musicPlaying);
                    return;
                }
                // Clear browser preview — timeline takes over
                useMusicStore.getState().setPlaybackSource(null);
                handlePlayPause();
                return;
            }

            if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && tracks.length > 1) {
                e.preventDefault();
                // Arrow navigation activates the timeline — clear browser preview
                useMusicStore.getState().setPlaybackSource(null);
                // Stop playback — arrows are for cursor navigation only
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
        // Capture phase: fires BEFORE any bubble-phase listeners (e.g. AudioPlayer)
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [handlePlayPause, tracks, cumulativeElapsed, setPlaybackPosition, setPlaying, scrollToPosition]);
}
