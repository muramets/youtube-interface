import React from 'react';

interface ControlPillProps {
    /** 'horizontal' for Time/Scale, 'vertical' for Spread */
    orientation?: 'horizontal' | 'vertical';
    /** The value text to display (e.g. "100%") */
    text: string | React.ReactNode;
    /** The icon or button to display */
    icon: React.ReactNode;
    /** Whether the control is currently being dragged (affects styles) */
    isDragging?: boolean;
    /** Loading state */
    isLoading?: boolean;
    /** Optional click/drag handler for the main container */
    onMouseDown?: (e: React.MouseEvent) => void;
    /** Ref for the container */
    containerRef?: React.Ref<HTMLDivElement>;
    /** Optional extra classes */
    className?: string;
    /** Mouse enter/leave for tooltip coordination */
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

export const ControlPill: React.FC<ControlPillProps> = ({
    orientation = 'horizontal',
    text,
    icon,
    isDragging = false,
    isLoading = false,
    onMouseDown,
    containerRef,
    className = '',
    onMouseEnter,
    onMouseLeave
}) => {
    const isVertical = orientation === 'vertical';

    // Shared Dimensions
    // Horizontal: h-[34px] fixed height
    // Vertical: w-[34px] fixed width
    // Vertical Padding: py-2.5 (10px) to match the visual ~10px left offset of horizontal mode
    const baseDimensions = isVertical ? 'w-[34px] py-2.5' : 'h-[34px] px-1.5 py-1';

    // Flex direction and alignment
    const flexLayout = isVertical ? 'flex-col gap-1.5 items-center' : 'flex-row gap-0 items-center justify-between';

    return (
        <div
            ref={containerRef}
            onMouseDown={onMouseDown}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className={`
                flex ${flexLayout} ${baseDimensions}
                bg-bg-secondary/90 backdrop-blur-md border border-border rounded-full shadow-lg
                select-none transition-all duration-200
                ${isDragging
                    ? 'ring-1 ring-white/30 brightness-110 text-white'
                    : 'text-text-secondary hover:brightness-125'
                }
                ${onMouseDown && !isLoading ? (isVertical ? 'cursor-ns-resize' : 'cursor-ew-resize') : 'cursor-default'}
                ${isLoading ? 'opacity-50 cursor-default' : ''}
                ${className}
            `}
        >
            {/* 1. Value Text */}
            <div className={`
                font-mono font-medium tracking-tighter tabular-nums
                ${isVertical ? 'text-[10px] text-center w-full' : 'text-xs text-right w-[32px] pl-0.5'}
                ${!isDragging && !isVertical ? 'group-hover/pill:text-text-primary' : ''}
            `}>
                {text}
            </div>

            {/* 2. Divider */}
            {isVertical ? (
                <div className="w-4 h-[1px] bg-border flex-shrink-0" />
            ) : (
                <div className="w-[1px] h-3 bg-border mx-1 flex-shrink-0" />
            )}

            {/* 3. Icon Wrapper (Standardized p-1.5) */}
            <div className={`
                flex items-center justify-center p-1.5
                ${!isDragging ? 'text-text-tertiary group-hover/pill:text-text-primary' : 'text-white'}
            `}>
                {icon}
            </div>
        </div>
    );
};
