// =============================================================================
// Persistent Context Bar — shows what data Gemini "remembers" in this conversation.
// Renders above the message list, collapsed by default.
// =============================================================================

import React, { useCallback } from 'react';
import type { AppContextItem } from '../../../core/types/appContext';
import { getContextItemKey } from '../../../core/types/appContext';
import { ContextAccordion } from './ContextAccordion';

interface PersistedContextBarProps {
    items: AppContextItem[];
    onRemoveItem: (updatedItems: AppContextItem[]) => void;
    onClear: () => void;
}

export const PersistedContextBar: React.FC<PersistedContextBarProps> = ({ items, onRemoveItem, onClear }) => {
    const handleRemoveItem = useCallback((item: AppContextItem) => {
        const itemKey = getContextItemKey(item);
        onRemoveItem(items.filter(i => getContextItemKey(i) !== itemKey));
    }, [items, onRemoveItem]);

    if (items.length === 0) return null;

    return (
        <div className="px-3.5 py-1.5 border-b border-border bg-card-bg">
            <ContextAccordion
                items={items}
                onRemoveItem={handleRemoveItem}
                onClearAll={onClear}
                defaultExpanded={false}
                label="Memory"
                invertChevron
            />
        </div>
    );
};
