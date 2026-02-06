import { useMemo } from 'react';
import type { Playlist } from '../../../core/services/playlistService';

/**
 * Hook for grouping and sorting playlists.
 * 
 * Business Logic:
 * - Groups playlists by their `group` field.
 * - Playlists without a group go to "Ungrouped".
 * - Within each group, playlists are sorted by `order` field.
 * - Group order is determined by `groupOrder` from settings.
 */
export function usePlaylistsGrouping(
    filteredPlaylists: Playlist[],
    groupOrder: string[],
    sortBy: 'default' | 'views' | 'updated' | 'created' = 'default'
) {
    /**
     * Groups playlists by their group field and sorts them according to groupOrder.
     * 
     * Logic:
     * 1. Sort playlists by order within each group (only if sortBy === 'default')
     * 2. Group playlists by group field (or 'Ungrouped' if no group)
     * 3. Sort groups according to groupOrder
     * 
     * Returns array of [groupName, playlists[]] tuples sorted by groupOrder
     */

    const groupedPlaylists = useMemo(() => {
        const groups: Record<string, Playlist[]> = {};

        // Step 0: Initialize with empty arrays for all groups in order
        groupOrder.forEach(g => {
            groups[g] = [];
        });

        // Step 1: Sort playlists by order within each group (only in default/manual mode)
        // Only sort by order field in default/manual mode
        // In other modes, preserve the sort from filteredPlaylists
        const sortedPlaylists = sortBy === 'default'
            ? [...filteredPlaylists].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
            : filteredPlaylists;

        // Step 2: Group playlists
        sortedPlaylists.forEach(p => {
            const groupName = p.group || 'Ungrouped';
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(p);
        });

        // Step 3: Determine group sort order
        const dynamicSortOrder = groupOrder.length > 0 ? groupOrder : [];

        // Step 4: Sort groups according to specified order
        const result = Object.entries(groups).sort(([keyA], [keyB]) => {
            const indexA = dynamicSortOrder.indexOf(keyA);
            const indexB = dynamicSortOrder.indexOf(keyB);

            // Both in list - sort by index
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            // keyA in list, keyB not - keyA first
            if (indexA !== -1) return -1;
            // keyB in list, keyA not - keyB first
            if (indexB !== -1) return 1;
            // Both not in list - sort alphabetically, but "Ungrouped" always last
            if (keyA === 'Ungrouped') return 1;
            if (keyB === 'Ungrouped') return -1;
            return keyA.localeCompare(keyB);
        });

        return result;
    }, [filteredPlaylists, groupOrder, sortBy]);

    /**
     * Extracts unique group names and sorts them.
     * Used for displaying group list in filter dropdown.
     */
    const playlistGroups = useMemo(() => {
        const groups = new Set(
            filteredPlaylists
                .map((p: Playlist) => p.group)
                .filter(Boolean)
        );

        return Array.from(groups).sort((a, b) => {
            if (!a || !b) return 0;

            const idxA = groupOrder.indexOf(a as string);
            const idxB = groupOrder.indexOf(b as string);

            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return (a as string).localeCompare(b as string);
        });
    }, [filteredPlaylists, groupOrder]);

    return {
        groupedPlaylists,
        playlistGroups,
    };
}
