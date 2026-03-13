// =============================================================================
// KnowledgeList — Renders a list of KnowledgeCard components
//
// Shared between Watch Page (video KI) and Lab Page (channel KI).
// Handles empty state and optional category filtering.
// =============================================================================

import { BookOpen } from 'lucide-react';
import type { KnowledgeItem } from '../../../core/types/knowledge';
import { KnowledgeCard } from './KnowledgeCard';

interface KnowledgeListProps {
    items: KnowledgeItem[];
    onEdit?: (item: KnowledgeItem) => void;
    /** Empty state message */
    emptyMessage?: string;
    /** Loading state */
    isLoading?: boolean;
}

export const KnowledgeList: React.FC<KnowledgeListProps> = ({
    items,
    onEdit,
    emptyMessage = 'No research items yet. Start a conversation with the AI assistant to generate insights.',
    isLoading = false,
}) => {
    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="h-20 rounded-lg bg-[var(--color-bg-secondary)] animate-pulse"
                    />
                ))}
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen size={40} className="text-[var(--color-text-tertiary)] mb-3" />
                <p className="text-sm text-[var(--color-text-tertiary)] max-w-sm">
                    {emptyMessage}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {items.map((item) => (
                <KnowledgeCard
                    key={item.id}
                    item={item}
                    onEdit={onEdit}
                />
            ))}
        </div>
    );
};
