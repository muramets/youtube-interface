import React, { useRef, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { useSmoothDrag } from './hooks/useSmoothDrag';
import { ControlPill } from './components/ControlPill';

interface VerticalSpreadControlProps {
    value: number;
    onChange: (value: number) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    isLoading?: boolean;
}

export const VerticalSpreadControl: React.FC<VerticalSpreadControlProps> = ({
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
        axis: 'y',
        isLoading,
    });

    // Ensure strictly clamped value for display
    const safeValue = Math.max(0, Math.min(1, value));
    const displayValue = Math.round(safeValue * 100) + '%';

    return (
        <div className="relative group/pill">
            <ControlPill
                orientation="vertical"
                containerRef={buttonRef}
                text={displayValue}
                icon={<ArrowUpDown size={14} />}
                isDragging={isDragging}
                isLoading={isLoading}
                onMouseDown={handleMouseDown}
                onMouseEnter={() => !isDragging && setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
            />

            {/* Tooltip (Left side) */}
            {showTooltip && !isDragging && !isLoading && (
                <div className="absolute bottom-full right-0 mb-3 pointer-events-none z-50 whitespace-nowrap">
                    <div className="bg-black/90 backdrop-blur text-white text-[10px] px-2 py-1 rounded shadow-xl border border-white/10">
                        vertical spread
                    </div>
                </div>
            )}

            {/* Drag Slider Indicator */}
            {isDragging && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 pointer-events-none z-50 flex flex-col items-center">
                    <div className="h-24 w-1.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-md overflow-hidden relative shadow-2xl">
                        <div
                            className="absolute bottom-0 w-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-75 ease-out"
                            style={{ height: `${safeValue * 100}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
