import React from 'react';
import type { TimelineConfig } from '../../../types/trends';
import { TrendsStats } from './TrendsStats';
import { TrendsSettings } from './TrendsSettings';

interface TrendsHeaderProps {
    title: string;
    videoCount: number;
    channelCount: number;
    showChannelCount?: boolean;
    timelineConfig: TimelineConfig;
    setTimelineConfig: (config: Partial<TimelineConfig>) => void;
    isLoading: boolean;
}

export const TrendsHeader: React.FC<TrendsHeaderProps> = ({
    title,
    videoCount,
    channelCount,
    showChannelCount = true,
    timelineConfig,
    setTimelineConfig,
    isLoading
}) => {
    return (
        <div className="h-14 border-b border-border flex items-center px-4 justify-between flex-shrink-0 bg-bg-primary sticky top-0 z-sticky">
            <h1 className="text-xl font-semibold text-text-primary">
                <span className="text-text-secondary">Trends Analysis:</span> {title}
            </h1>

            <div className="flex items-center gap-6">
                <TrendsStats
                    videoCount={videoCount}
                    channelCount={channelCount}
                    showChannelCount={showChannelCount}
                    isLoading={isLoading}
                />
                <TrendsSettings timelineConfig={timelineConfig} setTimelineConfig={setTimelineConfig} />
            </div>
        </div>
    );
};
