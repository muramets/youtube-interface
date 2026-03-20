import { fetchCollection, deleteDocument, setDocument, batchDeleteDocuments } from '../firestore';
import { orderBy, limit } from 'firebase/firestore';
import type { KnowledgeVersionWithId } from '../../types/knowledge';
import type { KnowledgeVersion } from '../../../../shared/knowledgeVersion';

const getVersionsPath = (userId: string, channelId: string, kiId: string) =>
    `users/${userId}/channels/${channelId}/knowledgeItems/${kiId}/versions`;

export const KnowledgeVersionService = {
    /**
     * Fetch all versions for a KI, ordered by createdAt DESC (newest first).
     */
    getVersions: async (
        userId: string,
        channelId: string,
        kiId: string,
    ): Promise<KnowledgeVersionWithId[]> => {
        return fetchCollection<KnowledgeVersionWithId>(
            getVersionsPath(userId, channelId, kiId),
            [orderBy('createdAt', 'desc'), limit(50)],
        );
    },

    /**
     * Create a version snapshot in the subcollection.
     * Returns the new version document ID.
     */
    createVersion: async (
        userId: string,
        channelId: string,
        kiId: string,
        version: KnowledgeVersion,
    ): Promise<string> => {
        const id = `v-${Date.now()}`;
        await setDocument(
            getVersionsPath(userId, channelId, kiId),
            id,
            version,
        );
        return id;
    },

    /**
     * Delete a single version document.
     */
    deleteVersion: async (
        userId: string,
        channelId: string,
        kiId: string,
        versionId: string,
    ): Promise<void> => {
        await deleteDocument(
            getVersionsPath(userId, channelId, kiId),
            versionId,
        );
    },

    /**
     * Delete multiple version documents in a single batch.
     * Used by "revert to version" to remove all versions newer than the target.
     */
    deleteVersions: async (
        userId: string,
        channelId: string,
        kiId: string,
        versionIds: string[],
    ): Promise<void> => {
        if (versionIds.length === 0) return;
        const path = getVersionsPath(userId, channelId, kiId);
        await batchDeleteDocuments(versionIds.map(id => ({ path, id })));
    },
};
