import React, { memo } from 'react';
import { ExternalLink } from 'lucide-react';
import type { TrafficSource, TrafficGroup } from '../../../../../core/types/traffic';
import { Checkbox } from '../../../../../components/ui/atoms/Checkbox/Checkbox';
import { PortalTooltip } from '../../../../../components/Shared/PortalTooltip';

interface TrafficRowProps {
    item: TrafficSource;
    index: number;
    isSelected: boolean;
    group?: TrafficGroup;
    onRowClick: (id: string, index: number, e: React.MouseEvent) => void;
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


export const TrafficRow = memo<TrafficRowProps>(({ item, index, isSelected, group, onRowClick }) => {
    return (
        <div
            key={item.videoId || index}
            onClick={(e) => item.videoId && onRowClick(item.videoId, index, e)}
            className={`
                h-full grid grid-cols-[40px_1fr_100px_100px_120px_100px] gap-4 px-4 items-center border-b border-white/5 
                text-sm transition-colors cursor-pointer group
                ${isSelected
                    ? 'bg-accent-blue/10 hover:bg-accent-blue/20'
                    : index % 2 === 0
                        ? 'bg-white/[0.01] hover:bg-white/[0.03]'
                        : 'hover:bg-white/[0.02]'
                }
            `}
        >
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
                        <PortalTooltip content={item.sourceTitle} enterDelay={500} triggerClassName="!flex w-full min-w-0 !justify-start">
                            <span className="truncate text-text-primary font-medium block">
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

            <div className="text-right text-text-secondary">
                {item.impressions.toLocaleString()}
            </div>

            <div className="text-right text-text-secondary">
                {item.ctr}%
            </div>

            <div className="text-right font-medium text-text-primary">
                {item.views.toLocaleString()}
            </div>

            <div className="text-right text-text-secondary">
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
        prevProps.index === nextProps.index
    );
});

TrafficRow.displayName = 'TrafficRow';
