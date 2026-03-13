// =============================================================================
// WatchPageKnowledge — AI Research tab content for the Watch Page
//
// Displays Knowledge Items for a specific video using KnowledgeList.
// Connects useVideoKnowledgeItems hook → KnowledgeList → KnowledgeItemModal.
// =============================================================================

import { useState, useCallback } from 'react';
import type { KnowledgeItem } from '../../../core/types/knowledge';
import { useVideoKnowledgeItems, useUpdateKnowledgeItem } from '../../../core/hooks/useKnowledgeItems';
import { KnowledgeList } from '../../Knowledge/components/KnowledgeList';
import { KnowledgeItemModal } from '../../Knowledge/modals/KnowledgeItemModal';

interface WatchPageKnowledgeProps {
    userId: string;
    channelId: string;
    videoId: string;
}

export const WatchPageKnowledge: React.FC<WatchPageKnowledgeProps> = ({
    userId,
    channelId,
    videoId,
}) => {
    const { items, isLoading } = useVideoKnowledgeItems(userId, channelId, videoId);
    const updateMutation = useUpdateKnowledgeItem(userId, channelId);

    const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);

    const handleSave = useCallback((updates: { title: string; content: string; summary?: string }) => {
        if (!editingItem) return;
        updateMutation.mutate(
            { itemId: editingItem.id, updates },
            { onSuccess: () => setEditingItem(null) },
        );
    }, [editingItem, updateMutation]);

    return (
        <>
            <KnowledgeList
                items={items}
                isLoading={isLoading}
                onEdit={setEditingItem}
                emptyMessage="No AI research yet. Start a chat conversation and analyze this video to generate insights."
            />

            {editingItem && (
                <KnowledgeItemModal
                    item={editingItem}
                    onSave={handleSave}
                    onClose={() => setEditingItem(null)}
                    isSaving={updateMutation.isPending}
                />
            )}
        </>
    );
};
