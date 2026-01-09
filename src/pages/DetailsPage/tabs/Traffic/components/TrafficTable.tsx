import React, { useCallback, useRef, useState, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { TrafficSource, TrafficGroup } from '../../../../../core/types/traffic';
import { Checkbox } from '../../../../../components/ui/atoms/Checkbox/Checkbox';
import { TrafficRow } from './TrafficRow';
import { TrafficEmptyState } from './TrafficEmptyState';
import { formatDuration, durationToSeconds } from '../utils/formatters';
import { TRAFFIC_TABLE } from '../utils/constants';
import type { CTRRule } from '../../../../../core/services/settingsService';

interface TrafficTableProps {
    data: TrafficSource[];
    groups: TrafficGroup[];
    isLoading: boolean;
    // Selection for grouping
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onToggleAll: (ids: string[]) => void;

    // For Drag and Drop Grouping (future) or just Visuals
    activeGroupId?: string; // If filtering by group

    // Versioning
    viewingVersion?: number | 'draft';
    activeVersion: number;

    // Upload for Empty State
    onUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<void>;
    hasExistingSnapshot: boolean;

    // CTR Rules
    ctrRules?: CTRRule[];

    // View mode to determine empty state type
    viewMode?: 'cumulative' | 'delta';
}

type SortKey = keyof TrafficSource;
interface SortConfig {
    key: SortKey;
    direction: 'asc' | 'desc';
}

export const TrafficTable = memo<TrafficTableProps>(({
    data,
    groups,
    selectedIds,
    onToggleSelection,
    onToggleAll,
    isLoading,
    onUpload,
    hasExistingSnapshot,
    ctrRules = [],
    viewMode = 'cumulative'
}) => {
    // Virtualization refs
    const parentRef = useRef<HTMLDivElement>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'views', direction: 'desc' });

    const sortedData = useMemo(() => {
        if (!sortConfig) return data;

        return [...data].sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];

            let comparison = 0;
            if (sortConfig.key === 'avgViewDuration') {
                comparison = durationToSeconds(aVal as string) - durationToSeconds(bVal as string);
            } else if (typeof aVal === 'number' && typeof bVal === 'number') {
                comparison = aVal - bVal;
            } else if (typeof aVal === 'string' && typeof bVal === 'string') {
                comparison = aVal.localeCompare(bVal);
            }

            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
    }, [data, sortConfig]);

    const rowVirtualizer = useVirtualizer({
        count: sortedData.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => TRAFFIC_TABLE.ROW_HEIGHT,
        overscan: TRAFFIC_TABLE.OVERSCAN_COUNT,
    });

    const handleRowClick = useCallback((id: string, _index: number, e: React.MouseEvent) => {
        // Prevent selection when clicking links or interactive elements
        if ((e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('button')) {
            return;
        }

        onToggleSelection(id);
    }, [onToggleSelection]);

    const handleHeaderCheckbox = useCallback(() => {
        const allIds = data.map(d => d.videoId).filter(Boolean) as string[];
        onToggleAll(allIds);
    }, [data, onToggleAll]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'desc' };
        });
    };

    const isAllSelected = data.length > 0 && data.every(d => d.videoId && selectedIds.has(d.videoId));
    const isIndeterminate = data.some(d => d.videoId && selectedIds.has(d.videoId)) && !isAllSelected;

    const computedTotal = useMemo(() => {
        if (data.length === 0) return null;

        const totalImpressions = data.reduce((sum, s) => sum + (s.impressions || 0), 0);
        const totalViews = data.reduce((sum, s) => sum + (s.views || 0), 0);
        const totalWatchTimeHours = data.reduce((sum, s) => sum + (s.watchTimeHours || 0), 0);
        const totalWatchTimeSeconds = totalWatchTimeHours * 3600;

        const avgCtr = totalImpressions > 0 ? (totalViews / totalImpressions) * 100 : 0;
        const avgDurationSeconds = totalViews > 0 ? totalWatchTimeSeconds / totalViews : 0;

        return {
            impressions: totalImpressions,
            views: totalViews,
            ctr: parseFloat(avgCtr.toFixed(2)),
            avgViewDuration: Math.round(avgDurationSeconds).toString(),
        };
    }, [data]);

    const renderHeaderCell = (label: string, sortKey?: SortKey, align: 'left' | 'right' = 'right') => {
        const isSorted = sortConfig?.key === sortKey;
        const canSort = !!sortKey;

        return (
            <div
                className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'} ${canSort ? 'cursor-pointer hover:text-white transition-colors select-none' : ''}`}
                onClick={() => canSort && handleSort(sortKey)}
            >
                {label}
                {canSort && (
                    <div className="w-3 flex-shrink-0">
                        {isSorted && sortConfig ? (
                            sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                            <ArrowDown size={12} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Determine if we should show the empty state without table structure
    // isInitialEmpty: truly no data uploaded yet (no snapshots exist)
    // isDeltaEmpty: in delta mode with snapshots but no new data
    const isInitialEmpty = !isLoading && data.length === 0 && !hasExistingSnapshot;
    const isDeltaEmpty = !isLoading && data.length === 0 && hasExistingSnapshot && viewMode === 'delta';

    // If initial empty state (no CSV uploaded yet), show empty state without table
    // IMPORTANT: Only show this if we're certain there are no snapshots
    if (isInitialEmpty) {
        return (
            <TrafficEmptyState
                onUpload={onUpload}
                hasExistingSnapshot={hasExistingSnapshot}
                mode="no-data"
            />
        );
    }

    return (
        <div className="w-full h-full flex flex-col bg-bg-secondary/30 rounded-xl border border-white/5 overflow-hidden">
            {/* Fixed Header */}
            <div className="grid grid-cols-[40px_1fr_100px_100px_120px_100px] gap-4 px-4 py-3 bg-white/5 border-b border-white/5 text-xs font-medium text-text-secondary uppercase tracking-wider flex-shrink-0 group">
                <div className="flex items-center justify-center">
                    <Checkbox
                        checked={isAllSelected}
                        indeterminate={isIndeterminate}
                        onChange={handleHeaderCheckbox}
                        disabled={isLoading || data.length === 0}
                    />
                </div>
                <div>Traffic Source</div>
                {renderHeaderCell('Impr.', 'impressions')}
                {renderHeaderCell('CTR', 'ctr')}
                {renderHeaderCell('Views', 'views')}
                {renderHeaderCell('AVD', 'avgViewDuration')}
            </div>

            {/* Scrollable Body */}
            <div
                ref={parentRef}
                className="flex-1 overflow-y-auto min-h-0 relative"
            >
                {isLoading ? (
                    <div className="px-4 py-3 text-xs font-medium text-center bg-clip-text text-transparent flex justify-center items-center"
                        style={{
                            backgroundImage: 'linear-gradient(120deg, var(--text-secondary) 42%, var(--text-primary) 50%, var(--text-secondary) 58%)',
                            backgroundSize: '200% 100%',
                            display: 'inline-block',
                            width: '100%',
                            animation: 'shimmer-premium 2.5s infinite linear',
                        }}
                    >
                        <style>
                            {`
                                @keyframes shimmer-premium {
                                    0% { background-position: 100% 0; }
                                    100% { background-position: -100% 0; }
                                }
                            `}
                        </style>
                        Loading traffic data...
                    </div>
                ) : isDeltaEmpty ? (
                    <TrafficEmptyState
                        onUpload={onUpload}
                        hasExistingSnapshot={hasExistingSnapshot}
                        mode="no-new-data"
                    />
                ) : data.length === 0 && !hasExistingSnapshot ? (
                    <TrafficEmptyState
                        onUpload={onUpload}
                        hasExistingSnapshot={hasExistingSnapshot}
                        mode="no-data"
                    />
                ) : data.length === 0 ? (
                    // Fallback: empty with snapshots but not in delta mode (shouldn't normally happen)
                    // Show loading state to avoid flash
                    <div className="px-4 py-3 text-xs font-medium text-center text-text-secondary">
                        Loading...
                    </div>
                ) : (
                    <>
                        {computedTotal && (
                            <div className="sticky top-0 z-10 grid grid-cols-[40px_1fr_100px_100px_120px_100px] gap-4 px-4 py-3 border-b border-white/10 bg-video-edit-bg backdrop-blur-md font-bold text-text-primary text-xs select-none shadow-sm">
                                <div />
                                <div>Total</div>
                                <div className={`text-right ${sortConfig?.key === 'impressions' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                                    {computedTotal.impressions.toLocaleString()}
                                </div>
                                <div className={`text-right ${sortConfig?.key === 'ctr' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                                    {computedTotal.ctr}%
                                </div>
                                <div className={`text-right ${sortConfig?.key === 'views' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                                    {computedTotal.views.toLocaleString()}
                                </div>
                                <div className={`text-right ${sortConfig?.key === 'avgViewDuration' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                                    {formatDuration(computedTotal.avgViewDuration)}
                                </div>
                            </div>
                        )}

                        <div
                            style={{
                                height: `${rowVirtualizer.getTotalSize()}px`,
                                width: '100%',
                                position: 'relative',
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const item = sortedData[virtualRow.index];
                                const index = virtualRow.index;
                                const isSelected = item.videoId ? selectedIds.has(item.videoId) : false;
                                const group = groups.find(g => item.videoId && g.videoIds.includes(item.videoId));

                                return (
                                    <div
                                        key={item.videoId || virtualRow.key}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: `${virtualRow.size}px`,
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        <TrafficRow
                                            item={item}
                                            index={index}
                                            isSelected={isSelected}
                                            group={group}
                                            activeSortKey={sortConfig?.key}
                                            onRowClick={handleRowClick}
                                            ctrRules={ctrRules}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
});

TrafficTable.displayName = 'TrafficTable';
