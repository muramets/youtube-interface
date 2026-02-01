import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useTrendsSync } from '../hooks/useTrendsSync';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui/molecules/Tooltip';
import type { TimelineConfig } from '../../../core/types/trends';
import { TrendsStats } from './TrendsStats';
import { TrendsSettings } from './TrendsSettings';
import { TrendsFilterButton } from './TrendsFilterButton';
import { TrendsFilterChips } from './TrendsFilterChips';

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
    availableMaxDate
}) => {
    const { handleSync, isSyncing, canSync, syncTooltip } = useTrendsSync();

    return (
        <div className="h-14 border-b border-border flex items-center px-4 justify-between flex-shrink-0 bg-bg-primary sticky top-0 z-sticky gap-4">
            {/* Left side: Title + Chips with flex-1 to allow shrinking */}
            <div className="flex items-center gap-4 flex-1 min-w-0 overflow-hidden">
                <h1 className="text-xl font-semibold text-text-primary flex-shrink-0 whitespace-nowrap">
                    <span className="text-text-secondary">Trends Analysis:</span> {title}
                </h1>
                <TrendsFilterChips />
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
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={handleSync}
                                    disabled={!canSync || isSyncing}
                                    className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 ${isSyncing || !canSync
                                        ? 'bg-transparent text-text-tertiary cursor-not-allowed'
                                        : 'bg-transparent text-text-primary hover:bg-hover-bg'
                                        }`}
                                >
                                    <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{syncTooltip}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <TrendsFilterButton availableMinDate={availableMinDate} availableMaxDate={availableMaxDate} />
                    <TrendsSettings
                        timelineConfig={timelineConfig}
                        setTimelineConfig={setTimelineConfig}
                        availableMinDate={availableMinDate}
                        availableMaxDate={availableMaxDate}
                    />
                </div>
            </div>
        </div>
    );
};
