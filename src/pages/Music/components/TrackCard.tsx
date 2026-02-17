// =============================================================================
// TRACK ROW: Horizontal row with cover, metadata, waveform, and actions
// =============================================================================

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Play, Pause, Mic, Piano, Sparkles, Copy, Check, Heart, Download, BookOpen, MoreHorizontal, Trash2, Settings, ListMusic, Link, Unlink } from 'lucide-react';
import { WaveformCanvas } from './WaveformCanvas';
import { useMusicStore } from '../../../core/stores/musicStore';
import type { Track } from '../../../core/types/track';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../../components/ui/molecules/DropdownMenu';
import { ConfirmationModal } from '../../../components/ui/organisms/ConfirmationModal';
import { AddToMusicPlaylistModal } from '../modals/AddToMusicPlaylistModal';
import { LinkVersionModal } from '../modals/LinkVersionModal';

interface TrackCardProps {
    track: Track;
    isSelected: boolean;
    userId: string;
    channelId: string;
    onSelect: (trackId: string | null) => void;
    onDelete?: (trackId: string) => void;
    onEdit?: (track: Track) => void;
    trailingElement?: React.ReactNode;
    disableDropTarget?: boolean;
    disableDrag?: boolean;
    /** Colored left stripe for sibling tracks without parent in playlist */
    siblingColor?: string;
    /** Position within sibling group for connected stripe rendering */
    siblingPosition?: 'first' | 'middle' | 'last';
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
    trailingElement,
    disableDropTarget,
    disableDrag,
    siblingColor,
    siblingPosition,
}) => {
    // Granular selectors — only subscribe to what this card needs
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const isCurrentTrack = playingTrackId === track.id;
    const draggingTrackId = useMusicStore((s) => s.draggingTrackId);
    const isHidden = draggingTrackId === track.id;

    const playingVariant = useMusicStore((s) => s.playingVariant);
    const isPlaying = useMusicStore((s) => s.isPlaying);
    const genres = useMusicStore((s) => s.genres);
    const allTags = useMusicStore((s) => s.tags);
    const featuredCategories = useMusicStore((s) => s.featuredCategories);
    const activePlaylistId = useMusicStore((s) => s.activePlaylistId);

    // Only subscribe to time-sensitive data for the active track
    const currentTime = useMusicStore((s) => isCurrentTrack ? s.currentTime : 0);
    const duration = useMusicStore((s) => isCurrentTrack ? s.duration : 0);
    const seekTo = useMusicStore((s) => isCurrentTrack ? s.seekTo : null);

    // Stable action references — don't subscribe to state changes
    const { setPlayingTrack, setIsPlaying, toggleLike, toggleVariant, setGenreFilter, toggleTagFilter, setSearchQuery, unlinkFromGroup } = useMusicStore.getState();
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
    const [showLinkVersion, setShowLinkVersion] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [tooltipOpen, setTooltipOpen] = useState(false);
    const [downloadVisible, setDownloadVisible] = useState(true);

    const cardRef = useRef<HTMLDivElement>(null);
    const overflowRef = useRef<HTMLDivElement>(null);
    const neededWidthRef = useRef<number>(0);

    const hasVocal = !!track.vocalUrl;
    const hasInstrumental = !!track.instrumentalUrl;
    const hasBothVariants = hasVocal && hasInstrumental;

    const downloadBaseName = useMemo(() => {
        const artist = track.artist?.trim();
        return artist ? `${artist} - ${track.title}` : track.title;
    }, [track.artist, track.title]);

    const handleDownload = useCallback(async (url?: string, suffix?: string) => {
        if (!url) return;
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${downloadBaseName}${suffix ? ` ${suffix}` : ''}.mp3`;
            a.click();
            // Clean up blob URL after a short delay
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (err) {
            console.error('[TrackCard] Download failed, falling back to direct link:', err);
            // Fallback: open in new tab
            window.open(url, '_blank');
        }
    }, [downloadBaseName]);

    const handleDownloadBoth = useCallback(() => {
        handleDownload(track.vocalUrl);
        setTimeout(() => handleDownload(track.instrumentalUrl, '(instr)'), 300);
    }, [handleDownload, track.vocalUrl, track.instrumentalUrl]);

    const currentVariant = isCurrentTrack ? playingVariant : (track.vocalUrl ? 'vocal' : 'instrumental');
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
            // Start playing this track and seek to position once audio loads
            // position is ratio 0–1, convert to seconds for pendingSeekPosition
            const variant = track.vocalUrl ? 'vocal' : 'instrumental';
            const seekSeconds = position * track.duration;
            setPlayingTrack(track.id, variant, seekSeconds);
        }
    }, [isCurrentTrack, seekTo, isPlaying, setIsPlaying, setPlayingTrack, track.id, track.vocalUrl, track.duration]);

    // DnD: Make track draggable
    const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
        id: `track-${track.id}`,
        data: { type: 'music-track', track },
        disabled: disableDrag,
    });

    // DnD: Make track a drop target for grouping
    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: `track-drop-${track.id}`,
        data: { type: 'music-track-target', trackId: track.id, groupId: track.groupId },
        disabled: disableDropTarget,
    });

    // Detect whether like+download buttons overflow the card
    useEffect(() => {
        const card = cardRef.current;
        if (!card) return;

        const check = () => {
            const overflows = card.scrollWidth > card.clientWidth + 1;
            if (overflows) {
                // Store the full width needed (including buttons) so we know
                // when the card is wide enough to show them again
                neededWidthRef.current = card.scrollWidth;
                setDownloadVisible(false);
            } else if (neededWidthRef.current > 0) {
                // Buttons are hidden — show them if card is now wide enough
                if (card.clientWidth >= neededWidthRef.current) {
                    neededWidthRef.current = 0;
                    setDownloadVisible(true);
                }
            }
        };

        const observer = new ResizeObserver(check);
        observer.observe(card);
        check();
        return () => observer.disconnect();
    }, []);

    // Merge drag ref + drop ref + card ref
    const mergedRef = useCallback((node: HTMLDivElement | null) => {
        setDragRef(node);
        setDropRef(node);
        (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }, [setDragRef, setDropRef]);

    return (
        <div
            ref={mergedRef}
            {...listeners}
            {...attributes}
            onClick={(e) => { e.stopPropagation(); if (e.metaKey || e.ctrlKey) { onSelect(isSelected ? null : track.id); } else { onSelect(null); } }}

            className={`group flex items-center gap-4 px-4 py-4 rounded-lg transition-all duration-300 cursor-pointer relative
                ${isHidden ? 'opacity-0' : ''}
                ${isOver && !isDragging ? 'ring-2 ring-indigo-400/50 bg-indigo-500/[0.06]' : ''}
                ${isCurrentTrack
                    ? 'bg-white/[0.06] hover:bg-white/[0.09]'
                    : (dropdownOpen || tooltipOpen)
                        ? 'bg-white/[0.04]'
                        : isSelected
                            ? 'bg-white/[0.03] ring-1 ring-white/10 hover:bg-white/[0.06]'
                            : 'hover:bg-white/[0.04]'
                }`}
        >
            {/* Sibling color stripe — connected line between siblings from same group */}
            {siblingColor && (
                <div
                    className="absolute left-0 w-[3px]"
                    style={{
                        backgroundColor: siblingColor,
                        top: siblingPosition === 'first' ? 8 : 0,
                        bottom: siblingPosition === 'last' ? 8 : 0,
                        borderRadius:
                            siblingPosition === 'first' ? '3px 3px 0 0'
                                : siblingPosition === 'last' ? '0 0 3px 3px'
                                    : 0,
                    }}
                />
            )}
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

            {/* Version badge (if passed from TrackGroupCard) */}
            {trailingElement}

            {/* 2.5 Variant toggle */}
            {hasBothVariants && (
                <PortalTooltip
                    content={currentVariant === 'vocal' ? 'Switch to instrumental' : 'Switch to vocal'}
                    triggerClassName="!block"
                    enterDelay={300}
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
                        className={`p-1.5 rounded-lg text-xs flex items-center gap-1 flex-shrink-0 transition-all duration-300
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
            <div className="flex flex-col items-end flex-shrink-0">
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
            <div className="w-[72px] flex-shrink-0 flex items-center justify-center">
                {genreInfo && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setGenreFilter(genreInfo.id); }}
                        className="text-[10px] font-medium truncate max-w-full transition-colors cursor-pointer text-text-tertiary hover:brightness-125"
                        style={{ '--genre-color': genreInfo.color } as React.CSSProperties}
                        onMouseEnter={(e) => (e.currentTarget.style.color = genreInfo.color)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                    >
                        {genreInfo.name}
                    </button>
                )}
            </div>

            {/* 6. Tags */}
            <div className="flex-1 min-w-0 max-w-[200px] line-clamp-2 text-[10px] text-text-tertiary leading-relaxed">
                {track.tags
                    .map(tagId => allTags.find(t => t.id === tagId))
                    .filter((tagDef): tagDef is NonNullable<typeof tagDef> => {
                        if (!tagDef) return false;
                        if (featuredCategories.length === 0) return true;
                        return featuredCategories.includes(tagDef.category || 'Uncategorized');
                    })
                    .map((tagDef, i, visible) => (
                        <span key={tagDef.id}>
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); toggleTagFilter(tagDef.id); }}
                                className="text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
                            >
                                {tagDef.name}
                            </span>
                            {i < visible.length - 1 && <span className="text-text-tertiary/50">,{' '}</span>}
                        </span>
                    ))
                }
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

                {/* Like + Download (visible when they fit) */}
                {downloadVisible && (
                    <div ref={overflowRef} className="flex items-center gap-0.5">
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
                                        <DropdownMenuItem onClick={() => handleDownload(track.vocalUrl)}>
                                            <Mic size={14} className="mr-2" /> Vocal
                                        </DropdownMenuItem>
                                    )}
                                    {hasInstrumental && (
                                        <DropdownMenuItem onClick={() => handleDownload(track.instrumentalUrl, '(instr)')}>
                                            <Piano size={14} className="mr-2" /> Instrumental
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={handleDownloadBoth}>
                                        <Download size={14} className="mr-2" /> Both
                                    </DropdownMenuItem>
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
                    </div>
                )}


                {/* More menu (hidden when no items to show) */}
                {(onEdit || onDelete || !downloadVisible) && (
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
                            {onEdit && (
                                <>
                                    <DropdownMenuItem onClick={() => setShowAddToPlaylist(true)}>
                                        <ListMusic size={14} className="mr-2" />
                                        {activePlaylistId && activePlaylistId !== 'liked' ? 'Manage Playlists' : 'Add to Playlist'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setShowLinkVersion(true)}>
                                        <Link size={14} className="mr-2" /> Link as Version
                                    </DropdownMenuItem>
                                    {track.groupId && (
                                        <DropdownMenuItem onClick={() => unlinkFromGroup(userId, channelId, track.id)}>
                                            <Unlink size={14} className="mr-2" /> Unlink from Group
                                        </DropdownMenuItem>
                                    )}
                                </>
                            )}
                            {!downloadVisible && (
                                <>
                                    {onEdit && <DropdownMenuSeparator />}
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleLike(userId, channelId, track.id); }}>
                                        <Heart size={14} className="mr-2" fill={track.liked ? 'currentColor' : 'none'} />
                                        {track.liked ? 'Unlike' : 'Like'}
                                    </DropdownMenuItem>
                                    {hasBothVariants ? (
                                        <>
                                            <DropdownMenuItem onClick={() => handleDownload(track.vocalUrl)}>
                                                <Download size={14} className="mr-2" /> Download Vocal
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleDownload(track.instrumentalUrl, '(instr)')}>
                                                <Download size={14} className="mr-2" /> Download Instrumental
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={handleDownloadBoth}>
                                                <Download size={14} className="mr-2" /> Download Both
                                            </DropdownMenuItem>
                                        </>
                                    ) : (
                                        <DropdownMenuItem onClick={() => handleDownload(track.vocalUrl || track.instrumentalUrl)}>
                                            <Download size={14} className="mr-2" /> Download
                                        </DropdownMenuItem>
                                    )}
                                </>
                            )}
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
                )}
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
            {/* Link Version */}
            <LinkVersionModal
                isOpen={showLinkVersion}
                onClose={() => setShowLinkVersion(false)}
                sourceTrackId={track.id}
            />
        </div>
    );
};

export const TrackCard = React.memo(TrackCardInner);
