import { useState, useCallback } from 'react';
import type { SortConfig } from '../types';

// =============================================================================
// useTableSort — Generic sort state management
//
// Provides controlled sort state with toggle behavior:
// - Click unsorted column → sort desc
// - Click sorted column → toggle direction
// =============================================================================

interface UseTableSortOptions {
    /** Initial sort key */
    defaultKey?: string;
    /** Initial sort direction (default: 'desc') */
    defaultDirection?: 'asc' | 'desc';
}

interface UseTableSortReturn {
    sortConfig: SortConfig;
    onSort: (key: string) => void;
}

export function useTableSort({
    defaultKey = '',
    defaultDirection = 'desc',
}: UseTableSortOptions = {}): UseTableSortReturn {
    const [sortConfig, setSortConfig] = useState<SortConfig>({
        key: defaultKey,
        direction: defaultDirection,
    });

    const onSort = useCallback((key: string) => {
        setSortConfig(prev => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'desc' };
        });
    }, []);

    return { sortConfig, onSort };
}
