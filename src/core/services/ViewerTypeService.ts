import { db } from '../../config/firebase';
import {
    collection,
    doc,
    onSnapshot,
    setDoc,
    query,
    serverTimestamp,
    deleteDoc,
    writeBatch
} from 'firebase/firestore';
import type { ViewerType, ViewerTypeEdge } from '../types/viewerType';

/**
 * Per-Snapshot Viewer Type Service
 * 
 * Stores viewer type edges per snapshot, allowing different characterizations
 * of viewer behavior as data evolves over time.
 * 
 * Firestore Path:
 * users/{userId}/videos/{targetVideoId}/snapshot_edges/{snapshotId}/viewer_types/{sourceVideoId}
 */
export const ViewerTypeService = {
    /**
     * Build the collection path for viewer type edges in a specific snapshot.
     */
    getCollectionPath: (userId: string, targetVideoId: string, snapshotId: string): string => {
        return `users/${userId}/videos/${targetVideoId}/snapshot_edges/${snapshotId}/viewer_types`;
    },

    /**
     * Subscribe to all viewer type edges for a specific snapshot.
     */
    subscribeToEdges: (
        userId: string,
        targetVideoId: string,
        snapshotId: string,
        onUpdate: (edges: ViewerTypeEdge[]) => void
    ) => {
        if (!userId || !targetVideoId || !snapshotId) return () => { };

        const collectionPath = ViewerTypeService.getCollectionPath(userId, targetVideoId, snapshotId);
        const q = query(collection(db, collectionPath));

        return onSnapshot(q, (snapshot) => {
            const edges: ViewerTypeEdge[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                edges.push({
                    id: docSnap.id,
                    targetVideoId,
                    sourceVideoId: data.sourceVideoId,
                    snapshotId,
                    type: data.type,
                    source: data.source,
                    updatedAt: data.updatedAt?.toMillis() || Date.now()
                });
            });
            onUpdate(edges);
        });
    },

    /**
     * Set or update the viewer type for a specific source in a specific snapshot.
     */
    setEdgeType: async (
        userId: string,
        targetVideoId: string,
        snapshotId: string,
        sourceVideoId: string,
        type: ViewerType,
        source: 'manual' | 'smart_assistant' = 'manual'
    ) => {
        if (!userId || !targetVideoId || !snapshotId || !sourceVideoId) return;

        const collectionPath = ViewerTypeService.getCollectionPath(userId, targetVideoId, snapshotId);
        const docRef = doc(db, collectionPath, sourceVideoId);

        await setDoc(docRef, {
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
        userId: string,
        targetVideoId: string,
        snapshotId: string,
        updates: Array<{ sourceVideoId: string; type: ViewerType; source: 'manual' | 'smart_assistant' }>
    ) => {
        if (!userId || !targetVideoId || !snapshotId || !updates.length) return;

        const collectionPath = ViewerTypeService.getCollectionPath(userId, targetVideoId, snapshotId);
        const batch = writeBatch(db);

        updates.forEach(update => {
            const docRef = doc(db, collectionPath, update.sourceVideoId);
            batch.set(docRef, {
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
        userId: string,
        targetVideoId: string,
        snapshotId: string,
        sourceVideoId: string
    ) => {
        if (!userId || !targetVideoId || !snapshotId || !sourceVideoId) return;

        const collectionPath = ViewerTypeService.getCollectionPath(userId, targetVideoId, snapshotId);
        const docRef = doc(db, collectionPath, sourceVideoId);

        await deleteDoc(docRef);
    }
};
