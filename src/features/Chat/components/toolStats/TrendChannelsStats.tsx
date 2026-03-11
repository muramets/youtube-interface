import React from 'react';
import { Users } from 'lucide-react';
import { formatViewCount } from '../../../../core/utils/formatUtils';

/** Compact stats for listTrendChannels expanded view. */
export const TrendChannelsStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const channels = result.channels as Array<{ title: string; videoCount?: number; averageViews?: number }> | undefined;
    const totalChannels = result.totalChannels as number | undefined;
    const totalVideos = result.totalVideos as number | undefined;

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
                <Users size={11} className="shrink-0 opacity-60" />
                {totalChannels ?? 0} channels \u00b7 {(totalVideos ?? 0).toLocaleString()} videos
            </span>
            {channels && channels.length > 0 && (
                <div className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                    {channels.slice(0, 5).map(ch => (
                        <span key={ch.title} className="truncate">
                            {ch.title}: {(ch.videoCount ?? 0).toLocaleString()} videos
                            {ch.averageViews != null && ` \u00b7 avg ${formatViewCount(ch.averageViews)}`}
                        </span>
                    ))}
                    {channels.length > 5 && (
                        <span className="text-text-tertiary">+{channels.length - 5} more</span>
                    )}
                </div>
            )}
        </div>
    );
};
