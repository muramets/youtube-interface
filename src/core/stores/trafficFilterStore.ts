import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrafficFilter } from '../types/traffic';

/**
 * BUSINESS LOGIC: Traffic Filter Persistence Store
 * 
 * This store manages filter state for the Traffic tab with context-aware persistence.
 * 
 * KEY CONCEPTS:
 * 1. Context-Based Storage: Each version/period/snapshot maintains independent filters
 * 2. Automatic Persistence: Filters survive page reloads and navigation
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
 * ```
 */

interface TrafficFilterState {
    /**
     * Map of context keys to their filter arrays.
     * Each context (snapshot or version+period) maintains its own filter state.
     */
    filtersByContext: Record<string, TrafficFilter[]>;

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
}

export const useTrafficFilterStore = create<TrafficFilterState>()(
    persist(
        (set, get) => ({
            filtersByContext: {},

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
            }
        }),
        {
            name: 'traffic-filters-storage',
            // Only persist the filter data, not the getter functions
            partialize: (state) => ({
                filtersByContext: state.filtersByContext
            })
        }
    )
);
