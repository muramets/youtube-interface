import { memo } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Checkbox } from '../../atoms/Checkbox/Checkbox';
import type { ColumnDef, SortConfig } from './types';

// =============================================================================
// DataTableHeader — Sortable header row
//
// Renders a CSS Grid row of header cells with sort indicators.
// Unsorted columns show a ghost ArrowDown on group-hover.
// =============================================================================

interface DataTableHeaderProps<T> {
    columns: ColumnDef<T>[];
    gridStyle: React.CSSProperties;
    sortConfig?: SortConfig | null;
    onSort?: (key: string) => void;
    // Selection
    selectable?: boolean;
    isAllSelected?: boolean;
    isIndeterminate?: boolean;
    onToggleAll?: () => void;
    disabled?: boolean;
}

function DataTableHeaderInner<T>({
    columns,
    gridStyle,
    sortConfig,
    onSort,
    selectable,
    isAllSelected,
    isIndeterminate,
    onToggleAll,
    disabled,
}: DataTableHeaderProps<T>) {
    return (
        <div
            className="grid gap-2 px-4 py-3 bg-text-primary/5 text-xs font-medium text-text-secondary uppercase tracking-wider flex-shrink-0 group"
            style={gridStyle}
        >
            {selectable && (
                <div className="flex items-center justify-center">
                    <Checkbox
                        checked={!!isAllSelected}
                        indeterminate={!!isIndeterminate}
                        onChange={() => onToggleAll?.()}
                        disabled={disabled}
                    />
                </div>
            )}
            {columns.filter(c => !c.hidden).map(col => {
                const isSorted = sortConfig?.key === col.sortKey;
                const canSort = !!col.sortKey;
                const align = col.align ?? 'left';

                return (
                    <div
                        key={col.key}
                        className={`flex items-center gap-1 ${
                            align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
                        } ${canSort ? 'cursor-pointer hover:text-text-primary transition-colors select-none' : ''} ${
                            isSorted ? 'text-text-primary' : ''
                        }`}
                        onClick={() => canSort && col.sortKey && onSort?.(col.sortKey)}
                    >
                        {col.header}
                        {canSort && (
                            <div className="w-3 flex-shrink-0">
                                {isSorted && sortConfig ? (
                                    sortConfig.direction === 'asc'
                                        ? <ArrowUp size={12} />
                                        : <ArrowDown size={12} />
                                ) : (
                                    <ArrowDown size={12} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export const DataTableHeader = memo(DataTableHeaderInner) as typeof DataTableHeaderInner;
