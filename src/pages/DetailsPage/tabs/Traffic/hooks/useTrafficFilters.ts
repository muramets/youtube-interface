import { useCallback } from 'react';
import type { TrafficSource, TrafficFilter, TrafficFilterType } from '../../../../../core/types/traffic';
import { durationToSeconds } from '../utils/formatters';
import { useTrafficFilterStore } from '../../../../../core/stores/trafficFilterStore';

/**
 * BUSINESS LOGIC: Traffic Filters Hook
 * 
 * This hook provides filter management for the Traffic tab with automatic persistence.
 * 
 * KEY FEATURES:
 * 1. Context-Aware Persistence: Filters are saved per version/period/snapshot
 * 2. Automatic State Sync: Filters load automatically when context changes
 * 3. Single Filter Per Type: Adding a filter replaces any existing filter of the same type
 * 
 * CONTEXT DETERMINATION:
 * - If viewing a snapshot: contextKey = `snapshot-${snapshotId}`
 * - If viewing a version period: contextKey = `version-${versionNumber}-period-${periodIndex}`
 * 
 * This ensures that:
 * - Each snapshot maintains its own filter state
 * - Each version period maintains its own filter state
 * - Filters persist across page reloads and navigation
 * - Only explicit user actions (remove/clear) delete filters
 */

interface UseTrafficFiltersProps {
    /**
     * Current viewing context to determine which filters to load/save.
     * Format: `snapshot-${id}` or `version-${v}-period-${p}`
     */
    contextKey: string;
}

export const useTrafficFilters = ({ contextKey }: UseTrafficFiltersProps) => {
    // Get store actions and current filters for this context
    const { filtersByContext, setFilters: setStoreFilters, clearFilters: clearStoreFilters } = useTrafficFilterStore();
    const filters = filtersByContext[contextKey] || [];

    /**
     * Add or update a filter for the current context.
     * If a filter of the same type exists, it will be replaced.
     */
    const addFilter = useCallback((filter: Omit<TrafficFilter, 'id'>) => {
        const id = `${filter.type}-${Date.now()}`;

        // Remove existing filter of same type (single filter per type policy)
        const others = filters.filter(f => f.type !== filter.type);
        const newFilters = [...others, { ...filter, id }];

        // Persist to store
        setStoreFilters(contextKey, newFilters);
    }, [contextKey, filters, setStoreFilters]);

    /**
     * Remove a specific filter by ID.
     */
    const removeFilter = useCallback((id: string) => {
        const newFilters = filters.filter(f => f.id !== id);
        setStoreFilters(contextKey, newFilters);
    }, [contextKey, filters, setStoreFilters]);

    /**
     * Clear all filters for the current context.
     */
    const clearFilters = useCallback(() => {
        clearStoreFilters(contextKey);
    }, [contextKey, clearStoreFilters]);

    /**
     * Apply active filters to a list of traffic sources.
     * Returns filtered array based on all active filter criteria.
     */
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

// Re-export types for convenience
export type { TrafficFilter, TrafficFilterType };
