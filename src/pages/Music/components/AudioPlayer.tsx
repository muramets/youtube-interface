// =============================================================================
// AUDIO PLAYER: Global bottom bar audio player with waveform
// =============================================================================

import React, { useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Mic, Piano, X } from 'lucide-react';
import { WaveformCanvas } from './WaveformCanvas';
import { useMusicStore } from '../../../core/stores/musicStore';
import { formatDuration } from '../utils/formatDuration';

export const AudioPlayer: React.FC = () => {
    const tracks = useMusicStore((s) => s.tracks);
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const playingVariant = useMusicStore((s) => s.playingVariant);
    const isPlaying = useMusicStore((s) => s.isPlaying);
    const genres = useMusicStore((s) => s.genres);
    const currentTime = useMusicStore((s) => s.currentTime);
    const duration = useMusicStore((s) => s.duration);
    const { setPlayingTrack, setIsPlaying, toggleVariant, setCurrentTime: setStoreTime, setDuration: setStoreDuration, registerSeek } = useMusicStore.getState();

    const audioRef = useRef<HTMLAudioElement>(null);
    const [volume, setVolume] = React.useState(0.8);
    const [isMuted, setIsMuted] = React.useState(false);

    // Track previous URL to detect variant-only changes
    const prevAudioUrlRef = useRef<string | null>(null);
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
        prevAudioUrlRef.current = audioUrl;

        // Detect variant-only switch (same track, different URL)
        const isVariantSwitch = prevUrl && prevUrl !== audioUrl && audio.currentTime > 0;

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

    // Restore timecode after variant switch
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleLoadedData = () => {
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
            // Auto-play next track
            const currentIndex = tracks.findIndex((t) => t.id === playingTrackId);
            if (currentIndex >= 0 && currentIndex < tracks.length - 1) {
                const nextTrack = tracks[currentIndex + 1];
                const variant = nextTrack.vocalUrl ? 'vocal' : 'instrumental';
                setPlayingTrack(nextTrack.id, variant);
            } else {
                setIsPlaying(false);
            }
        };

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('durationchange', onDurationChange);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('durationchange', onDurationChange);
            audio.removeEventListener('ended', onEnded);
        };
    }, [playingTrackId, tracks, setPlayingTrack, setIsPlaying, setStoreTime, setStoreDuration]);

    const handleSeek = useCallback((position: number) => {
        const audio = audioRef.current;
        if (audio && duration) {
            audio.currentTime = position * duration;
            setStoreTime(audio.currentTime);
        }
    }, [duration, setStoreTime]);

    // Register seek callback so TrackCard can trigger seeks
    useEffect(() => {
        registerSeek(handleSeek);
        return () => registerSeek(null);
    }, [handleSeek, registerSeek]);

    const handlePrevious = () => {
        const currentIndex = tracks.findIndex((t) => t.id === playingTrackId);
        if (currentIndex > 0) {
            const prev = tracks[currentIndex - 1];
            prevAudioUrlRef.current = null; // Reset — this is a track change, not variant
            setPlayingTrack(prev.id, prev.vocalUrl ? 'vocal' : 'instrumental');
        }
    };

    const handleNext = () => {
        const currentIndex = tracks.findIndex((t) => t.id === playingTrackId);
        if (currentIndex >= 0 && currentIndex < tracks.length - 1) {
            const next = tracks[currentIndex + 1];
            prevAudioUrlRef.current = null; // Reset — this is a track change, not variant
            setPlayingTrack(next.id, next.vocalUrl ? 'vocal' : 'instrumental');
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
                            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
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
                            <button
                                onClick={() => toggleVariant()}
                                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${playingVariant === 'instrumental'
                                    ? 'bg-white/10 text-white'
                                    : 'text-text-secondary hover:text-text-primary'
                                    }`}
                                title={playingVariant === 'vocal' ? 'Switch to instrumental' : 'Switch to vocal'}
                            >
                                {playingVariant === 'vocal' ? <Mic size={14} /> : <Piano size={14} />}
                                <span className="text-[10px] uppercase tracking-wider">
                                    {playingVariant === 'vocal' ? 'VOC' : 'INST'}
                                </span>
                            </button>
                        )}

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
        </>
    );
};
