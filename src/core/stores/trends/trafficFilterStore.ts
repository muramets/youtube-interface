import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrafficFilter, TrafficSortConfig } from '../../types/traffic';

/**
 * BUSINESS LOGIC: Traffic Filter Persistence Store
 * 
 * This store manages filter and sorting state for the Traffic tab with context-aware persistence.
 * 
 * KEY CONCEPTS:
 * 1. Context-Based Storage: Each version/period/snapshot maintains independent filters and sorts
 * 2. Automatic Persistence: Filters and sorts survive page reloads and navigation
 * 3. User-Controlled Clearing: Only explicit user actions remove filters
 * 
 * CONTEXT KEY FORMATS:
 * - Snapshot view: `snapshot-${snapshotId}`
 * - Version period: `version-${versionNumber}-period-${periodIndex}`
 * 
 * EXAMPLE USAGE:
 * ```typescript
 * const contextKey = selectedSnapshot 
 *   ? `snapshot-${selectedSnapshot}`
 *   : `version-${viewingVersion}-period-${viewingPeriodIndex}`;
 * 
 * const filters = useTrafficFilterStore(state => state.filtersByContext[contextKey] || []);
 * const sortConfig = useTrafficFilterStore(state => state.sortsByContext[contextKey] || null);
 * ```
 */

interface TrafficFilterState {
    /**
     * Map of context keys to their filter arrays.
     * Each context (snapshot or version+period) maintains its own filter state.
     */
    filtersByContext: Record<string, TrafficFilter[]>;

    /**
     * Map of context keys to their sort configuration.
     * Each context maintains its own sort state.
     */
    sortsByContext: Record<string, TrafficSortConfig | null>;

    /**
     * Map of context keys to their view mode ('cumulative' | 'delta').
     * Each context maintains its own view mode state.
     */
    viewModesByContext: Record<string, 'cumulative' | 'delta'>;

    /**
     * Set filters for a specific context.
     * This completely replaces the filter array for the given context.
     */
    setFilters: (contextKey: string, filters: TrafficFilter[]) => void;

    /**
     * Clear all filters for a specific context.
     * Called when user clicks "Clear All" button.
     */
    clearFilters: (contextKey: string) => void;

    /**
     * Get filters for a specific context.
     * Returns empty array if no filters exist for this context.
     */
    getFilters: (contextKey: string) => TrafficFilter[];

    /**
     * Set the sort configuration for a specific context.
     */
    setSort: (contextKey: string, sort: TrafficSortConfig | null) => void;

    /**
     * Set the view mode for a specific context.
     */
    setViewMode: (contextKey: string, mode: 'cumulative' | 'delta') => void;
}

export const useTrafficFilterStore = create<TrafficFilterState>()(
    persist(
        (set, get) => ({
            filtersByContext: {},
            sortsByContext: {},
            viewModesByContext: {},

            setFilters: (contextKey, filters) => set((state) => ({
                filtersByContext: {
                    ...state.filtersByContext,
                    [contextKey]: filters
                }
            })),

            clearFilters: (contextKey) => set((state) => ({
                filtersByContext: {
                    ...state.filtersByContext,
                    [contextKey]: []
                }
            })),

            getFilters: (contextKey) => {
                return get().filtersByContext[contextKey] || [];
            },

            setSort: (contextKey, sort) => set((state) => ({
                sortsByContext: {
                    ...state.sortsByContext,
                    [contextKey]: sort
                }
            })),

            setViewMode: (contextKey, mode) => set((state) => ({
                viewModesByContext: {
                    ...state.viewModesByContext,
                    [contextKey]: mode
                }
            }))
        }),
        {
            name: 'traffic-filters-storage',
            // Only persist the filter and sort data, not the getter functions
            partialize: (state) => ({
                filtersByContext: state.filtersByContext,
                sortsByContext: state.sortsByContext,
                viewModesByContext: state.viewModesByContext
            })
        }
    )
);
