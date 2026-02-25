import React, { memo } from 'react';
import { format } from 'date-fns';
import type { TrendVideo } from '../../../core/types/trends';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { VideoPreviewTooltip } from '../../../features/Video/components/VideoPreviewTooltip';
import { Info } from 'lucide-react';
import { Checkbox } from '../../../components/ui/atoms/Checkbox/Checkbox';

import { formatNumber, formatDuration } from '../utils/formatters';

// Helper for duration
// (Removed local definition)

export const DeltaValue: React.FC<{ value: number | null }> = ({ value }) => {
    if (value === null) return <span className="text-text-tertiary">-</span>;
    if (value === 0) return <span className="text-text-secondary">0</span>;
    const isPositive = value > 0;
    return (
        <span className={`${isPositive ? 'text-green-400' : 'text-red-400'} font-mono`}>
            {isPositive ? '+' : ''}{formatNumber(value)}
        </span>
    );
};

interface TrendsVideoRowProps {
    video: TrendVideo;
    delta24h: number | null;
    delta7d: number | null;
    delta30d: number | null;
    isSelected: boolean;
    onToggleSelection?: (video: TrendVideo, position: { x: number; y: number }, isModifier: boolean) => void;
}

export const TrendsVideoRow = memo<TrendsVideoRowProps>(({
    video,
    delta24h,
    delta7d,
    delta30d,
    isSelected,
    onToggleSelection
}) => {
    return (
        <tr
            className={`
            transition-colors group
            ${isSelected ? 'bg-accent/10 hover:bg-accent/15' : 'hover:bg-hover-bg'}
        `}
            onClick={(e) => {
                // Row click selection
                onToggleSelection?.(video, { x: e.clientX, y: e.clientY }, e.metaKey || e.ctrlKey);
            }}
        >
            <td className="py-3 px-6 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                    checked={!!isSelected}
                    onChange={() => {
                        // Position doesn't matter much for checkbox toggle as it implies "keep existing bar" or "default center"
                        const x = window.innerWidth / 2;
                        const y = window.innerHeight / 2;
                        onToggleSelection?.(video, { x, y }, true);
                    }}
                />
            </td>
            <td className="py-3 px-6">
                <div className="flex items-start gap-4 cursor-pointer">
                    <div className="relative w-32 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-bg-primary">
                        <img
                            src={video.thumbnail}
                            alt=""
                            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                        />
                        {video.duration && (
                            <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-medium text-white">
                                {formatDuration(video.duration || '')}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 pt-0.5 flex flex-col gap-1">
                        <div className="flex items-start gap-2">
                            <div className="font-medium text-text-primary text-sm line-clamp-2 leading-tight transition-colors">
                                {video.title}
                            </div>
                            {/* Info Icon - Visible on Group Hover */}
                            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5" onClick={(e) => e.stopPropagation()}>
                                <PortalTooltip
                                    content={
                                        <div className="pointer-events-auto">
                                            <VideoPreviewTooltip
                                                videoId={video.id}
                                                title={video.title}
                                                channelTitle={video.channelTitle}
                                                viewCount={video.viewCount}
                                                publishedAt={video.publishedAt}
                                                description={video.description}
                                                tags={video.tags}
                                                className="w-full"
                                            />
                                        </div>
                                    }
                                    variant="glass"
                                    sizeMode="fixed"
                                    side="bottom"
                                    align="left"
                                    enterDelay={500}
                                    triggerClassName="flex items-center justify-center"
                                >
                                    <div className="text-text-secondary hover:text-text-primary cursor-help p-1 -m-1">
                                        <Info size={14} />
                                    </div>
                                </PortalTooltip>
                            </div>
                        </div>

                        {video.channelTitle && (
                            <div className="text-xs text-text-secondary">
                                {video.channelTitle}
                            </div>
                        )}
                    </div>
                </div>
            </td>
            <td className="py-3 px-4 text-sm text-text-secondary whitespace-nowrap">
                {format(new Date(video.publishedAt), 'MMM d, yyyy')}
            </td>
            <td className="py-3 px-4 text-sm text-text-primary text-right font-mono">
                {formatNumber(video.viewCount)}
            </td>
            <td className="py-3 px-4 text-right">
                <DeltaValue value={delta24h} />
            </td>
            <td className="py-3 px-4 text-right">
                <DeltaValue value={delta7d} />
            </td>
            <td className="py-3 px-4 text-right">
                <DeltaValue value={delta30d} />
            </td>
        </tr>
    );
});

TrendsVideoRow.displayName = 'TrendsVideoRow';
