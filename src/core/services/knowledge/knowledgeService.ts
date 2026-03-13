import {
    fetchCollection,
    subscribeToCollection,
    updateDocument,
    deleteDocument,
    setDocument,
} from '../firestore';
import { where, orderBy, serverTimestamp } from 'firebase/firestore';
import type { KnowledgeItem } from '../../types/knowledge';

const getKnowledgeItemsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/knowledgeItems`;

/**
 * Strip undefined values from an object before Firestore write.
 * Firestore throws on undefined — this prevents silent crashes.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
    const result = {} as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result as T;
}

export const KnowledgeService = {
    /**
     * Fetch KI for a specific video (scope='video', filtered by videoId).
     */
    getVideoKnowledgeItems: async (
        userId: string,
        channelId: string,
        videoId: string
    ): Promise<KnowledgeItem[]> => {
        return fetchCollection<KnowledgeItem>(
            getKnowledgeItemsPath(userId, channelId),
            [
                where('videoId', '==', videoId),
                orderBy('createdAt', 'desc'),
            ]
        );
    },

    /**
     * Fetch channel-level KI (scope='channel').
     */
    getChannelKnowledgeItems: async (
        userId: string,
        channelId: string
    ): Promise<KnowledgeItem[]> => {
        return fetchCollection<KnowledgeItem>(
            getKnowledgeItemsPath(userId, channelId),
            [
                where('scope', '==', 'channel'),
                orderBy('createdAt', 'desc'),
            ]
        );
    },

    /**
     * Fetch all KI for the channel (both video and channel scoped).
     */
    getAllKnowledgeItems: async (
        userId: string,
        channelId: string
    ): Promise<KnowledgeItem[]> => {
        return fetchCollection<KnowledgeItem>(
            getKnowledgeItemsPath(userId, channelId),
            [orderBy('createdAt', 'desc')]
        );
    },

    /**
     * Subscribe to video KI in real-time.
     */
    subscribeToVideoKnowledgeItems: (
        userId: string,
        channelId: string,
        videoId: string,
        callback: (items: KnowledgeItem[]) => void
    ) => {
        return subscribeToCollection<KnowledgeItem>(
            getKnowledgeItemsPath(userId, channelId),
            callback,
            [
                where('videoId', '==', videoId),
                orderBy('createdAt', 'desc'),
            ]
        );
    },

    /**
     * Subscribe to channel-level KI in real-time.
     */
    subscribeToChannelKnowledgeItems: (
        userId: string,
        channelId: string,
        callback: (items: KnowledgeItem[]) => void
    ) => {
        return subscribeToCollection<KnowledgeItem>(
            getKnowledgeItemsPath(userId, channelId),
            callback,
            [
                where('scope', '==', 'channel'),
                orderBy('createdAt', 'desc'),
            ]
        );
    },

    /**
     * Update a KI (user edits content/title via Edit Modal).
     * Sets updatedAt automatically.
     */
    updateKnowledgeItem: async (
        userId: string,
        channelId: string,
        itemId: string,
        updates: Partial<Pick<KnowledgeItem, 'title' | 'content' | 'summary'>>
    ): Promise<void> => {
        await updateDocument(
            getKnowledgeItemsPath(userId, channelId),
            itemId,
            stripUndefined({
                ...updates,
                updatedAt: serverTimestamp(),
            })
        );
    },

    /**
     * Delete a KI.
     */
    deleteKnowledgeItem: async (
        userId: string,
        channelId: string,
        itemId: string
    ): Promise<void> => {
        await deleteDocument(
            getKnowledgeItemsPath(userId, channelId),
            itemId
        );
    },

    /**
     * Create a manual KI (from Lab [+ Add] button).
     * source = 'manual', no conversationId/model/toolsUsed.
     */
    createManualKnowledgeItem: async (
        userId: string,
        channelId: string,
        item: {
            category: string;
            title: string;
            content: string;
            summary: string;
            scope: 'video' | 'channel';
            videoId?: string;
        }
    ): Promise<string> => {
        const id = `ki-${Date.now()}`;
        const data = stripUndefined({
            ...item,
            conversationId: '',
            model: '',
            toolsUsed: [],
            source: 'manual' as const,
            createdAt: serverTimestamp(),
        });

        await setDocument(
            getKnowledgeItemsPath(userId, channelId),
            id,
            data
        );

        return id;
    },
};
