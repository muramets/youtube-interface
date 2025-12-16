import React from 'react';

interface TrendsStatsProps {
    videoCount: number;
    channelCount: number;
    showChannelCount?: boolean;
    isLoading?: boolean;
}

export const TrendsStats: React.FC<TrendsStatsProps> = ({
    videoCount,
    channelCount,
    showChannelCount = true,
    isLoading = false
}) => {
    return (
        <div className="flex items-center gap-4 text-sm">
            <div className="text-text-secondary flex items-center gap-1.5">
                {/* Fixed width container for video count to prevent layout shift */}
                <div className="min-w-[3rem] flex justify-end">
                    {isLoading ? (
                        <div className="h-5 w-full bg-bg-secondary rounded-sm relative overflow-hidden">
                            <div
                                className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                style={{ backgroundSize: '200% 100%' }}
                            />
                        </div>
                    ) : (
                        <span className="text-text-primary font-medium">{videoCount}</span>
                    )}
                </div>
                <span>videos</span>
            </div>
            {showChannelCount && (
                <div className="text-text-secondary flex items-center gap-1.5">
                    {/* Fixed width container for channel count */}
                    <div className="min-w-[2rem] flex justify-end">
                        {isLoading ? (
                            <div className="h-5 w-full bg-bg-secondary rounded-sm relative overflow-hidden">
                                <div
                                    className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                    style={{ backgroundSize: '200% 100%' }}
                                />
                            </div>
                        ) : (
                            <span className="text-text-primary font-medium">{channelCount}</span>
                        )}
                    </div>
                    <span>{channelCount === 1 ? 'channel' : 'channels'} tracked</span>
                </div>
            )}
        </div>
    );
};
