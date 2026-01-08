import React, { useCallback, useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { TrafficSource, TrafficGroup } from '../../../../../core/types/traffic';
import { Checkbox } from '../../../../../components/ui/atoms/Checkbox/Checkbox';
import { TrafficRow } from './TrafficRow';
import { TrafficEmptyState } from './TrafficEmptyState';

interface TrafficTableProps {
    data: TrafficSource[];
    totalRow?: TrafficSource;
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
}

type SortKey = keyof TrafficSource;
interface SortConfig {
    key: SortKey;
    direction: 'asc' | 'desc';
}

export const TrafficTable: React.FC<TrafficTableProps> = ({
    data,
    totalRow,
    groups,
    selectedIds,
    onToggleSelection,
    onToggleAll,
    isLoading,
    onUpload,
    hasExistingSnapshot
}) => {
    // Virtualization refs
    const parentRef = useRef<HTMLDivElement>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'views', direction: 'desc' });

    // Helper function to format duration
    const formatDuration = (duration: string) => {
        // If already formatted (HH:MM:SS), return as is
        if (duration.includes(':')) return duration;
        // Otherwise, assume it's seconds and format
        const seconds = parseInt(duration);
        if (isNaN(seconds)) return duration;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Convert duration to seconds for sorting
    const durationToSeconds = (duration: string): number => {
        if (!duration) return 0;
        if (!duration.includes(':')) return parseInt(duration) || 0;
        const parts = duration.split(':').map(p => parseInt(p) || 0);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] || 0;
    };

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
        estimateSize: () => 44, // Approximate height of a row
        overscan: 10, // Render 10 items outside of viewport
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64 text-text-secondary">
                Loading traffic data...
            </div>
        );
    }

    // Premium Empty State
    if (data.length === 0) {
        return (
            <TrafficEmptyState
                onUpload={onUpload}
                hasExistingSnapshot={hasExistingSnapshot}
            />
        );
    }

    return (
        <div className="w-full h-full flex flex-col bg-bg-secondary/30 rounded-xl border border-white/5 overflow-hidden mt-6">
            {/* Fixed Header */}
            <div className="grid grid-cols-[40px_1fr_100px_100px_120px_100px] gap-4 px-4 py-3 bg-white/5 border-b border-white/5 text-xs font-medium text-text-secondary uppercase tracking-wider flex-shrink-0 group">
                <div className="flex items-center justify-center">
                    <Checkbox
                        checked={isAllSelected}
                        indeterminate={isIndeterminate}
                        onChange={handleHeaderCheckbox}
                    />
                </div>
                <div>Traffic Source</div>
                {renderHeaderCell('Impr.', 'impressions')}
                {renderHeaderCell('CTR', 'ctr')}
                {renderHeaderCell('Views', 'views')}
                {renderHeaderCell('AVD', 'avgViewDuration')}
            </div>

            {/* Scrollable Body - Virtualized */}
            <div
                ref={parentRef}
                className="flex-1 overflow-y-auto min-h-0"
            >
                {totalRow && (
                    <div className="sticky top-0 z-10 grid grid-cols-[40px_1fr_100px_100px_120px_100px] gap-4 px-4 py-3 border-b border-white/10 bg-video-edit-bg backdrop-blur-md font-bold text-text-primary text-xs select-none shadow-sm">
                        <div />
                        <div>Total</div>
                        <div className={`text-right ${sortConfig?.key === 'impressions' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                            {totalRow.impressions.toLocaleString()}
                        </div>
                        <div className={`text-right ${sortConfig?.key === 'ctr' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                            {totalRow.ctr}%
                        </div>
                        <div className={`text-right ${sortConfig?.key === 'views' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                            {totalRow.views.toLocaleString()}
                        </div>
                        <div className={`text-right ${sortConfig?.key === 'avgViewDuration' ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                            {formatDuration(totalRow.avgViewDuration)}
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
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
