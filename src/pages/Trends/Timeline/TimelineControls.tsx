import React, { useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { VerticalSpreadControl } from './VerticalSpreadControl';
import { TimeDistributionControl } from './TimeDistributionControl';
import { ControlPill } from './components/ControlPill';

interface TimelineControlsProps {
    scale: number;
    minScale: number;
    onReset: () => void;
    verticalSpread: number;
    onSpreadChange: (level: number) => void;
    onSpreadDragStart?: () => void;
    onSpreadDragEnd?: () => void;
    timeLinearity: number;
    onTimeLinearityChange: (level: number) => void;
    onTimeDragStart?: () => void;
    onTimeDragEnd?: () => void;
    isLoading?: boolean;
}

export const TimelineControls: React.FC<TimelineControlsProps> = ({
    scale,
    minScale,
    onReset,
    verticalSpread,
    onSpreadChange,
    onSpreadDragStart,
    onSpreadDragEnd,
    timeLinearity,
    onTimeLinearityChange,
    onTimeDragStart,
    onTimeDragEnd,
    isLoading = false
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // -- LOGIC --

    // Normalized zoom percentage: minScale = 0%, 1.0 = 100%, higher = higher %
    const zoomRange = 1.0 - minScale;
    const normalizedZoomPercent = (isLoading || zoomRange <= 0)
        ? 0
        : Math.max(0, Math.round(((scale - minScale) / zoomRange) * 100));

    return (
        <div
            ref={containerRef}
            className={`absolute bottom-4 right-6 pointer-events-auto z-sticky group select-none flex flex-col items-end gap-3 ${isLoading ? 'opacity-50 pointer-events-none grayscale' : ''}`}
            onDragStart={(e) => e.preventDefault()}
        >
            {/* 1. Vertical Spread Control (Top) */}
            <VerticalSpreadControl
                value={verticalSpread}
                onChange={onSpreadChange}
                onDragStart={onSpreadDragStart}
                onDragEnd={onSpreadDragEnd}
                isLoading={isLoading}
            />

            {/* 2. Controls Row (Bottom) */}
            <div className="flex items-center gap-2">
                {/* --- Time Distribution (New separate pill) --- */}
                <TimeDistributionControl
                    value={timeLinearity}
                    onChange={onTimeLinearityChange}
                    onDragStart={onTimeDragStart}
                    onDragEnd={onTimeDragEnd}
                    isLoading={isLoading}
                />

                {/* --- Scale Display & Reset (Start of Scale Pill) --- */}
                <div className="group/zoom relative">
                    <ControlPill
                        orientation="horizontal"
                        text={`${normalizedZoomPercent}%`}
                        isLoading={isLoading}
                        className="w-[92px]" // Same width as TimeDistribution
                        icon={
                            <div className="relative flex justify-center group/reset">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onReset(); }}
                                    className="flex items-center justify-center p-0 rounded-full hover:text-text-primary transition-colors disabled:opacity-50"
                                    disabled={isLoading}
                                >
                                    <RotateCcw size={14} />
                                </button>
                                {!isLoading && (
                                    <div className="absolute bottom-full right-0 mb-3 opacity-0 group-hover/reset:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                                        <div className="bg-black/90 backdrop-blur text-white text-[10px] px-2 py-1 rounded shadow-xl border border-white/10">
                                            reset scale (z)
                                        </div>
                                    </div>
                                )}
                            </div>
                        }
                    />
                </div>
            </div>
        </div>
    );
};
