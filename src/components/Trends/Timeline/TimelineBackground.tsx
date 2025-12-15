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
        // Linearity 1.0 -> 0 opacity
        // Linearity 0.0 -> 0.15 opacity (visible but subtle)
        // Fade starts around 0.8
        if (timeLinearity > 0.8) return 0;
        const fade = (0.8 - timeLinearity) / 0.8; // 0 to 1
        return 0.05 + fade * 0.1; // Min 0.05, Max 0.15
    }, [timeLinearity]);

    const dayOpacity = useMemo(() => {
        // Linearity > 0.4 -> 0 opacity
        // Fade starts around 0.4
        if (timeLinearity > 0.4) return 0;
        const fade = (0.4 - timeLinearity) / 0.4; // 0 to 1
        return 0.02 + fade * 0.06; // Min 0.02, Max 0.08 (Very subtle)
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
                                            className={`absolute top-0 bottom-0 border-l ${isWeek ? 'border-text-secondary/20' : 'border-text-secondary/10'}`}
                                            style={{
                                                left: `${(dayIndex / region.daysInMonth) * 100}%`,
                                                opacity: isWeek ? weekOpacity : dayOpacity,
                                                // borderColor removed to allow class colors to work
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
