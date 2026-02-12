// =============================================================================
// TRACK ROW: Horizontal row with cover, metadata, waveform, and actions
// =============================================================================

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Play, Pause, Mic, Piano, Sparkles, Copy, Check, Heart, Download, BookOpen, MoreHorizontal, Trash2, Settings, ListMusic } from 'lucide-react';
import { WaveformCanvas } from './WaveformCanvas';
import { useMusicStore } from '../../../core/stores/musicStore';
import type { Track } from '../../../core/types/track';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../../components/ui/molecules/DropdownMenu';
import { ConfirmationModal } from '../../../components/ui/organisms/ConfirmationModal';
import { AddToMusicPlaylistModal } from '../modals/AddToMusicPlaylistModal';

interface TrackCardProps {
    track: Track;
    isSelected: boolean;
    userId: string;
    channelId: string;
    onSelect: (trackId: string) => void;
    onDelete?: (trackId: string) => void;
    onEdit?: (track: Track) => void;
}

import { formatDuration } from '../utils/formatDuration';

const TrackCardInner: React.FC<TrackCardProps> = ({
    track,
    isSelected,
    userId,
    channelId,
    onSelect,
    onDelete,
    onEdit,
}) => {
    // Granular selectors — only subscribe to what this card needs
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const isCurrentTrack = playingTrackId === track.id;

    const playingVariant = useMusicStore((s) => s.playingVariant);
    const isPlaying = useMusicStore((s) => s.isPlaying);
    const genres = useMusicStore((s) => s.genres);

    // Only subscribe to time-sensitive data for the active track
    const currentTime = useMusicStore((s) => isCurrentTrack ? s.currentTime : 0);
    const duration = useMusicStore((s) => isCurrentTrack ? s.duration : 0);
    const seekTo = useMusicStore((s) => isCurrentTrack ? s.seekTo : null);

    // Stable action references — don't subscribe to state changes
    const { setPlayingTrack, setIsPlaying, toggleLike, toggleVariant, setGenreFilter, toggleTagFilter, setSearchQuery } = useMusicStore.getState();
    const isCurrentlyPlaying = isCurrentTrack && isPlaying;

    const genreInfo = useMemo(() =>
        genres.find((g) => g.id === track.genre),
        [genres, track.genre]
    );

    const handlePlayPause = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCurrentTrack) {
            setIsPlaying(!isPlaying);
        } else {
            const variant = track.vocalUrl ? 'vocal' : 'instrumental';
            setPlayingTrack(track.id, variant);
        }
    };

    const [copied, setCopied] = useState(false);

    // Detect title truncation
    const titleRef = useRef<HTMLParagraphElement>(null);
    const [titleTruncated, setTitleTruncated] = useState(false);
    useEffect(() => {
        const el = titleRef.current;
        if (!el) return;
        const check = () => setTitleTruncated(el.scrollWidth > el.clientWidth);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [track.title]);
    const handleCopyPrompt = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!track.prompt) return;
        await navigator.clipboard.writeText(track.prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const [lyricsCopied, setLyricsCopied] = useState(false);
    const handleCopyLyrics = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!track.lyrics) return;
        await navigator.clipboard.writeText(track.lyrics);
        setLyricsCopied(true);
        setTimeout(() => setLyricsCopied(false), 1500);
    };

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [tooltipOpen, setTooltipOpen] = useState(false);

    const hasVocal = !!track.vocalUrl;
    const hasInstrumental = !!track.instrumentalUrl;
    const hasBothVariants = hasVocal && hasInstrumental;

    const handleDownload = useCallback((url?: string, label?: string) => {
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.download = `${track.title}${label ? ` (${label})` : ''}.mp3`;
        a.target = '_blank';
        a.click();
    }, [track.title]);

    const currentVariant = isCurrentTrack ? playingVariant : 'vocal';
    const currentPeaks = currentVariant === 'vocal' ? track.vocalPeaks : track.instrumentalPeaks;
    const currentUrl = currentVariant === 'vocal' ? track.vocalUrl : track.instrumentalUrl;
    const accentColor = genreInfo?.color || '#6366F1';

    // Waveform playback progress (0–1)
    const waveformProgress = isCurrentTrack && duration > 0 ? currentTime / duration : 0;

    // Click on waveform → seek (or start playback)
    const handleWaveformSeek = useCallback((position: number) => {
        if (isCurrentTrack && seekTo) {
            seekTo(position);
            if (!isPlaying) setIsPlaying(true);
        } else {
            // Start playing this track, then seek
            const variant = track.vocalUrl ? 'vocal' : 'instrumental';
            setPlayingTrack(track.id, variant);
            // Wait for AudioPlayer to register seek callback after track change
            const unsub = useMusicStore.subscribe((state) => {
                if (state.seekTo) {
                    state.seekTo(position);
                    unsub();
                }
            });
            // Safety fallback — unsubscribe after 3s if AudioPlayer never loads
            setTimeout(() => unsub(), 3000);
        }
    }, [isCurrentTrack, seekTo, isPlaying, setIsPlaying, setPlayingTrack, track.id, track.vocalUrl]);

    // DnD: Make track draggable
    const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
        id: `track-${track.id}`,
        data: { type: 'music-track', track },
    });

    return (
        <div
            ref={setDragRef}
            {...listeners}
            {...attributes}
            onClick={(e) => { e.stopPropagation(); onSelect(track.id); }}

            className={`group flex items-center gap-4 px-4 py-4 rounded-lg transition-all duration-150 cursor-pointer
                ${isDragging ? 'opacity-40' : ''}
                ${isCurrentTrack
                    ? 'bg-white/[0.06] hover:bg-white/[0.09]'
                    : (dropdownOpen || tooltipOpen)
                        ? 'bg-white/[0.04]'
                        : isSelected
                            ? 'bg-white/[0.03] ring-1 ring-white/10 hover:bg-white/[0.06]'
                            : 'hover:bg-white/[0.04]'
                }`}
        >
            {/* 1. Cover + Play/Pause overlay */}
            <div
                className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center relative group/cover cursor-pointer"
                style={{
                    background: track.coverUrl
                        ? undefined
                        : `linear-gradient(135deg, ${accentColor}88, ${accentColor}44)`,
                }}
                onClick={handlePlayPause}
            >
                {track.coverUrl ? (
                    <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                    <span className="text-white/60 text-sm font-bold">
                        {track.title.charAt(0).toUpperCase()}
                    </span>
                )}
                <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity
                    ${isCurrentlyPlaying ? 'opacity-100' : 'opacity-0 group-hover/cover:opacity-100'}`}>
                    {isCurrentlyPlaying ? (
                        <Pause size={16} className="text-white" fill="currentColor" />
                    ) : (
                        <Play size={16} className="text-white ml-0.5" fill="currentColor" />
                    )}
                </div>
                {/* Playing indicator bars */}
                {isCurrentlyPlaying && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 flex gap-[1.5px]">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="w-[2px] rounded-full"
                                style={{
                                    backgroundColor: '#fff',
                                    animation: `barBounce 0.6s ease-in-out ${i * 0.15}s infinite`,
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* 2. Title + Artist */}
            <div className="min-w-0 w-[260px] flex-shrink-0">
                <PortalTooltip
                    variant="default"
                    sizeMode="auto"
                    enterDelay={500}
                    triggerClassName="!block !justify-start min-w-0"
                    content={<span className="text-xs">{track.title}</span>}
                    disabled={!titleTruncated}
                >
                    <p
                        ref={titleRef}
                        className="text-sm font-medium text-text-primary truncate cursor-default"
                    >
                        {track.title}
                    </p>
                </PortalTooltip>
                <p
                    onClick={(e) => { e.stopPropagation(); setSearchQuery(track.artist || ''); }}
                    className="text-xs text-text-tertiary truncate transition-colors hover:text-text-secondary cursor-pointer"
                >
                    {track.artist || 'Unknown'}
                </p>
            </div>

            {/* 2.5 Variant toggle */}
            {hasBothVariants && (
                <PortalTooltip
                    content={currentVariant === 'vocal' ? 'Switch to instrumental' : 'Switch to vocal'}
                    triggerClassName="!block"
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (isCurrentTrack) {
                                toggleVariant();
                            } else {
                                const variant = currentVariant === 'vocal' ? 'instrumental' : 'vocal';
                                setPlayingTrack(track.id, variant);
                            }
                        }}
                        className={`p-1.5 rounded-lg text-xs flex items-center gap-1 flex-shrink-0 transition-all duration-150
                            ${isCurrentTrack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                            ${currentVariant === 'instrumental'
                                ? 'bg-white/10 text-white'
                                : 'text-text-secondary hover:text-text-primary hover:bg-white/10'
                            }`}
                    >
                        {currentVariant === 'vocal' ? <Mic size={14} /> : <Piano size={14} />}
                        <span className="text-[10px] uppercase tracking-wider">
                            {currentVariant === 'vocal' ? 'VOC' : 'INST'}
                        </span>
                    </button>
                </PortalTooltip>
            )}

            {/* 3. Waveform */}
            <div className="flex-1 min-w-0 max-w-[280px] group/waveform">
                <div className="transition-[filter] duration-150 group-hover/waveform:brightness-125">
                    <WaveformCanvas
                        peaks={currentPeaks}
                        audioUrl={currentUrl}
                        progress={waveformProgress}
                        height={40}
                        playedColor={accentColor}
                        unplayedColor="rgba(255,255,255,0.08)"
                        onSeek={handleWaveformSeek}
                        compact
                    />
                </div>
            </div>

            {/* 4. Duration / BPM */}
            <div className="flex flex-col items-end w-[52px] flex-shrink-0">
                <span className="text-[11px] text-text-secondary tabular-nums">
                    {track.duration > 0 ? formatDuration(track.duration) : '—'}
                </span>
                {track.bpm && (
                    <span className="text-[10px] text-text-tertiary tabular-nums">
                        {track.bpm} bpm
                    </span>
                )}
            </div>

            {/* 5. Genre */}
            <div className="w-[72px] flex-shrink-0 flex items-center">
                {genreInfo && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setGenreFilter(genreInfo.id); }}
                        className="text-[10px] font-medium truncate max-w-full transition-all hover:brightness-125 cursor-pointer"
                        style={{ color: genreInfo.color }}
                    >
                        {genreInfo.name}
                    </button>
                )}
            </div>

            {/* 6. Tags */}
            <div className="flex-1 min-w-0 max-w-[200px] line-clamp-2 text-[10px] text-text-tertiary leading-relaxed">
                {track.tags.map((tag, i) => (
                    <span key={tag}>
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); toggleTagFilter(tag); }}
                            className="text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
                        >
                            {tag}
                        </span>
                        {i < track.tags.length - 1 && <span className="text-text-tertiary/50">,{' '}</span>}
                    </span>
                ))}
            </div>

            {/* 7+8+icons: Actions */}
            <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
                {/* Prompt icon */}
                {track.prompt && (
                    <PortalTooltip
                        variant="default"
                        sizeMode="auto"
                        enterDelay={350}
                        onOpenChange={setTooltipOpen}
                        content={
                            <div className="flex flex-col gap-2 max-w-[280px]">
                                <p className="text-xs text-text-primary whitespace-pre-wrap">{track.prompt}</p>
                                <button
                                    onClick={handleCopyPrompt}
                                    className="flex items-center gap-1.5 text-[10px] text-text-secondary hover:text-text-primary transition-colors self-end"
                                >
                                    {copied ? <Check size={10} /> : <Copy size={10} />}
                                    {copied ? 'Copied!' : 'Copy prompt'}
                                </button>
                            </div>
                        }
                    >
                        <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <Sparkles size={14} />
                        </button>
                    </PortalTooltip>
                )}

                {/* Lyrics icon */}
                {track.lyrics && (
                    <PortalTooltip
                        variant="default"
                        sizeMode="auto"
                        maxWidth={480}
                        enterDelay={350}
                        onOpenChange={setTooltipOpen}
                        content={
                            <div className="flex flex-col gap-2 min-w-[160px]">
                                <p className="text-xs text-text-primary whitespace-pre-wrap max-h-[360px] overflow-y-auto">{track.lyrics}</p>
                                <button
                                    onClick={handleCopyLyrics}
                                    className="flex items-center gap-1.5 text-[10px] text-text-secondary hover:text-text-primary transition-colors self-end"
                                >
                                    {lyricsCopied ? <Check size={10} /> : <Copy size={10} />}
                                    {lyricsCopied ? 'Copied!' : 'Copy lyrics'}
                                </button>
                            </div>
                        }
                    >
                        <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <BookOpen size={14} />
                        </button>
                    </PortalTooltip>
                )}

                {/* Like heart */}
                <button
                    onClick={(e) => { e.stopPropagation(); toggleLike(userId, channelId, track.id); }}
                    className={`p-1.5 rounded-lg transition-colors ${track.liked
                        ? 'text-red-400 hover:text-red-300'
                        : 'text-text-tertiary hover:text-text-primary'
                        }`}
                >
                    <Heart size={14} fill={track.liked ? 'currentColor' : 'none'} />
                </button>

                {/* Download */}
                {hasBothVariants ? (
                    <DropdownMenu onOpenChange={setDropdownOpen}>
                        <DropdownMenuTrigger asChild>
                            <button
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary transition-colors flex items-center"
                            >
                                <Download size={14} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={4}>
                            {hasVocal && (
                                <DropdownMenuItem onClick={() => handleDownload(track.vocalUrl, 'Vocal')}>
                                    <Mic size={14} className="mr-2" /> Vocal
                                </DropdownMenuItem>
                            )}
                            {hasInstrumental && (
                                <DropdownMenuItem onClick={() => handleDownload(track.instrumentalUrl, 'Instrumental')}>
                                    <Piano size={14} className="mr-2" /> Instrumental
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(track.vocalUrl || track.instrumentalUrl); }}
                        className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
                    >
                        <Download size={14} />
                    </button>
                )}

                {/* More menu */}
                <DropdownMenu onOpenChange={setDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                        <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <MoreHorizontal size={14} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4}>
                        <DropdownMenuItem onClick={() => setShowAddToPlaylist(true)}>
                            <ListMusic size={14} className="mr-2" /> Add to Playlist
                        </DropdownMenuItem>
                        {onEdit && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onEdit(track)}>
                                    <Settings size={14} className="mr-2" /> Track Settings
                                </DropdownMenuItem>
                            </>
                        )}
                        {onDelete && <DropdownMenuSeparator />}
                        {onDelete && (
                            <DropdownMenuItem
                                onClick={() => setShowDeleteConfirm(true)}
                                className="text-red-400 focus:text-red-400"
                            >
                                <Trash2 size={14} className="mr-2" /> Delete Track
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Delete confirmation */}
            <ConfirmationModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => onDelete?.(track.id)}
                title="Delete Track"
                message={<>Are you sure you want to delete <strong>{track.title}</strong>? Audio files will be permanently removed.</>}
                confirmLabel="Delete"
                cancelLabel="Cancel"
            />
            {/* Add to Playlist */}
            <AddToMusicPlaylistModal
                isOpen={showAddToPlaylist}
                onClose={() => setShowAddToPlaylist(false)}
                trackId={track.id}
            />
        </div>
    );
};

export const TrackCard = React.memo(TrackCardInner);
