import React from 'react';
import { Search } from 'lucide-react';

/** Compact stats for findSimilarVideos expanded view. */
export const FindSimilarStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const similar = result.similar as Array<{ title: string; channelTitle: string; similarityScore: number }> | undefined;
    const totalFound = result.totalFound as number | undefined;
    const coverage = result.coverage as { indexed: number; total: number } | null | undefined;
    const referenceVideo = result.referenceVideo as { title: string } | undefined;

    const topMatch = similar?.[0];

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-text-secondary">
            {referenceVideo?.title && (
                <span className="text-text-primary text-[10px] font-medium truncate">
                    Reference: {referenceVideo.title}
                </span>
            )}
            <span className="inline-flex items-center gap-1.5">
                <Search size={11} className="shrink-0 opacity-60" />
                {similar?.length ?? 0} results
                {totalFound != null && totalFound > (similar?.length ?? 0) && ` (${totalFound} found)`}
            </span>
            {topMatch && (
                <span className="text-[10px] text-text-tertiary truncate">
                    Top: {topMatch.title} ({Math.round(topMatch.similarityScore * 100)}% match)
                </span>
            )}
            {coverage && (
                <span className="text-[10px] text-text-tertiary">
                    Coverage: {coverage.indexed}/{coverage.total} videos indexed
                </span>
            )}
        </div>
    );
};
