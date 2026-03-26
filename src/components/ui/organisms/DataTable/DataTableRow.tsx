import { memo, type ReactNode, type MouseEvent } from 'react';

// =============================================================================
// DataTableRow — Base row wrapper
//
// Premium features included by default:
// - Hover-trail: 350ms fade-out, 75ms snap-in (dual-speed transition)
// - Alternating background via index
// - Selection indicator: blue left border + glow shadow
// =============================================================================

interface DataTableRowOwnProps {
    gridStyle: React.CSSProperties;
    index: number;
    isSelected?: boolean;
    onClick?: (e: MouseEvent) => void;
    className?: string;
    children: ReactNode;
}

export const DataTableRow = memo<DataTableRowOwnProps>(({
    gridStyle,
    index,
    isSelected = false,
    onClick,
    className = '',
    children,
}) => {
    return (
        <div
            onClick={onClick}
            className={`
                relative grid gap-2 px-4 py-2.5 items-center
                border-b border-text-primary/[0.03]
                text-xs group ${onClick ? 'cursor-pointer' : ''}
                ${index % 2 === 0 ? 'bg-text-primary/[0.03]' : ''}
                hover:bg-text-primary/[0.05]
                transition-colors duration-[350ms] hover:duration-75
                ${className}
            `}
            style={gridStyle}
        >
            {/* Selection indicator — blue left border + glow */}
            {isSelected && (
                <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#3EA6FF] z-raised shadow-[2px_0_8px_rgba(62,166,255,0.4)]" />
            )}
            {children}
        </div>
    );
});

DataTableRow.displayName = 'DataTableRow';
