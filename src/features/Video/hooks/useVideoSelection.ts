import { useCallback, useEffect, useMemo } from 'react';
import { useVideoSelectionStore, selectScope, selectTotalCount } from '../../../core/stores/videoSelectionStore';

/**
 * Hook for video selection within a scoped context (e.g. a playlist).
 *
 * @param persistKey  Scope key (e.g. playlist ID). Selections are stored
 *                    globally in `videoSelectionStore` under `playlist:{key}`.
 *                    Without it a transient "anonymous" scope is used.
 */
export const useVideoSelection = (persistKey?: string) => {
    const scope = persistKey ? `playlist:${persistKey}` : '__anonymous__';

    const selectedIds = useVideoSelectionStore(selectScope(scope));
    const toggleSelection = useVideoSelectionStore(s => s.toggleSelection);
    const clearScopeFn = useVideoSelectionStore(s => s.clearScope);

    const handleToggle = useCallback(
        (id: string) => toggleSelection(scope, id),
        [scope, toggleSelection],
    );

    const clearSelection = useCallback(
        () => clearScopeFn(scope),
        [scope, clearScopeFn],
    );

    // Handle Escape key to clear ALL selections (cross-playlist)
    const clearAllFn = useVideoSelectionStore(s => s.clearAll);
    const globalTotalCount = useVideoSelectionStore(selectTotalCount);

    useEffect(() => {
        if (globalTotalCount === 0) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // Stop other keydown listeners (e.g. AudioPlayer close) from
                // consuming this same Escape — selection clear takes priority.
                e.stopImmediatePropagation();
                clearAllFn();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [globalTotalCount, clearAllFn]);

    const count = selectedIds.size;

    return useMemo(() => ({
        selectedIds,
        toggleSelection: handleToggle,
        clearSelection,
        count,
        hasSelection: count > 0,
        isSelectionMode: count > 0,
    }), [selectedIds, handleToggle, clearSelection, count]);
};
