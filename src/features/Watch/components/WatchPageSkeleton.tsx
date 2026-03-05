import React from 'react';

export const WatchPageSkeleton: React.FC = () => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 py-6 pr-6 pl-0 w-full max-w-[1800px] mx-auto min-h-screen box-border items-start animate-fade-in">
            {/* Main Content Skeleton */}
            <div className="min-w-0">
                {/* Video Player Skeleton */}
                <div className="w-full aspect-video bg-bg-secondary rounded-xl mb-4 relative overflow-hidden">
                    <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                </div>

                {/* Title Skeleton */}
                <div className="h-7 bg-bg-secondary rounded w-3/4 mb-3 relative overflow-hidden">
                    <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                </div>

                {/* Meta Row Skeleton */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-bg-secondary relative overflow-hidden">
                            <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                        </div>
                        {/* Channel Info */}
                        <div className="flex flex-col gap-2">
                            <div className="h-4 w-32 bg-bg-secondary rounded relative overflow-hidden">
                                <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                            </div>
                            <div className="h-3 w-24 bg-bg-secondary rounded relative overflow-hidden">
                                <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                            </div>
                        </div>
                        {/* Subscribe Button */}
                        <div className="w-24 h-9 bg-bg-secondary rounded-full ml-6 relative overflow-hidden">
                            <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <div className="w-32 h-9 bg-bg-secondary rounded-full relative overflow-hidden">
                            <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                        </div>
                        <div className="w-24 h-9 bg-bg-secondary rounded-full relative overflow-hidden">
                            <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                        </div>
                        <div className="w-9 h-9 bg-bg-secondary rounded-full relative overflow-hidden">
                            <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                        </div>
                    </div>
                </div>

                {/* Description Skeleton */}
                <div className="bg-bg-secondary rounded-xl p-3 h-32 relative overflow-hidden mb-6">
                    <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                </div>
            </div>

            {/* Recommendations Sidebar Skeleton */}
            <div className="w-full lg:w-auto flex-shrink-0 flex flex-col gap-3">
                {/* Filter Bar Skeleton */}
                <div className="flex gap-2 mb-2 overflow-hidden">
                    <div className="w-16 h-8 bg-bg-secondary rounded-lg relative overflow-hidden">
                        <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                    </div>
                    <div className="w-20 h-8 bg-bg-secondary rounded-lg relative overflow-hidden">
                        <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                    </div>
                    <div className="w-24 h-8 bg-bg-secondary rounded-lg relative overflow-hidden">
                        <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                    </div>
                </div>

                {/* List of Recommendation Cards */}
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex gap-2">
                        <div className="w-40 h-24 bg-bg-secondary rounded-xl flex-shrink-0 relative overflow-hidden">
                            <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                        </div>
                        <div className="flex flex-col gap-2 flex-1 pt-1">
                            <div className="h-4 w-full bg-bg-secondary rounded relative overflow-hidden">
                                <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                            </div>
                            <div className="h-3 w-2/3 bg-bg-secondary rounded relative overflow-hidden">
                                <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
