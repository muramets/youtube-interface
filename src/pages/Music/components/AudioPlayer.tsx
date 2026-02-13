// =============================================================================
// AUDIO PLAYER: Global bottom bar audio player with waveform
// =============================================================================

import React, { useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Mic, Piano, X, Repeat, Repeat1, ListMusic } from 'lucide-react';
import { AddToMusicPlaylistModal } from '../modals/AddToMusicPlaylistModal';
import { WaveformCanvas } from './WaveformCanvas';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { useMusicStore } from '../../../core/stores/musicStore';
import { formatDuration } from '../utils/formatDuration';

export const AudioPlayer: React.FC = () => {
    const tracks = useMusicStore((s) => s.tracks);
    const playbackQueue = useMusicStore((s) => s.playbackQueue);
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const playingVariant = useMusicStore((s) => s.playingVariant);
    const isPlaying = useMusicStore((s) => s.isPlaying);
    const genres = useMusicStore((s) => s.genres);
    const currentTime = useMusicStore((s) => s.currentTime);
    const duration = useMusicStore((s) => s.duration);
    const repeatMode = useMusicStore((s) => s.repeatMode);
    const { setPlayingTrack, setIsPlaying, toggleVariant, cycleRepeatMode, setCurrentTime: setStoreTime, setDuration: setStoreDuration, registerSeek } = useMusicStore.getState();

    const audioRef = useRef<HTMLAudioElement>(null);
    const [volume, setVolume] = React.useState(0.8);
    const [isMuted, setIsMuted] = React.useState(false);
    const [showPlaylistModal, setShowPlaylistModal] = React.useState(false);

    // Track previous URL and track ID to detect variant-only changes
    const prevAudioUrlRef = useRef<string | null>(null);
    const prevTrackIdRef = useRef<string | null>(null);
    const seekAfterLoadRef = useRef<number | null>(null);

    const track = tracks.find((t) => t.id === playingTrackId);
    const genreInfo = track ? genres.find((g) => g.id === track.genre) : null;

    const audioUrl = track
        ? (playingVariant === 'vocal' ? track.vocalUrl : track.instrumentalUrl) || track.vocalUrl || track.instrumentalUrl
        : null;

    // Sync audio element with URL changes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !audioUrl) return;

        const prevUrl = prevAudioUrlRef.current;
        const prevTrackId = prevTrackIdRef.current;
        prevAudioUrlRef.current = audioUrl;
        prevTrackIdRef.current = playingTrackId;

        // Detect variant-only switch (same track, different URL)
        const isVariantSwitch = prevUrl && prevUrl !== audioUrl && audio.currentTime > 0 && prevTrackId === playingTrackId;

        if (isVariantSwitch) {
            // Save current position to restore after load
            seekAfterLoadRef.current = audio.currentTime;
        }

        audio.src = audioUrl;
        audio.volume = isMuted ? 0 : volume;

        if (isPlaying) {
            audio.play().catch(console.error);
        }

        return () => {
            audio.pause();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioUrl]);

    // Restore timecode after variant switch or cross-track waveform seek
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleLoadedData = () => {
            // Check store for pending seek from cross-track waveform click
            const { pendingSeekPosition } = useMusicStore.getState();
            if (pendingSeekPosition !== null) {
                audio.currentTime = pendingSeekPosition * audio.duration;
                useMusicStore.setState({ pendingSeekPosition: null });
                if (isPlaying) audio.play().catch(console.error);
                return;
            }
            // Check ref for variant switch position restore
            if (seekAfterLoadRef.current !== null) {
                audio.currentTime = seekAfterLoadRef.current;
                seekAfterLoadRef.current = null;
                if (isPlaying) audio.play().catch(console.error);
            }
        };

        audio.addEventListener('loadeddata', handleLoadedData);
        return () => audio.removeEventListener('loadeddata', handleLoadedData);
    }, [isPlaying]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.play().catch(console.error);
        } else {
            audio.pause();
        }
    }, [isPlaying]);

    useEffect(() => {
        const audio = audioRef.current;
        if (audio) audio.volume = isMuted ? 0 : volume;
    }, [volume, isMuted]);

    // Helper: find next/prev track by playback queue (visual order)
    const findTrackById = useCallback((id: string) => tracks.find((t) => t.id === id), [tracks]);

    // Progress tracking
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => {
            setStoreTime(audio.currentTime);
        };
        const onDurationChange = () => {
            setStoreDuration(audio.duration || 0);
        };
        const onEnded = () => {
            const { repeatMode: rm, playbackQueue: queue } = useMusicStore.getState();
            if (rm === 'one') {
                // Repeat current track
                audio.currentTime = 0;
                audio.play();
                return;
            }
            const currentIndex = queue.indexOf(playingTrackId!);
            if (currentIndex >= 0 && currentIndex < queue.length - 1) {
                const nextId = queue[currentIndex + 1];
                const next = findTrackById(nextId);
                if (next) {
                    setPlayingTrack(next.id, next.vocalUrl ? 'vocal' : 'instrumental');
                }
            } else if (rm === 'all' && queue.length > 0) {
                // Wrap to first track in queue
                const firstId = queue[0];
                const first = findTrackById(firstId);
                if (first) {
                    setPlayingTrack(first.id, first.vocalUrl ? 'vocal' : 'instrumental');
                }
            } else {
                setIsPlaying(false);
            }
        };

        const onPause = () => {
            // Sync store when paused externally (media keys, MediaSession)
            if (useMusicStore.getState().isPlaying) setIsPlaying(false);
        };
        const onPlay = () => {
            // Sync store when resumed externally
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

    const handleSeek = useCallback((position: number) => {
        const audio = audioRef.current;
        if (audio && audio.duration && isFinite(audio.duration)) {
            audio.currentTime = position * audio.duration;
            setStoreTime(audio.currentTime);
        }
    }, [setStoreTime]);

    // Register seek callback so TrackCard can trigger seeks
    useEffect(() => {
        registerSeek(handleSeek);
        return () => registerSeek(null);
    }, [handleSeek, registerSeek]);

    const handlePrevious = () => {
        const currentIndex = playbackQueue.indexOf(playingTrackId!);
        if (playbackQueue.length <= 1 || currentIndex <= 0) {
            // Single track or first track — restart from beginning
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
            setPlayingTrack(prev.id, prev.vocalUrl ? 'vocal' : 'instrumental');
        }
    };

    const handleNext = () => {
        const currentIndex = playbackQueue.indexOf(playingTrackId!);
        if (playbackQueue.length <= 1) return; // Single track — do nothing
        if (currentIndex >= 0 && currentIndex < playbackQueue.length - 1) {
            const nextId = playbackQueue[currentIndex + 1];
            const next = tracks.find((t) => t.id === nextId);
            if (next) {
                prevAudioUrlRef.current = null;
                setPlayingTrack(next.id, next.vocalUrl ? 'vocal' : 'instrumental');
            }
        } else if (repeatMode === 'all' && playbackQueue.length > 0) {
            // Wrap to first track
            const firstId = playbackQueue[0];
            const first = tracks.find((t) => t.id === firstId);
            if (first) {
                prevAudioUrlRef.current = null;
                setPlayingTrack(first.id, first.vocalUrl ? 'vocal' : 'instrumental');
            }
        }
    };

    const progress = duration > 0 ? currentTime / duration : 0;

    if (!track || !audioUrl) return null;

    const hasVocal = !!track.vocalUrl;
    const hasInstrumental = !!track.instrumentalUrl;
    const hasBothVariants = hasVocal && hasInstrumental;
    const accentColor = genreInfo?.color || '#6366F1';

    return (
        <>
            <audio ref={audioRef} preload="auto" />
            <div
                className="fixed bottom-0 left-0 right-0 z-[100] backdrop-blur-xl border-t border-white/10"
                style={{
                    background: `linear-gradient(to right, ${accentColor}08, var(--bg-primary) 30%, var(--bg-primary))`,
                }}
            >
                {/* Progress bar at very top */}
                <div className="h-[2px] bg-white/5 w-full">
                    <div
                        className="h-full transition-[width] duration-100"
                        style={{
                            width: `${progress * 100}%`,
                            backgroundColor: accentColor,
                        }}
                    />
                </div>

                <div className="flex items-center gap-4 px-4 py-2 max-w-screen-xl mx-auto">
                    {/* Track info */}
                    <div className="flex items-center gap-3 min-w-0 w-[200px] flex-shrink-0">
                        <div
                            className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
                            style={{
                                background: track.coverUrl
                                    ? undefined
                                    : `linear-gradient(135deg, ${accentColor}88, ${accentColor}44)`,
                            }}
                        >
                            {track.coverUrl ? (
                                <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-white/60 text-sm font-bold">
                                    {track.title.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{track.title}</p>
                            <p className="text-xs text-text-secondary truncate">{track.artist || 'Unknown artist'}</p>
                        </div>
                    </div>

                    {/* Playback controls */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                            onClick={handlePrevious}
                            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                        >
                            <SkipBack size={16} fill="currentColor" />
                        </button>
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
                        >
                            {isPlaying ? (
                                <Pause size={16} fill="currentColor" />
                            ) : (
                                <Play size={16} fill="currentColor" className="ml-0.5" />
                            )}
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={playbackQueue.length <= 1}
                            className={`p-1.5 transition-colors ${playbackQueue.length <= 1
                                ? 'text-text-tertiary opacity-30 cursor-not-allowed'
                                : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            <SkipForward size={16} fill="currentColor" />
                        </button>
                    </div>

                    {/* Waveform + time */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-[10px] text-text-tertiary tabular-nums w-8 text-right flex-shrink-0">
                            {formatDuration(currentTime)}
                        </span>
                        <div className="flex-1 min-w-0">
                            <WaveformCanvas
                                peaks={playingVariant === 'vocal' ? track.vocalPeaks : track.instrumentalPeaks}
                                audioUrl={audioUrl}
                                progress={progress}
                                height={28}
                                playedColor={accentColor}
                                unplayedColor="rgba(255,255,255,0.12)"
                                onSeek={handleSeek}
                                compact
                            />
                        </div>
                        <span className="text-[10px] text-text-tertiary tabular-nums w-8 flex-shrink-0">
                            {formatDuration(duration)}
                        </span>
                    </div>

                    {/* Right: Variant + Volume + Close */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {hasBothVariants && (
                            <PortalTooltip
                                content={playingVariant === 'vocal' ? 'Switch to instrumental' : 'Switch to vocal'}
                                enterDelay={800}
                                side="top"
                            >
                                <button
                                    onClick={() => toggleVariant()}
                                    className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${playingVariant === 'instrumental'
                                        ? 'text-white'
                                        : 'text-text-secondary hover:text-text-primary'
                                        }`}
                                >
                                    {playingVariant === 'vocal' ? <Mic size={14} /> : <Piano size={14} />}
                                    <span className="text-[10px] uppercase tracking-wider">
                                        {playingVariant === 'vocal' ? 'VOC' : 'INST'}
                                    </span>
                                </button>
                            </PortalTooltip>
                        )}

                        {/* Repeat toggle */}
                        <PortalTooltip
                            content={repeatMode === 'off' ? 'Enable repeat' : repeatMode === 'all' ? 'Repeat current track' : 'Disable repeat'}
                            enterDelay={800}
                            side="top"
                        >
                            <button
                                onClick={() => cycleRepeatMode()}
                                className={`p-1.5 rounded-lg transition-colors ${repeatMode !== 'off'
                                    ? ''
                                    : 'text-text-secondary hover:text-text-primary'
                                    }`}
                                style={repeatMode === 'one'
                                    ? { color: genreInfo?.color || '#6366F1' }
                                    : repeatMode === 'all'
                                        ? { color: '#22c55e' }
                                        : undefined}
                            >
                                {repeatMode === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
                            </button>
                        </PortalTooltip>

                        {/* Add to playlist */}
                        <PortalTooltip
                            content="Add to playlist"
                            enterDelay={800}
                            side="top"
                        >
                            <button
                                onClick={() => setShowPlaylistModal(true)}
                                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <ListMusic size={14} />
                            </button>
                        </PortalTooltip>

                        {/* Volume */}
                        <button
                            onClick={() => setIsMuted(!isMuted)}
                            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                        >
                            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={isMuted ? 0 : volume}
                            onChange={(e) => {
                                setVolume(parseFloat(e.target.value));
                                setIsMuted(false);
                            }}
                            className="w-16 accent-white h-1"
                        />

                        {/* Close player */}
                        <button
                            onClick={() => setPlayingTrack(null)}
                            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Add to Playlist Modal */}
            <AddToMusicPlaylistModal
                isOpen={showPlaylistModal}
                onClose={() => setShowPlaylistModal(false)}
                trackId={playingTrackId || ''}
            />
        </>
    );
};
