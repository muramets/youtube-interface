import { useState, useCallback, useMemo } from 'react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { FilterOperator } from '../../../../../core/stores/filterStore';
import { durationToSeconds } from '../utils/formatters';

export type TrafficFilterType = 'impressions' | 'ctr' | 'views' | 'avgViewDuration' | 'hideZeroViews' | 'hideZeroImpressions';

export interface TrafficFilter {
    id: string;
    type: TrafficFilterType;
    operator: FilterOperator;
    value: any;
    label: string;
}

export const useTrafficFilters = (initialFilters: TrafficFilter[] = []) => {
    const [filters, setFilters] = useState<TrafficFilter[]>(initialFilters);

    const addFilter = useCallback((filter: Omit<TrafficFilter, 'id'>) => {
        const id = `${filter.type}-${Date.now()}`;
        setFilters(prev => {
            // Remove existing filter of same type if it exists (single filter per type policy)
            const others = prev.filter(f => f.type !== filter.type);
            return [...others, { ...filter, id }];
        });
    }, []);

    const removeFilter = useCallback((id: string) => {
        setFilters(prev => prev.filter(f => f.id !== id));
    }, []);

    const clearFilters = useCallback(() => {
        setFilters([]);
    }, []);

    const applyFilters = useCallback((sources: TrafficSource[]) => {
        if (filters.length === 0) return sources;

        return sources.filter(source => {
            return filters.every(filter => {
                // Special handling for independent Hide Zero filters
                if (filter.type === 'hideZeroViews') {
                    return (source.views || 0) > 0;
                }
                if (filter.type === 'hideZeroImpressions') {
                    return (source.impressions || 0) > 0;
                }

                let itemValue: any = source[filter.type as keyof TrafficSource];

                // Special handling for AVD (string "HH:MM:SS" -> seconds)
                if (filter.type === 'avgViewDuration' && typeof itemValue === 'string') {
                    itemValue = durationToSeconds(itemValue);
                }

                // Numeric comparisons
                if (typeof filter.value === 'number') {
                    const numValue = Number(itemValue);
                    if (isNaN(numValue)) return false;

                    switch (filter.operator) {
                        case 'gt': return numValue > filter.value;
                        case 'gte': return numValue >= filter.value;
                        case 'lt': return numValue < filter.value;
                        case 'lte': return numValue <= filter.value;
                        case 'equals': return numValue === filter.value;
                        default: return true;
                    }
                }

                // Range comparisons (between)
                if (Array.isArray(filter.value) && filter.operator === 'between') {
                    const [min, max] = filter.value;
                    const numValue = Number(itemValue);
                    if (isNaN(numValue)) return false;
                    return numValue >= min && numValue <= max;
                }

                return true;
            });
        });
    }, [filters]);

    return {
        filters,
        addFilter,
        removeFilter,
        clearFilters,
        applyFilters
    };
};
