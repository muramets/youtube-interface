import React from 'react'
import type { KnowledgeItem } from '../../../core/types/knowledge'
import type { VideoPreviewData } from '../../Video/types'
import { KnowledgeCard } from './KnowledgeCard'

interface KnowledgeListProps {
    /** Items to display */
    items: KnowledgeItem[]
    /** Called when user clicks Edit on a card */
    onEdit: (item: KnowledgeItem) => void
    /** Called when user clicks Delete on a card */
    onDelete?: (item: KnowledgeItem) => void
    /** Optional empty state message */
    emptyMessage?: string
    /** Video reference map for highlighting video IDs in KI content */
    videoMap?: Map<string, VideoPreviewData>
    /** Show linked video row on video-scoped cards (default: false) */
    showLinkedVideo?: boolean
    /** Set of selected KI IDs (for export selection). */
    selectedIds?: Set<string>
    /** Callback to toggle KI selection. */
    onToggleSelection?: (id: string) => void
}

/**
 * KnowledgeList — renders a list of KnowledgeCard components.
 *
 * Shared between:
 * - Watch Page: video-level KI (AI Research tab)
 * - Knowledge Page: channel-level KI (full page)
 */
export const KnowledgeList = React.memo(({
    items,
    onEdit,
    onDelete,
    emptyMessage = 'No Knowledge Items yet. Start a chat conversation and analyze content to generate insights.',
    videoMap,
    showLinkedVideo = false,
    selectedIds,
    onToggleSelection,
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
                    onDelete={onDelete}
                    videoMap={videoMap}
                    showLinkedVideo={showLinkedVideo}
                    isSelected={selectedIds?.has(item.id)}
                    onToggleSelection={onToggleSelection}
                />
            ))}
        </div>
    )
})
