// =============================================================================
// SearchDatabaseStats — compact stats for searchDatabase expanded view
// =============================================================================

import React from 'react';
import { Search } from 'lucide-react';

interface SearchDatabaseStatsProps {
    result: Record<string, unknown>;
}

export const SearchDatabaseStats: React.FC<SearchDatabaseStatsProps> = ({ result }) => {
    const results = result.results as unknown[] | undefined;
    const totalFound = result.totalFound as number | undefined;
    const query = result.query as string | undefined;
    const coverage = result.coverage as { indexed: number; total: number } | null | undefined;

    const resultCount = results?.length ?? 0;

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-surface-primary dark:bg-white/[0.03] text-[11px] text-text-secondary">
            {query && (
                <span className="text-text-primary text-[10px] font-medium truncate">
                    Query: &quot;{query}&quot;
                </span>
            )}
            <span className="inline-flex items-center gap-1.5">
                <Search size={11} className="shrink-0 opacity-60" />
                {resultCount} {resultCount === 1 ? 'result' : 'results'}
                {totalFound != null && totalFound > resultCount && ` (${totalFound} found)`}
            </span>
            {coverage && (
                <span className="text-[10px] text-text-tertiary">
                    Coverage: {coverage.indexed}/{coverage.total} videos indexed
                </span>
            )}
        </div>
    );
};
