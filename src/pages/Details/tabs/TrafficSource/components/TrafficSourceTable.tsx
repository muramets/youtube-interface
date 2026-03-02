// =============================================================================
// Traffic Source Table
//
// Displays aggregate traffic source metrics in a sortable table.
// Design: mirrors Suggested Traffic table styling (Tailwind, rounded container,
// sticky header with hover, row hover effects).
// =============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
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
 * Delta cell — absolute change as primary text, percentage as secondary.
 * Used in delta mode: replaces the original CSV value as the main display.
 */
const DeltaCell: React.FC<{
    delta: number | undefined;
    pct?: number | undefined;
    suffix?: string;
    original?: string;
}> = ({ delta, pct, suffix = '', original }) => {
    const isEmpty = delta === undefined || delta === 0;
    const isPositive = !isEmpty && delta > 0;
    const sign = isPositive ? '+' : '';
    const primaryStr = isEmpty ? '–' : (() => {
        const absStr = Number.isInteger(delta)
            ? Math.abs(delta!).toLocaleString()
            : Math.abs(delta!).toFixed(2);
        return `${sign}${isPositive ? absStr : `-${absStr}`}${suffix}`;
    })();

    return (
        <div className={`flex flex-col items-end transition-colors duration-[350ms] group-hover:duration-75 ${!isEmpty ? (isPositive ? 'text-emerald-500/60 group-hover:text-emerald-400' : 'text-red-500/60 group-hover:text-red-400') : ''}`}>
            <span className={`font-medium ${isEmpty ? 'opacity-25' : ''}`}>{primaryStr}</span>
            {/* Always render secondary line to keep row height consistent */}
            <span className="flex items-center gap-1.5 text-[10px]">
                <span className={pct !== undefined && !isEmpty ? 'opacity-70' : 'invisible'}>
                    {pct !== undefined ? `${sign}${pct}%` : '–'}
                </span>
                <span className={original !== undefined && !isEmpty ? 'text-white/30 group-hover:text-white/55 transition-colors duration-[350ms] group-hover:duration-75' : 'invisible'}>
                    {original ?? '–'}
                </span>
            </span>
        </div>
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
        metrics.length > 1 && value > 0 && value === maxValues.values[key] ? 'font-bold' : '';

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
                        <div className="self-center">{totalRow.source}</div>
                        <div className="flex flex-col items-end">
                            {showDelta
                                ? <DeltaCell delta={totalRow.deltaImpressions} pct={totalRow.pctImpressions} original={totalRow.impressions.toLocaleString()} />
                                : <span>{totalRow.impressions.toLocaleString()}</span>}
                        </div>
                        <div className="flex flex-col items-end">
                            {showDelta
                                ? <DeltaCell delta={totalRow.deltaCtr} pct={totalRow.pctCtr} suffix="%" original={`${totalRow.ctr}%`} />
                                : <span>{totalRow.ctr}%</span>}
                        </div>
                        <div className="flex flex-col items-end">
                            {showDelta
                                ? <DeltaCell delta={totalRow.deltaViews} pct={totalRow.pctViews} original={totalRow.views.toLocaleString()} />
                                : <span>{totalRow.views.toLocaleString()}</span>}
                        </div>
                        <div className="flex flex-col items-end">
                            <span>{totalRow.avgViewDuration}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            {showDelta
                                ? <DeltaCell delta={totalRow.deltaWatchTimeHours} pct={totalRow.pctWatchTimeHours} suffix="h" original={`${totalRow.watchTimeHours.toFixed(2)}h`} />
                                : <span>{totalRow.watchTimeHours.toFixed(2)}h</span>}
                        </div>
                    </div>
                )}

                {/* Data rows */}
                {sorted.map((metric) => (
                    <div
                        key={metric.source}
                        className={`group grid ${gridCols} gap-2 px-4 ${showDelta ? 'py-3' : 'py-2.5'} text-xs text-text-secondary border-b border-white/[0.03] hover:bg-white/5 hover:text-text-primary transition-colors duration-[350ms] hover:duration-75`}
                    >
                        <div className="text-text-primary truncate self-center group-hover:text-white transition-colors duration-[350ms] group-hover:duration-75">{metric.source}</div>
                        <div className={`flex flex-col items-end ${showDelta ? '' : boldIf('impressions', metric.impressions)}`}>
                            {showDelta
                                ? <DeltaCell delta={metric.deltaImpressions} pct={metric.pctImpressions} original={metric.impressions.toLocaleString()} />
                                : <span>{metric.impressions.toLocaleString()}</span>}
                        </div>
                        <div className={`flex flex-col items-end ${showDelta ? '' : boldIf('ctr', metric.ctr)}`}>
                            {showDelta
                                ? <DeltaCell delta={metric.deltaCtr} pct={metric.pctCtr} suffix="%" original={`${metric.ctr}%`} />
                                : <span>{metric.ctr}%</span>}
                        </div>
                        <div className={`flex flex-col items-end ${showDelta ? '' : boldIf('views', metric.views)}`}>
                            {showDelta
                                ? <DeltaCell delta={metric.deltaViews} pct={metric.pctViews} original={metric.views.toLocaleString()} />
                                : <span>{metric.views.toLocaleString()}</span>}
                        </div>
                        <div className={`flex flex-col items-end ${showDelta ? '' : boldIf('avgViewDuration', maxValues.parseDuration(metric.avgViewDuration))}`}>
                            <span>{metric.avgViewDuration || '–'}</span>
                        </div>
                        <div className={`flex flex-col items-end ${showDelta ? '' : boldIf('watchTimeHours', metric.watchTimeHours)}`}>
                            {showDelta
                                ? <DeltaCell delta={metric.deltaWatchTimeHours} pct={metric.pctWatchTimeHours} suffix="h" original={metric.watchTimeHours > 0 ? `${metric.watchTimeHours.toFixed(2)}h` : undefined} />
                                : <span>{metric.watchTimeHours > 0 ? `${metric.watchTimeHours.toFixed(2)}h` : '–'}</span>}
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
