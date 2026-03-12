import React, { useMemo } from 'react';
import { Users } from 'lucide-react';
import { formatViewCount } from '../../../../core/utils/formatUtils';
import { getToolConfig } from '../../utils/toolRegistry';

type ChannelEntry = { title: string; videoCount?: number; averageViews?: number };

/** Compact stats for listTrendChannels expanded view. */
export const TrendChannelsStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const channels = result.channels as ChannelEntry[] | undefined;
    const totalChannels = result.totalChannels as number | undefined;
    const totalVideos = result.totalVideos as number | undefined;

    const config = getToolConfig('listTrendChannels');
    const sorted = useMemo(() => {
        if (!channels) return [];
        if (config?.sortChannelsBy === 'averageViews') {
            return [...channels].sort((a, b) => (b.averageViews ?? 0) - (a.averageViews ?? 0));
        }
        return channels;
    }, [channels, config?.sortChannelsBy]);

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
                <Users size={11} className="shrink-0 opacity-60" />
                {totalChannels ?? 0} channels · {(totalVideos ?? 0).toLocaleString()} videos
            </span>
            {sorted.length > 0 && (
                <div className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                    {sorted.slice(0, 5).map(ch => (
                        <span key={ch.title} className="truncate">
                            {ch.title}: {(ch.videoCount ?? 0).toLocaleString()} videos
                            {ch.averageViews != null && ` · avg ${formatViewCount(ch.averageViews)}`}
                        </span>
                    ))}
                    {channels && channels.length > 5 && (
                        <span className="text-text-tertiary">+{channels.length - 5} more</span>
                    )}
                </div>
            )}
        </div>
    );
};
