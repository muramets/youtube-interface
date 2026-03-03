// =============================================================================
// Persistent Context Bar — shows what data Gemini "remembers" in this conversation.
// Read-only audit trail: renders above the message list, collapsed by default.
// No remove/clear actions — mutations would break mention:// links in messages.
// =============================================================================

import React from 'react';
import type { AppContextItem } from '../../../core/types/appContext';
import { ContextAccordion } from './ContextAccordion';

interface PersistedContextBarProps {
    items: AppContextItem[];
}

export const PersistedContextBar: React.FC<PersistedContextBarProps> = ({ items }) => {
    if (items.length === 0) return null;

    return (
        <div className="px-3.5 py-1.5 border-b border-border bg-card-bg">
            <ContextAccordion
                items={items}
                defaultExpanded={false}
                label="Memory"
                invertChevron
            />
        </div>
    );
};
