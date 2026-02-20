import React from 'react';

export const PlaylistsPageSkeleton: React.FC = () => {
    return (
        <div className="animate-fade-in p-6 pl-0">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between mb-6">
                <div className="h-8 w-48 bg-bg-secondary rounded relative overflow-hidden">
                    <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-9 h-9 bg-bg-secondary rounded-full relative overflow-hidden">
                        <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                    </div>
                    <div className="w-32 h-9 bg-bg-secondary rounded-lg relative overflow-hidden">
                        <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                    </div>
                </div>
            </div>

            {/* Grid Skeleton */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-3">
                        {/* Cover Image */}
                        <div className="aspect-video bg-bg-secondary rounded-xl relative overflow-hidden">
                            <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                        </div>
                        {/* Meta */}
                        <div className="flex flex-col gap-2">
                            <div className="h-5 w-3/4 bg-bg-secondary rounded relative overflow-hidden">
                                <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                            </div>
                            <div className="h-4 w-1/2 bg-bg-secondary rounded relative overflow-hidden">
                                <div className="shimmer-overlay" style={{ backgroundSize: '200% 100%' }} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
