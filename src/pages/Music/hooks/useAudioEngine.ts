// =============================================================================
// useAudioEngine — Manages <audio> element: src transitions, error retry,
// volume sync, event listeners, variant switch position restore, seek
// =============================================================================

import { useRef, useEffect, useState, useCallback } from 'react';
import { useMusicStore, selectAllTracks, selectAllGenres } from '../../../core/stores/musicStore';
import { useEditingStore } from '../../../core/stores/editingStore';
import { getEffectiveDuration } from '../../../core/types/editing';
import { refreshAudioUrl } from '../../../core/services/storageService';
import { TrackService } from '../../../core/services/trackService';
import { getDefaultVariant } from '../../../core/utils/trackUtils';

interface AudioEngineResult {
    /** Ref to the underlying <audio> element — mount this in your JSX */
    audioRef: React.RefObject<HTMLAudioElement | null>;
    /** The resolved Track object, or undefined if not found */
    track: ReturnType<typeof selectAllTracks>[number] | undefined;
    /** Resolved genre info for the current track */
    genreInfo: ReturnType<typeof selectAllGenres>[number] | null;
    /** Seek to a normalised position [0..1] */
    handleSeek: (position: number) => void;
    /** Local volume state [0..1] */
    volume: number;
    setVolume: (v: number) => void;
    /** Local mute toggle */
    isMuted: boolean;
    setIsMuted: (m: boolean) => void;
    /** Ref used by navigation to clear cached URL on track switch */
    prevAudioUrlRef: React.MutableRefObject<string | null>;
}

export function useAudioEngine(): AudioEngineResult {
    const tracks = useMusicStore(selectAllTracks);
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const playingVariant = useMusicStore((s) => s.playingVariant);
    const isPlaying = useMusicStore((s) => s.isPlaying);
    const genres = useMusicStore(selectAllGenres);
    const playbackVolume = useMusicStore((s) => s.playbackVolume);
    const { setIsPlaying, setCurrentTime: setStoreTime, setDuration: setStoreDuration, registerSeek, setPlayingTrack } = useMusicStore.getState();

    const audioRef = useRef<HTMLAudioElement>(null);
    const [volume, setVolume] = useState(0.8);
    const [isMuted, setIsMuted] = useState(false);

    // Track previous URL and track ID to detect variant-only changes
    const prevAudioUrlRef = useRef<string | null>(null);
    const prevTrackIdRef = useRef<string | null>(null);
    const seekAfterLoadRef = useRef<number | null>(null);
    const hasRetriedRef = useRef(false);
    /** Guard: true while audio.src is being changed, prevents spurious onPause from cascading */
    const srcTransitionRef = useRef(false);
    const [freshUrl, setFreshUrl] = useState<string | null>(null);

    const track = tracks.find((t) => t.id === playingTrackId);
    const genreInfo = track ? genres.find((g) => g.id === track.genre) ?? null : null;

    const storedUrl = track
        ? (playingVariant === 'vocal' ? track.vocalUrl : track.instrumentalUrl) || track.vocalUrl || track.instrumentalUrl
        : null;
    const audioUrl = freshUrl || storedUrl;

    // Reset fresh URL and retry flag when track or variant changes
    useEffect(() => {
        setFreshUrl(null);
        hasRetriedRef.current = false;
    }, [playingTrackId, playingVariant]);

    // Sync audio element with URL changes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !audioUrl) return;

        const prevUrl = prevAudioUrlRef.current;
        const prevTrackId = prevTrackIdRef.current;
        prevAudioUrlRef.current = audioUrl;
        prevTrackIdRef.current = playingTrackId;

        const isVariantSwitch = prevUrl && prevUrl !== audioUrl && audio.currentTime > 0 && prevTrackId === playingTrackId;
        if (isVariantSwitch) {
            seekAfterLoadRef.current = audio.currentTime;
        }

        srcTransitionRef.current = true;
        audio.src = audioUrl;
        const freshVol = useMusicStore.getState().playbackVolume;
        audio.volume = isMuted ? 0 : (freshVol ?? volume);

        if (isPlaying) {
            audio.play()
                .then(() => { srcTransitionRef.current = false; })
                .catch((err) => { srcTransitionRef.current = false; console.error(err); });
        } else {
            const clearGuard = () => { srcTransitionRef.current = false; audio.removeEventListener('loadeddata', clearGuard); };
            audio.addEventListener('loadeddata', clearGuard);
        }

        return () => { audio.pause(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioUrl]);

    // Auto-retry with fresh URL on load error (expired Firebase Storage token → 403)
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !track) return;

        const handleError = async () => {
            if (hasRetriedRef.current) return;
            hasRetriedRef.current = true;

            const isVocal = playingVariant === 'vocal' && track.vocalStoragePath;
            const storagePath = isVocal
                ? track.vocalStoragePath!
                : track.instrumentalStoragePath || track.vocalStoragePath;

            if (!storagePath) {
                console.error('[AudioPlayer] No storagePath available to refresh URL');
                return;
            }

            try {
                console.warn('[AudioPlayer] Audio load failed, refreshing URL from storagePath...');
                const fresh = await refreshAudioUrl(storagePath);
                setFreshUrl(fresh);
                setIsPlaying(true);

                const urlField = isVocal ? 'vocalUrl' : 'instrumentalUrl';
                useMusicStore.setState((state) => ({
                    tracks: state.tracks.map((t) =>
                        t.id === track.id ? { ...t, [urlField]: fresh } : t
                    ),
                }));
                const parts = storagePath.split('/');
                const uid = parts[1];
                const cid = parts[3];
                if (uid && cid) {
                    TrackService.updateTrack(uid, cid, track.id, { [urlField]: fresh }).catch(console.error);
                }
            } catch (err) {
                console.error('[AudioPlayer] Failed to refresh audio URL:', err);
            }
        };

        audio.addEventListener('error', handleError);
        return () => audio.removeEventListener('error', handleError);
    }, [track, playingVariant, setIsPlaying]);

    // Restore timecode after variant switch or cross-track waveform seek
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleLoadedData = () => {
            const { pendingSeekSeconds } = useMusicStore.getState();
            if (pendingSeekSeconds !== null) {
                audio.currentTime = pendingSeekSeconds;
                useMusicStore.setState({ pendingSeekSeconds: null, currentTime: pendingSeekSeconds });
                if (isPlaying) audio.play().catch(console.error);
                return;
            }
            if (seekAfterLoadRef.current !== null) {
                audio.currentTime = seekAfterLoadRef.current;
                seekAfterLoadRef.current = null;
                if (isPlaying) audio.play().catch(console.error);
            }
            const vol = useMusicStore.getState().playbackVolume;
            if (vol !== null) {
                audio.volume = vol;
            }
        };

        audio.addEventListener('loadeddata', handleLoadedData);
        return () => audio.removeEventListener('loadeddata', handleLoadedData);
    }, [isPlaying]);

    // Play/pause sync
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.play().catch(console.error);
        } else {
            audio.pause();
        }
    }, [isPlaying]);

    // Volume sync
    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.volume = isMuted ? 0 : (playbackVolume ?? volume);
        }
    }, [volume, isMuted, playbackVolume]);

    // Helper: find track by id
    const findTrackById = useCallback((id: string) => tracks.find((t) => t.id === id), [tracks]);

    // Progress tracking + event listeners
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => {
            const time = audio.currentTime;
            setStoreTime(time);
            const { playingTrimEnd: trimEnd } = useMusicStore.getState();
            if (trimEnd > 0 && audio.duration > 0 && time >= audio.duration - trimEnd) {
                audio.pause();
                audio.dispatchEvent(new Event('ended'));
            }
        };
        const onDurationChange = () => {
            setStoreDuration(audio.duration || 0);
        };
        const onEnded = () => {
            const { repeatMode: rm, playbackQueue: queue, playbackSource: ps } = useMusicStore.getState();

            if (rm === 'one') {
                audio.currentTime = 0;
                audio.play();
                return;
            }

            if (ps === 'timeline') {
                useMusicStore.getState().signalTrackEnded();
                return;
            }

            const currentIndex = queue.indexOf(playingTrackId!);
            if (currentIndex >= 0 && currentIndex < queue.length - 1) {
                const nextId = queue[currentIndex + 1];
                const next = findTrackById(nextId);
                if (next) {
                    setPlayingTrack(next.id, getDefaultVariant(next));
                }
            } else if (rm === 'all' && queue.length > 0) {
                const firstId = queue[0];
                const first = findTrackById(firstId);
                if (first) {
                    setPlayingTrack(first.id, getDefaultVariant(first));
                }
            } else {
                setIsPlaying(false);
            }
        };

        const onPause = () => {
            if (srcTransitionRef.current) return;
            if (useMusicStore.getState().isPlaying) setIsPlaying(false);
        };
        const onPlay = () => {
            if (!useMusicStore.getState().isPlaying) setIsPlaying(true);
        };

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('durationchange', onDurationChange);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('play', onPlay);

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('durationchange', onDurationChange);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('play', onPlay);
        };
    }, [playingTrackId, findTrackById, setPlayingTrack, setIsPlaying, setStoreTime, setStoreDuration]);

    // Seek handler
    const handleSeek = useCallback((position: number) => {
        const audio = audioRef.current;
        if (audio && audio.duration && isFinite(audio.duration)) {
            audio.currentTime = position * audio.duration;
            setStoreTime(audio.currentTime);

            const ps = useMusicStore.getState().playbackSource;
            if (ps === 'timeline') {
                const editState = useEditingStore.getState();
                const tlTracks = editState.tracks;
                const pos = editState.playbackPosition;
                let elapsed = 0;
                for (let i = 0; i < tlTracks.length; i++) {
                    const dur = getEffectiveDuration(tlTracks[i]);
                    if (pos < elapsed + dur + 0.01) {
                        const newPos = elapsed + (audio.currentTime - tlTracks[i].trimStart);
                        editState.setPlaybackPosition(Math.max(elapsed, Math.min(elapsed + dur, newPos)));
                        break;
                    }
                    elapsed += dur;
                }
            }
        }
    }, [setStoreTime]);

    // Register seek callback so TrackCard can trigger seeks
    useEffect(() => {
        registerSeek(handleSeek);
        return () => registerSeek(null);
    }, [handleSeek, registerSeek]);

    return {
        audioRef,
        track,
        genreInfo,
        handleSeek,
        volume,
        setVolume,
        isMuted,
        setIsMuted,
        prevAudioUrlRef,
    };
}
