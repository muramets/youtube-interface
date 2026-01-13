import React, { useRef } from 'react';
import {
    ExternalLink, Info, Sparkles, Flag, CircleOff, Layers, Target,
    MousePointerClick, HelpCircle, Wand2, ZapOff, Zap, Compass, Eye, Coffee, User
} from 'lucide-react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { TrafficType } from '../../../../../core/types/videoTrafficType';
import type { ViewerType } from '../../../../../core/types/viewerType';
import { Checkbox } from '../../../../../components/ui/atoms/Checkbox/Checkbox';
import { PortalTooltip } from '../../../../../components/Shared/PortalTooltip';
import { VideoPreviewTooltip } from '../../../../../components/Shared/VideoPreviewTooltip';
import { formatDuration } from '../utils/formatters';
import type { CTRRule } from '../../../../../core/services/settingsService';
import { useTrafficNicheStore } from '../../../../../core/stores/useTrafficNicheStore';
import { TrafficRowBadges } from './TrafficRowBadges';
import { useVideoPlayer } from '../../../../../core/contexts/VideoPlayerContext';
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
    // Smart Assistant Props
    suggestedNiche?: SuggestedTrafficNiche;
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
    ctrRules = [],
    gridClassName,
    showPropertyIcon,
    videoDetails,
    suggestedNiche,
    onConfirmSuggestion,
    trafficType,
    trafficSource,
    onToggleTrafficType,
    viewerType,
    viewerSource,
    onToggleViewerType,
    activeTooltipId,
    onTooltipEnter,
    onTooltipLeave
}: TrafficRowProps) => {
    // Connect to Niche Store
    const { niches, assignments } = useTrafficNicheStore();
    const enterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    // Connect to Video Player mainly to check if this video is minimized
    const { activeVideoId, isMinimized } = useVideoPlayer();

    // Check if THIS specific video is minimized
    const isThisVideoMinimized = isMinimized && activeVideoId === item.videoId;

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
            <div className="flex items-center justify-center">
                <Checkbox
                    checked={isSelected}
                    onChange={() => { }} // Handled by row click
                />
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

            <div className="min-w-0 flex flex-col justify-center h-full py-1">
                <div className="flex items-center gap-2 min-w-0 w-full">
                    <div className="min-w-0 flex-1 flex items-center gap-2 overflow-hidden">
                        {/* Title Group: Title + Info Icon */}
                        <div className="min-w-0 flex items-center gap-1.5">
                            <span className={`truncate block ${activeSortKey === 'sourceTitle' ? 'text-text-primary font-semibold' : 'text-text-primary font-medium'}`}>
                                {item.sourceTitle}
                            </span>

                            {/* Info Icon - Moved here, visible on group hover */}
                            {item.videoId && !isThisVideoMinimized && (
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
                                        // Tooltip Stability Bridge: Start a grace period in TrafficTable.tsx 
                                        // to handle iframe-induced focus flickers.
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
                                                className="pointer-events-auto w-full relative p-6"
                                                onMouseEnter={() => {
                                                    // Maintain open state if hovering content
                                                    // Note: We don't need delay here because it's already open
                                                    if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
                                                    if (onTooltipEnter) onTooltipEnter(`preview-${item.videoId}`);
                                                }}
                                                onMouseLeave={(e: any) => {
                                                    // IGNORE LEAVE if we are moving back to our own trigger icon
                                                    // This prevents the "flicker loop" where hovering the icon underneath closes the tooltip
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
                                                />
                                            </div>
                                        }
                                        enterDelay={0}
                                        triggerClassName="flex items-center justify-center"
                                        variant="glass"
                                        side="top"
                                        align="center"
                                        estimatedHeight={480}
                                        fixedWidth={640}
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
                    </div>

                    {/* Niche Badges - Fixed Position (Before External Link) */}
                    <TrafficRowBadges
                        niches={assignedNiches}
                        suggested={suggestedNiche}
                        onConfirmSuggestion={(niche) => item.videoId && onConfirmSuggestion?.(item.videoId, niche)}
                    />

                    {/* Actions Group - Appears on Row Hover */}
                    <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {item.videoId && (
                            <>
                                {/* External Link */}
                                <a
                                    href={`https://youtu.be/${item.videoId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 -m-1.5 text-text-secondary hover:text-white transition-colors flex items-center justify-center"
                                >
                                    <ExternalLink size={14} />
                                </a>
                            </>
                        )}
                    </div>
                </div>
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
        </div>
    );
};

TrafficRow.displayName = 'TrafficRow';
