import React from 'react';

/**
 * Skeleton loader for channel list in Trends sidebar.
 * Matches the layout of TrendsChannelItem: avatar + channel name.
 */
export const TrendsChannelSkeleton: React.FC = () => {
    return (
        <ul className="space-y-0.5">
            {[...Array(5)].map((_, index) => (
                <li
                    key={index}
                    className="flex items-center p-2 rounded-lg"
                >
                    {/* Avatar Skeleton */}
                    <div className="w-6 h-6 rounded-full bg-bg-secondary mr-3 relative overflow-hidden">
                        <div
                            className="shimmer-overlay"
                            style={{ backgroundSize: '200% 100%' }}
                        />
                    </div>

                    {/* Channel Name Skeleton - Variable widths for natural look */}
                    <div
                        className="h-3.5 bg-bg-secondary rounded relative overflow-hidden"
                        style={{ width: `${55 + (index % 3) * 15}%` }}
                    >
                        <div
                            className="shimmer-overlay"
                            style={{ backgroundSize: '200% 100%' }}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
};
