import React from 'react';
import type { MonthRegion, YearMarker } from '../../../types/trends';

interface TimelineDateHeaderProps {
    yearMarkers: YearMarker[];
    monthRegions: MonthRegion[];
    transform: { scale: number; offsetX: number };
    worldWidth: number;
}

export const TimelineDateHeader: React.FC<TimelineDateHeaderProps> = ({ yearMarkers, monthRegions, transform, worldWidth }) => {
    const transformStyle = {
        transform: `translateX(${transform.offsetX}px) scaleX(${transform.scale})`,
        transformOrigin: '0 0' as const,
        width: worldWidth,
        height: '100%',
        position: 'absolute' as const,
        top: 0,
        left: 0,
    };

    return (
        <div className="absolute top-0 left-0 right-0 h-12 border-b border-border z-sticky overflow-hidden">
            {/* LAYER 1: Month Stripes Background (bottom layer) */}
            <div style={transformStyle} className="pointer-events-none">
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

            {/* LAYER 2: Blur Overlay (middle layer) - creates the premium frosted glass effect */}
            <div className="absolute inset-0 backdrop-blur-md bg-bg-primary/70" />

            {/* LAYER 3: Text Labels (top layer) */}
            <div style={transformStyle}>
                {/* Year Row */}
                {yearMarkers.map((yearMarker) => (
                    <div
                        key={`year-${yearMarker.year}`}
                        className="absolute h-5 top-0 flex items-center justify-center"
                        style={{
                            left: `${yearMarker.startX * 100}%`,
                            width: `${(yearMarker.endX - yearMarker.startX) * 100}%`
                        }}
                    >
                        <span
                            className="text-xs font-bold text-text-secondary tracking-widest select-none"
                            style={{
                                transform: `scaleX(${1 / transform.scale})`,
                                transformOrigin: 'center',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {yearMarker.year}
                        </span>
                    </div>
                ))}

                {/* Month Row */}
                {monthRegions.map((region) => {
                    const renderedWidth = (region.endX - region.startX) * worldWidth * transform.scale;
                    const showText = renderedWidth > 45;

                    return (
                        <div
                            key={`month-${region.month}-${region.year}`}
                            className="absolute h-7 top-5 flex items-center justify-center"
                            style={{
                                left: `${region.startX * 100}%`,
                                width: `${(region.endX - region.startX) * 100}%`
                            }}
                        >
                            {showText && (
                                <span
                                    className="text-[10px] font-semibold text-text-secondary tracking-widest uppercase select-none"
                                    style={{
                                        transform: `scaleX(${1 / transform.scale})`,
                                        transformOrigin: 'center',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {region.month}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
