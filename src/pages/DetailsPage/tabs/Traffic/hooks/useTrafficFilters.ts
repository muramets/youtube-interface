import { useCallback } from 'react';
import type { TrafficSource, TrafficFilter, TrafficFilterType, EnrichedTrafficSource } from '../../../../../core/types/traffic';
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
     * 
     * @param sources List of traffic sources to filter
     * @param groups Optional list of groups (niches) needed for 'niche' filter
     */
    const applyFilters = useCallback((sources: TrafficSource[], groups?: import('../../../../../core/types/traffic').TrafficGroup[]) => {
        if (filters.length === 0) return sources;

        // Pre-compute VideoID -> Set<NicheID> map if Niche filter is active, for O(1) lookup
        // Pre-compute VideoID -> Set<NicheID> map if Niche or NicheProperty filter is active
        const nicheFilter = filters.find(f => f.type === 'niche');
        const nichePropertyFilter = filters.find(f => f.type === 'nicheProperty');
        let videoIdToGroupIds: Map<string, Set<string>> | undefined;

        if ((nicheFilter || nichePropertyFilter) && groups) {
            videoIdToGroupIds = new Map();
            groups.forEach(g => {
                g.videoIds.forEach(vid => {
                    const set = videoIdToGroupIds!.get(vid) || new Set();
                    set.add(g.id);
                    videoIdToGroupIds!.set(vid, set);
                });
            });
        }

        return sources.filter(source => {
            return filters.every(filter => {
                // Special handling for independent Hide Zero filters
                if (filter.type === 'hideZeroViews') {
                    return (source.views || 0) > 0;
                }
                if (filter.type === 'hideZeroImpressions') {
                    return (source.impressions || 0) > 0;
                }

                if (filter.type === 'niche') {
                    // Logic: source.videoId must belong to one of the selected niches
                    // UNASSIGNED handling: if 'UNASSIGNED' is selected, include sources with no videoId OR videoId not in any group.
                    if (!groups || !videoIdToGroupIds || !Array.isArray(filter.value)) return true; // Can't filter without groups or value

                    const selectedIds = filter.value as string[];
                    const sourceVideoId = source.videoId;

                    // Is source Unassigned?
                    const isUnassigned = !sourceVideoId || !videoIdToGroupIds.has(sourceVideoId);

                    // If source is unassigned and UNASSIGNED is selected -> keep
                    if (isUnassigned && selectedIds.includes('UNASSIGNED')) return true;

                    // If source is assigned, check if its group is selected
                    if (!isUnassigned && sourceVideoId) {
                        const sourceGroupIds = videoIdToGroupIds.get(sourceVideoId);
                        if (sourceGroupIds) {
                            // Does source belong to ANY selected group?
                            for (const gid of sourceGroupIds) {
                                if (selectedIds.includes(gid)) return true;
                            }
                        }
                    }

                    return false;
                }

                if (filter.type === 'trafficType' || filter.type === 'viewerType') {
                    // Inject property check (Source is actually EnrichedTrafficSource)
                    const enrichedSource = source as EnrichedTrafficSource;

                    const actualType = filter.type === 'trafficType'
                        ? enrichedSource.trafficType
                        : enrichedSource.viewerType;

                    const actualSource = filter.type === 'trafficType'
                        ? enrichedSource.trafficSource
                        : enrichedSource.viewerSource;

                    const selectedValues = Array.isArray(filter.value) ? filter.value : [filter.value];

                    // Split checking: "Smart Assistant" refers to SOURCE, others refer to TYPE
                    const isSmartAssistantSelected = selectedValues.includes('smart_assistant');
                    const selectedMainTypes = selectedValues.filter((v: string | number) => v !== 'smart_assistant');

                    // 1. Check Source Match
                    if (isSmartAssistantSelected && actualSource === 'smart_assistant') {
                        return true;
                    }

                    // 2. Check Type Match
                    if (selectedMainTypes.includes(actualType || 'unknown')) {
                        return true;
                    }

                    return false;
                }

                if (filter.type === 'nicheProperty') {
                    if (!groups || !videoIdToGroupIds) return true; // Can't filter without context

                    const selectedProperties = Array.isArray(filter.value) ? filter.value : [filter.value];
                    const sourceVideoId = source.videoId;

                    if (!sourceVideoId) return false;

                    const sourceGroupIds = videoIdToGroupIds.get(sourceVideoId);
                    if (!sourceGroupIds) return false; // Not in any niche -> no property property

                    // Check if *any* of the assigned niches has one of the selected properties
                    for (const gid of sourceGroupIds) {
                        const group = groups.find(g => g.id === gid);
                        if (group && group.property && selectedProperties.includes(group.property)) {
                            return true;
                        }
                    }
                    return false;
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
                    const [min, max] = filter.value as [number, number];
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
