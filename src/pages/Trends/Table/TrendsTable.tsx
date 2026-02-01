import React from 'react';
import { useTrendChannelTableData } from '../hooks/useTrendChannelTableData';
import { useTrendTableData } from '../hooks/useTrendTableData';
import { format } from 'date-fns';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { TrendVideo, TrendChannel, TrendSortConfig, TrendSortKey, TrendRow, TrendTotals, TrendVideoRow, TrendChannelRow } from '../../../core/types/trends';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { VideoPreviewTooltip } from '../../../features/Video/components/VideoPreviewTooltip';

interface TrendsTableProps {
    videos: TrendVideo[];
    channels?: TrendChannel[];
    channelId: string;
    mode?: 'videos' | 'channels';
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

export const TrendsTable: React.FC<TrendsTableProps> = ({ videos, channels = [], channelId, mode = 'videos' }) => {
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
                            <td className="py-4 px-6 text-sm text-text-primary" colSpan={2}>
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
                            <tr key={row.video.id} className="hover:bg-white/5 transition-colors group">
                                <td className="py-3 px-6">
                                    <PortalTooltip
                                        content={
                                            <VideoPreviewTooltip
                                                videoId={row.video.id}
                                                title={row.video.title}
                                                channelTitle={row.video.channelTitle}
                                                viewCount={row.video.viewCount}
                                                publishedAt={row.video.publishedAt}
                                                description={row.video.description}
                                                tags={row.video.tags}
                                            />
                                        }
                                        variant="glass"
                                        sizeMode="fixed"
                                        side="bottom"
                                        align="center"
                                        enterDelay={500}
                                    >
                                        <div className="flex items-start gap-4 cursor-pointer">
                                            <div className="relative w-32 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-bg-primary">
                                                <img
                                                    src={row.video.thumbnail}
                                                    alt=""
                                                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                                                />
                                                {row.video.duration && (
                                                    <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-medium text-white">
                                                        {formatDuration(row.video.duration || '')}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 pt-0.5">
                                                <div className="font-medium text-text-primary text-sm line-clamp-2 leading-tight group-hover:text-white transition-colors mb-1">
                                                    {row.video.title}
                                                </div>
                                                {row.video.channelTitle && (
                                                    <div className="text-xs text-text-secondary">
                                                        {row.video.channelTitle}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </PortalTooltip>
                                </td>
                                <td className="py-3 px-4 text-sm text-text-secondary whitespace-nowrap">
                                    {format(new Date(row.video.publishedAt), 'MMM d, yyyy')}
                                </td>
                                <td className="py-3 px-4 text-sm text-text-primary text-right font-mono">
                                    {formatNumber(row.video.viewCount)}
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
                    )}


                    {
                        rows.length === 0 && (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-text-secondary">
                                    No videos found.
                                </td>
                            </tr>
                        )
                    }
                </tbody >
            </table >
        </div >

    );
};

// Helper Components & Functions

const DeltaValue: React.FC<{ value: number | null }> = ({ value }) => {
    if (value === null) return <span className="text-text-tertiary">-</span>;
    if (value === 0) return <span className="text-text-secondary">0</span>;
    const isPositive = value > 0;
    return (
        <span className={`${isPositive ? 'text-green-400' : 'text-red-400'} font-mono`}>
            {isPositive ? '+' : ''}{formatNumber(value)}
        </span>
    );
};

// Helper for formatting numbers compactly
const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
};

// Helper for duration
const formatDuration = (isoDuration: string): string => {
    if (!isoDuration) return '';
    const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return '';
    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');

    if (hours) {
        return `${hours}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
    }
    return `${minutes || '0'}:${seconds.padStart(2, '0')}`;
};
