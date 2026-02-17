import React from 'react';
import { useRulerTicks, type RulerTick } from '../hooks/useRulerTicks';

export type { RulerTick };

interface TimelineRulerProps {
    pxPerSecond: number;
    timelineDuration: number;
    cursorPx: number;
    showCursor: boolean;
    cursorRulerRef: React.RefObject<HTMLDivElement | null>;
    onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
}


/** Ruler with time tick marks, labels, and playback cursor head. */
export const TimelineRuler: React.FC<TimelineRulerProps> = ({
    pxPerSecond,
    timelineDuration,
    cursorPx,
    showCursor,
    cursorRulerRef,
    onClick,
    onMouseDown,
}) => {
    const rulerTicks = useRulerTicks(pxPerSecond, timelineDuration);

    return (
        <div
            className="relative h-5 border-b border-white/[0.06] cursor-crosshair select-none"
            onClick={onClick}
            onMouseDown={onMouseDown}
        >
            {rulerTicks.map((tick, i) => (
                <div
                    key={i}
                    className="absolute top-0"
                    style={{ left: tick.px }}
                >
                    <div
                        className={`w-px ${tick.isMajor
                            ? 'h-full bg-white/[0.10]'
                            : 'h-2 bg-white/[0.05]'
                            }`}
                    />
                    {tick.label !== null && (
                        <span className="absolute top-[5px] left-1 text-[8px] text-text-tertiary/50 leading-none tabular-nums whitespace-nowrap pointer-events-none">
                            {tick.label}
                        </span>
                    )}
                </div>
            ))}

            {/* Playback cursor on ruler */}
            {showCursor && (
                <div
                    ref={cursorRulerRef}
                    className="absolute top-0 left-0 h-full w-0.5 bg-red-500 z-10 pointer-events-none"
                    style={{ transform: `translateX(${cursorPx}px)`, willChange: 'transform' }}
                >
                    {/* Cursor head triangle */}
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 w-0 h-0
                                    border-l-[3px] border-l-transparent
                                    border-r-[3px] border-r-transparent
                                    border-t-[4px] border-t-red-500" />
                </div>
            )}
        </div>
    );
};
