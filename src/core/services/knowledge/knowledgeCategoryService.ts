import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { KnowledgeCategoryEntry, KnowledgeCategoryRegistry } from '../../types/knowledge';
import { SEED_CATEGORIES, KNOWLEDGE_CATEGORIES_DOC_ID } from '../../types/knowledge';

const getRegistryPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/knowledgeCategories`;

const getRegistryRef = (userId: string, channelId: string) =>
    doc(db, getRegistryPath(userId, channelId), KNOWLEDGE_CATEGORIES_DOC_ID);

export const KnowledgeCategoryService = {
    /**
     * Read the category registry and convert map → array of entries.
     * Returns seed categories if registry doesn't exist yet.
     */
    getCategories: async (
        userId: string,
        channelId: string
    ): Promise<KnowledgeCategoryEntry[]> => {
        const ref = getRegistryRef(userId, channelId);
        const snapshot = await getDoc(ref);

        const categoriesMap = snapshot.exists()
            ? (snapshot.data() as KnowledgeCategoryRegistry).categories
            : SEED_CATEGORIES;

        return Object.entries(categoriesMap).map(([slug, entry]) => ({
            slug,
            ...entry,
        }));
    },

    /**
     * Create the registry with seed categories if it doesn't exist.
     * Uses set with merge — safe to call multiple times.
     */
    ensureSeedCategories: async (
        userId: string,
        channelId: string
    ): Promise<void> => {
        const ref = getRegistryRef(userId, channelId);
        const snapshot = await getDoc(ref);

        if (!snapshot.exists()) {
            await setDoc(ref, {
                categories: SEED_CATEGORIES,
            } satisfies KnowledgeCategoryRegistry);
        }
    },
};
