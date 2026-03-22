import { useMemo } from 'react'
import { useAuth } from './useAuth'
import { useChannelStore } from '../stores/channelStore'
import { useAllKnowledgeItems } from './useKnowledgeItems'
import type { KiPreviewData } from '../../components/ui/organisms/RichTextEditor/types'

/**
 * Fetches lightweight Knowledge Item catalog for @-autocomplete in RichTextEditor.
 *
 * Maps KnowledgeItem[] → KiPreviewData[] (only fields needed for dropdown + tooltip).
 * Sorted by title. Uses real-time subscription via useAllKnowledgeItems.
 */
export function useKnowledgeCatalog(): KiPreviewData[] {
    const { user } = useAuth()
    const { currentChannel } = useChannelStore()
    const userId = user?.uid ?? ''
    const channelId = currentChannel?.id ?? ''

    const { items } = useAllKnowledgeItems(userId, channelId)

    return useMemo(() =>
        items
            .map(ki => ({
                id: ki.id,
                title: ki.title,
                category: ki.category,
                summary: ki.summary,
                scope: ki.scope,
                videoId: ki.videoId,
            }))
            .sort((a, b) => a.title.localeCompare(b.title)),
    [items])
}
