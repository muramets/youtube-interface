// =============================================================================
// TRACK ROW: Horizontal row with cover, metadata, waveform, and actions
// =============================================================================

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Play, Pause, Mic, Piano, Sparkles, Copy, Check, BookOpen } from 'lucide-react';
import { WaveformCanvas } from './WaveformCanvas';
import { TrackContextMenu } from './TrackContextMenu';
import { useMusicStore } from '../../../core/stores/musicStore';
import type { Track } from '../../../core/types/track';
import { DEFAULT_ACCENT_COLOR, getDefaultVariant } from '../../../core/utils/trackUtils';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';

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

    // Only subscribe to time-sensitive data for the active track
    const currentTime = useMusicStore((s) => isCurrentTrack ? s.currentTime : 0);
    const duration = useMusicStore((s) => isCurrentTrack ? s.duration : 0);
    const seekTo = useMusicStore((s) => isCurrentTrack ? s.seekTo : null);

    // Stable action references — don't subscribe to state changes
    const { setPlayingTrack, setIsPlaying, toggleVariant, setGenreFilter, toggleTagFilter, setSearchQuery } = useMusicStore.getState();
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
            const variant = getDefaultVariant(track);
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
            onClick={(e) => { e.stopPropagation(); if (e.metaKey || e.ctrlKey) { onSelect(isSelected ? null : track.id); } else { onSelect(null); } }}

            className={`group flex items-center gap-4 px-4 py-4 rounded-lg transition-all duration-300 cursor-pointer relative
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
            <div className="w-[72px] flex-shrink-0 flex items-center justify-center ml-3">
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
            <div className="flex-1 min-w-0 max-w-[200px] line-clamp-2 text-[10px] text-text-tertiary leading-relaxed ml-3">
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

                <TrackContextMenu
                    track={track}
                    userId={userId}
                    channelId={channelId}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    cardRef={cardRef}
                    onDropdownChange={setDropdownOpen}
                />
            </div>
        </div>
    );
};

export const TrackCard = React.memo(TrackCardInner);
