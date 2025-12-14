import React from 'react';

interface TrendsStatsProps {
    videoCount: number;
    channelCount: number;
    showChannelCount?: boolean;
}

export const TrendsStats: React.FC<TrendsStatsProps> = ({ videoCount, channelCount, showChannelCount = true }) => {
    return (
        <div className="flex items-center gap-4 text-sm">
            <div className="text-text-secondary">
                <span className="text-text-primary font-medium">{videoCount}</span> videos
            </div>
            {showChannelCount && (
                <div className="text-text-secondary">
                    <span className="text-text-primary font-medium">{channelCount}</span> {channelCount === 1 ? 'channel' : 'channels'} tracked
                </div>
            )}
        </div>
    );
};
