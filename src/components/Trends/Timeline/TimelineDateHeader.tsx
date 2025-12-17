import React from 'react';
import type { MonthRegion, YearMarker } from '../../../types/trends';

interface TimelineDateHeaderProps {
    yearMarkers: YearMarker[];
    monthRegions: MonthRegion[];
    transform: { scale: number; offsetX: number };
    worldWidth: number;
}

export const TimelineDateHeader: React.FC<TimelineDateHeaderProps> = ({ yearMarkers, monthRegions, transform, worldWidth }) => {
    // We render at the "effective" width (worldWidth * scale)
    // This allows children to be positioned by simple percentages relative to the stretched container,
    // OR we can calculate absolute pixel positions.
    // Given React performance, let's keep the parent effectively sized and use % for children to leverage layout engine.

    // Instead of scaling the container, we set its width to the SCALED width.
    // Text elements inside won't inherit any scale, so they remain sharp and stable.
    const effectiveWidth = worldWidth * transform.scale;

    const containerStyle = {
        transform: `translateX(${transform.offsetX}px)`,
        width: effectiveWidth,
        height: '100%',
        position: 'absolute' as const,
        top: 0,
        left: 0,
    };

    return (
        <div className="absolute top-0 left-0 right-0 h-12 border-b border-border overflow-hidden select-none">
            {/* LAYER 1: Month Stripes Background (bottom layer) */}
            <div style={containerStyle} className="pointer-events-none">
                {monthRegions.map((region, i) => (
                    <div
                        key={`stripe-${region.month}-${region.year}`}
                        className={`absolute inset-y-0 border-l border-black/5 dark:border-white/5 ${i % 2 === 0 ? 'bg-black/5 dark:bg-white/5' : 'bg-transparent'}`}
                        style={{
                            left: `${region.startX * 100}%`,
                            width: `${(region.endX - region.startX) * 100}%`
                        }}
                    />
                ))}
            </div>

            {/* LAYER 2: Blur Overlay */}
            <div className="absolute inset-0 backdrop-blur-md bg-bg-primary/70 pointer-events-none" />

            {/* LAYER 3: Text Labels (top layer) */}
            <div style={containerStyle}>
                {/* Year Row */}
                {yearMarkers.map((yearMarker) => (
                    <div
                        key={`year-${yearMarker.year}`}
                        className="absolute h-5 top-0 flex items-center justify-center pointer-events-none"
                        style={{
                            left: `${yearMarker.startX * 100}%`,
                            width: `${(yearMarker.endX - yearMarker.startX) * 100}%`
                        }}
                    >
                        <span className="text-xs font-bold text-text-secondary tracking-widest whitespace-nowrap">
                            {yearMarker.year}
                        </span>
                    </div>
                ))}

                {/* Month Row */}
                {monthRegions.map((region) => {
                    // Check visibility based on pixel width
                    const widthPx = (region.endX - region.startX) * effectiveWidth;

                    // Smooth opacity transition thresholds
                    const MIN_WIDTH = 30;
                    const MAX_WIDTH = 60;
                    const opacity = Math.min(1, Math.max(0, (widthPx - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)));

                    if (opacity < 0.01) return null;

                    return (
                        <div
                            key={`month-${region.month}-${region.year}`}
                            className="absolute h-7 top-5 flex items-center justify-center pointer-events-none"
                            style={{
                                left: `${region.startX * 100}%`,
                                width: `${(region.endX - region.startX) * 100}%`,
                                opacity // Apply calculated opacity
                            }}
                        >
                            <span className="text-[10px] font-semibold text-text-secondary tracking-widest uppercase whitespace-nowrap">
                                {region.month}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
