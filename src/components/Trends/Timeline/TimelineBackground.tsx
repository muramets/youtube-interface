import React from 'react';
import type { MonthRegion } from '../../../types/trends';

interface TimelineBackgroundProps {
    monthRegions: MonthRegion[];
    transform: { scale: number; offsetX: number };
    worldWidth: number;
}

export const TimelineBackground: React.FC<TimelineBackgroundProps> = ({ monthRegions, transform, worldWidth }) => {
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
                {monthRegions.map((region, i) => (
                    <div
                        key={`bg-${region.month}-${region.year}`}
                        className={`h-full border-l border-black/5 dark:border-white/5 ${i % 2 === 0 ? 'bg-black/5 dark:bg-white/5' : 'bg-transparent'}`}
                        style={{
                            position: 'absolute',
                            left: `${region.startX * 100}%`,
                            width: `${(region.endX - region.startX) * 100}%`
                        }}
                    />
                ))}
            </div>
        </div>
    );
};
