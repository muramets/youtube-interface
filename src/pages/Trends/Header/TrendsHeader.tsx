import React from 'react';
import { RefreshCw, LayoutGrid, Table2, ChevronRight } from 'lucide-react';
import { useTrendsSync } from '../hooks/useTrendsSync';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import type { TimelineConfig } from '../../../core/types/trends';
import { TrendsStats } from './TrendsStats';
import { TrendsSettings } from './TrendsSettings';
import { TrendsFilterButton } from './TrendsFilterButton';
import { TrendsFilterChips } from './TrendsFilterChips';
import { TrendsExportControls } from './TrendsExportControls';
import type { TrendVideo } from '../../../core/types/trends';

interface TrendsHeaderProps {
    title: string;
    videoCount: number;
    channelCount: number;
    showChannelCount?: boolean;
    timelineConfig: TimelineConfig;
    setTimelineConfig: (config: Partial<TimelineConfig>) => void;
    isLoading: boolean;
    availableMinDate?: number;
    availableMaxDate?: number;
    currentViewMode: 'timeline' | 'table';
    onViewModeChange: (mode: 'timeline' | 'table') => void;
    filteredVideos: TrendVideo[];
    isInsideChannel?: boolean;
    onBackToChannels?: () => void;
    isAppliedFromAllChannels?: boolean;
    onSaveForChannel?: () => void;
    onClearApplied?: () => void;
}

export const TrendsHeader: React.FC<TrendsHeaderProps> = ({
    title,
    videoCount,
    channelCount,
    showChannelCount = true,
    timelineConfig,
    setTimelineConfig,
    isLoading,
    availableMinDate,
    availableMaxDate,
    currentViewMode,
    onViewModeChange,
    filteredVideos,
    isInsideChannel = false,
    onBackToChannels,
    isAppliedFromAllChannels = false,
    onSaveForChannel,
    onClearApplied
}) => {
    const { handleSync, isSyncing, canSync, syncTooltip } = useTrendsSync();

    return (
        <div className="h-14 border-b border-border flex items-center px-4 justify-between flex-shrink-0 bg-bg-primary sticky top-0 z-sticky gap-4">
            {/* Left side: Title + Chips with flex-1 to allow shrinking */}
            <div className="flex items-center gap-4 flex-1 min-w-0 overflow-hidden">
                <h1 className="text-xl font-semibold text-text-primary flex-shrink-0 whitespace-nowrap">
                    <span className="text-text-secondary">Trends Analysis:</span>{' '}
                    {isInsideChannel && onBackToChannels ? (
                        <>
                            <button
                                onClick={onBackToChannels}
                                className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer bg-transparent border-none p-0 font-semibold text-xl"
                            >
                                All Channels
                            </button>
                            <ChevronRight size={16} className="inline mx-1 text-text-tertiary align-middle" />
                            <span>{title}</span>
                        </>
                    ) : (
                        title
                    )}
                </h1>
                <TrendsFilterChips
                    isAppliedFromAllChannels={isAppliedFromAllChannels}
                    onSaveForChannel={onSaveForChannel}
                    onClearApplied={onClearApplied}
                />
            </div>

            <div className="flex items-center gap-6">
                <TrendsStats
                    videoCount={videoCount}
                    channelCount={channelCount}
                    showChannelCount={showChannelCount}
                    isLoading={isLoading}
                />
                {/* Icons aligned with main header (gap-2) */}
                <div className="flex items-center gap-2 mr-2">
                    {/* Sync Button */}
                    <PortalTooltip content={currentViewMode === 'table' ? "Switch to Timeline View to sync" : syncTooltip} side="bottom" align="center">
                        <button
                            onClick={handleSync}
                            disabled={currentViewMode === 'table' || !canSync || isSyncing}
                            className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 ${currentViewMode === 'table' || isSyncing || !canSync
                                ? 'bg-transparent text-text-tertiary cursor-not-allowed'
                                : 'bg-transparent text-text-primary hover:bg-hover-bg'
                                }`}
                        >
                            <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                        </button>
                    </PortalTooltip>

                    {/* Export Controls for All Filtered Videos */}
                    <TrendsExportControls
                        videos={filteredVideos}
                        channelTitle={title}
                        disabled={isLoading}
                    />

                    {/* View Mode Toggle */}
                    <div className="flex items-center gap-1 border border-border rounded-lg bg-bg-secondary/50 p-0.5 ml-2 mr-2">
                        <PortalTooltip content="Timeline View" side="bottom" align="center">
                            <button
                                onClick={(e) => {
                                    e.currentTarget.blur();
                                    onViewModeChange('timeline');
                                }}
                                className={`p-1.5 rounded-md transition-all ${currentViewMode === 'timeline'
                                    ? 'bg-bg-primary shadow-sm text-text-primary'
                                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                                    }`}
                            >
                                <LayoutGrid size={16} />
                            </button>
                        </PortalTooltip>

                        <PortalTooltip content="Table View" side="bottom" align="center">
                            <button
                                onClick={(e) => {
                                    e.currentTarget.blur();
                                    onViewModeChange('table');
                                }}
                                className={`p-1.5 rounded-md transition-all ${currentViewMode === 'table'
                                    ? 'bg-bg-primary shadow-sm text-text-primary'
                                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                                    }`}
                            >
                                <Table2 size={16} />
                            </button>
                        </PortalTooltip>
                    </div>

                    <TrendsFilterButton
                        availableMinDate={availableMinDate}
                        availableMaxDate={availableMaxDate}
                    />
                    <TrendsSettings
                        timelineConfig={timelineConfig}
                        setTimelineConfig={setTimelineConfig}
                        availableMinDate={availableMinDate}
                        availableMaxDate={availableMaxDate}
                        disabled={currentViewMode === 'table'}
                    />
                </div>
            </div>
        </div>
    );
};
