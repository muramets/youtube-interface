import { useState, useCallback, useEffect } from 'react';

/** Module-level cache: survives unmount, cleared on full page refresh. */
const selectionCache = new Map<string, Set<string>>();

/**
 * @param persistKey  Optional key (e.g. playlist ID) to persist selection
 *                    across mount/unmount cycles. Without it, selection resets
 *                    on unmount (original behavior).
 */
export const useVideoSelection = (persistKey?: string) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => (persistKey ? selectionCache.get(persistKey) ?? new Set() : new Set()),
    );

    // Sync changes back to cache
    useEffect(() => {
        if (!persistKey) return;
        if (selectedIds.size > 0) {
            selectionCache.set(persistKey, selectedIds);
        } else {
            selectionCache.delete(persistKey);
        }
    }, [persistKey, selectedIds]);

    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    // Handle Escape key to clear selection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedIds.size > 0) {
                // Prevent default behavior if needed, but usually just clearing is enough
                clearSelection();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIds.size, clearSelection]);

    return {
        selectedIds,
        toggleSelection,
        clearSelection,
        count: selectedIds.size,
        hasSelection: selectedIds.size > 0,
        isSelectionMode: selectedIds.size > 0
    };
};
