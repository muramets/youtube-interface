import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ArrowUpDown } from 'lucide-react';

interface VerticalSpreadControlProps {
    value: number;
    onChange: (value: number) => void;
    isLoading?: boolean;
}

export const VerticalSpreadControl: React.FC<VerticalSpreadControlProps> = ({
    value,
    onChange,
    isLoading = false
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartY, setDragStartY] = useState(0);
    const [startValue, setStartValue] = useState(0);

    const buttonRef = useRef<HTMLDivElement>(null);
    const [showTooltip, setShowTooltip] = useState(false);

    // Format value for display (e.g. 100%)
    const displayValue = Math.round(value * 100) + '%';

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (isLoading) return;

        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragStartY(e.clientY);
        setStartValue(value);
        setShowTooltip(false);

        // Disable text selection and enforce cursor during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';
    }, [isLoading, value]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaY = dragStartY - e.clientY; // Up moves positive
            const sensitivity = 0.005; // 200px = full range

            // Range: 0 (Line) to 1 (Fit In)
            const newValue = Math.max(0, Math.min(1, startValue + deltaY * sensitivity));

            onChange(newValue);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isDragging, dragStartY, startValue, onChange]);

    return (
        <div className="relative group/spread">
            {/* Main Pill Container */}
            <div
                ref={buttonRef}
                onMouseDown={handleMouseDown}
                onMouseEnter={() => !isDragging && setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className={`
                    flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5
                    bg-bg-secondary/90 backdrop-blur-md border border-border rounded-full shadow-lg
                    transition-all duration-200 select-none
                    ${isDragging ? 'cursor-ns-resize ring-1 ring-text-primary/20 bg-bg-secondary' : 'cursor-ns-resize hover:bg-hover-bg'}
                    ${isLoading ? 'opacity-50 cursor-default' : ''}
                `}
            >
                {/* Value Display */}
                <div className={`text-[10px] font-mono font-medium text-text-secondary tracking-tighter tabular-nums ${isDragging ? 'text-text-primary' : ''}`}>
                    {displayValue}
                </div>

                {/* Icon */}
                <ArrowUpDown size={14} className={`text-text-tertiary transition-colors ${isDragging ? 'text-text-primary' : 'group-hover/spread:text-text-primary'}`} />
            </div>

            {/* Tooltip (Left side) */}
            {showTooltip && !isDragging && !isLoading && (
                <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 pointer-events-none z-50 whitespace-nowrap">
                    <div className="bg-black/90 backdrop-blur text-white text-[10px] px-2 py-1 rounded shadow-xl border border-white/10">
                        vertical spread (drag)
                    </div>
                </div>
            )}

            {/* Drag Slider Indicator (Appears ABOVE the pill during drag) */}
            {isDragging && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none z-50 flex flex-col items-center">
                    {/* Slider Track */}
                    <div className="h-24 w-1.5 rounded-full bg-bg-secondary border border-white/10 backdrop-blur-md overflow-hidden relative shadow-xl">
                        {/* Fill Bar (Bottom Up) */}
                        <div
                            className="absolute bottom-0 w-full bg-primary transition-all duration-75 ease-out"
                            style={{ height: `${value * 100}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
