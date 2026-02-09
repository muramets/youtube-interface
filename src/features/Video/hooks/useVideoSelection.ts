import { useState, useCallback, useEffect } from 'react';

export const useVideoSelection = () => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
