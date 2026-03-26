/**
 * =============================================================================
 * ORGANISMS - Atomic Design Level 3
 * =============================================================================
 *
 * Организмы — это сложные компоненты, комбинирующие атомы и молекулы.
 * Примеры: Header, Modal, Card, Sidebar, DataTable
 *
 * Они представляют собой законченные секции UI.
 */

export { DataTable, DataTableHeader, DataTableRow, DataTableTotalRow, DeltaCell, ThumbnailCell, useTableSort } from './DataTable';
export type { ColumnDef, SortConfig, DataTableConfig, DataTableProps, DataTableRowProps } from './DataTable';
