// =============================================================================
// Traffic Source Table — powered by DataTable
//
// Displays aggregate traffic source metrics in a sortable table.
// Thin wrapper: defines 6 column defs, computes max-bold highlighting,
// delegates all infrastructure to DataTable.
// =============================================================================

import { useMemo, useCallback } from 'react';
import { DataTable, DeltaCell, useTableSort } from '../../../../../components/ui/organisms/DataTable';
import type { ColumnDef } from '../../../../../components/ui/organisms/DataTable';
import type { TrafficSourceDeltaMetric } from '../../../../../core/utils/trafficSource/delta';
import { durationToSeconds } from '../../Traffic/utils/formatters';

interface TrafficSourceTableProps {
    metrics: TrafficSourceDeltaMetric[];
    totalRow?: TrafficSourceDeltaMetric;
    viewMode: 'cumulative' | 'delta';
}

export function TrafficSourceTable({ metrics, totalRow, viewMode }: TrafficSourceTableProps) {
    const showDelta = viewMode === 'delta';
    const { sortConfig, onSort } = useTableSort({ defaultKey: 'views' });

    // Sort data
    const sorted = useMemo(() => {
        return [...metrics].sort((a, b) => {
            const { key, direction } = sortConfig;
            let aVal: number | string = 0;
            let bVal: number | string = 0;
            if (key === 'source') {
                aVal = a.source;
                bVal = b.source;
            } else if (key === 'avgViewDuration') {
                aVal = durationToSeconds(a.avgViewDuration);
                bVal = durationToSeconds(b.avgViewDuration);
            } else {
                aVal = a[key as keyof TrafficSourceDeltaMetric] as number ?? 0;
                bVal = b[key as keyof TrafficSourceDeltaMetric] as number ?? 0;
            }
            if (typeof aVal === 'string') {
                return direction === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
            }
            return direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [metrics, sortConfig]);

    // Max per numeric column — bold highlight in cumulative mode
    const maxValues = useMemo(() => {
        const numericKeys = ['impressions', 'ctr', 'views', 'watchTimeHours'] as const;
        const result: Record<string, number> = {};
        for (const k of numericKeys) {
            let max = -Infinity;
            for (const m of metrics) {
                const val = m[k] as number;
                if (val > max) max = val;
            }
            result[k] = max;
        }
        let maxAvd = -Infinity;
        for (const m of metrics) {
            const sec = durationToSeconds(m.avgViewDuration);
            if (sec > maxAvd) maxAvd = sec;
        }
        result['avgViewDuration'] = maxAvd;
        return result;
    }, [metrics]);

    const columns = useMemo((): ColumnDef<TrafficSourceDeltaMetric>[] => {
    const boldIf = (key: string, value: number) =>
        metrics.length > 1 && value > 0 && value === maxValues[key] ? 'font-bold' : '';

    return [
        {
            key: 'source',
            header: 'Source',
            width: '2fr',
            align: 'left',
            sortKey: 'source',
            render: (m) => (
                <span className="text-text-primary truncate self-center group-hover:text-text-primary transition-colors duration-[350ms] group-hover:duration-75">
                    {m.source}
                </span>
            ),
            renderTotal: () => totalRow ? <span className="self-center">{totalRow.source}</span> : null,
        },
        {
            key: 'impressions',
            header: 'Impr.',
            width: '1fr',
            align: 'right',
            sortKey: 'impressions',
            render: (m) => showDelta
                ? <DeltaCell delta={m.deltaImpressions} pct={m.pctImpressions} original={m.impressions.toLocaleString()} />
                : <span className={boldIf('impressions', m.impressions)}>{m.impressions.toLocaleString()}</span>,
            renderTotal: () => totalRow ? (
                showDelta
                    ? <DeltaCell delta={totalRow.deltaImpressions} pct={totalRow.pctImpressions} original={totalRow.impressions.toLocaleString()} />
                    : <span>{totalRow.impressions.toLocaleString()}</span>
            ) : null,
        },
        {
            key: 'ctr',
            header: 'CTR',
            width: '1fr',
            align: 'right',
            sortKey: 'ctr',
            render: (m) => showDelta
                ? <DeltaCell delta={m.deltaCtr} pct={m.pctCtr} suffix="%" original={`${m.ctr}%`} />
                : <span className={boldIf('ctr', m.ctr)}>{m.ctr}%</span>,
            renderTotal: () => totalRow ? (
                showDelta
                    ? <DeltaCell delta={totalRow.deltaCtr} pct={totalRow.pctCtr} suffix="%" original={`${totalRow.ctr}%`} />
                    : <span>{totalRow.ctr}%</span>
            ) : null,
        },
        {
            key: 'views',
            header: 'Views',
            width: '1fr',
            align: 'right',
            sortKey: 'views',
            render: (m) => showDelta
                ? <DeltaCell delta={m.deltaViews} pct={m.pctViews} original={m.views.toLocaleString()} />
                : <span className={boldIf('views', m.views)}>{m.views.toLocaleString()}</span>,
            renderTotal: () => totalRow ? (
                showDelta
                    ? <DeltaCell delta={totalRow.deltaViews} pct={totalRow.pctViews} original={totalRow.views.toLocaleString()} />
                    : <span>{totalRow.views.toLocaleString()}</span>
            ) : null,
        },
        {
            key: 'avgViewDuration',
            header: 'AVD',
            width: '1fr',
            align: 'right',
            sortKey: 'avgViewDuration',
            render: (m) => (
                <span className={showDelta ? '' : boldIf('avgViewDuration', durationToSeconds(m.avgViewDuration))}>
                    {m.avgViewDuration || '–'}
                </span>
            ),
            renderTotal: () => totalRow ? <span>{totalRow.avgViewDuration}</span> : null,
        },
        {
            key: 'watchTimeHours',
            header: 'Watch Time',
            width: '1fr',
            align: 'right',
            sortKey: 'watchTimeHours',
            render: (m) => showDelta
                ? <DeltaCell delta={m.deltaWatchTimeHours} pct={m.pctWatchTimeHours} suffix="h" original={m.watchTimeHours > 0 ? `${m.watchTimeHours.toFixed(2)}h` : undefined} />
                : <span className={boldIf('watchTimeHours', m.watchTimeHours)}>{m.watchTimeHours > 0 ? `${m.watchTimeHours.toFixed(2)}h` : '–'}</span>,
            renderTotal: () => totalRow ? (
                showDelta
                    ? <DeltaCell delta={totalRow.deltaWatchTimeHours} pct={totalRow.pctWatchTimeHours} suffix="h" original={`${totalRow.watchTimeHours.toFixed(2)}h`} />
                    : <span>{totalRow.watchTimeHours.toFixed(2)}h</span>
            ) : null,
        },
    ];
    }, [showDelta, totalRow, metrics, maxValues]);

    const rowKey = useCallback((m: TrafficSourceDeltaMetric) => m.source, []);

    const emptyState = useMemo(() => (
        <div className="text-center py-10 text-text-tertiary text-sm">No data in this snapshot</div>
    ), []);

    const tableConfig = useMemo(() => ({
        showTotalRow: !!totalRow,
        emptyState,
    }), [totalRow, emptyState]);

    return (
        <DataTable
            columns={columns}
            data={sorted}
            rowKey={rowKey}
            sortConfig={sortConfig}
            onSort={onSort}
            config={tableConfig}
        />
    );
}

TrafficSourceTable.displayName = 'TrafficSourceTable';
