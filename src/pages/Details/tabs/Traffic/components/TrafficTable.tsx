import React, { useCallback, useRef, useMemo, memo } from 'react';
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
import { SmartTrafficTooltip } from './SmartTrafficTooltip';

import type { SuggestedTrafficNiche } from '../../../../../core/types/suggestedTrafficNiches';
import type { SmartSuggestion } from '../hooks/useSmartNicheSuggestions';

import type { VideoDetails } from '../../../../../core/utils/youtubeApi';


import type { TrafficType } from '../../../../../core/types/videoTrafficType';
import type { ViewerType } from '../../../../../core/types/viewerType';

export type SortKey = keyof TrafficSource | 'trafficType' | 'viewerType';
export interface SortConfig {
    key: SortKey;
    direction: 'asc' | 'desc';
}

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
    isViewingSnapshot?: boolean;

    // CTR Rules
    ctrRules?: CTRRule[];

    // View mode to determine empty state type
    viewMode?: 'cumulative' | 'delta';

    // Filters
    hasActiveFilters?: boolean;

    // View switch
    onSwitchToTotal?: () => void;

    // Rich Data
    videos?: VideoDetails[];

    // Sorting (Controlled)
    sortConfig: SortConfig | null;
    onSort: (key: SortKey) => void;

    // Smart Assistant
    getSuggestion?: (videoId: string) => SmartSuggestion | null;
    onConfirmSuggestion?: (videoId: string, niche: SuggestedTrafficNiche) => void;

    // Traffic Types
    trafficEdges?: Record<string, { type: TrafficType; source?: 'manual' | 'smart_assistant' }>;
    onToggleTrafficType?: (videoId: string, currentType?: TrafficType) => void;

    // Viewer Types
    viewerEdges?: Record<string, { type: ViewerType; source?: 'manual' | 'smart_assistant' }>;
    onToggleViewerType?: (videoId: string, currentType?: ViewerType) => void;

    // Discrepancy reporting
    actualTotalRow?: TrafficSource;
    trashMetrics?: import('../hooks/useTrafficDataLoader').TrashMetrics;
    deltaContext?: import('../hooks/useTrafficDataLoader').DeltaContext;

    // Current Video for metadata comparison
    currentVideo?: VideoDetails;
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
    isViewingSnapshot = false,
    ctrRules = [],
    viewMode = 'cumulative',
    hasActiveFilters = false,
    onSwitchToTotal,
    videos = [],
    sortConfig,
    onSort,
    getSuggestion,
    onConfirmSuggestion,
    actualTotalRow,
    trashMetrics,
    deltaContext,
    trafficEdges,
    onToggleTrafficType,
    viewerEdges,
    onToggleViewerType,
    currentVideo
}) => {
    // Virtualization refs
    const parentRef = useRef<HTMLDivElement>(null);
    // Local sort state removed in favor of props

    // State for controlled tooltips (SmartTrafficTooltip)
    const [hoveredTooltipId, setHoveredTooltipId] = React.useState<string | null>(null);
    const tooltipTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleTooltipEnter = useCallback((id: string) => {
        if (tooltipTimeoutRef.current) {
            clearTimeout(tooltipTimeoutRef.current);
            tooltipTimeoutRef.current = null;
        }
        setHoveredTooltipId(id);
    }, []);

    const handleTooltipLeave = useCallback(() => {
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);

        tooltipTimeoutRef.current = setTimeout(() => {
            setHoveredTooltipId(null);
            tooltipTimeoutRef.current = null;
        }, 500); // 500ms Grace Period: Sufficient bridge to survive heavy iframe renders and mouse flickers
    }, []);

    // Lookup map for rich video details
    const videoMap = useMemo(() => {
        const map = new Map<string, VideoDetails>();
        videos.forEach(v => map.set(v.id, v));
        return map;
    }, [videos]);

    const sortedData = useMemo(() => {
        if (!sortConfig) return data;

        return [...data].sort((a, b) => {
            let comparison = 0;
            const { key, direction } = sortConfig;

            if (key === 'trafficType') {
                const aType = a.videoId && trafficEdges ? (trafficEdges[a.videoId]?.type || '') : '';
                const bType = b.videoId && trafficEdges ? (trafficEdges[b.videoId]?.type || '') : '';
                comparison = aType.localeCompare(bType);
            } else if (key === 'viewerType') {
                const aType = a.videoId && viewerEdges ? (viewerEdges[a.videoId]?.type || '') : '';
                const bType = b.videoId && viewerEdges ? (viewerEdges[b.videoId]?.type || '') : '';
                comparison = aType.localeCompare(bType);
            } else if (key === 'avgViewDuration') {
                comparison = durationToSeconds(a.avgViewDuration) - durationToSeconds(b.avgViewDuration);
            } else {
                // Key is keyof TrafficSource
                const aVal = a[key as keyof TrafficSource];
                const bVal = b[key as keyof TrafficSource];

                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    comparison = aVal - bVal;
                } else if (typeof aVal === 'string' && typeof bVal === 'string') {
                    comparison = aVal.localeCompare(bVal);
                } else if (aVal != null && bVal != null) {
                    comparison = String(aVal).localeCompare(String(bVal));
                } else if (aVal != null) {
                    comparison = 1;
                } else if (bVal != null) {
                    comparison = -1;
                }
            }

            return direction === 'asc' ? comparison : -comparison;
        });
    }, [data, sortConfig, trafficEdges, viewerEdges]);

    // eslint-disable-next-line react-hooks/incompatible-library
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

    // handleSort uses prop now
    const handleSort = (key: SortKey) => {
        onSort(key);
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
        ? "grid-cols-[40px_24px_1fr_22px_22px_70px_60px_70px_80px]"
        : "grid-cols-[40px_1fr_22px_22px_70px_60px_70px_80px]";

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
                onSwitchToTotal={onSwitchToTotal}
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
                {/* Traffic Type Header */}
                {renderHeaderCell('', 'trafficType', 'left')}
                {/* Viewer Type Header */}
                {renderHeaderCell('', 'viewerType', 'left')}
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
                        onSwitchToTotal={onSwitchToTotal}
                    />
                ) : isDeltaEmpty ? (
                    <TrafficEmptyState
                        onUpload={onUpload}
                        hasExistingSnapshot={hasExistingSnapshot}
                        hasPreviousSnapshots={hasPreviousSnapshots}
                        isFirstSnapshot={isFirstSnapshot}
                        isViewingSnapshot={isViewingSnapshot}
                        mode="no-new-data"
                        onSwitchToTotal={onSwitchToTotal}
                    />
                ) : (
                    <>
                        {computedTotal && (
                            <div className={`sticky top-0 z-10 grid ${gridClassName} gap-2 px-4 py-3 border-b border-white/10 bg-video-edit-bg backdrop-blur-md font-bold text-text-primary text-xs select-none shadow-sm`}>
                                <div />
                                {showPropertyColumn && <div />}
                                <div>Total</div>
                                {/* Traffic Type Total Cell (Empty) */}
                                <div />
                                {/* Viewer Type Total Cell (Empty) */}
                                <div />
                                <div className={`text-right flex items-center justify-end gap-1.5 ${sortConfig?.key === 'impressions' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                                    {actualTotalRow && !hasActiveFilters && Number(actualTotalRow.impressions || 0) > (computedTotal.impressions + 1) && (
                                        <SmartTrafficTooltip
                                            actualTotal={Number(actualTotalRow.impressions)}
                                            tableSum={computedTotal.impressions}
                                            trashValue={trashMetrics?.impressions}
                                            deltaContext={deltaContext?.impressions}
                                            isIncomplete={deltaContext?.isIncomplete}
                                            forceOpen={hoveredTooltipId === 'total-impressions'}
                                            onMouseEnter={() => handleTooltipEnter('total-impressions')}
                                            onMouseLeave={handleTooltipLeave}
                                        />
                                    )}
                                    {computedTotal.impressions.toLocaleString()}
                                </div>
                                <div className={`text-right ${sortConfig?.key === 'ctr' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                                    {computedTotal.ctr}%
                                </div>
                                <div className={`text-right flex items-center justify-end gap-1.5 ${sortConfig?.key === 'views' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                                    {actualTotalRow && !hasActiveFilters && Number(actualTotalRow.views || 0) > (computedTotal.views + 1) && (
                                        <SmartTrafficTooltip
                                            actualTotal={Number(actualTotalRow.views)}
                                            tableSum={computedTotal.views}
                                            trashValue={trashMetrics?.views}
                                            deltaContext={deltaContext?.views}
                                            isIncomplete={deltaContext?.isIncomplete}
                                            forceOpen={hoveredTooltipId === 'total-views'}
                                            onMouseEnter={() => handleTooltipEnter('total-views')}
                                            onMouseLeave={handleTooltipLeave}
                                        />
                                    )}
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

                                // Lookup Traffic Type
                                const trafficEdge = item.videoId && trafficEdges ? trafficEdges[item.videoId] : undefined;

                                // Lookup Viewer Type
                                const viewerEdge = item.videoId && viewerEdges ? viewerEdges[item.videoId] : undefined;

                                // Lookup Smart Suggestion
                                const suggestion = item.videoId && getSuggestion ? getSuggestion(item.videoId) : null;

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
                                            onToggleSelection={onToggleSelection}
                                            ctrRules={ctrRules}
                                            gridClassName={gridClassName}
                                            showPropertyIcon={showPropertyColumn}
                                            videoDetails={videoDetails}
                                            suggestedNiche={suggestion?.targetNiche}
                                            isTrendsSuggestion={suggestion?.reason === 'trends'}
                                            onConfirmSuggestion={onConfirmSuggestion}
                                            trafficType={trafficEdge?.type}
                                            trafficSource={trafficEdge?.source}
                                            onToggleTrafficType={onToggleTrafficType}
                                            viewerType={viewerEdge?.type}
                                            viewerSource={viewerEdge?.source}
                                            onToggleViewerType={onToggleViewerType}
                                            activeTooltipId={hoveredTooltipId}
                                            onTooltipEnter={handleTooltipEnter}
                                            onTooltipLeave={handleTooltipLeave}
                                            currentVideo={currentVideo}
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
