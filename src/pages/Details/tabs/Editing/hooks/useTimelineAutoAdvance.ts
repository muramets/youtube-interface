/**
 * Module-level zustand subscription for timeline auto-advance.
 *
 * This is NOT a React hook — it's a pure side-effect module that subscribes
 * to `trackEndedSignal` in musicStore. It must stay active even when the
 * Editing tab is unmounted (e.g. user navigates away while audio plays).
 *
 * Import this module from a component that's always mounted (e.g. AudioPlayer).
 */
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import { getEffectiveDuration } from '../../../../../core/types/editing';

useMusicStore.subscribe((state, prev) => {
    // Only react when the signal changes
    if (state.trackEndedSignal === prev.trackEndedSignal) return;
    // Only handle timeline mode
    if (state.playbackSource !== 'timeline') return;

    const editState = useEditingStore.getState();
    const tlTracks = editState.tracks;
    const pos = editState.playbackPosition;
    const repeatMode = state.repeatMode;

    // Find current track index from playback position
    let currentIdx = -1;
    let elapsed = 0;
    for (let i = 0; i < tlTracks.length; i++) {
        const dur = getEffectiveDuration(tlTracks[i]);
        if (pos < elapsed + dur + 0.01) {
            currentIdx = i;
            break;
        }
        elapsed += dur;
    }
    if (currentIdx < 0) currentIdx = tlTracks.length - 1;

    const nextIdx = currentIdx + 1;
    if (nextIdx < tlTracks.length) {
        // Advance to next track
        const next = tlTracks[nextIdx];
        const masterVol = editState.volume;
        useMusicStore.getState().setPlaybackVolume(next.volume * masterVol);
        useMusicStore.getState().setPlayingTrack(
            next.trackId, next.variant, next.trimStart, next.trimStart, next.trimEnd,
        );
        // Update editing playback position to start of next track
        let nextElapsed = 0;
        for (let i = 0; i < nextIdx; i++) {
            nextElapsed += getEffectiveDuration(tlTracks[i]);
        }
        editState.setPlaybackPosition(nextElapsed);
    } else if (repeatMode === 'all' && tlTracks.length > 0) {
        // Loop back to first track
        const first = tlTracks[0];
        const masterVol = editState.volume;
        useMusicStore.getState().setPlaybackVolume(first.volume * masterVol);
        useMusicStore.getState().setPlayingTrack(
            first.trackId, first.variant, first.trimStart, first.trimStart, first.trimEnd,
        );
        editState.setPlaybackPosition(0);
    } else {
        // End of timeline — stop playback
        useMusicStore.getState().setIsPlaying(false);
        editState.setPlaying(false);
        useMusicStore.getState().setPlaybackVolume(null);
        useMusicStore.getState().setPlaybackSource(null);
    }
});
