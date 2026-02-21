// =============================================================================
// AUDIO PLAYER: Global bottom bar audio player with waveform
// =============================================================================
//
// Logic lives in hooks:
//   - useAudioEngine.ts        — <audio> lifecycle, src transitions, error retry, volume, seek
//   - usePlaybackNavigation.ts — prev/next for library and timeline modes
//
// This file is UI composition + lightweight derived state for shared library
// awareness (owner credentials, permission-gated like/settings buttons).
// =============================================================================

import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Heart, Mic, Piano, X, Repeat, Repeat1, Settings, ListMusic, Scissors, Check, Loader2 } from 'lucide-react';
import { AddToMusicPlaylistModal } from '../modals/AddToMusicPlaylistModal';
import { UploadTrackModal } from '../modals/UploadTrackModal';
import { WaveformCanvas } from './WaveformCanvas';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { useMusicStore, selectAllTracks } from '../../../core/stores/musicStore';
import { useEditingStore } from '../../../core/stores/editing/editingStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { DEFAULT_ACCENT_COLOR } from '../../../core/utils/trackUtils';
import { formatDuration } from '../utils/formatDuration';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { usePlaybackNavigation } from '../hooks/usePlaybackNavigation';
import { useTrimMode } from '../hooks/useTrimMode';
import type { SharePermissions } from '../../../core/types/musicSharing';
import { DEFAULT_SHARE_PERMISSIONS, OWNER_PERMISSIONS } from '../../../core/types/musicSharing';

export const AudioPlayer: React.FC = () => {
    // ── Hook composition ────────────────────────────────────────────────────
    const {
        audioRef, track, genreInfo, handleSeek,
        volume, setVolume, isMuted, setIsMuted, prevAudioUrlRef,
    } = useAudioEngine();

    const tracks = useMusicStore(selectAllTracks);
    const { handlePrevious, handleNext, isTimelineMode } = usePlaybackNavigation(audioRef, tracks, prevAudioUrlRef);

    // ── Store selectors (UI-only) ───────────────────────────────────────────
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const playingVariant = useMusicStore((s) => s.playingVariant);
    const isPlaying = useMusicStore((s) => s.isPlaying);
    const currentTime = useMusicStore((s) => s.currentTime);
    const duration = useMusicStore((s) => s.duration);
    const repeatMode = useMusicStore((s) => s.repeatMode);
    const playingTrimStart = useMusicStore((s) => s.playingTrimStart);
    const playingTrimEnd = useMusicStore((s) => s.playingTrimEnd);
    const playbackVolume = useMusicStore((s) => s.playbackVolume);
    const playbackSource = useMusicStore((s) => s.playbackSource);
    const playbackQueue = useMusicStore((s) => s.playbackQueue);
    const { setPlayingTrack, setIsPlaying, toggleVariant, cycleRepeatMode } = useMusicStore.getState();

    const editingTracks = useEditingStore((s) => s.tracks);

    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    // ── Shared library awareness ─────────────────────────────────────────
    // Determine if the playing track belongs to a shared library so we can
    // use the owner's credentials for mutations and respect permissions.
    const sharedTracks = useMusicStore((s) => s.sharedTracks);
    const activeLibrarySource = useMusicStore((s) => s.activeLibrarySource);

    const isSharedTrack = !!playingTrackId && sharedTracks.some((t) => t.id === playingTrackId);
    const effectiveUserId = isSharedTrack && activeLibrarySource ? activeLibrarySource.ownerUserId : userId;
    const effectiveChannelId = isSharedTrack && activeLibrarySource ? activeLibrarySource.ownerChannelId : channelId;
    const permissions: SharePermissions = isSharedTrack && activeLibrarySource?.permissions
        ? activeLibrarySource.permissions
        : isSharedTrack
            ? DEFAULT_SHARE_PERMISSIONS
            : OWNER_PERMISSIONS;

    const [showPlaylistModal, setShowPlaylistModal] = useState(false);
    const [showTrackSettings, setShowTrackSettings] = useState(false);

    // ── Trim mode (extracted hook) ───────────────────────────────────────
    const {
        isTrimMode, isTrimSaving, isWaveformReloading, clearWaveformReloading,
        trimStartFrac, trimEndFrac,
        fadeOutStartFrac, fadeOutCurvature,
        enterTrimMode, exitTrimMode,
        handleTrimChange, handleTrimSave,
        handleFadeOutChange, activateFadeOut, deactivateFadeOut,
    } = useTrimMode({
        audioRef, track, duration,
        volume, isMuted, playbackVolume,
        playingVariant, playingTrackId,
        effectiveUserId, effectiveChannelId,
    });


    // Close player on Esc — only if no modals are open
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (showPlaylistModal || showTrackSettings) return;
            if (document.querySelector('[role="dialog"]')) return;

            if (e.code === 'Space') {
                e.preventDefault();
                setIsPlaying(!useMusicStore.getState().isPlaying);
                return;
            }
            if (e.key === 'Escape') {
                setPlayingTrack(null);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showPlaylistModal, showTrackSettings, setPlayingTrack, setIsPlaying]);

    // ── MediaSession: system media key support (play/pause, prev, next) ─────
    useEffect(() => {
        if (!('mediaSession' in navigator) || !track) return;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist || 'Unknown artist',
            ...(track.coverUrl ? { artwork: [{ src: track.coverUrl }] } : {}),
        });

        const actionHandlers: [MediaSessionAction, MediaSessionActionHandler][] = [
            ['play', () => setIsPlaying(true)],
            ['pause', () => setIsPlaying(false)],
            ['previoustrack', handlePrevious],
            ['nexttrack', handleNext],
        ];

        for (const [action, handler] of actionHandlers) {
            navigator.mediaSession.setActionHandler(action, handler);
        }

        return () => {
            for (const [action] of actionHandlers) {
                navigator.mediaSession.setActionHandler(action, null);
            }
        };
    }, [track, handlePrevious, handleNext, setIsPlaying]);

    // ── Derived values ──────────────────────────────────────────────────────
    const progress = duration > 0 ? currentTime / duration : 0;
    const storedUrl = track
        ? (playingVariant === 'vocal' ? track.vocalUrl : track.instrumentalUrl) || track.vocalUrl || track.instrumentalUrl
        : null;

    if (!track || !storedUrl) return null;

    const hasVocal = !!track.vocalUrl;
    const hasInstrumental = !!track.instrumentalUrl;
    const hasBothVariants = hasVocal && hasInstrumental;
    const accentColor = genreInfo?.color || DEFAULT_ACCENT_COLOR;

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <>
            <audio ref={audioRef} preload="auto" />
            <div
                className="fixed bottom-0 left-0 right-0 z-panel backdrop-blur-xl border-t border-black/10 dark:border-white/10 bg-bg-primary/80"
                style={{
                    background: `linear-gradient(to right, ${accentColor}08, var(--bg-primary) 30%, var(--bg-primary))`,
                }}
            >
                {/* Progress bar at very top */}
                <div className="h-[2px] bg-black/5 dark:bg-white/5 w-full">
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
                                <span className="text-text-primary/60 dark:text-white/60 text-sm font-bold">
                                    {track.title.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{track.title}</p>
                            <p className="text-xs text-text-secondary truncate">{track.artist || 'Unknown artist'}</p>
                        </div>
                    </div>

                    {/* Like button — requires edit permission, uses owner credentials (hidden in trim mode) */}
                    {!isTrimMode && permissions.canEdit && (
                        <button
                            onClick={() => useMusicStore.getState().toggleLike(effectiveUserId, effectiveChannelId, track.id)}
                            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${track.liked
                                ? 'text-red-400 hover:text-red-300'
                                : 'text-text-tertiary hover:text-text-primary'
                                }`}
                        >
                            <Heart size={16} fill={track.liked ? 'currentColor' : 'none'} />
                        </button>
                    )}

                    {/* Playback controls */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!isTrimMode && (
                            <button
                                onClick={handlePrevious}
                                className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <SkipBack size={16} fill="currentColor" />
                            </button>
                        )}
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-8 h-8 rounded-full bg-black text-white dark:bg-white dark:text-black flex items-center justify-center hover:scale-105 transition-transform"
                        >
                            {isPlaying ? (
                                <Pause size={16} fill="currentColor" />
                            ) : (
                                <Play size={16} fill="currentColor" className="ml-0.5" />
                            )}
                        </button>
                        {!isTrimMode && (
                            <button
                                onClick={handleNext}
                                disabled={isTimelineMode ? editingTracks.length <= 1 : playbackQueue.length <= 1}
                                className={`p-1.5 transition-colors ${(isTimelineMode ? editingTracks.length <= 1 : playbackQueue.length <= 1)
                                    ? 'text-text-tertiary opacity-30 cursor-not-allowed'
                                    : 'text-text-secondary hover:text-text-primary'}`}
                            >
                                <SkipForward size={16} fill="currentColor" />
                            </button>
                        )}
                    </div>

                    {/* Waveform + time */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-[10px] text-text-tertiary tabular-nums w-8 text-right flex-shrink-0">
                            {isTrimMode
                                ? formatDuration(trimStartFrac * duration)
                                : formatDuration(currentTime)
                            }
                        </span>
                        <div className="flex-1 min-w-0">
                            <WaveformCanvas
                                peaks={isWaveformReloading ? undefined : (playingVariant === 'vocal' ? track.vocalPeaks : track.instrumentalPeaks)}
                                audioUrl={storedUrl}
                                progress={progress}
                                height={28}
                                playedColor={accentColor}
                                onSeek={handleSeek}
                                trimStartFraction={isTrimMode ? trimStartFrac : (duration > 0 ? playingTrimStart / duration : 0)}
                                trimEndFraction={isTrimMode ? trimEndFrac : (duration > 0 ? playingTrimEnd / duration : 0)}
                                isTrimMode={isTrimMode}
                                onTrimChange={handleTrimChange}
                                duration={duration}
                                fadeOutStartFrac={fadeOutStartFrac}
                                fadeOutCurvature={fadeOutCurvature}
                                onFadeOutChange={isTrimMode ? handleFadeOutChange : undefined}
                                onPeaksComputed={isWaveformReloading ? clearWaveformReloading : undefined}
                                compact
                            />
                        </div>
                        <span className="text-[10px] text-text-tertiary tabular-nums w-8 flex-shrink-0">
                            {isTrimMode
                                ? formatDuration(duration - trimEndFrac * duration)
                                : formatDuration(duration)
                            }
                        </span>
                    </div>

                    {/* Right: Variant + Volume + Close (or Trim controls in trim mode) */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {isTrimMode ? (
                            /* ── Trim mode controls ── */
                            <>
                                <button
                                    onClick={exitTrimMode}
                                    disabled={isTrimSaving}
                                    className="px-3 py-1 rounded-lg text-xs font-medium
                                               text-text-secondary hover:text-text-primary
                                               bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10
                                               transition-colors"
                                >
                                    Cancel
                                </button>
                                {/* Fade-out toggle */}
                                <button
                                    onClick={fadeOutStartFrac > 0 ? deactivateFadeOut : activateFadeOut}
                                    title={fadeOutStartFrac > 0 ? 'Remove fade-out' : 'Add fade-out'}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${fadeOutStartFrac > 0
                                        ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                                        : 'text-text-secondary hover:text-text-primary bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                                        }`}
                                >
                                    Fade Out
                                </button>
                                <button
                                    onClick={handleTrimSave}
                                    disabled={isTrimSaving || (trimStartFrac < 0.005 && trimEndFrac < 0.005 && fadeOutStartFrac <= 0)}
                                    className="px-3 py-1 rounded-lg text-xs font-medium
                                               text-white bg-indigo-500 hover:bg-indigo-400
                                               disabled:opacity-40 disabled:cursor-not-allowed
                                               transition-colors flex items-center gap-1.5"
                                >
                                    {isTrimSaving ? (
                                        <><Loader2 size={12} className="animate-spin" /> Trimming...</>
                                    ) : (
                                        <><Check size={12} /> Save Trim</>
                                    )}
                                </button>
                            </>
                        ) : (
                            /* ── Normal controls ── */
                            <>
                                {hasBothVariants && (
                                    <PortalTooltip
                                        content={playingVariant === 'vocal' ? 'Switch to instrumental' : 'Switch to vocal'}
                                        enterDelay={800}
                                        side="top"
                                    >
                                        <button
                                            onClick={() => toggleVariant()}
                                            className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${playingVariant === 'instrumental'
                                                ? 'text-text-primary dark:text-white'
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
                                    content={repeatMode === 'off' ? 'Repeat: off' : repeatMode === 'all' ? 'Repeat: all' : 'Repeat: one'}
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
                                            ? { color: genreInfo?.color || DEFAULT_ACCENT_COLOR }
                                            : repeatMode === 'all'
                                                ? { color: 'var(--color-success)' }
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

                                {/* Trim button — requires edit permission */}
                                {permissions.canEdit && (
                                    <PortalTooltip
                                        content="Trim track"
                                        enterDelay={800}
                                        side="top"
                                    >
                                        <button
                                            onClick={enterTrimMode}
                                            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                                        >
                                            <Scissors size={14} />
                                        </button>
                                    </PortalTooltip>
                                )}

                                {/* Track settings — requires edit permission */}
                                {permissions.canEdit && (
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
                                )}

                                {/* Volume */}
                                <button
                                    onClick={() => { if (playbackSource !== 'timeline') setIsMuted(!isMuted); }}
                                    className={`p-1 transition-colors ${playbackSource === 'timeline' ? 'text-text-tertiary cursor-default' : 'text-text-secondary hover:text-text-primary'}`}
                                >
                                    {isMuted && playbackSource !== 'timeline' ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                </button>
                                {playbackSource === 'timeline' ? (
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
                                            value={playbackVolume ?? 0}
                                            readOnly
                                            className="w-16 accent-black dark:accent-white h-1 opacity-50 cursor-default"
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
                                        className="w-16 accent-black dark:accent-white h-1"
                                    />
                                )}

                                {/* Close player */}
                                <button
                                    onClick={() => setPlayingTrack(null)}
                                    className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </>
                        )}
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
                userId={effectiveUserId}
                channelId={effectiveChannelId}
                editTrack={track}
                initialTab="library"
            />
        </>
    );
};
