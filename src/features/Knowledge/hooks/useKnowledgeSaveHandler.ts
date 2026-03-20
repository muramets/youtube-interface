import { useCallback } from 'react'
import type { KnowledgeItem } from '../../../core/types/knowledge'
import type { useUpdateKnowledgeItem } from '../../../core/hooks/useKnowledgeItems'

/** Updates payload passed from KnowledgeItemModal to save handler. */
export interface KnowledgeItemSaveUpdates {
    title: string;
    summary: string;
    content: string;
    videoId?: string;
    scope?: 'video' | 'channel';
    skipVersioning?: boolean;
    lastEditSource?: KnowledgeItem['lastEditSource'];
    lastEditedBy?: string;
    versionIdsToDelete?: string[];
}

/**
 * Shared save handler for KnowledgeItemModal consumers.
 *
 * Extracts `skipVersioning` and `versionIdsToDelete` from modal updates,
 * routes them to the correct mutation parameters. Used by KnowledgePage
 * and WatchPageKnowledge to avoid duplicated callback logic.
 */
export function useKnowledgeSaveHandler(
    editingItem: KnowledgeItem | null,
    updateMutation: ReturnType<typeof useUpdateKnowledgeItem>,
) {
    return useCallback((updates: KnowledgeItemSaveUpdates) => {
        if (!editingItem) return
        const { skipVersioning, versionIdsToDelete, ...firestoreUpdates } = updates
        updateMutation.mutate({
            itemId: editingItem.id,
            updates: firestoreUpdates,
            previousItem: skipVersioning ? undefined : editingItem,
            versionIdsToDelete,
        })
    }, [editingItem, updateMutation])
}
