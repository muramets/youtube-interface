import {
    fetchCollection,
    subscribeToCollection,
    updateDocument,
    deleteDocument,
    setDocument,
} from '../firestore';
import { where, orderBy, serverTimestamp, writeBatch, doc, deleteField, increment, arrayUnion, type FieldValue, type WriteBatch } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { KnowledgeItem } from '../../types/knowledge';

/** Firestore update payload: values can be regular types or FieldValue sentinels (deleteField, serverTimestamp) */
type FirestoreUpdatePayload = Record<string, string | string[] | number | FieldValue | undefined>;

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

/**
 * Build Firestore-safe update payload for KI.
 * When scope changes to 'channel', videoId must be deleted via deleteField().
 */
function buildKiUpdatePayload(
    updates: Partial<Pick<KnowledgeItem, 'title' | 'content' | 'summary' | 'videoId' | 'scope'>>
): FirestoreUpdatePayload {
    const payload: FirestoreUpdatePayload = stripUndefined({
        ...updates,
        updatedAt: serverTimestamp(),
    });

    // When unlinking: scope='channel' means videoId should be removed from Firestore doc
    if (updates.scope === 'channel' && !updates.videoId) {
        payload.videoId = deleteField();
    }

    return payload;
}

/**
 * Get Firestore ref for the entity (video doc or channel doc) that owns discovery flags.
 */
function getEntityRef(basePath: string, scope: 'video' | 'channel', videoId?: string) {
    return scope === 'video' && videoId
        ? doc(db, `${basePath}/videos/${videoId}`)
        : doc(db, basePath);
}

/**
 * Add discovery flag updates to a batch when scope/videoId changes.
 * Decrements knowledgeItemCount on old entity, increments on new entity.
 */
function addDiscoveryFlagUpdates(
    batch: WriteBatch,
    basePath: string,
    previousItem: KnowledgeItem,
    updates: Partial<Pick<KnowledgeItem, 'videoId' | 'scope'>>,
): void {
    const newScope = updates.scope ?? previousItem.scope;
    const newVideoId = updates.videoId ?? previousItem.videoId;

    const oldRef = getEntityRef(basePath, previousItem.scope, previousItem.videoId);
    const newRef = getEntityRef(basePath, newScope, newVideoId);

    // Only update if the owning entity actually changed
    if (oldRef.path === newRef.path) return;

    // Decrement old entity
    batch.update(oldRef, {
        knowledgeItemCount: increment(-1),
    });

    // Increment new entity
    batch.update(newRef, {
        knowledgeItemCount: increment(1),
        knowledgeCategories: arrayUnion(previousItem.category),
        lastAnalyzedAt: serverTimestamp(),
    });
}

/**
 * Check if updates contain a scope/videoId change.
 */
function hasScopeChange(
    updates: Partial<Pick<KnowledgeItem, 'videoId' | 'scope'>>,
    previousItem: KnowledgeItem,
): boolean {
    if (updates.scope !== undefined && updates.scope !== previousItem.scope) return true;
    if (updates.videoId !== undefined && updates.videoId !== previousItem.videoId) return true;
    return false;
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
     * Subscribe to ALL KI (both video + channel scoped) in real-time.
     * Used by Knowledge Page which displays all KI with scope filters.
     */
    subscribeToAllKnowledgeItems: (
        userId: string,
        channelId: string,
        callback: (items: KnowledgeItem[]) => void
    ) => {
        return subscribeToCollection<KnowledgeItem>(
            getKnowledgeItemsPath(userId, channelId),
            callback,
            [orderBy('createdAt', 'desc')]
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
        updates: Partial<Pick<KnowledgeItem, 'title' | 'content' | 'summary' | 'videoId' | 'scope'>>
    ): Promise<void> => {
        await updateDocument(
            getKnowledgeItemsPath(userId, channelId),
            itemId,
            buildKiUpdatePayload(updates),
        );
    },

    /**
     * Update a KI with version snapshot.
     * If content changed, snapshots old content to versions/ before updating.
     * Used by UI Edit flow — ensures every content change is versioned.
     */
    updateKnowledgeItemWithVersion: async (
        userId: string,
        channelId: string,
        itemId: string,
        updates: Partial<Pick<KnowledgeItem, 'title' | 'content' | 'summary' | 'videoId' | 'scope'>>,
        previousItem: KnowledgeItem,
    ): Promise<void> => {
        const contentChanged = updates.content !== undefined
            && updates.content.trim() !== previousItem.content.trim();
        const scopeChanged = hasScopeChange(updates, previousItem);
        const needsBatch = contentChanged || scopeChanged;

        if (needsBatch) {
            const batch = writeBatch(db);

            // Version snapshot (only if content changed)
            if (contentChanged) {
                const versionId = `v-${Date.now()}`;
                const versionsPath = `${getKnowledgeItemsPath(userId, channelId)}/${itemId}/versions`;
                const versionRef = doc(db, versionsPath, versionId);
                const contentTs = previousItem.updatedAt ?? previousItem.createdAt;
                const contentTimeMs = contentTs.toDate?.()?.getTime()
                    ?? (contentTs.seconds ? contentTs.seconds * 1000 : Date.now());
                batch.set(versionRef, stripUndefined({
                    content: previousItem.content,
                    title: previousItem.title || undefined,
                    createdAt: contentTimeMs,
                    source: previousItem.lastEditSource ?? previousItem.source,
                    model: previousItem.lastEditedBy ?? previousItem.model,
                }));
            }

            // Main doc update
            const kiRef = doc(db, getKnowledgeItemsPath(userId, channelId), itemId);
            const kiPayload = buildKiUpdatePayload(updates);
            if (contentChanged) {
                kiPayload.lastEditSource = 'manual';
                kiPayload.lastEditedBy = '';
            }
            batch.update(kiRef, kiPayload);

            // Discovery flags update (only if scope/videoId changed)
            if (scopeChanged) {
                const basePath = `users/${userId}/channels/${channelId}`;
                addDiscoveryFlagUpdates(batch, basePath, previousItem, updates);
            }

            await batch.commit();
        } else {
            // No content or scope change — simple update without batch
            await updateDocument(
                getKnowledgeItemsPath(userId, channelId),
                itemId,
                buildKiUpdatePayload(updates),
            );
        }
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
