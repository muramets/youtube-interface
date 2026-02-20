// =============================================================================
// TRACK ROW: Horizontal row with cover, metadata, waveform, and actions
// =============================================================================

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Play, Pause, Mic, Piano, Sparkles, Copy, Check, BookOpen, Share2 } from 'lucide-react';
import { WaveformCanvas } from '../WaveformCanvas';
import { TrackContextMenu } from './TrackContextMenu';
import { useMusicStore } from '../../../../core/stores/musicStore';
import { selectAllGenres } from '../../../../core/stores/musicStore';
import { useFilterStore } from '../../../../core/stores/filterStore';
import type { Track, MusicTag } from '../../../../core/types/track';
import type { TrackSource } from '../../../../core/types/musicPlaylist';
import { DEFAULT_ACCENT_COLOR, getDefaultVariant } from '../../../../core/utils/trackUtils';

// Section marker regex: matches [Verse 1], [Chorus], (Bridge), or bare "Verse 1:" etc.
const SECTION_RE = /^\s*(?:\[|\()?(verse|chorus|bridge|pre-chorus|intro|outro|hook|interlude|refrain)(?:\s*\d+)?(?:\]|\))?\s*:?\s*$/i;

/** Renders lyrics with section markers styled as mini-headers. */
function formatLyrics(text: string): React.ReactNode {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let blockLines: string[] = [];
    let key = 0;

    const flushBlock = () => {
        if (blockLines.length === 0) return;
        elements.push(
            <p key={key++} className="text-xs text-text-primary whitespace-pre-wrap leading-relaxed">
                {blockLines.join('\n')}
            </p>
        );
        blockLines = [];
    };

    for (const line of lines) {
        if (SECTION_RE.test(line)) {
            flushBlock();
            const label = line.replace(/[\[\]()]/g, '').replace(/:$/, '').trim();
            elements.push(
                <span key={key++} className="block text-[10px] font-semibold uppercase tracking-wider text-indigo-400/80 mt-3 mb-1 first:mt-0">
                    {label}
                </span>
            );
        } else {
            blockLines.push(line);
        }
    }
    flushBlock();
    return <>{elements}</>;
}
import { PortalTooltip } from '../../../../components/ui/atoms/PortalTooltip';
import { Badge } from '../../../../components/ui/atoms/Badge/Badge';
import { formatDuration } from '../../utils/formatDuration';

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
    /** Whether the user can edit tracks (like, settings) */
    canEdit?: boolean;
    /** Whether the user can reorder/link/unlink tracks */
    canReorder?: boolean;
    /** Source library metadata for cross-library playlist adds */
    trackSource?: TrackSource;
    /** Library name shown as a subtle badge in playlist All mode */
    sourceName?: string;
    /** Context-aware tag definitions for resolving track.tags ids */
    availableTags: MusicTag[];
    /** Context-aware featured categories for tag filtering */
    featuredCategories: string[];
}

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
    canEdit,
    canReorder,
    trackSource,
    sourceName,
    availableTags,
    featuredCategories,
}) => {
    // Granular selectors — only subscribe to what this card needs
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const isCurrentTrack = playingTrackId === track.id;
    const draggingTrackId = useMusicStore((s) => s.draggingTrackId);
    const isHidden = draggingTrackId === track.id;

    const playingVariant = useMusicStore((s) => s.playingVariant);
    const isPlaying = useMusicStore((s) => s.isPlaying);
    const genres = useMusicStore(selectAllGenres);
    // Tags and featured categories are context-aware — received from parent

    // Only subscribe to time-sensitive data for the active track
    const currentTime = useMusicStore((s) => isCurrentTrack ? s.currentTime : 0);
    const duration = useMusicStore((s) => isCurrentTrack ? s.duration : 0);
    const seekTo = useMusicStore((s) => isCurrentTrack ? s.seekTo : null);

    // Stable action references — don't subscribe to state changes
    const { setPlayingTrack, setIsPlaying, toggleVariant, setSearchQuery } = useMusicStore.getState();
    const { toggleMusicGenreFilter, toggleMusicTagFilter } = useFilterStore.getState();
    const isCurrentlyPlaying = isCurrentTrack && isPlaying;

    const genreInfo = useMemo(() =>
        genres.find((g) => g.id === track.genre),
        [genres, track.genre]
    );

    const handlePlayPause = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCurrentTrack) {
            setIsPlaying(!isPlaying);
        } else {
            const variant = getDefaultVariant(track);
            setPlayingTrack(track.id, variant);
        }
    }, [isCurrentTrack, isPlaying, track, setIsPlaying, setPlayingTrack]);

    const handleCardClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey) {
            onSelect(isSelected ? null : track.id);
        } else {
            onSelect(null);
        }
    }, [isSelected, track.id, onSelect]);

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

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [tooltipOpen, setTooltipOpen] = useState(false);

    const cardRef = useRef<HTMLDivElement | null>(null);

    const hasBothVariants = !!track.vocalUrl && !!track.instrumentalUrl;

    const currentVariant = isCurrentTrack ? playingVariant : getDefaultVariant(track);
    const currentPeaks = currentVariant === 'vocal' ? track.vocalPeaks : track.instrumentalPeaks;
    const currentUrl = currentVariant === 'vocal' ? track.vocalUrl : track.instrumentalUrl;
    const accentColor = genreInfo?.color || DEFAULT_ACCENT_COLOR;

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
            const variant = getDefaultVariant(track);
            const seekSeconds = position * track.duration;
            setPlayingTrack(track.id, variant, seekSeconds);
        }
    }, [isCurrentTrack, seekTo, isPlaying, setIsPlaying, setPlayingTrack, track]);

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



    // Merge drag ref + drop ref + card ref
    const mergedRef = useCallback((node: HTMLDivElement | null) => {
        setDragRef(node);
        setDropRef(node);
        (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }, [setDragRef, setDropRef]);

    // When this card is being dragged, render a lightweight placeholder
    // to prevent ResizeObserver from remeasuring the virtualizer row
    if (isHidden) {
        return (
            <div
                ref={mergedRef}
                className="px-4 py-4"
            >
                <div className="h-14" />
            </div>
        );
    }

    return (
        <div
            ref={mergedRef}
            {...listeners}
            {...attributes}
            onClick={handleCardClick}

            className={`group flex items-center gap-4 px-4 py-4 rounded-lg transition-all duration-300 cursor-pointer relative select-none
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
            <div className="min-w-0 w-[220px] flex-shrink-0">
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
                {/* Source library badge — shown in playlist All mode for shared tracks */}
                {sourceName && (
                    <Badge variant="info" className="mt-0.5 opacity-50" maxWidth="140px">
                        <Share2 size={8} />
                        {sourceName}
                    </Badge>
                )}
            </div>

            {/* Version badge (if passed from TrackGroupCard) */}
            {trailingElement}

            {/* 2.5 Variant toggle — fixed-width slot so waveform position is consistent */}
            <div className="w-[58px] flex-shrink-0 flex items-center justify-center">
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
            </div>

            {/* 3. Waveform */}
            <div className="flex-1 min-w-0 max-w-[280px] group/waveform">
                <div className="transition-[filter] duration-150 group-hover/waveform:brightness-125">
                    <WaveformCanvas
                        peaks={currentPeaks}
                        audioUrl={currentUrl}
                        progress={waveformProgress}
                        height={40}
                        playedColor={accentColor}
                        onSeek={handleWaveformSeek}
                        compact
                    />
                </div>
            </div>

            {/* 4. Duration / BPM */}
            <div className="flex flex-col items-end flex-shrink-0 min-w-[44px]">
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
            <div className="w-[72px] flex-shrink-0 flex items-center justify-center ml-3">
                {genreInfo && (
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleMusicGenreFilter(genreInfo.id); }}
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
            <div className="flex-1 min-w-0 max-w-[200px] line-clamp-2 text-[10px] text-text-tertiary leading-relaxed ml-3">
                {track.tags
                    .map(tagId => availableTags.find(t => t.id === tagId))
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
                                onClick={(e) => { e.stopPropagation(); toggleMusicTagFilter(tagDef.id); }}
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
                        maxWidth={480}
                        enterDelay={350}
                        onOpenChange={setTooltipOpen}
                        content={
                            <div className="flex flex-col min-w-[280px]">
                                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/5">
                                    <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Prompt</span>
                                    <button
                                        onClick={handleCopyPrompt}
                                        className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-text-primary transition-colors"
                                    >
                                        {copied ? <Check size={10} /> : <Copy size={10} />}
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <p className="text-xs text-text-primary whitespace-pre-wrap leading-relaxed">{track.prompt}</p>
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
                            <div className="flex flex-col min-w-[280px]">
                                {/* Sticky header with copy action */}
                                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/5">
                                    <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Lyrics</span>
                                    <button
                                        onClick={handleCopyLyrics}
                                        className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-text-primary transition-colors"
                                    >
                                        {lyricsCopied ? <Check size={10} /> : <Copy size={10} />}
                                        {lyricsCopied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                {/* Lyrics text with styled section headers */}
                                {formatLyrics(track.lyrics)}
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

                <TrackContextMenu
                    track={track}
                    userId={userId}
                    channelId={channelId}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    cardRef={cardRef}
                    onDropdownChange={setDropdownOpen}
                    canEdit={canEdit}
                    canReorder={canReorder}
                    trackSource={trackSource}
                />
            </div>
        </div>
    );
};

export const TrackCard = React.memo(TrackCardInner);
