import React, { memo } from 'react';
import { ExternalLink } from 'lucide-react';
import type { TrafficSource, TrafficGroup } from '../../../../../core/types/traffic';
import { Checkbox } from '../../../../../components/ui/atoms/Checkbox/Checkbox';
import { PortalTooltip } from '../../../../../components/Shared/PortalTooltip';
import { VideoPreviewTooltip } from '../../../../../components/Shared/VideoPreviewTooltip';
import type { CTRRule } from '../../../../../core/services/settingsService';

interface TrafficRowProps {
    item: TrafficSource;
    index: number;
    isSelected: boolean;
    group?: TrafficGroup;
    activeSortKey?: string;
    onRowClick: (id: string, index: number, e: React.MouseEvent) => void;
    ctrRules?: CTRRule[];
}

// Helper function to format duration
const formatDuration = (duration: string) => {
    // If already formatted (HH:MM:SS), return as is
    if (duration.includes(':')) return duration;
    // Otherwise, assume it's seconds and format
    const seconds = parseInt(duration);
    if (isNaN(seconds)) return duration;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

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


export const TrafficRow = memo<TrafficRowProps>(({ item, index, isSelected, group, activeSortKey, onRowClick, ctrRules = [] }) => {
    return (
        <div
            key={item.videoId || index}
            onClick={(e) => item.videoId && onRowClick(item.videoId, index, e)}
            className={`
                relative h-full grid grid-cols-[40px_1fr_100px_100px_120px_100px] gap-4 px-4 items-center border-b border-white/5 
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

            <div className="min-w-0 flex items-center">
                <div className="flex items-center gap-2 min-w-0 w-full">
                    {group && (
                        <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: group.color }}
                            title={group.name}
                        />
                    )}
                    <div className="min-w-0 flex-1">
                        <PortalTooltip
                            content={
                                item.videoId ? (
                                    <VideoPreviewTooltip
                                        videoId={item.videoId}
                                        title={item.sourceTitle}
                                        channelTitle={item.channelTitle}
                                    />
                                ) : (
                                    item.sourceTitle
                                )
                            }
                            enterDelay={500}
                            triggerClassName="!flex w-full min-w-0 !justify-start"
                            variant={item.videoId ? "glass" : "default"}
                        >
                            <span className={`truncate block ${activeSortKey === 'sourceTitle' ? 'text-text-primary font-semibold' : 'text-text-primary font-medium'}`}>
                                {item.sourceTitle}
                            </span>
                        </PortalTooltip>
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
}, (prevProps, nextProps) => {
    // Custom comparison function - only re-render if these props change
    return (
        prevProps.item === nextProps.item &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.group === nextProps.group &&
        prevProps.index === nextProps.index &&
        prevProps.activeSortKey === nextProps.activeSortKey &&
        prevProps.ctrRules === nextProps.ctrRules
    );
});

TrafficRow.displayName = 'TrafficRow';
