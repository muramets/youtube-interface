// =============================================================================
// Traffic Source Table
//
// Displays aggregate traffic source metrics in a sortable table.
// Design: mirrors Suggested Traffic table styling (Tailwind, rounded container,
// sticky header with hover, row hover effects).
// =============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { ArrowUp, ArrowDown, TrendingUp, TrendingDown } from 'lucide-react';
import type { TrafficSourceDeltaMetric } from '../utils/trafficSourceDelta';

interface TrafficSourceTableProps {
    metrics: TrafficSourceDeltaMetric[];
    totalRow?: TrafficSourceDeltaMetric;
    viewMode: 'cumulative' | 'delta';
}

type SortKey = 'source' | 'views' | 'watchTimeHours' | 'avgViewDuration' | 'impressions' | 'ctr';
type SortDirection = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'source', label: 'Source', align: 'left' },
    { key: 'impressions', label: 'Impr.', align: 'right' },
    { key: 'ctr', label: 'CTR', align: 'right' },
    { key: 'views', label: 'Views', align: 'right' },
    { key: 'avgViewDuration', label: 'AVD', align: 'right' },
    { key: 'watchTimeHours', label: 'Watch Time', align: 'right' },
];

/**
 * Delta badge — shows percentage change with icon.
 * Format: ↑ +519% (+4,360)
 */
const DeltaBadge: React.FC<{
    value: number | undefined;
    pct?: number | undefined;
    suffix?: string;
}> = ({ value, pct, suffix = '' }) => {
    if (value === undefined || value === 0) return null;
    const isPositive = value > 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;

    const absFormatted = `${isPositive ? '+' : ''}${typeof value === 'number' && Number.isInteger(value) ? value.toLocaleString() : value}${suffix}`;
    const pctFormatted = pct !== undefined ? `${isPositive ? '+' : ''}${pct}%` : null;

    return (
        <span className={`inline-flex items-center gap-0.5 text-[11px] ml-1.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            <Icon size={10} />
            {pctFormatted ? (
                <>
                    <span className="font-semibold">{pctFormatted}</span>
                    <span className="opacity-70 text-[10px]">({absFormatted})</span>
                </>
            ) : (
                absFormatted
            )}
        </span>
    );
};

export const TrafficSourceTable = React.memo<TrafficSourceTableProps>(({
    metrics,
    totalRow,
    viewMode,
}) => {
    const [sortKey, setSortKey] = useState<SortKey>('views');
    const [sortDir, setSortDir] = useState<SortDirection>('desc');

    const handleSort = useCallback((key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    }, [sortKey]);

    const sorted = useMemo(() => {
        return [...metrics].sort((a, b) => {
            let aVal: number | string = 0;
            let bVal: number | string = 0;
            if (sortKey === 'source') {
                aVal = a.source;
                bVal = b.source;
            } else {
                aVal = a[sortKey] as number;
                bVal = b[sortKey] as number;
            }
            if (typeof aVal === 'string') {
                return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
            }
            return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [metrics, sortKey, sortDir]);

    const showDelta = viewMode === 'delta';

    // Compute max per numeric column (excluding total row)
    const maxValues = useMemo(() => {
        /** Parse "1:23" or "0:42" duration string → total seconds */
        const parseDuration = (val: string | number): number => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            const parts = String(val).split(':').map(Number);
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            return 0;
        };

        const numericKeys = ['impressions', 'ctr', 'views', 'watchTimeHours'] as const;
        const result: Record<string, number> = {};

        for (const key of numericKeys) {
            let max = -Infinity;
            for (const m of metrics) {
                const val = m[key] as number;
                if (val > max) max = val;
            }
            result[key] = max;
        }

        // AVD handled separately (string → seconds)
        let maxAvd = -Infinity;
        for (const m of metrics) {
            const sec = parseDuration(m.avgViewDuration);
            if (sec > maxAvd) maxAvd = sec;
        }
        result['avgViewDuration'] = maxAvd;

        return { values: result, parseDuration };
    }, [metrics]);

    /** Returns 'font-bold text-text-primary' when value equals column max */
    const boldIf = (key: string, value: number) =>
        metrics.length > 1 && value > 0 && value === maxValues.values[key] ? 'font-bold text-text-primary' : '';

    const renderHeaderCell = (col: typeof COLUMNS[number]) => {
        const isSorted = sortKey === col.key;
        return (
            <div
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`flex items-center gap-1 cursor-pointer select-none transition-colors hover:text-white
                    ${col.align === 'right' ? 'justify-end' : 'justify-start'}
                    ${isSorted ? 'text-text-primary' : ''}`}
            >
                {col.label}
                <div className="w-3 flex-shrink-0">
                    {isSorted ? (
                        sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : (
                        <ArrowDown size={12} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                    )}
                </div>
            </div>
        );
    };

    const gridCols = "grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]";

    return (
        <div className="w-full h-full flex flex-col bg-bg-secondary/30 rounded-xl border border-white/5 overflow-hidden relative">
            {/* Header */}
            <div className={`grid ${gridCols} gap-2 px-4 py-3 bg-white/5 border-b border-white/5 text-xs font-medium text-text-secondary uppercase tracking-wider flex-shrink-0 group`}>
                {COLUMNS.map(col => renderHeaderCell(col))}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                {/* Total Row */}
                {totalRow && (
                    <div className={`sticky top-0 z-10 grid ${gridCols} gap-2 px-4 py-3 border-b border-white/10 bg-video-edit-bg backdrop-blur-md font-bold text-text-primary text-xs select-none shadow-sm`}>
                        <div>{totalRow.source}</div>
                        <div className="text-right">
                            {totalRow.impressions.toLocaleString()}
                            {showDelta && <DeltaBadge value={totalRow.deltaImpressions} pct={totalRow.pctImpressions} />}
                        </div>
                        <div className="text-right">
                            {totalRow.ctr}%
                            {showDelta && <DeltaBadge value={totalRow.deltaCtr} suffix="%" />}
                        </div>
                        <div className="text-right">
                            {totalRow.views.toLocaleString()}
                            {showDelta && <DeltaBadge value={totalRow.deltaViews} pct={totalRow.pctViews} />}
                        </div>
                        <div className="text-right">
                            {totalRow.avgViewDuration}
                        </div>
                        <div className="text-right">
                            {totalRow.watchTimeHours.toFixed(2)}h
                            {showDelta && <DeltaBadge value={totalRow.deltaWatchTimeHours} pct={totalRow.pctWatchTimeHours} suffix="h" />}
                        </div>
                    </div>
                )}

                {/* Data rows */}
                {sorted.map((metric) => (
                    <div
                        key={metric.source}
                        className={`grid ${gridCols} gap-2 px-4 py-2.5 text-xs text-text-secondary border-b border-white/[0.03] hover:bg-white/5 transition-colors`}
                    >
                        <div className="text-text-primary truncate">{metric.source}</div>
                        <div className={`text-right ${boldIf('impressions', metric.impressions)}`}>
                            {metric.impressions.toLocaleString()}
                            {showDelta && <DeltaBadge value={metric.deltaImpressions} pct={metric.pctImpressions} />}
                        </div>
                        <div className={`text-right ${boldIf('ctr', metric.ctr)}`}>
                            {metric.ctr}%
                            {showDelta && <DeltaBadge value={metric.deltaCtr} suffix="%" />}
                        </div>
                        <div className={`text-right ${boldIf('views', metric.views)}`}>
                            {metric.views.toLocaleString()}
                            {showDelta && <DeltaBadge value={metric.deltaViews} pct={metric.pctViews} />}
                        </div>
                        <div className={`text-right ${boldIf('avgViewDuration', maxValues.parseDuration(metric.avgViewDuration))}`}>
                            {metric.avgViewDuration || '–'}
                        </div>
                        <div className={`text-right ${boldIf('watchTimeHours', metric.watchTimeHours)}`}>
                            {metric.watchTimeHours > 0 ? `${metric.watchTimeHours.toFixed(2)}h` : '–'}
                            {showDelta && <DeltaBadge value={metric.deltaWatchTimeHours} pct={metric.pctWatchTimeHours} suffix="h" />}
                        </div>
                    </div>
                ))}

                {metrics.length === 0 && (
                    <div className="text-center py-10 text-text-tertiary text-sm">
                        No data in this snapshot
                    </div>
                )}
            </div>
        </div>
    );
});

TrafficSourceTable.displayName = 'TrafficSourceTable';
