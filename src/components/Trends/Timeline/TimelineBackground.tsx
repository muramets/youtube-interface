import React, { useMemo } from 'react';
import type { MonthRegion } from '../../../types/trends';

interface TimelineBackgroundProps {
    monthRegions: MonthRegion[];
    transform: { scale: number; offsetX: number };
    worldWidth: number;
    timeLinearity: number;
}

export const TimelineBackground: React.FC<TimelineBackgroundProps> = ({
    monthRegions,
    transform,
    worldWidth,
    timeLinearity
}) => {
    // Determine opacities
    const weekOpacity = useMemo(() => {
        if (timeLinearity > 0.8) return 0;
        return Math.min(1, (0.8 - timeLinearity) * 2.5);
    }, [timeLinearity]);

    const dayOpacity = useMemo(() => {
        if (timeLinearity > 0.4) return 0;
        return Math.min(1, (0.4 - timeLinearity) * 2.5);
    }, [timeLinearity]);

    return (
        <div className="absolute inset-0 top-12 pointer-events-none overflow-hidden z-0">
            <div
                style={{
                    transform: `translateX(${transform.offsetX}px) scaleX(${transform.scale})`,
                    transformOrigin: '0 0',
                    width: worldWidth,
                    height: '100%',
                    position: 'relative'
                }}
            >
                {/* Month Backgrounds & Borders */}
                {monthRegions.map((region, i) => (
                    <div
                        key={`bg-${region.month}-${region.year}`}
                        className={`h-full border-l border-black/5 dark:border-white/5 ${i % 2 === 0 ? 'bg-black/5 dark:bg-white/5' : 'bg-transparent'}`}
                        style={{
                            position: 'absolute',
                            left: `${region.startX * 100}%`,
                            width: `${(region.endX - region.startX) * 100}%`
                        }}
                    >
                        {/* Grid Lines (Only render if visible) */}
                        {weekOpacity > 0 && (
                            <div className="absolute inset-0 w-full h-full">
                                {Array.from({ length: region.daysInMonth }).map((_, dayIndex) => {
                                    const day = dayIndex + 1;
                                    const isWeek = day % 7 === 1; // Approx weeks

                                    // Optimization: Skip rendering days if opacity is 0
                                    if (!isWeek && dayOpacity <= 0) return null;

                                    return (
                                        <div
                                            key={`grid-${region.month}-${day}`}
                                            className="absolute top-0 bottom-0 border-l border-black/5 dark:border-white/5"
                                            style={{
                                                left: `${(dayIndex / region.daysInMonth) * 100}%`,
                                                opacity: isWeek ? weekOpacity : dayOpacity,
                                                borderColor: isWeek ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.05)'
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
