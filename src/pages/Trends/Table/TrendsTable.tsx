import React from 'react';
import { useTrendChannelTableData } from '../hooks/useTrendChannelTableData';
import { useTrendTableData } from '../hooks/useTrendTableData';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { TrendVideo, TrendChannel, TrendSortConfig, TrendSortKey, TrendRow, TrendTotals, TrendVideoRow, TrendChannelRow } from '../../../core/types/trends';
import { Checkbox } from '../../../components/ui/atoms/Checkbox/Checkbox';
import { formatNumber } from '../utils/formatters';
import { TrendsVideoRow, DeltaValue } from './TrendsVideoRow';

interface TrendsTableProps {
    videos: TrendVideo[];
    channels?: TrendChannel[];
    channelId: string;
    mode?: 'videos' | 'channels';
    // Selection Props
    selectedIds?: Set<string>;
    onToggleSelection?: (video: TrendVideo, position: { x: number; y: number }, isModifier: boolean) => void;
    onToggleAll?: () => void;
}

interface HeaderCellProps {
    label: string;
    sortKey: TrendSortKey;
    sortConfig: TrendSortConfig;
    onSort: (key: TrendSortKey) => void;
    align?: 'left' | 'right';
    className?: string;
}

const HeaderCell: React.FC<HeaderCellProps> = ({ label, sortKey, sortConfig, onSort, align = 'left', className = '' }) => {
    const renderSortIcon = (key: string) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={14} className="ml-1 text-text-primary" />
            : <ArrowDown size={14} className="ml-1 text-text-primary" />;
    };

    return (
        <th
            className={`py-4 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-white/5 transition-colors select-none ${className}`}
            onClick={() => onSort(sortKey)}
        >
            <div className={`flex items-center ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                {label}
                {renderSortIcon(sortKey)}
            </div>
        </th>
    );
};

// Stable constant for empty array to prevent infinite loops
const EMPTY_CHANNELS: TrendChannel[] = [];

export const TrendsTable = React.memo<TrendsTableProps>(({
    videos,
    channels = [],
    channelId,
    mode = 'videos',
    selectedIds,
    onToggleSelection,
    onToggleAll
}) => {
    // Video Data Hook
    const videoData = useTrendTableData(channelId, videos);

    // Channel Data Hook (only runs if mode is channels)
    const channelData = useTrendChannelTableData(mode === 'channels' ? channels : EMPTY_CHANNELS, videos);

    // Select active data based on mode
    const { rows, isLoading, error, sortConfig, onSort, totals } = mode === 'channels'
        ? {
            rows: channelData.rows as TrendRow[],
            isLoading: channelData.isLoading,
            error: channelData.error,
            sortConfig: channelData.sortConfig,
            onSort: channelData.onSort,
            totals: channelData.totals as TrendTotals | null
        }
        : {
            rows: videoData.rows as TrendRow[],
            isLoading: videoData.isLoading,
            error: videoData.error,
            sortConfig: videoData.sortConfig,
            onSort: videoData.onSort,
            totals: videoData.totals as TrendTotals | null
        };

    const handleSort = (key: TrendSortKey) => {
        onSort(key);
    };

    // Helper to safely access total properties based on type
    const getTotalValue = (totals: TrendTotals | null, field: 'main') => {
        if (!totals) return 0;
        if (field === 'main') {
            return totals.type === 'channel' ? totals.totalViews : totals.viewCount;
        }
        return 0;
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center text-text-secondary">
                <div className="animate-spin mr-3">⟳</div> Loading historical data...
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center text-red-400">
                Failed to load trend data
            </div>
        );
    }

    return (

        <div className="flex-1 overflow-auto bg-bg-secondary/30 backdrop-blur-sm">
            <table className="w-full text-left border-collapse">
                <thead className="bg-bg-secondary sticky top-0 z-10 shadow-sm">
                    <tr>
                        {/* Checkbox Header (Only in Video Mode) */}
                        {mode === 'videos' && (
                            <th className="py-4 px-6 w-12 text-center">
                                <Checkbox
                                    checked={selectedIds?.size === videos.length && videos.length > 0}
                                    indeterminate={(selectedIds?.size || 0) > 0 && (selectedIds?.size || 0) < videos.length}
                                    onChange={() => onToggleAll?.()}
                                    disabled={videos.length === 0}
                                />
                            </th>
                        )}
                        {mode === 'channels' ? (
                            <HeaderCell label="Channel" sortKey="title" className="pl-6 w-[40%]" sortConfig={sortConfig} onSort={handleSort} />
                        ) : (
                            <HeaderCell label="Video" sortKey="title" className="pl-6 w-[40%]" sortConfig={sortConfig} onSort={handleSort} />
                        )}

                        {mode === 'channels' ? (
                            <HeaderCell label="Videos" sortKey="videoCount" sortConfig={sortConfig} onSort={handleSort} />
                        ) : (
                            <HeaderCell label="Published" sortKey="publishedAt" sortConfig={sortConfig} onSort={handleSort} />
                        )}

                        <HeaderCell label="Total Views" sortKey={mode === 'channels' ? 'totalViews' : 'viewCount'} align="right" sortConfig={sortConfig} onSort={handleSort} />
                        <HeaderCell label="Last 24h" sortKey="delta24h" align="right" sortConfig={sortConfig} onSort={handleSort} />
                        <HeaderCell label="Last 7d" sortKey="delta7d" align="right" sortConfig={sortConfig} onSort={handleSort} />
                        <HeaderCell label="Last 30d" sortKey="delta30d" align="right" sortConfig={sortConfig} onSort={handleSort} />
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {/* Totals Row */}
                    {!isLoading && totals && rows.length > 0 && (
                        <tr className="bg-white/5 font-semibold">
                            <td className="py-4 px-6 text-sm text-text-primary" colSpan={mode === 'videos' ? 3 : 2}>
                                Total
                            </td>
                            <td className="py-4 px-4 text-sm text-text-primary text-right font-mono">
                                {formatNumber(getTotalValue(totals, 'main'))}
                            </td>
                            <td className="py-4 px-4 text-right">
                                <DeltaValue value={totals.delta24h} />
                            </td>
                            <td className="py-4 px-4 text-right">
                                <DeltaValue value={totals.delta7d} />
                            </td>
                            <td className="py-4 px-4 text-right">
                                <DeltaValue value={totals.delta30d} />
                            </td>
                        </tr>
                    )}

                    {/* Render Rows based on Mode */}
                    {mode === 'channels' ? (
                        // CHANNEL ROWS
                        (rows as TrendChannelRow[]).map((row) => (
                            <tr key={row.channel.id} className="hover:bg-white/5 transition-colors group cursor-pointer">
                                <td className="py-3 px-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-bg-primary border border-border">
                                            <img
                                                src={row.channel.avatarUrl}
                                                alt={row.channel.title}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <div className="font-medium text-text-primary group-hover:text-white transition-colors">
                                            {row.channel.title}
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-sm text-text-secondary font-mono">
                                    {row.videoCount}
                                </td>
                                <td className="py-3 px-4 text-sm text-text-primary text-right font-mono">
                                    {formatNumber(row.totalViews)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <DeltaValue value={row.delta24h} />
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <DeltaValue value={row.delta7d} />
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <DeltaValue value={row.delta30d} />
                                </td>
                            </tr>
                        ))
                    ) : (
                        // VIDEO ROWS
                        (rows as TrendVideoRow[]).map((row) => (
                            <TrendsVideoRow
                                key={row.video.id}
                                video={row.video}
                                delta24h={row.delta24h}
                                delta7d={row.delta7d}
                                delta30d={row.delta30d}
                                isSelected={!!selectedIds?.has(row.video.id)}
                                onToggleSelection={onToggleSelection}
                            />
                        ))
                    )}


                    {
                        rows.length === 0 && (
                            <tr>
                                <td colSpan={mode === 'videos' ? 7 : 6} className="py-12 text-center text-text-secondary">
                                    No videos found.
                                </td>
                            </tr>
                        )
                    }
                </tbody >
            </table >
        </div >

    );
});

TrendsTable.displayName = 'TrendsTable';
