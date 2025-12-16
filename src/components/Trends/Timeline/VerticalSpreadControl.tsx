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

    const buttonRef = useRef<HTMLButtonElement>(null);
    const [showTooltip, setShowTooltip] = useState(false);

    // Format value for display (e.g. 1.2x)
    const displayValue = value.toFixed(1) + 'x';

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (isLoading) return;

        e.preventDefault();
        setIsDragging(true);
        setDragStartY(e.clientY);
        setStartValue(value);
        setShowTooltip(false);

        // Disable text selection during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';
    }, [isLoading, value]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaY = dragStartY - e.clientY; // Up is positive
            const sensitivity = 0.01; // Adjust sensitivity

            // Calculate new value
            // Range: 0.1 to 3.0? Or strictly > 0.
            // Let's assume min 0.1, max 5.0 for safety
            const newValue = Math.max(0.1, Math.min(5.0, startValue + deltaY * sensitivity));

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
        <div className="flex flex-col items-center gap-1 group/spread relative">
            {/* Value Display (Always Visible) */}
            <div className={`text-[10px] font-mono text-text-secondary select-none tracking-tighter tabular-nums transition-opacity ${isLoading || isDragging ? 'opacity-100' : 'opacity-70 group-hover/spread:opacity-100'}`}
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                {displayValue}
            </div>

            {/* Control Button */}
            <button
                ref={buttonRef}
                onMouseDown={handleMouseDown}
                onMouseEnter={() => !isDragging && setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                disabled={isLoading}
                className={`
                    p-1.5 rounded-full backdrop-blur-md transition-all duration-200
                    bg-bg-secondary/90 border border-border shadow-lg
                    ${isDragging ? 'cursor-ns-resize ring-1 ring-white/20 bg-bg-secondary' : 'cursor-ns-resize hover:bg-hover-bg'}
                    ${isLoading ? 'opacity-50 cursor-default' : ''}
                `}
            >
                <ArrowUpDown size={14} className={`text-text-secondary ${isDragging ? 'text-text-primary' : 'group-hover/spread:text-text-primary'}`} />
            </button>

            {/* Tooltip (Only when NOT dragging) */}
            {showTooltip && !isDragging && !isLoading && (
                <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 pointer-events-none z-50 whitespace-nowrap">
                    <div className="bg-black/90 backdrop-blur text-white text-[10px] px-2 py-1 rounded shadow-xl border border-white/10">
                        vertical spread
                    </div>
                </div>
            )}

            {/* Drag Slider Indicator (Visual feedback during drag) */}
            {isDragging && (
                <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 pointer-events-none z-50 flex items-center gap-2">
                    {/* We can show a visual slider bar here if requested, 
                         but user asked for "sleek slider" logic. 
                         Given the gesture is invisible drag, a visual bar might effectively just be the value display updating.
                         However, user said "appears slider... without outline". 
                         Let's add a subtle vertical track next to it to show the range?
                      */}
                    <div className="h-24 w-1 rounded-full bg-white/10 backdrop-blur-sm overflow-hidden relative">
                        {/* Fill bar */}
                        <div
                            className="absolute bottom-0 w-full bg-primary/80 transition-all duration-75 ease-out"
                            style={{ height: `${Math.min(100, Math.max(0, (value / 3.0) * 100))}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
