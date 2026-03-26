import { memo, type ReactNode } from 'react';

// =============================================================================
// DataTableTotalRow — Sticky total row
//
// Opaque background with subtle shadow for depth separation.
// Note: backdrop-filter blur is NOT possible on sticky elements inside
// overflow:auto containers (Chrome bug). Timeline achieves blur via
// transform-based scrolling — tables use overflow:auto, so we use
// a clean opaque design instead.
// =============================================================================

interface DataTableTotalRowProps {
    gridStyle: React.CSSProperties;
    children: ReactNode;
    className?: string;
}

export const DataTableTotalRow = memo<DataTableTotalRowProps>(({
    gridStyle,
    children,
    className = '',
}) => {
    return (
        <div
            className={`
                sticky top-0 z-sticky grid gap-2 px-4 py-3
                border-b border-text-primary/10
                bg-bg-secondary shadow-xs
                font-bold text-text-primary text-xs select-none
                ${className}
            `}
            style={gridStyle}
        >
            {children}
        </div>
    );
});

DataTableTotalRow.displayName = 'DataTableTotalRow';
