import React from 'react';
import { Globe } from 'lucide-react';

/** Compact stats for getChannelOverview expanded view (quota gate). */
export const ChannelOverviewStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-surface-primary dark:bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
                <Globe size={11} className="shrink-0 opacity-60" />
                {result.channelTitle as string}
                {result.handle ? ` (${result.handle as string})` : null}
                {result.subscriberCount ? ` \u2014 ${(result.subscriberCount as number).toLocaleString()} subs` : null}
            </span>
            <span className="text-[10px] text-text-tertiary">
                {(result.videoCount as number | undefined)?.toLocaleString() ?? '\u2014'} videos
                {result.quotaCost != null && ` \u00b7 Estimated cost: ~${result.quotaCost as number} quota units`}
            </span>
        </div>
    );
};
