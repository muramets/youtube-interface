// =============================================================================
// usePlaybackNavigation — Prev/next navigation for library and timeline modes
// =============================================================================

import { useCallback } from 'react';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useEditingStore } from '../../../core/stores/editing/editingStore';
import { getEffectiveDuration } from '../../../core/types/editing';
import { getDefaultVariant } from '../../../core/utils/trackUtils';
import type { Track } from '../../../core/types/track';

interface PlaybackNavigationResult {
    handlePrevious: () => void;
    handleNext: () => void;
    isTimelineMode: boolean;
}

export function usePlaybackNavigation(
    audioRef: React.RefObject<HTMLAudioElement | null>,
    tracks: Track[],
    prevAudioUrlRef: React.MutableRefObject<string | null>,
): PlaybackNavigationResult {
    const playbackQueue = useMusicStore((s) => s.playbackQueue);
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const isPlaying = useMusicStore((s) => s.isPlaying);
    const repeatMode = useMusicStore((s) => s.repeatMode);
    const playbackSource = useMusicStore((s) => s.playbackSource);
    const { setPlayingTrack, setIsPlaying, setCurrentTime: setStoreTime } = useMusicStore.getState();

    const isTimelineMode = playbackSource === 'timeline';
    const editingTracks = useEditingStore((s) => s.tracks);
    const editingPosition = useEditingStore((s) => s.playbackPosition);

    // Compute current timeline track index from playback position
    const getTimelineTrackIndex = useCallback(() => {
        let elapsed = 0;
        for (let i = 0; i < editingTracks.length; i++) {
            const dur = getEffectiveDuration(editingTracks[i]);
            if (editingPosition < elapsed + dur) return i;
            elapsed += dur;
        }
        return editingTracks.length - 1;
    }, [editingTracks, editingPosition]);

    const jumpToTimelineTrack = useCallback((index: number) => {
        if (index < 0 || index >= editingTracks.length) return;
        let elapsed = 0;
        for (let i = 0; i < index; i++) elapsed += getEffectiveDuration(editingTracks[i]);
        const target = editingTracks[index];
        const masterVol = useEditingStore.getState().volume;
        useMusicStore.getState().setPlaybackVolume(target.volume * masterVol);
        prevAudioUrlRef.current = null;
        setPlayingTrack(target.trackId, target.variant, target.trimStart, target.trimStart, target.trimEnd);
        useEditingStore.getState().setPlaybackPosition(elapsed);
    }, [editingTracks, setPlayingTrack, prevAudioUrlRef]);

    const handlePrevious = useCallback(() => {
        if (isTimelineMode && editingTracks.length > 1) {
            const idx = getTimelineTrackIndex();
            let elapsed = 0;
            for (let i = 0; i < idx; i++) elapsed += getEffectiveDuration(editingTracks[i]);
            const withinTrack = editingPosition - elapsed;
            if (withinTrack > 2 || idx === 0) {
                jumpToTimelineTrack(idx);
            } else {
                jumpToTimelineTrack(idx - 1);
            }
            return;
        }
        const currentIndex = playbackQueue.indexOf(playingTrackId!);
        if (playbackQueue.length <= 1 || currentIndex <= 0) {
            const audio = audioRef.current;
            if (audio) {
                audio.currentTime = 0;
                setStoreTime(0);
                if (!isPlaying) setIsPlaying(true);
            }
            return;
        }
        const prevId = playbackQueue[currentIndex - 1];
        const prev = tracks.find((t) => t.id === prevId);
        if (prev) {
            prevAudioUrlRef.current = null;
            setPlayingTrack(prev.id, getDefaultVariant(prev));
        }
    }, [isTimelineMode, editingTracks, getTimelineTrackIndex, editingPosition, jumpToTimelineTrack, playbackQueue, playingTrackId, isPlaying, tracks, setStoreTime, setIsPlaying, setPlayingTrack, audioRef, prevAudioUrlRef]);

    const handleNext = useCallback(() => {
        if (isTimelineMode && editingTracks.length > 1) {
            const idx = getTimelineTrackIndex();
            if (idx < editingTracks.length - 1) {
                jumpToTimelineTrack(idx + 1);
            }
            return;
        }
        const currentIndex = playbackQueue.indexOf(playingTrackId!);
        if (playbackQueue.length <= 1) return;
        if (currentIndex >= 0 && currentIndex < playbackQueue.length - 1) {
            const nextId = playbackQueue[currentIndex + 1];
            const next = tracks.find((t) => t.id === nextId);
            if (next) {
                prevAudioUrlRef.current = null;
                setPlayingTrack(next.id, getDefaultVariant(next));
            }
        } else if (repeatMode === 'all' && playbackQueue.length > 0) {
            const firstId = playbackQueue[0];
            const first = tracks.find((t) => t.id === firstId);
            if (first) {
                prevAudioUrlRef.current = null;
                setPlayingTrack(first.id, getDefaultVariant(first));
            }
        }
    }, [isTimelineMode, editingTracks, getTimelineTrackIndex, jumpToTimelineTrack, playbackQueue, playingTrackId, tracks, repeatMode, setPlayingTrack, prevAudioUrlRef]);

    return { handlePrevious, handleNext, isTimelineMode };
}
