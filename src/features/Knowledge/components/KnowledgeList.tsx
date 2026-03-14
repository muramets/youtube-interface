import React from 'react'
import type { KnowledgeItem } from '../../../core/types/knowledge'
import { KnowledgeCard } from './KnowledgeCard'

interface KnowledgeListProps {
    /** Items to display */
    items: KnowledgeItem[]
    /** Called when user clicks Edit on a card */
    onEdit: (item: KnowledgeItem) => void
    /** Optional empty state message */
    emptyMessage?: string
}

/**
 * KnowledgeList — renders a list of KnowledgeCard components.
 *
 * Shared between:
 * - Watch Page: video-level KI (AI Research tab)
 * - Lab Page: channel-level KI (full page)
 */
export const KnowledgeList = React.memo(({
    items,
    onEdit,
    emptyMessage = 'No Knowledge Items yet. Start a chat conversation and analyze content to generate insights.',
}: KnowledgeListProps) => {
    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-text-tertiary max-w-xs leading-relaxed">
                    {emptyMessage}
                </p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-2">
            {items.map(item => (
                <KnowledgeCard
                    key={item.id}
                    item={item}
                    onEdit={onEdit}
                />
            ))}
        </div>
    )
})
