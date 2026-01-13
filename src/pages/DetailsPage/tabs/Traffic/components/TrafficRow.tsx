import React from 'react';
import { ExternalLink, ThumbsDown, Trophy, Heart, GitBranch, Info, Sparkles, MousePointerClick, HelpCircle } from 'lucide-react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { TrafficType } from '../../../../../core/types/videoTrafficType';
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
    onToggleTrafficType?: (videoId: string, currentType?: TrafficType) => void;
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
    onToggleTrafficType,
    activeTooltipId,
    onTooltipEnter,
    onTooltipLeave
}: TrafficRowProps) => {
    // Connect to Niche Store
    const { niches, assignments } = useTrafficNicheStore();
    // Connect to Video Player mainly to check if this video is minimized
    const { activeVideoId, isMinimized } = useVideoPlayer();

    // Check if THIS specific video is providing the mini-player content
    const isThisVideoMinimized = isMinimized && activeVideoId === item.videoId;

    // Traffic Type Icon Logic
    const { icon: TypeIcon, label: typeLabel, color: typeColor, activeClass } = React.useMemo(() => {
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

    // Handle Type Click
    const handleTypeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item.videoId || !onToggleTrafficType) return;
        onToggleTrafficType(item.videoId, trafficType);
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

        if (hasProperty('desired')) return { icon: <Heart size={12} className="text-pink-500" />, label: 'Desired' };
        if (hasProperty('targeted')) return { icon: <Trophy size={12} className="text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.5)]" />, label: 'Targeted' };
        if (hasProperty('adjacent')) return { icon: <GitBranch size={12} className="text-purple-400" />, label: 'Adjacent' };
        if (hasProperty('unrelated')) return { icon: <ThumbsDown size={12} className="text-stone-400" />, label: 'Unrelated' };

        return { icon: null, label: '' };
    }, [assignedNiches]);



    return (
        <div
            key={item.videoId || index}
            onClick={(e) => item.videoId && onRowClick(item.videoId, index, e)}
            className={`
                relative h-full grid ${gridClassName} gap-2 px-4 items-center border-b border-white/5 
                text-xs transition-colors duration-200 cursor-pointer group select-none
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
                                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity inline-flex"
                                    onMouseEnter={() => {
                                        if (onTooltipEnter) onTooltipEnter(`preview-${item.videoId}`);
                                    }}
                                    onMouseLeave={() => {
                                        if (onTooltipLeave) onTooltipLeave();
                                    }}
                                >
                                    <PortalTooltip
                                        content={
                                            <div
                                                className="pointer-events-auto inline-block relative"
                                                onMouseEnter={() => {
                                                    if (onTooltipEnter) onTooltipEnter(`preview-${item.videoId}`);
                                                }}
                                                onMouseLeave={() => {
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
                                                    className="w-[600px]"
                                                />
                                            </div>
                                        }
                                        enterDelay={200}
                                        triggerClassName="flex items-center justify-center"
                                        variant="glass"
                                        side="top"
                                        align="center"
                                        estimatedHeight={480}
                                        fixedWidth={640}
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
                                p-1.5 rounded-full transition-all duration-200
                                hover:bg-white/10 active:scale-95
                                ${typeColor} ${activeClass}
                            `}
                        >
                            <TypeIcon size={14} className={trafficType === 'autoplay' ? 'animate-pulse' : ''} />
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
