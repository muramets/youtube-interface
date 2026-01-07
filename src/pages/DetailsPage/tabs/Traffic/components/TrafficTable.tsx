import React, { useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TrafficSource, TrafficGroup } from '../../../../../core/types/traffic';
import { Checkbox } from '../../../../../components/ui/atoms/Checkbox/Checkbox';
import { TrafficRow } from './TrafficRow';

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
}

export const TrafficTable: React.FC<TrafficTableProps> = ({
    data,
    totalRow,
    groups,
    selectedIds,
    onToggleSelection,
    onToggleAll,
    isLoading
}) => {
    // Virtualization refs
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: data.length,
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

    const isAllSelected = data.length > 0 && data.every(d => d.videoId && selectedIds.has(d.videoId));
    const isIndeterminate = data.some(d => d.videoId && selectedIds.has(d.videoId)) && !isAllSelected;

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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64 text-text-secondary">
                Loading traffic data...
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col bg-bg-secondary/30 rounded-xl border border-white/5 overflow-hidden mt-6">
            {/* Fixed Header */}
            <div className="grid grid-cols-[40px_1fr_100px_100px_120px_100px] gap-4 px-4 py-3 bg-white/5 border-b border-white/5 text-xs font-medium text-text-secondary uppercase tracking-wider flex-shrink-0">
                <div className="flex items-center justify-center">
                    <Checkbox
                        checked={isAllSelected}
                        indeterminate={isIndeterminate}
                        onChange={handleHeaderCheckbox}
                    />
                </div>
                <div>Traffic Source</div>
                <div className="text-right">Impr.</div>
                <div className="text-right">CTR</div>
                <div className="text-right">Views</div>
                <div className="text-right">AVD</div>
            </div>

            {/* Scrollable Body - Virtualized */}
            <div
                ref={parentRef}
                className="flex-1 overflow-y-auto min-h-0"
            >
                {totalRow && (
                    <div className="sticky top-0 z-10 grid grid-cols-[40px_1fr_100px_100px_120px_100px] gap-4 px-4 py-3 border-b border-white/5 bg-video-edit-bg/95 backdrop-blur-sm font-semibold text-text-primary text-sm hover:bg-white/[0.04] transition-colors">
                        <div />
                        <div>Total</div>
                        <div className="text-right">{totalRow.impressions.toLocaleString()}</div>
                        <div className="text-right">{totalRow.ctr}%</div>
                        <div className="text-right text-accent-blue">{totalRow.views.toLocaleString()}</div>
                        <div className="text-right">{formatDuration(totalRow.avgViewDuration)}</div>
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
                        const item = data[virtualRow.index];
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
