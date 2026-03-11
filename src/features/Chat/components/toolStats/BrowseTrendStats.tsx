import React from 'react';

/** Compact stats for browseTrendVideos expanded view. */
export const BrowseTrendStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const videos = result.videos as unknown[] | undefined;
    const totalMatched = result.totalMatched as number | undefined;
    const channels = result.channels as Array<{ title: string; matchedCount: number }> | undefined;

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            <span className="text-[10px] text-text-tertiary">
                {videos?.length ?? 0} videos returned
                {totalMatched != null && totalMatched > (videos?.length ?? 0) && ` (${totalMatched} matched)`}
            </span>
            {channels && channels.length > 0 && (
                <div className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                    {channels.map(ch => (
                        <span key={ch.title} className="truncate">
                            {ch.title}: {ch.matchedCount} matched
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};
