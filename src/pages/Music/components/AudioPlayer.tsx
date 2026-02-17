// =============================================================================
// AUDIO PLAYER: Global bottom bar audio player with waveform
// =============================================================================

import React, { useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Mic, Piano, X, Repeat, Repeat1, ListMusic, Settings } from 'lucide-react';
import { AddToMusicPlaylistModal } from '../modals/AddToMusicPlaylistModal';
import { UploadTrackModal } from '../modals/UploadTrackModal';
import { WaveformCanvas } from './WaveformCanvas';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { useMusicStore, selectAllTracks } from '../../../core/stores/musicStore';
import { useEditingStore } from '../../../core/stores/editingStore';
import { getEffectiveDuration } from '../../../core/types/editing';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { refreshAudioUrl } from '../../../core/services/storageService';
import { TrackService } from '../../../core/services/trackService';
import { formatDuration } from '../utils/formatDuration';

export const AudioPlayer: React.FC = () => {
    const tracks = useMusicStore(selectAllTracks);
    const playbackQueue = useMusicStore((s) => s.playbackQueue);
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const playingVariant = useMusicStore((s) => s.playingVariant);
    const isPlaying = useMusicStore((s) => s.isPlaying);
    const genres = useMusicStore((s) => s.genres);
    const currentTime = useMusicStore((s) => s.currentTime);
    const duration = useMusicStore((s) => s.duration);
    const repeatMode = useMusicStore((s) => s.repeatMode);
    const playingTrimStart = useMusicStore((s) => s.playingTrimStart);
    const playingTrimEnd = useMusicStore((s) => s.playingTrimEnd);
    const playbackVolume = useMusicStore((s) => s.playbackVolume);
    const { setPlayingTrack, setIsPlaying, toggleVariant, cycleRepeatMode, setCurrentTime: setStoreTime, setDuration: setStoreDuration, registerSeek } = useMusicStore.getState();

    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    const audioRef = useRef<HTMLAudioElement>(null);
    const [volume, setVolume] = React.useState(0.8);
    const [isMuted, setIsMuted] = React.useState(false);
    const [showPlaylistModal, setShowPlaylistModal] = React.useState(false);
    const [showTrackSettings, setShowTrackSettings] = React.useState(false);

    // Track previous URL and track ID to detect variant-only changes
    const prevAudioUrlRef = useRef<string | null>(null);
    const prevTrackIdRef = useRef<string | null>(null);
    const seekAfterLoadRef = useRef<number | null>(null);
    const hasRetriedRef = useRef(false);
    /** Guard: true while audio.src is being changed, prevents spurious onPause from cascading */
    const srcTransitionRef = useRef(false);
    const [freshUrl, setFreshUrl] = React.useState<string | null>(null);

    const track = tracks.find((t) => t.id === playingTrackId);
    const genreInfo = track ? genres.find((g) => g.id === track.genre) : null;

    const storedUrl = track
        ? (playingVariant === 'vocal' ? track.vocalUrl : track.instrumentalUrl) || track.vocalUrl || track.instrumentalUrl
        : null;
    // Use fresh URL if we resolved one, otherwise fall back to stored URL
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

        // Detect variant-only switch (same track, different URL)
        const isVariantSwitch = prevUrl && prevUrl !== audioUrl && audio.currentTime > 0 && prevTrackId === playingTrackId;

        if (isVariantSwitch) {
            // Save current position to restore after load
            seekAfterLoadRef.current = audio.currentTime;
        }

        // Guard: signal that we're changing src so onPause won't cascade
        srcTransitionRef.current = true;
        audio.src = audioUrl;
        // Read fresh volume from store to avoid stale closure (this effect depends only on [audioUrl])
        const freshVol = useMusicStore.getState().playbackVolume;
        audio.volume = isMuted ? 0 : (freshVol ?? volume);

        if (isPlaying) {
            audio.play()
                .then(() => { srcTransitionRef.current = false; })
                .catch((err) => { srcTransitionRef.current = false; console.error(err); });
        } else {
            // If not playing, clear guard on loadeddata
            const clearGuard = () => { srcTransitionRef.current = false; audio.removeEventListener('loadeddata', clearGuard); };
            audio.addEventListener('loadeddata', clearGuard);
        }

        return () => {
            audio.pause();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioUrl]);

    // Auto-retry with fresh URL on load error (e.g. expired Firebase Storage token → 403)
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !track) return;

        const handleError = async () => {
            if (hasRetriedRef.current) return; // prevent infinite loop
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
                // Force isPlaying back to true — the failed load triggers a pause event
                // that resets isPlaying to false, so the [audioUrl] effect won't auto-play
                setIsPlaying(true);

                // Persist fresh URL to local store + Firestore so 403 doesn't repeat
                const urlField = isVocal ? 'vocalUrl' : 'instrumentalUrl';
                useMusicStore.setState((state) => ({
                    tracks: state.tracks.map((t) =>
                        t.id === track.id ? { ...t, [urlField]: fresh } : t
                    ),
                }));
                // Extract userId/channelId from storagePath: users/{uid}/channels/{cid}/tracks/...
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
            // Check store for pending seek from cross-track waveform click
            const { pendingSeekSeconds } = useMusicStore.getState();
            if (pendingSeekSeconds !== null) {
                audio.currentTime = pendingSeekSeconds;
                useMusicStore.setState({ pendingSeekSeconds: null, currentTime: pendingSeekSeconds });
                if (isPlaying) audio.play().catch(console.error);
                return;
            }
            // Check ref for variant switch position restore
            if (seekAfterLoadRef.current !== null) {
                audio.currentTime = seekAfterLoadRef.current;
                seekAfterLoadRef.current = null;
                if (isPlaying) audio.play().catch(console.error);
            }
            // Re-apply volume after load (browser may reset during src load)
            const vol = useMusicStore.getState().playbackVolume;
            if (vol !== null) {
                audio.volume = vol;
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
        if (audio) {
            audio.volume = isMuted ? 0 : (playbackVolume ?? volume);
        }
    }, [volume, isMuted, playbackVolume]);

    // Helper: find next/prev track by playback queue (visual order)
    const findTrackById = useCallback((id: string) => tracks.find((t) => t.id === id), [tracks]);

    // Progress tracking
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => {
            const time = audio.currentTime;
            setStoreTime(time);
            // Enforce trimEnd boundary: stop at (duration - trimEnd)
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
            // Skip if we're in the middle of a src transition (browser fires pause during src change)
            if (srcTransitionRef.current) return;
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

    // ── Timeline mode detection ──────────────────────────────────────
    const isTimelineMode = playbackVolume !== null;
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
    }, [editingTracks, setPlayingTrack]);

    const handlePrevious = () => {
        if (isTimelineMode && editingTracks.length > 1) {
            const idx = getTimelineTrackIndex();
            // If >2s into current track, restart it; otherwise go to previous
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
        if (isTimelineMode && editingTracks.length > 1) {
            const idx = getTimelineTrackIndex();
            if (idx < editingTracks.length - 1) {
                jumpToTimelineTrack(idx + 1);
            }
            return;
        }
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
                            disabled={isTimelineMode ? editingTracks.length <= 1 : playbackQueue.length <= 1}
                            className={`p-1.5 transition-colors ${(isTimelineMode ? editingTracks.length <= 1 : playbackQueue.length <= 1)
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
                                trimStartFraction={duration > 0 ? playingTrimStart / duration : 0}
                                trimEndFraction={duration > 0 ? playingTrimEnd / duration : 0}
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

                        {/* Track settings */}
                        <PortalTooltip
                            content="Track settings"
                            enterDelay={800}
                            side="top"
                        >
                            <button
                                onClick={() => setShowTrackSettings(true)}
                                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <Settings size={14} />
                            </button>
                        </PortalTooltip>

                        {/* Volume */}
                        <button
                            onClick={() => { if (playbackVolume === null) setIsMuted(!isMuted); }}
                            className={`p-1 transition-colors ${playbackVolume !== null ? 'text-text-tertiary cursor-default' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            {isMuted && playbackVolume === null ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </button>
                        {playbackVolume !== null ? (
                            <PortalTooltip
                                content={<span style={{ whiteSpace: 'nowrap' }}>Volume controlled by Editing Timeline</span>}
                                enterDelay={500}
                                side="top"
                            >
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={playbackVolume}
                                    readOnly
                                    className="w-16 accent-white h-1 opacity-50 cursor-default"
                                />
                            </PortalTooltip>
                        ) : (
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
                        )}

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

            {/* Track Settings Modal */}
            <UploadTrackModal
                isOpen={showTrackSettings}
                onClose={() => setShowTrackSettings(false)}
                userId={userId}
                channelId={channelId}
                editTrack={track}
                initialTab="library"
            />
        </>
    );
};
