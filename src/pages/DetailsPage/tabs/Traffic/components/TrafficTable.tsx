import React, { useCallback, useRef, useState, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import { Checkbox } from '../../../../../components/ui/atoms/Checkbox/Checkbox';
import { TrafficRow } from './TrafficRow';
import { TrafficEmptyState } from './TrafficEmptyState';
import { formatDuration, durationToSeconds } from '../utils/formatters';
import { TRAFFIC_TABLE } from '../utils/constants';
import type { CTRRule } from '../../../../../core/services/settingsService';
import { useTrafficNicheStore } from '../../../../../core/stores/useTrafficNicheStore';

import type { VideoDetails } from '../../../../../core/utils/youtubeApi';

interface TrafficTableProps {
    data: TrafficSource[];
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
    hasPreviousSnapshots?: boolean; // Are there snapshots in earlier versions?
    isFirstSnapshot?: boolean; // Is this the very first snapshot of the current version?

    // CTR Rules
    ctrRules?: CTRRule[];

    // View mode to determine empty state type
    viewMode?: 'cumulative' | 'delta';

    // Filters
    hasActiveFilters?: boolean;

    // Rich Data
    videos?: VideoDetails[];
}

type SortKey = keyof TrafficSource;
interface SortConfig {
    key: SortKey;
    direction: 'asc' | 'desc';
}

export const TrafficTable = memo<TrafficTableProps>(({
    data,
    selectedIds,
    onToggleSelection,
    onToggleAll,
    isLoading,
    onUpload,
    hasExistingSnapshot,
    hasPreviousSnapshots = false,
    isFirstSnapshot = false,
    ctrRules = [],
    viewMode = 'cumulative',
    hasActiveFilters = false,
    videos = []
}) => {
    // Virtualization refs
    const parentRef = useRef<HTMLDivElement>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'views', direction: 'desc' });

    // Lookup map for rich video details
    const videoMap = useMemo(() => {
        const map = new Map<string, VideoDetails>();
        videos.forEach(v => map.set(v.id, v));
        return map;
    }, [videos]);

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


    const { niches, assignments } = useTrafficNicheStore();

    const showPropertyColumn = useMemo(() => {
        if (!data.length) return false;
        return data.some(item => {
            if (!item.videoId) return false;
            const myAssignmentIds = assignments
                .filter(a => a.videoId === item.videoId)
                .map(a => a.nicheId);
            const myNiches = niches.filter(n => myAssignmentIds.includes(n.id));
            return myNiches.some(n => n.property && ['desired', 'targeted', 'unrelated'].includes(n.property));
        });
    }, [data, niches, assignments]);

    const gridClassName = showPropertyColumn
        ? "grid-cols-[40px_24px_1fr_80px_70px_70px_80px]"
        : "grid-cols-[40px_1fr_80px_70px_70px_80px]";

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
    const isInitialEmpty = !isLoading && data.length === 0 && !hasExistingSnapshot;

    // Check if empty due to filters or delta (when not initial empty)
    const isFilteredEmpty = !isLoading && data.length === 0 && hasActiveFilters;
    const isDeltaEmpty = !isLoading && data.length === 0 && !hasActiveFilters && viewMode === 'delta';

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
        <div className="w-full h-full flex flex-col bg-bg-secondary/30 rounded-xl border border-white/5 overflow-hidden relative">
            {/* Fixed Header - Show when loading OR when there's data OR when filtered/delta empty */}
            {/* Fixed Header - Show when loading OR when there's data OR when filtered/delta empty */}
            <div className={`grid ${gridClassName} gap-2 px-4 py-3 bg-white/5 border-b border-white/5 text-xs font-medium text-text-secondary uppercase tracking-wider flex-shrink-0 group`}>
                <div className="flex items-center justify-center">
                    <Checkbox
                        checked={isAllSelected}
                        indeterminate={isIndeterminate}
                        onChange={handleHeaderCheckbox}
                        disabled={isLoading || data.length === 0}
                    />
                </div>
                {showPropertyColumn && <div></div>} {/* Property Icon Column */}
                <div>Traffic Source</div>
                {renderHeaderCell('Impr.', 'impressions')}
                {renderHeaderCell('CTR', 'ctr')}
                {renderHeaderCell('Views', 'views')}
                {renderHeaderCell('AVD', 'avgViewDuration')}
            </div>

            <div
                ref={parentRef}
                className="flex-1 overflow-y-auto min-h-0 relative custom-scrollbar"
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
                ) : isFilteredEmpty ? (
                    <TrafficEmptyState
                        onUpload={onUpload}
                        hasExistingSnapshot={hasExistingSnapshot}
                        mode="no-matches"
                    />
                ) : isDeltaEmpty ? (
                    <TrafficEmptyState
                        onUpload={onUpload}
                        hasExistingSnapshot={hasExistingSnapshot}
                        hasPreviousSnapshots={hasPreviousSnapshots}
                        isFirstSnapshot={isFirstSnapshot}
                        mode="no-new-data"
                    />
                ) : (
                    <>
                        {computedTotal && (
                            <div className={`sticky top-0 z-10 grid ${gridClassName} gap-2 px-4 py-3 border-b border-white/10 bg-video-edit-bg backdrop-blur-md font-bold text-text-primary text-xs select-none shadow-sm`}>
                                <div />
                                {showPropertyColumn && <div />}
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
                                paddingBottom: '80px',
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const item = sortedData[virtualRow.index];
                                const index = virtualRow.index;
                                const isSelected = item.videoId ? selectedIds.has(item.videoId) : false;
                                const videoDetails = item.videoId ? videoMap.get(item.videoId) : undefined;

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
                                            activeSortKey={sortConfig?.key}
                                            onRowClick={handleRowClick}
                                            ctrRules={ctrRules}
                                            gridClassName={gridClassName}
                                            showPropertyIcon={showPropertyColumn}
                                            videoDetails={videoDetails}
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
