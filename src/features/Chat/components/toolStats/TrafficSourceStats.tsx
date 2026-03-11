import React from 'react';
import { PieChart } from 'lucide-react';

/** Compact stats for analyzeTrafficSources expanded view. */
export const TrafficSourceStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const sources = result.sources as Array<{ source: string; views: number }> | undefined;
    const timeline = result.snapshotTimeline as Array<{ date: string; label: string; totalSources: number }> | undefined;
    const sourceVideo = result.sourceVideo as { title?: string } | undefined;

    const sourceCount = sources?.length ?? 0;
    const snapshotCount = timeline?.length ?? 0;
    const topSources = sources?.slice(0, 5) ?? [];

    return (
        <div className="flex flex-col gap-1.5 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            {sourceVideo?.title && (
                <span className="text-text-primary text-[10px] font-medium truncate">{sourceVideo.title}</span>
            )}
            <span className="inline-flex items-center gap-1.5">
                <PieChart size={11} className="shrink-0 opacity-60" />
                {sourceCount} traffic {sourceCount === 1 ? 'source' : 'sources'} across {snapshotCount} {snapshotCount === 1 ? 'snapshot' : 'snapshots'}
            </span>
            {topSources.length > 0 && (
                <div className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                    {topSources.map(s => (
                        <span key={s.source} className="truncate">
                            {s.source}: {s.views?.toLocaleString() ?? '\u2014'} views
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};
