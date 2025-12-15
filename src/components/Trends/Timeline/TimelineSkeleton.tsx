import React from 'react';

/**
 * Full-page timeline skeleton matching real timeline structure:
 * - Header with blur + year/month skeleton placeholders
 * - Equal-width month stripe backgrounds
 */
export const TimelineSkeleton: React.FC = () => {
    // 12 equal-width month stripes
    const monthCount = 12;

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
            {/* === HEADER with blur (like TimelineDateHeader) === */}
            <div className="absolute top-0 left-0 right-0 h-12 border-b border-border overflow-hidden z-30">
                {/* LAYER 1: Month stripes in header (bottom layer) */}
                <div className="absolute inset-0 flex">
                    {Array(monthCount).fill(0).map((_, i) => (
                        <div
                            key={i}
                            className={`flex-1 border-l border-black/5 dark:border-white/5 ${i % 2 === 0 ? 'bg-black/5 dark:bg-white/5' : 'bg-transparent'}`}
                        />
                    ))}
                </div>

                {/* LAYER 2: Blur overlay (middle layer - premium frosted glass) */}
                <div className="absolute inset-0 backdrop-blur-md bg-bg-primary/70" />

                {/* LAYER 3: Skeleton placeholders (top layer - above blur) */}
                <div className="absolute inset-0">
                    {/* Year skeleton (top row) */}
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 h-5 flex items-center justify-center">
                        <div className="h-3 w-12 bg-bg-secondary rounded-sm relative overflow-hidden">
                            <div
                                className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                style={{ backgroundSize: '200% 100%' }}
                            />
                        </div>
                    </div>

                    {/* Month skeletons (bottom row) */}
                    <div className="absolute top-5 h-7 left-0 right-0 flex items-center">
                        {Array(monthCount).fill(0).map((_, i) => (
                            <div key={i} className="flex-1 flex justify-center">
                                <div
                                    className="h-2.5 w-6 bg-bg-secondary rounded-sm relative overflow-hidden"
                                >
                                    <div
                                        className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                        style={{ backgroundSize: '200% 100%', animationDelay: `${i * 60}ms` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* === BODY: Month stripes background (equal widths) === */}
            <div className="absolute top-12 bottom-0 left-0 right-0 flex">
                {Array(monthCount).fill(0).map((_, i) => (
                    <div
                        key={i}
                        className={`flex-1 border-l border-black/5 dark:border-white/5 ${i % 2 === 0 ? 'bg-black/5 dark:bg-white/5' : 'bg-transparent'}`}
                    />
                ))}
            </div>
        </div>
    );
};
