import React, { useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useSmoothDrag } from './hooks/useSmoothDrag';
import { ControlPill } from './components/ControlPill';

interface TimeDistributionControlProps {
    value: number;
    onChange: (value: number) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    isLoading?: boolean;
}

export const TimeDistributionControl: React.FC<TimeDistributionControlProps> = ({
    value,
    onChange,
    onDragStart,
    onDragEnd,
    isLoading = false
}) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const buttonRef = useRef<HTMLDivElement>(null);

    const { isDragging, handleMouseDown } = useSmoothDrag({
        value,
        onChange,
        onDragStart,
        onDragEnd,
        axis: 'x',
        isLoading,
    });

    // Ensure strictly clamped value for display
    const safeValue = Math.max(0, Math.min(1, value));
    const displayValue = Math.round(safeValue * 100) + '%';

    return (
        <div className="relative group/pill">
            <ControlPill
                orientation="horizontal"
                containerRef={buttonRef}
                text={displayValue}
                icon={<ArrowLeftRight size={14} />}
                isDragging={isDragging}
                isLoading={isLoading}
                onMouseDown={handleMouseDown}
                onMouseEnter={() => !isDragging && setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                // Fixed width for TimeDistribution to match Scale Pill if needed, or let content define it
                // Using w-[92px] as requested previously for extra spacing
                className="w-[92px]"
            />

            {/* Tooltip */}
            {showTooltip && !isDragging && !isLoading && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 pointer-events-none z-50 whitespace-nowrap">
                    <div className="bg-black/90 backdrop-blur text-white text-[10px] px-2 py-1 rounded shadow-xl border border-white/10">
                        time distribution
                    </div>
                </div>
            )}

            {/* Drag Slider Indicator */}
            {isDragging && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 pointer-events-none z-50 flex flex-col items-center">
                    <div className="w-24 h-1.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-md overflow-hidden relative shadow-2xl">
                        <div
                            className="absolute left-0 h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-75 ease-out"
                            style={{ width: `${safeValue * 100}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
