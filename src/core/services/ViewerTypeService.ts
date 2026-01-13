import { db } from '../../config/firebase';
import {
    collection,
    doc,
    onSnapshot,
    setDoc,
    query,
    where,
    serverTimestamp,
    deleteDoc,
    writeBatch
} from 'firebase/firestore';
import type { ViewerType, ViewerTypeEdge } from '../types/viewerType';

const COLLECTION_NAME = 'viewer_type_edges';

export const ViewerTypeService = {
    /**
     * Subscribe to all viewer type edges for a specific target video (MY video).
     */
    subscribeToEdges: (
        targetVideoId: string,
        onUpdate: (edges: ViewerTypeEdge[]) => void
    ) => {
        if (!targetVideoId) return () => { };

        const q = query(
            collection(db, COLLECTION_NAME),
            where('targetVideoId', '==', targetVideoId)
        );

        return onSnapshot(q, (snapshot) => {
            const edges: ViewerTypeEdge[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                edges.push({
                    id: doc.id,
                    targetVideoId: data.targetVideoId,
                    sourceVideoId: data.sourceVideoId,
                    type: data.type,
                    source: data.source,
                    updatedAt: data.updatedAt?.toMillis() || Date.now()
                });
            });
            onUpdate(edges);
        });
    },

    /**
     * Set or update the viewer type for a specific source on a specific target video.
     */
    setEdgeType: async (
        targetVideoId: string,
        sourceVideoId: string,
        type: ViewerType,
        source: 'manual' | 'smart_assistant' = 'manual'
    ) => {
        if (!targetVideoId || !sourceVideoId) return;

        const id = `${targetVideoId}_${sourceVideoId}`;
        const docRef = doc(db, COLLECTION_NAME, id);

        await setDoc(docRef, {
            targetVideoId,
            sourceVideoId,
            type,
            source,
            updatedAt: serverTimestamp()
        }, { merge: true });
    },

    /**
     * Set or update viewer types in bulk using a Firestore batch.
     */
    batchSetEdgeTypes: async (
        targetVideoId: string,
        updates: Array<{ sourceVideoId: string; type: ViewerType; source: 'manual' | 'smart_assistant' }>
    ) => {
        if (!targetVideoId || !updates.length) return;

        const batch = writeBatch(db);

        updates.forEach(update => {
            const id = `${targetVideoId}_${update.sourceVideoId}`;
            const docRef = doc(db, COLLECTION_NAME, id);
            batch.set(docRef, {
                targetVideoId,
                sourceVideoId: update.sourceVideoId,
                type: update.type,
                source: update.source,
                updatedAt: serverTimestamp()
            }, { merge: true });
        });

        await batch.commit();
    },

    /**
     * Delete the viewer type edge (unset it).
     */
    deleteEdgeType: async (
        targetVideoId: string,
        sourceVideoId: string
    ) => {
        if (!targetVideoId || !sourceVideoId) return;

        const id = `${targetVideoId}_${sourceVideoId}`;
        const docRef = doc(db, COLLECTION_NAME, id);

        await deleteDoc(docRef);
    }
};
