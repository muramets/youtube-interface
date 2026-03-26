// =============================================================================
// TrendsTable — powered by DataTable
//
// Dual-mode table: videos (with thumbnails, selection) or channels (with avatars).
// Data hooks (useTrendTableData, useTrendChannelTableData) provide sorted rows +
// sort state — DataTable renders the infrastructure.
// =============================================================================

import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { Info } from 'lucide-react';
import { useTrendChannelTableData } from '../hooks/useTrendChannelTableData';
import { useTrendTableData } from '../hooks/useTrendTableData';
import { DataTable, DeltaCell, DataTableRow } from '../../../components/ui/organisms/DataTable';
import type { ColumnDef, SortConfig } from '../../../components/ui/organisms/DataTable';
import { Checkbox } from '../../../components/ui/atoms/Checkbox/Checkbox';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { VideoPreviewTooltip, PREVIEW_DIMENSIONS } from '../../../features/Video/components/VideoPreviewTooltip';
import { formatNumber, formatDuration } from '../utils/formatters';
import type {
    TrendVideo, TrendChannel, TrendSortKey,
    TrendVideoRow, TrendChannelRow, TrendTotals,
} from '../../../core/types/trends';

interface TrendsTableProps {
    videos: TrendVideo[];
    channels?: TrendChannel[];
    channelId: string;
    mode?: 'videos' | 'channels';
    selectedIds?: Set<string>;
    onToggleSelection?: (video: TrendVideo, position: { x: number; y: number }, isModifier: boolean) => void;
    onToggleAll?: () => void;
    onChannelClick?: (channelId: string) => void;
}

// Stable constant for empty array to prevent infinite loops
const EMPTY_CHANNELS: TrendChannel[] = [];

export const TrendsTable = React.memo<TrendsTableProps>(({
    videos,
    channels = [],
    channelId,
    mode = 'videos',
    selectedIds,
    onToggleSelection,
    onToggleAll,
    onChannelClick,
}) => {
    // Data hooks
    const videoData = useTrendTableData(channelId, videos);
    const channelData = useTrendChannelTableData(mode === 'channels' ? channels : EMPTY_CHANNELS, videos);

    const activeData = mode === 'channels' ? channelData : videoData;
    const { rows, isLoading, error, sortConfig, onSort, totals } = activeData;

    // Adapt TrendSortConfig → DataTable SortConfig
    const dtSortConfig: SortConfig = sortConfig;
    const handleSort = (key: string) => onSort(key as TrendSortKey);

    // Helper to get total view count regardless of type
    const getTotalViewCount = (t: TrendTotals | null) => {
        if (!t) return 0;
        return t.type === 'channel' ? t.totalViews : t.viewCount;
    };

    // Selection state for header checkbox
    const isAllSelected = selectedIds?.size === videos.length && videos.length > 0;
    const isIndeterminate = (selectedIds?.size || 0) > 0 && !isAllSelected;

    // --- Video mode columns ---
    const videoColumns = useMemo((): ColumnDef<TrendVideoRow>[] => [
        {
            key: 'checkbox',
            header: (
                <Checkbox
                    checked={!!isAllSelected}
                    indeterminate={!!isIndeterminate}
                    onChange={() => onToggleAll?.()}
                    disabled={videos.length === 0}
                />
            ),
            width: '48px',
            align: 'center',
            render: () => null, // rendered in custom renderRow
        },
        {
            key: 'video',
            header: 'Video',
            width: '1fr',
            align: 'left',
            sortKey: 'title',
            render: () => null, // rendered in custom renderRow
        },
        {
            key: 'publishedAt',
            header: 'Published',
            width: '120px',
            align: 'left',
            sortKey: 'publishedAt',
            render: (row) => (
                <span className="text-sm text-text-secondary whitespace-nowrap">
                    {format(new Date(row.video.publishedAt), 'MMM d, yyyy')}
                </span>
            ),
            renderTotal: () => <span className="text-sm">Total</span>,
        },
        {
            key: 'viewCount',
            header: 'Total Views',
            width: '110px',
            align: 'right',
            sortKey: 'viewCount',
            render: (row) => (
                <span className="text-sm text-text-primary font-mono">
                    {formatNumber(row.video.viewCount)}
                </span>
            ),
            renderTotal: () => (
                <span className="text-sm font-mono">
                    {formatNumber(getTotalViewCount(totals))}
                </span>
            ),
        },
        {
            key: 'delta24h',
            header: 'Last 24h',
            width: '90px',
            align: 'right',
            sortKey: 'delta24h',
            render: (row) => <DeltaCell delta={row.delta24h} compact />,
            renderTotal: () => <DeltaCell delta={totals?.delta24h ?? null} compact />,
        },
        {
            key: 'delta7d',
            header: 'Last 7d',
            width: '90px',
            align: 'right',
            sortKey: 'delta7d',
            render: (row) => <DeltaCell delta={row.delta7d} compact />,
            renderTotal: () => <DeltaCell delta={totals?.delta7d ?? null} compact />,
        },
        {
            key: 'delta30d',
            header: 'Last 30d',
            width: '90px',
            align: 'right',
            sortKey: 'delta30d',
            render: (row) => <DeltaCell delta={row.delta30d} compact />,
            renderTotal: () => <DeltaCell delta={totals?.delta30d ?? null} compact />,
        },
    ], [totals, isAllSelected, isIndeterminate, onToggleAll, videos.length]);

    // --- Channel mode columns ---
    const channelColumns = useMemo((): ColumnDef<TrendChannelRow>[] => [
        {
            key: 'channel',
            header: 'Channel',
            width: '1fr',
            align: 'left',
            sortKey: 'title',
            render: (row) => (
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-bg-primary border border-border">
                        <img src={row.channel.avatarUrl} alt={row.channel.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="font-medium text-text-primary">{row.channel.title}</div>
                </div>
            ),
            renderTotal: () => <span>Total</span>,
        },
        {
            key: 'videoCount',
            header: 'Videos',
            width: '80px',
            align: 'left',
            sortKey: 'videoCount',
            render: (row) => <span className="text-sm text-text-secondary font-mono">{row.videoCount}</span>,
            renderTotal: () => {
                const t = totals as TrendChannelRow['type'] extends 'channel' ? typeof totals : never;
                return <span className="text-sm font-mono">{t && 'videoCount' in t ? t.videoCount : ''}</span>;
            },
        },
        {
            key: 'totalViews',
            header: 'Total Views',
            width: '110px',
            align: 'right',
            sortKey: 'totalViews',
            render: (row) => <span className="text-sm text-text-primary font-mono">{formatNumber(row.totalViews)}</span>,
            renderTotal: () => <span className="text-sm font-mono">{formatNumber(getTotalViewCount(totals))}</span>,
        },
        {
            key: 'delta24h',
            header: 'Last 24h',
            width: '90px',
            align: 'right',
            sortKey: 'delta24h',
            render: (row) => <DeltaCell delta={row.delta24h} compact />,
            renderTotal: () => <DeltaCell delta={totals?.delta24h ?? null} compact />,
        },
        {
            key: 'delta7d',
            header: 'Last 7d',
            width: '90px',
            align: 'right',
            sortKey: 'delta7d',
            render: (row) => <DeltaCell delta={row.delta7d} compact />,
            renderTotal: () => <DeltaCell delta={totals?.delta7d ?? null} compact />,
        },
        {
            key: 'delta30d',
            header: 'Last 30d',
            width: '90px',
            align: 'right',
            sortKey: 'delta30d',
            render: (row) => <DeltaCell delta={row.delta30d} compact />,
            renderTotal: () => <DeltaCell delta={totals?.delta30d ?? null} compact />,
        },
    ], [totals]);

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center text-red-400">
                Failed to load trend data
            </div>
        );
    }

    if (mode === 'channels') {
        return (
            <DataTable
                columns={channelColumns}
                data={rows as TrendChannelRow[]}
                rowKey={(row) => row.channel.id}
                sortConfig={dtSortConfig}
                onSort={handleSort}
                isLoading={isLoading}
                loadingText="Loading historical data..."
                config={{
                    showTotalRow: !isLoading && !!totals && rows.length > 0,
                    emptyState: <div className="text-center py-12 text-text-secondary">No videos found.</div>,
                    className: 'flex-1 backdrop-blur-sm',
                }}
                renderRow={(row, index, rowProps) => (
                    <DataTableRow
                        {...rowProps}
                        className="py-3 cursor-pointer"
                        onClick={() => onChannelClick?.(row.channel.id)}
                    >
                        {channelColumns.filter(c => !c.hidden).map(col => (
                            <div
                                key={col.key}
                                className={`flex items-center ${col.align === 'right' ? 'justify-end text-right' : ''}`}
                            >
                                {col.render(row, index)}
                            </div>
                        ))}
                    </DataTableRow>
                )}
            />
        );
    }

    // Video mode — custom renderRow for thumbnail + checkbox + tooltip
    return (
        <DataTable
            columns={videoColumns}
            data={rows as TrendVideoRow[]}
            rowKey={(row) => row.video.id}
            sortConfig={dtSortConfig}
            onSort={handleSort}
            isLoading={isLoading}
            loadingText="Loading historical data..."
            config={{
                showTotalRow: !isLoading && !!totals && rows.length > 0,
                emptyState: <div className="text-center py-12 text-text-secondary">No videos found.</div>,
                className: 'flex-1 backdrop-blur-sm',
            }}
            renderRow={(row, _index, rowProps) => (
                <DataTableRow
                    {...rowProps}
                    className="py-3"
                    onClick={(e) => onToggleSelection?.(row.video, { x: e.clientX, y: e.clientY }, e.metaKey || e.ctrlKey)}
                >
                    {/* Checkbox */}
                    <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                            checked={!!selectedIds?.has(row.video.id)}
                            onChange={() => {
                                const x = window.innerWidth / 2;
                                const y = window.innerHeight / 2;
                                onToggleSelection?.(row.video, { x, y }, true);
                            }}
                        />
                    </div>
                    {/* Video cell — thumbnail + title + channel + info tooltip */}
                    <div className="flex items-start gap-4 cursor-pointer py-0.5">
                        <div className="relative w-32 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-bg-primary">
                            <img
                                src={row.video.thumbnail}
                                alt=""
                                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                            />
                            {row.video.duration && (
                                <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-medium text-white">
                                    {formatDuration(row.video.duration)}
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 pt-0.5 flex flex-col gap-1">
                            <div className="flex items-start gap-2">
                                <div className="font-medium text-text-primary text-sm line-clamp-2 leading-tight">
                                    {row.video.title}
                                </div>
                                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5" onClick={(e) => e.stopPropagation()}>
                                    <PortalTooltip
                                        content={
                                            <div className="pointer-events-auto">
                                                <VideoPreviewTooltip
                                                    video={{
                                                        videoId: row.video.id,
                                                        title: row.video.title,
                                                        channelTitle: row.video.channelTitle,
                                                        viewCount: row.video.viewCount,
                                                        publishedAt: row.video.publishedAt,
                                                        description: row.video.description,
                                                        tags: row.video.tags,
                                                        delta24h: row.delta24h,
                                                        delta7d: row.delta7d,
                                                        delta30d: row.delta30d,
                                                    }}
                                                    className="w-full"
                                                />
                                            </div>
                                        }
                                        variant="glass"
                                        sizeMode="fixed"
                                        fixedDimensions={PREVIEW_DIMENSIONS.full}
                                        side="bottom"
                                        align="left"
                                        enterDelay={500}
                                        triggerClassName="flex items-center justify-center"
                                    >
                                        <div className="text-text-secondary hover:text-text-primary cursor-help p-1 -m-1">
                                            <Info size={14} />
                                        </div>
                                    </PortalTooltip>
                                </div>
                            </div>
                            {row.video.channelTitle && (
                                <div className="text-xs text-text-secondary">{row.video.channelTitle}</div>
                            )}
                        </div>
                    </div>
                    {/* Published */}
                    <div className="flex items-center">
                        <span className="text-sm text-text-secondary whitespace-nowrap">
                            {format(new Date(row.video.publishedAt), 'MMM d, yyyy')}
                        </span>
                    </div>
                    {/* View Count */}
                    <div className="flex items-center justify-end">
                        <span className="text-sm text-text-primary font-mono">
                            {formatNumber(row.video.viewCount)}
                        </span>
                    </div>
                    {/* Deltas */}
                    <div className="flex items-center justify-end"><DeltaCell delta={row.delta24h} compact /></div>
                    <div className="flex items-center justify-end"><DeltaCell delta={row.delta7d} compact /></div>
                    <div className="flex items-center justify-end"><DeltaCell delta={row.delta30d} compact /></div>
                </DataTableRow>
            )}
        />
    );
});

TrendsTable.displayName = 'TrendsTable';
