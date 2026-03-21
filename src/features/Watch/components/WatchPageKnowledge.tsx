import React, { useState, useCallback, useMemo } from 'react'
import { useAuth } from '../../../core/hooks/useAuth'
import { useChannelStore } from '../../../core/stores/channelStore'
import { useVideoKnowledgeItems, useUpdateKnowledgeItem, useDeleteKnowledgeItem } from '../../../core/hooks/useKnowledgeItems'
import { useKnowledgeSaveHandler } from '../../Knowledge/hooks/useKnowledgeSaveHandler'
import { useVideosCatalog } from '../../../core/hooks/useVideosCatalog'
import { useKnowledgeCatalog } from '../../../core/hooks/useKnowledgeCatalog'
import { buildCatalogVideoMap } from '../../Knowledge/utils/videoRefMap'
import { KnowledgeList } from '../../Knowledge/components/KnowledgeList'
import { KnowledgeItemModal } from '../../Knowledge/modals/KnowledgeItemModal'
import type { KnowledgeItem } from '../../../core/types/knowledge'

interface WatchPageKnowledgeProps {
    videoId: string
}

/**
 * WatchPageKnowledge — AI Research tab content for the Watch Page.
 *
 * Connects useVideoKnowledgeItems → KnowledgeList, with edit support
 * via KnowledgeItemModal + useUpdateKnowledgeItem mutation.
 */
export const WatchPageKnowledge = React.memo(({ videoId }: WatchPageKnowledgeProps) => {
    const { user } = useAuth()
    const { currentChannel } = useChannelStore()

    const userId = user?.uid ?? ''
    const channelId = currentChannel?.id ?? ''

    const { items, isLoading, error } = useVideoKnowledgeItems(userId, channelId, videoId)
    const updateMutation = useUpdateKnowledgeItem(userId, channelId)
    const deleteMutation = useDeleteKnowledgeItem(userId, channelId)
    const videoCatalog = useVideosCatalog()
    const videoMap = useMemo(() => buildCatalogVideoMap(videoCatalog), [videoCatalog])
    const knowledgeCatalog = useKnowledgeCatalog()

    const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null)

    const handleEdit = useCallback((item: KnowledgeItem) => {
        setEditingItem(item)
    }, [])

    const handleSave = useKnowledgeSaveHandler(editingItem, updateMutation)

    const handleDelete = useCallback((item: KnowledgeItem) => {
        deleteMutation.mutate(item.id)
    }, [deleteMutation])

    if (isLoading) {
        return (
            <div className="space-y-3 mt-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 rounded-lg bg-bg-secondary animate-pulse" />
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="mt-4 p-4 rounded-lg bg-bg-secondary text-sm text-text-secondary">
                Failed to load Knowledge Items. Try refreshing the page.
            </div>
        )
    }

    return (
        <>
            <div className="mt-4">
                <KnowledgeList
                    items={items}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    videoMap={videoMap}
                    emptyMessage="No AI research yet. Use the chat to analyze this video and generate Knowledge Items."
                />
            </div>

            {editingItem && (
                <KnowledgeItemModal
                    item={editingItem}
                    onSave={handleSave}
                    onClose={() => setEditingItem(null)}
                    videoCatalog={videoCatalog}
                    knowledgeCatalog={knowledgeCatalog}
                />
            )}
        </>
    )
})
