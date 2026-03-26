import type { ReactNode } from 'react';

// =============================================================================
// DataTable — Type definitions
//
// Generic table infrastructure: column definitions, sort config, table config.
// Each consumer (Traffic Sources, Suggested Traffic, Trends) defines its own
// ColumnDef<T> array — DataTable handles the rest.
// =============================================================================

/** Single column definition. Generic over row data type T. */
export interface ColumnDef<T> {
    /** Unique key for this column (used as React key) */
    key: string;
    /** Header label (text or ReactNode for custom headers like checkboxes) */
    header: ReactNode;
    /** CSS Grid track size: '1fr', '70px', '2fr', 'minmax(80px, 1fr)', etc. */
    width: string;
    /** Text alignment within cells */
    align?: 'left' | 'right' | 'center';
    /** Sort key — enables sorting on this column. Omit to disable sort for this column. */
    sortKey?: string;
    /** Render cell content for a given row item */
    render: (item: T, index: number) => ReactNode;
    /** Render total row cell. Omit to render empty cell in totals. */
    renderTotal?: () => ReactNode;
    /** Conditionally hide this column */
    hidden?: boolean;
}

/** Sort state for a table. */
export interface SortConfig {
    key: string;
    direction: 'asc' | 'desc';
}

/** Configuration for DataTable behavior. */
export interface DataTableConfig {
    /** Enable TanStack Virtual for large datasets */
    virtualize?: boolean;
    /** Row height in px — required when virtualize=true */
    rowHeight?: number;
    /** Virtual overscan count (default: 25) */
    overscan?: number;
    /** Show sticky total row at top of scrollable body */
    showTotalRow?: boolean;
    /** Content to display when data is empty */
    emptyState?: ReactNode;
    /** Additional CSS class on the outer container */
    className?: string;
    /** Bottom padding inside the virtual scroll area (px) */
    virtualBottomPadding?: number;
}

/** Props for the generic DataTable component. */
export interface DataTableProps<T> {
    /** Column definitions */
    columns: ColumnDef<T>[];
    /** Row data */
    data: T[];
    /** Extract a unique key for each row */
    rowKey: (item: T, index: number) => string;
    /** Table configuration */
    config?: DataTableConfig;
    /** Current sort state (controlled) */
    sortConfig?: SortConfig | null;
    /** Sort handler (controlled) */
    onSort?: (key: string) => void;
    /** Loading state */
    isLoading?: boolean;
    /** Loading text */
    loadingText?: string;

    // --- Selection ---
    /** Set of selected row keys */
    selectedKeys?: Set<string>;
    /** Toggle selection for a single row */
    onToggleSelection?: (key: string, index: number, event: React.MouseEvent) => void;
    /** Toggle all rows */
    onToggleAll?: () => void;
    /** Whether to show checkboxes */
    selectable?: boolean;

    // --- Custom row rendering ---
    /** Override default row rendering. When provided, DataTable renders this
     *  instead of auto-generating cells from column defs.
     *  Receives the row wrapper props (hover-trail, selection, alternating bg)
     *  that should be spread onto the outer element. */
    renderRow?: (item: T, index: number, rowProps: DataTableRowProps) => ReactNode;
}

/** Props passed to DataTableRow (or to renderRow for custom rows). */
export interface DataTableRowProps {
    /** Inline gridTemplateColumns style (Tailwind JIT can't generate dynamic grid-cols-[...]) */
    gridStyle: React.CSSProperties;
    /** Row index (for alternating bg) */
    index: number;
    /** Whether this row is selected */
    isSelected: boolean;
    /** Click handler for the row */
    onClick?: (e: React.MouseEvent) => void;
    /** Additional className */
    className?: string;
}
