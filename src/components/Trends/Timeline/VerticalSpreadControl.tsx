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

    // Ensure strictly clamped value for display to prevent artifacts
    const safeValue = Math.max(0, Math.min(1, value));

    // Format value for display (e.g. 100%)
    const displayValue = Math.round(safeValue * 100) + '%';

    // Constant for drag sensitivity (~66px = full range)
    const DRAG_SENSITIVITY = 0.015;

    // Smoothing state
    const rafRef = useRef<number | null>(null);
    const targetValueRef = useRef(value);
    const currentValueRef = useRef(value);

    // Sync refs when not dragging to prevent jumps when starting next drag
    useEffect(() => {
        if (!isDragging) {
            targetValueRef.current = value;
            currentValueRef.current = value;
        }
    }, [value, isDragging]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (isLoading) return;

        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragStartY(e.clientY);
        setStartValue(value);
        setShowTooltip(false);

        // Initialize smoothing refs
        targetValueRef.current = value;
        currentValueRef.current = value;

        // Disable text selection and enforce cursor during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';
    }, [isLoading, value]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaY = dragStartY - e.clientY; // Up moves positive

            // Calculate RAW constant target based on mouse position
            // Range: 0 (Line) to 1 (Fit In)
            // Clamp strictly between 0 and 1
            const rawTarget = Math.max(0, Math.min(1, startValue + deltaY * DRAG_SENSITIVITY));
            targetValueRef.current = rawTarget;
        };

        // Animation loop for smoothing
        const animate = () => {
            if (!isDragging) return;

            // Lerp factor: 0.15 = snappy but smooth, 0.05 = very floaty
            const lerpFactor = 0.15;

            const current = currentValueRef.current;
            const target = targetValueRef.current;

            // Simple Lerp
            const next = current + (target - current) * lerpFactor;

            // Update ref
            currentValueRef.current = next;

            // Only update if difference is significant to save renders
            if (Math.abs(target - current) > 0.0001) {
                onChange(next);
                rafRef.current = requestAnimationFrame(animate);
            } else {
                // Snap if very close
                onChange(target);
                rafRef.current = requestAnimationFrame(animate);
            }
        };

        // Start loop
        rafRef.current = requestAnimationFrame(animate);

        const handleMouseUp = () => {
            setIsDragging(false);
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isDragging, dragStartY, startValue, onChange]);

    return (
        <div className="relative group/spread">
            {/* Main Pill Container - Matches ZoomIndicator style (vertical) */}
            <div
                ref={buttonRef}
                onMouseDown={handleMouseDown}
                onMouseEnter={() => !isDragging && setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className={`
                    flex flex-col items-center justify-center gap-1 py-1.5 w-[34px]
                    bg-bg-secondary/90 backdrop-blur-md border border-border rounded-full shadow-lg
                    transition-all duration-200 select-none
                    ${isDragging ? 'cursor-ns-resize ring-1 ring-white/30 brightness-110' : 'cursor-ns-resize hover:brightness-125'}
                    ${isLoading ? 'opacity-50 cursor-default' : ''}
                `}
            >
                {/* Value Display */}
                <div className={`text-[9px] font-mono font-medium text-text-secondary tracking-tighter tabular-nums w-full text-center ${isDragging ? 'text-white' : ''}`}>
                    {displayValue}
                </div>

                {/* Divider - Slightly wider now to match new width? */}
                <div className="w-4 h-[1px] bg-white/10" />

                {/* Icon */}
                <ArrowUpDown size={14} className={`text-text-tertiary transition-colors ${isDragging ? 'text-white' : 'group-hover/spread:text-white'}`} />
            </div>

            {/* Tooltip (Left side) */}
            {showTooltip && !isDragging && !isLoading && (
                <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 pointer-events-none z-50 whitespace-nowrap">
                    <div className="bg-black/90 backdrop-blur text-white text-[10px] px-2 py-1 rounded shadow-xl border border-white/10">
                        vertical spread
                    </div>
                </div>
            )}

            {/* Drag Slider Indicator (Appears ABOVE the pill during drag) */}
            {isDragging && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 pointer-events-none z-50 flex flex-col items-center">
                    {/* Slider Track (Dark background) */}
                    <div className="h-24 w-1.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-md overflow-hidden relative shadow-2xl">
                        {/* Fill Bar (Bottom Up) - WHITE */}
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
