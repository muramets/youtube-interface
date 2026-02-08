import React, { useRef, useState, useCallback } from 'react';
import {
    ExternalLink, Info, Sparkles, Flag, CircleOff, Layers, Target,
    MousePointerClick, HelpCircle, Wand2, ZapOff, Zap, Compass, Eye, Coffee, User, Play, MessageSquare,
    Star, ThumbsUp, ThumbsDown
} from 'lucide-react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { TrafficType } from '../../../../../core/types/videoTrafficType';
import type { ViewerType } from '../../../../../core/types/viewerType';
import type { VideoReaction } from '../../../../../core/types/videoReaction';
import { Checkbox } from '../../../../../components/ui/atoms/Checkbox/Checkbox';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';
import { VideoPreviewTooltip } from '../../../../../features/Video/components/VideoPreviewTooltip';
import { formatDuration } from '../utils/formatters';
import type { CTRRule } from '../../../../../core/services/settingsService';
import { useTrafficNicheStore } from '../../../../../core/stores/useTrafficNicheStore';
import { useTrafficNoteStore } from '../../../../../core/stores/useTrafficNoteStore';
import { TrafficRowBadges } from './TrafficRowBadges';
import { useVideoPlayer } from '../../../../../core/hooks/useVideoPlayer';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import type { SuggestedTrafficNiche } from '../../../../../core/types/suggestedTrafficNiches';

import type { VideoDetails } from '../../../../../core/utils/youtubeApi';

interface TrafficRowProps {
    item: TrafficSource;
    index: number;
    isSelected: boolean;
    activeSortKey?: string;
    onRowClick: (id: string, index: number, e: React.MouseEvent) => void;
    ctrRules?: CTRRule[];
    gridClassName: string;
    showPropertyIcon: boolean;
    videoDetails?: VideoDetails;
    onToggleSelection?: (id: string) => void;
    // Smart Assistant Props
    suggestedNiche?: SuggestedTrafficNiche;
    isTrendsSuggestion?: boolean;
    onConfirmSuggestion?: (videoId: string, niche: SuggestedTrafficNiche) => void;
    // Traffic Type Props
    trafficType?: TrafficType;
    trafficSource?: 'manual' | 'smart_assistant';
    onToggleTrafficType?: (videoId: string, currentType?: TrafficType) => void;
    // Viewer Type Props
    viewerType?: ViewerType;
    viewerSource?: 'manual' | 'smart_assistant';
    onToggleViewerType?: (videoId: string, currentType?: ViewerType) => void;
    // Tooltip Control
    activeTooltipId?: string | null;
    onTooltipEnter?: (id: string) => void;
    onTooltipLeave?: () => void;
    currentVideo?: VideoDetails;
    // Video Reactions (star/like/dislike)
    reaction?: VideoReaction;
    onToggleReaction?: (videoId: string, reaction: VideoReaction) => void;
}

const getCtrColor = (ctr: number | string, rules: CTRRule[]): string | undefined => {
    const val = typeof ctr === 'string' ? parseFloat(ctr) : ctr;
    if (isNaN(val)) return undefined;

    // Rules are user-defined and ordered via drag-and-drop in the CTR Config UI.
    // We apply "first match wins" logic: iterate through rules in order,
    // and return the color of the first rule that matches the CTR value.
    for (const rule of rules) {
        switch (rule.operator) {
            case '<': if (val < rule.value) return rule.color; break;
            case '>': if (val > rule.value) return rule.color; break;
            case '<=': if (val <= rule.value) return rule.color; break;
            case '>=': if (val >= rule.value) return rule.color; break;
            case 'between':
                if (rule.maxValue !== undefined && val >= rule.value && val <= rule.maxValue) return rule.color;
                break;
        }
    }
    return undefined;
};


export const TrafficRow = ({
    item,
    index,
    isSelected,
    activeSortKey,
    onRowClick,
    onToggleSelection,
    ctrRules = [],
    gridClassName,
    showPropertyIcon,
    videoDetails,
    suggestedNiche,
    isTrendsSuggestion = false,
    onConfirmSuggestion,
    trafficType,
    trafficSource,
    onToggleTrafficType,
    viewerType,
    viewerSource,
    onToggleViewerType,
    activeTooltipId,
    onTooltipEnter,
    onTooltipLeave,
    currentVideo,
    reaction,
    onToggleReaction
}: TrafficRowProps) => {
    // Connect to Niche Store
    const { niches, assignments } = useTrafficNicheStore();
    const enterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [isThumbLoaded, setIsThumbLoaded] = useState(false);
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [editNoteText, setEditNoteText] = useState('');
    const noteInputRef = useRef<HTMLInputElement>(null);

    // Connect to Video Player
    const { minimize, activeVideoId, isMinimized } = useVideoPlayer();
    const isNowPlaying = isMinimized && activeVideoId === item.videoId;

    // Traffic Notes
    const { getNoteForVideo, setNote, deleteNote } = useTrafficNoteStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const noteText = item.videoId ? getNoteForVideo(item.videoId) : undefined;


    const handleStartEditNote = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item.videoId) return;
        setEditNoteText(noteText || '');
        setIsEditingNote(true);
        // Focus will be set by autoFocus on the input
    }, [item.videoId, noteText]);

    const handleSaveNote = useCallback(() => {
        if (!item.videoId || !user?.uid || !currentChannel?.id) return;
        const trimmed = editNoteText.trim();
        if (trimmed) {
            setNote(item.videoId, trimmed, user.uid, currentChannel.id);
        } else if (noteText) {
            // Had a note, now empty → delete
            deleteNote(item.videoId, user.uid, currentChannel.id);
        }
        setIsEditingNote(false);
    }, [item.videoId, editNoteText, noteText, user, currentChannel, setNote, deleteNote]);

    const handleCancelNote = useCallback(() => {
        setIsEditingNote(false);
        setEditNoteText('');
    }, []);

    // Traffic Type Icon Logic
    const { icon: TypeIcon, label: typeLabel, color: typeColor, activeClass: typeActiveClass } = React.useMemo(() => {
        if (trafficType === 'autoplay') {
            return {
                icon: Sparkles,
                label: 'Suggested (Autoplay)',
                color: 'text-purple-400',
                activeClass: 'opacity-100'
            };
        }
        if (trafficType === 'user_click') {
            return {
                icon: MousePointerClick,
                label: 'User Intent (Click)',
                color: 'text-emerald-400',
                activeClass: 'opacity-100'
            };
        }
        return {
            icon: HelpCircle,
            label: 'Set Traffic Type',
            color: 'text-white/20',
            activeClass: 'opacity-0 group-hover:opacity-100' // Only show on hover if unset
        };
    }, [trafficType]);

    // Viewer Type Icon Logic
    const { icon: ViewerIcon, label: viewerLabel, color: viewerColor, activeClass: viewerActiveClass } = React.useMemo(() => {
        switch (viewerType) {
            case 'bouncer':
                return { icon: ZapOff, label: 'Bouncer: < 1% Watch Duration', color: 'text-red-400', activeClass: 'opacity-100' };
            case 'trialist':
                return { icon: Zap, label: 'Trialist: 1.1% – 10% Watch Duration', color: 'text-orange-400', activeClass: 'opacity-100' };
            case 'explorer':
                return { icon: Compass, label: 'Explorer: 10.1% – 30% Watch Duration', color: 'text-amber-400', activeClass: 'opacity-100' };
            case 'interested':
                return { icon: Eye, label: 'Interested: 30.1% – 60% Watch Duration', color: 'text-blue-400', activeClass: 'opacity-100' };
            case 'core':
                return { icon: Target, label: 'Core Audience: 60.1% – 95% Watch Duration', color: 'text-emerald-400', activeClass: 'opacity-100' };
            case 'passive':
                return { icon: Coffee, label: 'Passive: > 95% Watch Duration', color: 'text-purple-400', activeClass: 'opacity-100' };
            default:
                return {
                    icon: User,
                    label: 'Set Viewer Type',
                    color: 'text-white/20',
                    activeClass: 'opacity-0 group-hover:opacity-100'
                };
        }
    }, [viewerType]);

    // Handle Type Click
    const handleTypeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item.videoId || !onToggleTrafficType) return;
        onToggleTrafficType(item.videoId, trafficType);
    };

    // Handle Viewer Click
    const handleViewerClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item.videoId || !onToggleViewerType) return;
        onToggleViewerType(item.videoId, viewerType);
    };

    // Derived state: find niches assigned to this video
    const assignedNiches = React.useMemo(() => {
        if (!item.videoId) return [];
        const myAssignmentIds = assignments
            .filter(a => a.videoId === item.videoId)
            .map(a => a.nicheId);
        return niches.filter(n => myAssignmentIds.includes(n.id));
    }, [item.videoId, assignments, niches]);

    // Determine property icon based on priority: Desired > Targeted > Unrelated
    const { icon: PropertyIcon, label: propertyLabel } = React.useMemo(() => {
        if (!assignedNiches.length) return { icon: null, label: '' };

        const hasProperty = (p: string) => assignedNiches.some(n => n.property === p);

        if (hasProperty('desired')) return { icon: <Flag size={12} className="text-emerald-400" />, label: 'Desired' };
        if (hasProperty('targeted')) return { icon: <Target size={12} className="text-yellow-400" />, label: 'Targeted' };
        if (hasProperty('adjacent')) return { icon: <Layers size={12} className="text-blue-400" />, label: 'Adjacent' };
        if (hasProperty('unrelated')) return { icon: <CircleOff size={12} className="text-red-400" />, label: 'Unrelated' };

        return { icon: null, label: '' };
    }, [assignedNiches]);

    // BUSINESS RULE: Star icon color derives from assigned niche property
    // Priority: desired (emerald) > targeted (yellow) > adjacent (blue) > unrelated (red) > default (amber)
    const starColor = React.useMemo(() => {
        if (reaction !== 'star') return 'text-white/20'; // inactive ghost
        if (!assignedNiches.length) return 'text-amber-400'; // no niche → default amber

        const hasProperty = (p: string) => assignedNiches.some(n => n.property === p);
        if (hasProperty('desired')) return 'text-emerald-400';
        if (hasProperty('targeted')) return 'text-yellow-400';
        if (hasProperty('adjacent')) return 'text-blue-400';
        if (hasProperty('unrelated')) return 'text-red-400';

        return 'text-amber-400';
    }, [reaction, assignedNiches]);

    // Reaction click handler — toggle on/off or switch reaction
    const handleReactionClick = useCallback((e: React.MouseEvent, type: VideoReaction) => {
        e.stopPropagation();
        if (!item.videoId || !onToggleReaction) return;
        onToggleReaction(item.videoId, type);
    }, [item.videoId, onToggleReaction]);



    return (
        <div
            key={item.videoId || index}
            onClick={(e) => item.videoId && onRowClick(item.videoId, index, e)}
            className={`
                relative h-full grid ${gridClassName} gap-2 px-4 items-center border-b border-white/5 
                text-xs cursor-pointer group select-none
                ${index % 2 === 0 ? 'bg-white/[0.035]' : 'bg-transparent'}  
                hover:bg-white/[0.05]
            `}
        >
            {/* Selection indicator line - Absolute to avoid clipping */}
            {isSelected && (
                <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#3EA6FF] z-10 shadow-[2px_0_8px_rgba(62,166,255,0.4)]" />
            )}
            <div
                className="flex items-center justify-center p-2 -m-2 z-10" // Expanded hit area + z-index
                onClick={(e) => e.stopPropagation()}
            >
                <Checkbox
                    checked={isSelected}
                    onChange={() => item.videoId && onToggleSelection?.(item.videoId)}
                />
            </div>

            {/* Video Thumbnail */}
            <div className="flex items-center justify-center py-1.5">
                {videoDetails?.thumbnail ? (
                    <div className={`relative w-full overflow-hidden rounded-md ${isNowPlaying ? 'ring-1 ring-emerald-400/60' : ''}`} style={{ aspectRatio: '16/9' }}>
                        {/* Pulse placeholder — starts animating instantly, no compositor delay */}
                        <div className="absolute inset-0 bg-white/5 animate-pulse rounded-md" />
                        <img
                            src={videoDetails.thumbnail}
                            alt=""
                            loading="lazy"
                            onLoad={() => setIsThumbLoaded(true)}
                            className={`absolute inset-0 w-full h-full object-cover group-hover:scale-105 group-hover:brightness-110 group-hover:shadow-lg group-hover:shadow-white/10 ${isThumbLoaded ? 'opacity-100' : 'opacity-0'}`}
                            style={{ transition: 'opacity 500ms ease-out, transform 200ms ease-out, filter 200ms ease-out, box-shadow 200ms ease-out' }}
                        />
                        {/* Play button overlay — visible on row hover, hidden when already playing */}
                        {!isNowPlaying && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.videoId) minimize(item.videoId, videoDetails?.title || item.sourceTitle);
                                }}
                                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer bg-transparent border-none z-10"
                            >
                                <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-lg transition-transform duration-150 ease-out hover:scale-110">
                                    <Play size={12} className="text-white fill-white ml-[1px]" />
                                </div>
                            </button>
                        )}
                        {/* Now Playing indicator */}
                        {isNowPlaying && (
                            <div className="absolute bottom-0.5 left-0.5 flex items-center gap-1 px-1 py-px rounded bg-emerald-500/80 z-20">
                                <div className="flex items-end gap-px h-[8px]">
                                    <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_infinite]" style={{ height: '4px' }} />
                                    <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_0.2s_infinite]" style={{ height: '7px' }} />
                                    <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_0.4s_infinite]" style={{ height: '5px' }} />
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="w-full h-full rounded-md bg-white/5 transition-all duration-200 ease-out group-hover:bg-white/10 group-hover:shadow-lg group-hover:shadow-white/5"
                        style={{ aspectRatio: '16/9' }} />
                )}
            </div>

            {showPropertyIcon && (
                <div className="flex items-center justify-center">
                    {PropertyIcon && (
                        <PortalTooltip content={propertyLabel} enterDelay={300}>
                            <div className="flex items-center justify-center cursor-help">
                                {PropertyIcon}
                            </div>
                        </PortalTooltip>
                    )}
                </div>
            )}

            <div className="min-w-0 flex items-center gap-2 h-full py-1">
                {isEditingNote ? (
                    /* Inline Note Editor */
                    <input
                        ref={noteInputRef}
                        type="text"
                        value={editNoteText}
                        onChange={(e) => setEditNoteText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleSaveNote(); }
                            if (e.key === 'Escape') { e.preventDefault(); handleCancelNote(); }
                        }}
                        onBlur={handleSaveNote}
                        autoFocus
                        placeholder="Add a note..."
                        className="w-full bg-transparent border-none outline-none text-xs text-text-primary placeholder:text-white/20 py-0.5 caret-blue-400"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <>
                        {/* Left: Title + Note subtitle (stacked) */}
                        <div className="min-w-0 flex-1 flex flex-col justify-center">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`truncate block ${activeSortKey === 'sourceTitle' ? 'text-text-primary font-semibold' : 'text-text-primary font-medium'}`}>
                                    {item.sourceTitle}
                                </span>

                                {/* Note Icon — before Info, same visual weight (14px) */}
                                {item.videoId && (
                                    <button
                                        onClick={handleStartEditNote}
                                        className={`flex-shrink-0 transition-all duration-150 cursor-pointer bg-transparent border-none p-0 ${noteText ? 'opacity-50 hover:opacity-100' : 'opacity-0 group-hover:opacity-30 hover:!opacity-60'}`}
                                        title={noteText ? 'Edit note' : 'Add note'}
                                    >
                                        <MessageSquare size={14} className={noteText ? 'text-blue-400' : 'text-text-secondary'} />
                                    </button>
                                )}

                                {/* Info Icon - visible on group hover (always available, even when mini player is active) */}
                                {item.videoId && (
                                    <div
                                        ref={wrapperRef}
                                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity inline-flex -m-2 p-2"
                                        onMouseEnter={() => {
                                            if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
                                            enterTimeoutRef.current = setTimeout(() => {
                                                if (onTooltipEnter) onTooltipEnter(`preview-${item.videoId}`);
                                            }, 500);
                                        }}
                                        onMouseLeave={() => {
                                            if (enterTimeoutRef.current) {
                                                clearTimeout(enterTimeoutRef.current);
                                                enterTimeoutRef.current = null;
                                            }
                                            if (onTooltipLeave) onTooltipLeave();
                                        }}
                                    >
                                        <PortalTooltip
                                            content={
                                                <div
                                                    className="pointer-events-auto w-full relative"
                                                    onMouseEnter={() => {
                                                        if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
                                                        if (onTooltipEnter) onTooltipEnter(`preview-${item.videoId}`);
                                                    }}
                                                    onMouseLeave={(e: React.MouseEvent) => {
                                                        if (wrapperRef.current && wrapperRef.current.contains(e.relatedTarget as Node)) {
                                                            return;
                                                        }
                                                        if (onTooltipLeave) onTooltipLeave();
                                                    }}
                                                >
                                                    <VideoPreviewTooltip
                                                        videoId={item.videoId}
                                                        title={videoDetails?.title || item.sourceTitle}
                                                        channelTitle={videoDetails?.channelTitle || item.channelTitle}
                                                        viewCount={videoDetails?.viewCount ? parseInt(videoDetails.viewCount) : undefined}
                                                        publishedAt={videoDetails?.publishedAt}
                                                        description={videoDetails?.description}
                                                        tags={videoDetails?.tags}
                                                        className="w-full"
                                                        comparisonVideo={currentVideo}
                                                    />
                                                </div>
                                            }
                                            enterDelay={0}
                                            triggerClassName="flex items-center justify-center"
                                            variant="glass"
                                            side="top"
                                            align="center"
                                            sizeMode="fixed"
                                            className="!p-0"
                                            forceOpen={activeTooltipId === `preview-${item.videoId}`}
                                        >
                                            <div
                                                className="text-text-secondary hover:text-white cursor-pointer transition-colors"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Info size={14} />
                                            </div>
                                        </PortalTooltip>
                                    </div>
                                )}
                            </div>

                            {/* Note subtitle — shown when note exists, below title row */}
                            {noteText && (
                                <button
                                    onClick={handleStartEditNote}
                                    className="truncate text-xs text-white/30 italic mt-0.5 cursor-pointer bg-transparent border-none p-0 text-left max-w-fit hover:text-white/50 transition-colors"
                                >
                                    {noteText}
                                </button>
                            )}
                        </div>

                        {/* Right: Badges + Actions (vertically centered) */}
                        <TrafficRowBadges
                            niches={assignedNiches}
                            suggested={suggestedNiche}
                            isTrendsSuggestion={isTrendsSuggestion}
                            onConfirmSuggestion={(niche) => item.videoId && onConfirmSuggestion?.(item.videoId, niche)}
                        />

                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            {item.videoId && (
                                <a
                                    href={`https://youtu.be/${item.videoId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 -m-1.5 text-text-secondary hover:text-white transition-colors flex items-center justify-center"
                                >
                                    <ExternalLink size={14} />
                                </a>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Traffic Type Indicator */}
            {onToggleTrafficType && (
                <div className="flex items-center justify-center">
                    <PortalTooltip
                        content={typeLabel}
                        enterDelay={300}
                        side="top"
                        className="!px-2.5 !py-1 !border-none !shadow-xl !bg-[#1F1F1F]"
                    >
                        <button
                            onClick={handleTypeClick}
                            className={`
                                p-1.5 rounded-full transition-transform duration-200
                                hover:bg-white/10 active:scale-95
                                ${typeColor} ${typeActiveClass}
                            `}
                        >
                            <div className="relative">
                                <TypeIcon size={14} className={trafficType === 'autoplay' ? 'animate-pulse' : ''} />
                                {trafficSource === 'smart_assistant' && (
                                    <div className="absolute -bottom-1 -right-1">
                                        <Wand2 className="w-2.5 h-2.5 text-blue-500 fill-blue-500 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                                    </div>
                                )}
                            </div>
                        </button>
                    </PortalTooltip>
                </div>
            )}

            {/* Viewer Type Indicator */}
            {onToggleViewerType && (
                <div className="flex items-center justify-center">
                    <PortalTooltip
                        content={viewerLabel}
                        enterDelay={300}
                        side="top"
                        className="!px-2.5 !py-1 !border-none !shadow-xl !bg-[#1F1F1F]"
                    >
                        <button
                            onClick={handleViewerClick}
                            className={`
                                p-1.5 rounded-full transition-transform duration-200
                                hover:bg-white/10 active:scale-95
                                ${viewerColor} ${viewerActiveClass}
                            `}
                        >
                            <div className="relative">
                                <ViewerIcon size={14} />
                                {viewerSource === 'smart_assistant' && (
                                    <div className="absolute -bottom-1 -right-1">
                                        <Wand2 className="w-2.5 h-2.5 text-blue-500 fill-blue-500 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                                    </div>
                                )}
                            </div>
                        </button>
                    </PortalTooltip>
                </div>
            )}

            <div className={`text-right ${activeSortKey === 'impressions' ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                {item.impressions.toLocaleString()}
            </div>

            <div
                className={`text-right ${activeSortKey === 'ctr' ? 'text-text-primary font-medium' : 'text-text-secondary'}`}
                style={{ color: getCtrColor(item.ctr, ctrRules) }}
            >
                {item.ctr}%
            </div>

            <div className={`text-right ${activeSortKey === 'views' ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                {item.views.toLocaleString()}
            </div>

            <div className={`text-right ${activeSortKey === 'avgViewDuration' ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                {formatDuration(item.avgViewDuration)}
            </div>

            {/* Video Reactions: Star / Like / Dislike */}
            <div className="flex items-center justify-end gap-0.5">
                {/* Star — color from niche property */}
                <button
                    onClick={(e) => handleReactionClick(e, 'star')}
                    className={`
                        p-1 rounded-full transition-all duration-150
                        hover:bg-white/10 active:scale-90
                        ${reaction === 'star' ? `${starColor} opacity-100` : 'text-white/20 opacity-0 group-hover:opacity-100'}
                    `}
                >
                    <Star size={12} className={reaction === 'star' ? 'fill-current' : ''} />
                </button>
                {/* Like — green */}
                <button
                    onClick={(e) => handleReactionClick(e, 'like')}
                    className={`
                        p-1 rounded-full transition-all duration-150
                        hover:bg-white/10 active:scale-90
                        ${reaction === 'like' ? 'text-emerald-400 opacity-100' : 'text-white/20 opacity-0 group-hover:opacity-100'}
                    `}
                >
                    <ThumbsUp size={12} className={reaction === 'like' ? 'fill-current' : ''} />
                </button>
                {/* Dislike — red */}
                <button
                    onClick={(e) => handleReactionClick(e, 'dislike')}
                    className={`
                        p-1 rounded-full transition-all duration-150
                        hover:bg-white/10 active:scale-90
                        ${reaction === 'dislike' ? 'text-red-400 opacity-100' : 'text-white/20 opacity-0 group-hover:opacity-100'}
                    `}
                >
                    <ThumbsDown size={12} className={reaction === 'dislike' ? 'fill-current' : ''} />
                </button>
            </div>
        </div>
    );
};

TrafficRow.displayName = 'TrafficRow';
