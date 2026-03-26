import React, { useRef, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '../../atoms/Checkbox/Checkbox';
import { DataTableHeader } from './DataTableHeader';
import { DataTableTotalRow } from './DataTableTotalRow';
import { DataTableRow } from './DataTableRow';
import { alignClass } from './utils';
import type { DataTableProps, ColumnDef } from './types';

/** Build CSS Grid template from pre-filtered visible columns. */
function buildGridTemplate<T>(visibleColumns: ColumnDef<T>[], selectable: boolean): string {
    const tracks = visibleColumns.map(c => c.width);
    if (selectable) tracks.unshift('40px');
    return tracks.join(' ');
}

function DataTableInner<T>({
    columns,
    data,
    rowKey,
    config = {},
    sortConfig,
    onSort,
    isLoading = false,
    loadingText = 'Loading...',
    selectedKeys,
    onToggleSelection,
    onToggleAll,
    selectable = false,
    renderRow,
}: DataTableProps<T>) {
    const parentRef = useRef<HTMLDivElement>(null);
    const {
        virtualize = false,
        rowHeight = 52,
        overscan = 5,
        showTotalRow = false,
        emptyState,
        className = '',
        virtualBottomPadding = 80,
    } = config;

    const visibleColumns = useMemo(() => columns.filter(c => !c.hidden), [columns]);
    const gridStyle = useMemo((): React.CSSProperties => ({
        gridTemplateColumns: buildGridTemplate(visibleColumns, selectable),
    }), [visibleColumns, selectable]);

    // Selection state — only computed when selectable (avoids iterating full dataset otherwise)
    const isAllSelected = selectable && data.length > 0 && data.every((item, i) => selectedKeys?.has(rowKey(item, i)));
    const isIndeterminate = selectable && !isAllSelected && data.some((item, i) => selectedKeys?.has(rowKey(item, i)));

    // eslint-disable-next-line react-hooks/incompatible-library
    const rowVirtualizer = useVirtualizer({
        count: virtualize ? data.length : 0,
        getScrollElement: () => parentRef.current,
        estimateSize: () => rowHeight,
        overscan,
        enabled: virtualize,
    });

    const renderSingleRow = (item: T, index: number) => {
        const key = rowKey(item, index);
        const isSelected = selectedKeys?.has(key) ?? false;

        const rowProps = {
            gridStyle,
            index,
            isSelected,
            onClick: onToggleSelection
                ? (e: React.MouseEvent) => onToggleSelection(key, index, e)
                : undefined,
            className: '',
        };

        if (renderRow) {
            return renderRow(item, index, rowProps);
        }

        return (
            <DataTableRow {...rowProps}>
                {selectable && (
                    <div
                        className="flex items-center justify-center p-2 -m-2 z-raised"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Checkbox
                            checked={isSelected}
                            onChange={() => onToggleSelection?.(key, index, {} as React.MouseEvent)}
                        />
                    </div>
                )}
                {visibleColumns.map(col => (
                    <div key={col.key} className={`flex items-center ${alignClass(col.align)}`}>
                        {col.render(item, index)}
                    </div>
                ))}
            </DataTableRow>
        );
    };

    return (
        <div className={`w-full h-full flex flex-col bg-bg-secondary/30 rounded-xl border border-text-primary/5 overflow-hidden relative ${className}`}>
            <DataTableHeader
                columns={columns}
                gridStyle={gridStyle}
                sortConfig={sortConfig}
                onSort={onSort}
                selectable={selectable}
                isAllSelected={isAllSelected}
                isIndeterminate={isIndeterminate}
                onToggleAll={onToggleAll}
                disabled={isLoading || data.length === 0}
            />

            <div
                ref={parentRef}
                className="flex-1 overflow-y-auto min-h-0 relative custom-scrollbar"
            >
                {isLoading ? (
                    <div className="px-4 py-3 text-xs font-medium text-center flex justify-center items-center">
                        <span className="text-shimmer">{loadingText}</span>
                    </div>
                ) : data.length === 0 ? (
                    emptyState ?? (
                        <div className="text-center py-10 text-text-tertiary text-sm">
                            No data
                        </div>
                    )
                ) : (
                    <>
                        {showTotalRow && (
                            <DataTableTotalRow gridStyle={gridStyle}>
                                {selectable && <div />}
                                {visibleColumns.map(col => (
                                    <div key={col.key} className={`flex items-center ${alignClass(col.align)}`}>
                                        {col.renderTotal?.() ?? null}
                                    </div>
                                ))}
                            </DataTableTotalRow>
                        )}

                        {virtualize ? (
                            <div
                                style={{
                                    height: `${rowVirtualizer.getTotalSize()}px`,
                                    width: '100%',
                                    position: 'relative',
                                    paddingBottom: `${virtualBottomPadding}px`,
                                }}
                            >
                                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const item = data[virtualRow.index];
                                    return (
                                        <div
                                            key={rowKey(item, virtualRow.index)}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: `${virtualRow.size}px`,
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            {renderSingleRow(item, virtualRow.index)}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            data.map((item, index) => (
                                <React.Fragment key={rowKey(item, index)}>
                                    {renderSingleRow(item, index)}
                                </React.Fragment>
                            ))
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;
