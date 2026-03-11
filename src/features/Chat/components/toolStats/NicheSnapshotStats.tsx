import React from 'react';
import { Telescope } from 'lucide-react';
import { formatViewCount } from '../../../../core/utils/formatUtils';

/** Compact stats for getNicheSnapshot expanded view. */
export const NicheSnapshotStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const window = result.window as { from: string; to: string } | undefined;
    const aggregates = result.aggregates as {
        totalVideosInWindow?: number;
        commonTags?: Array<{ tag: string; count: number }>;
        avgViewsInWindow?: number;
    } | undefined;
    const activity = result.competitorActivity as Array<{ channelTitle: string; videosPublished: number }> | undefined;

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            {window && (
                <span className="text-[10px] text-text-tertiary">
                    Window: {window.from} \u2014 {window.to}
                </span>
            )}
            <span className="inline-flex items-center gap-1.5">
                <Telescope size={11} className="shrink-0 opacity-60" />
                {aggregates?.totalVideosInWindow ?? 0} videos
                {aggregates?.avgViewsInWindow != null && ` \u00b7 avg ${formatViewCount(aggregates.avgViewsInWindow)}`}
            </span>
            {activity && activity.length > 0 && (
                <div className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                    {activity.slice(0, 5).map(ch => (
                        <span key={ch.channelTitle} className="truncate">
                            {ch.channelTitle}: {ch.videosPublished} videos
                        </span>
                    ))}
                </div>
            )}
            {aggregates?.commonTags && aggregates.commonTags.length > 0 && (
                <span className="text-[10px] text-text-tertiary truncate">
                    Tags: {aggregates.commonTags.slice(0, 5).map(t => t.tag).join(', ')}
                </span>
            )}
        </div>
    );
};
