import type { Playlist } from '../../../../core/services/playlistService';
import type { DndState, DragDiff } from './types';

/**
 * Determine target group name from a dnd-kit "over" ID.
 *
 * IDs follow conventions:
 *   "group-drop-{name}" — droppable zone
 *   "group-{name}"      — sortable group header
 *   "{playlistId}"      — playlist card
 */
export function resolveTargetGroup(
    overId: string,
    localPlaylists: Playlist[],
    fallbackGroup: string,
): string {
    if (overId.startsWith('group-drop-')) {
        return overId.replace('group-drop-', '');
    }
    if (overId.startsWith('group-')) {
        return overId.replace('group-', '');
    }
    const overPlaylist = localPlaylists.find(p => String(p.id) === overId);
    if (overPlaylist) {
        return overPlaylist.group || 'Ungrouped';
    }
    return fallbackGroup;
}

/**
 * Build grouped playlists from flat local state, sorted by localGroupOrder.
 * Pure function — used in useMemo for optimistic UI.
 */
export function buildOptimisticGroups(
    localPlaylists: Playlist[],
    localGroupOrder: string[],
): [string, Playlist[]][] {
    const groups: Record<string, Playlist[]> = {};

    localGroupOrder.forEach(g => {
        groups[g] = [];
    });

    localPlaylists.forEach(p => {
        const groupName = p.group || 'Ungrouped';
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(p);
    });

    return Object.entries(groups).sort(([keyA], [keyB]) => {
        const indexA = localGroupOrder.indexOf(keyA);
        const indexB = localGroupOrder.indexOf(keyB);

        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        if (keyA === 'Ungrouped') return 1;
        if (keyB === 'Ungrouped') return -1;
        return keyA.localeCompare(keyB);
    });
}

/**
 * Compare drag-start snapshot with current state to determine what changed.
 * Returns a DragDiff describing the persistence action needed.
 */
export function computeDragDiff(state: DndState, activeId: string): DragDiff {
    const movedPlaylist = state.localPlaylists.find(p => String(p.id) === activeId);
    const originalPlaylist = state.initialPlaylists.find(p => String(p.id) === activeId);

    if (!movedPlaylist || !originalPlaylist) {
        return { type: 'none', activeId };
    }

    const finalGroup = movedPlaylist.group || 'Ungrouped';
    const initialGroup = originalPlaylist.group || 'Ungrouped';

    if (finalGroup !== initialGroup) {
        const groupItems = state.localPlaylists.filter(
            p => (p.group || 'Ungrouped') === finalGroup,
        );
        return {
            type: 'cross-group',
            activeId,
            targetGroup: finalGroup,
            orderedIds: groupItems.map(p => String(p.id)),
        };
    }

    // Check within-group reorder
    const finalGroupItems = state.localPlaylists.filter(
        p => (p.group || 'Ungrouped') === finalGroup,
    );
    const initialGroupItems = state.initialPlaylists.filter(
        p => (p.group || 'Ungrouped') === finalGroup,
    );

    const finalIds = finalGroupItems.map(p => String(p.id));
    const initialIds = initialGroupItems.map(p => String(p.id));

    if (finalIds.length !== initialIds.length || finalIds.some((id, i) => id !== initialIds[i])) {
        return {
            type: 'reorder',
            activeId,
            orderedIds: finalIds,
        };
    }

    return { type: 'none', activeId };
}
