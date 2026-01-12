import React from 'react';
import { ExternalLink, ThumbsDown, Trophy, Heart } from 'lucide-react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import { Checkbox } from '../../../../../components/ui/atoms/Checkbox/Checkbox';
import { PortalTooltip } from '../../../../../components/Shared/PortalTooltip';
import { VideoPreviewTooltip } from '../../../../../components/Shared/VideoPreviewTooltip';
import { formatDuration } from '../utils/formatters';
import type { CTRRule } from '../../../../../core/services/settingsService';
import { useTrafficNicheStore } from '../../../../../core/stores/useTrafficNicheStore';
import { TrafficRowBadges } from './TrafficRowBadges';
import { useVideoPlayer } from '../../../../../core/contexts/VideoPlayerContext';

interface TrafficRowProps {
    item: TrafficSource;
    index: number;
    isSelected: boolean;
    activeSortKey?: string;
    onRowClick: (id: string, index: number, e: React.MouseEvent) => void;
    ctrRules?: CTRRule[];
    gridClassName: string;
    showPropertyIcon: boolean;
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


export const TrafficRow = ({ item, index, isSelected, activeSortKey, onRowClick, ctrRules = [], gridClassName, showPropertyIcon }: TrafficRowProps) => {
    // Connect to Niche Store
    const { niches, assignments } = useTrafficNicheStore();
    // Connect to Video Player mainly to check if this video is minimized
    const { activeVideoId, isMinimized } = useVideoPlayer();

    // Check if THIS specific video is providing the mini-player content
    const isThisVideoMinimized = isMinimized && activeVideoId === item.videoId;

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
                        <PortalTooltip
                            content={
                                item.videoId && !isThisVideoMinimized ? (
                                    <VideoPreviewTooltip
                                        videoId={item.videoId}
                                        title={item.sourceTitle}
                                        channelTitle={item.channelTitle}
                                        className="w-[600px]"
                                    />
                                ) : (
                                    item.sourceTitle
                                )
                            }
                            enterDelay={200}
                            triggerClassName="!flex min-w-0 !justify-start shrink truncate"
                            variant={item.videoId && !isThisVideoMinimized ? "glass" : "default"}
                            estimatedHeight={item.videoId && !isThisVideoMinimized ? 350 : 80}
                            fixedWidth={item.videoId && !isThisVideoMinimized ? 640 : undefined}
                        >
                            <span className={`truncate block ${activeSortKey === 'sourceTitle' ? 'text-text-primary font-semibold' : 'text-text-primary font-medium'}`}>
                                {item.sourceTitle}
                            </span>
                        </PortalTooltip>

                        <TrafficRowBadges niches={assignedNiches} />
                    </div>
                    {item.videoId && (
                        <a
                            href={`https://youtu.be/${item.videoId}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-white transition-opacity flex-shrink-0"
                        >
                            <ExternalLink size={12} />
                        </a>
                    )}
                </div>
            </div>

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
