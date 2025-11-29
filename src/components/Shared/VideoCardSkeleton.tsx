import React from 'react';

export const VideoCardSkeleton: React.FC = () => {
    return (
        <div className="flex flex-col gap-3 p-2 rounded-xl">
            {/* Thumbnail Skeleton */}
            <div className="relative aspect-video rounded-xl bg-bg-secondary overflow-hidden">
                <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ backgroundSize: '200% 100%' }} />
            </div>

            {/* Info Skeleton */}
            <div className="flex gap-3 items-start pr-6">
                {/* Avatar Skeleton */}
                <div className="flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-bg-secondary relative overflow-hidden">
                        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ backgroundSize: '200% 100%' }} />
                    </div>
                </div>

                {/* Text Skeleton */}
                <div className="flex flex-col flex-1 gap-2">
                    {/* Title Line 1 */}
                    <div className="h-4 bg-bg-secondary rounded w-full relative overflow-hidden">
                        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ backgroundSize: '200% 100%' }} />
                    </div>
                    {/* Title Line 2 (shorter) */}
                    <div className="h-4 bg-bg-secondary rounded w-3/4 relative overflow-hidden">
                        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ backgroundSize: '200% 100%' }} />
                    </div>

                    {/* Meta Info */}
                    <div className="h-3 bg-bg-secondary rounded w-1/2 mt-1 relative overflow-hidden">
                        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ backgroundSize: '200% 100%' }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
