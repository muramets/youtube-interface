import { db } from '../../config/firebase';
import {
    collection,
    doc,
    onSnapshot,
    setDoc,
    query,
    serverTimestamp,
    deleteDoc
} from 'firebase/firestore';
import type { TrafficType, TrafficTypeEdge } from '../types/videoTrafficType';

/**
 * Per-Snapshot Traffic Type Service
 * 
 * Stores traffic type edges per snapshot, allowing different characterizations
 * of traffic sources as data evolves over time.
 * 
 * Firestore Path:
 * users/{userId}/videos/{targetVideoId}/snapshot_edges/{snapshotId}/traffic_types/{sourceVideoId}
 */
export const TrafficTypeService = {
    /**
     * Build the collection path for traffic type edges in a specific snapshot.
     */
    getCollectionPath: (userId: string, targetVideoId: string, snapshotId: string): string => {
        return `users/${userId}/videos/${targetVideoId}/snapshot_edges/${snapshotId}/traffic_types`;
    },

    /**
     * Subscribe to all traffic type edges for a specific snapshot.
     */
    subscribeToEdges: (
        userId: string,
        targetVideoId: string,
        snapshotId: string,
        onUpdate: (edges: TrafficTypeEdge[]) => void
    ) => {
        if (!userId || !targetVideoId || !snapshotId) return () => { };

        const collectionPath = TrafficTypeService.getCollectionPath(userId, targetVideoId, snapshotId);
        const q = query(collection(db, collectionPath));

        return onSnapshot(q, (snapshot) => {
            const edges: TrafficTypeEdge[] = [];
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
     * Set or update the traffic type for a specific source in a specific snapshot.
     */
    setEdgeType: async (
        userId: string,
        targetVideoId: string,
        snapshotId: string,
        sourceVideoId: string,
        type: TrafficType,
        source: 'manual' | 'smart_assistant' = 'manual'
    ) => {
        if (!userId || !targetVideoId || !snapshotId || !sourceVideoId) return;

        const collectionPath = TrafficTypeService.getCollectionPath(userId, targetVideoId, snapshotId);
        const docRef = doc(db, collectionPath, sourceVideoId);

        await setDoc(docRef, {
            sourceVideoId,
            type,
            source,
            updatedAt: serverTimestamp()
        }, { merge: true });
    },

    /**
     * Delete the traffic type edge (unset it).
     */
    deleteEdgeType: async (
        userId: string,
        targetVideoId: string,
        snapshotId: string,
        sourceVideoId: string
    ) => {
        if (!userId || !targetVideoId || !snapshotId || !sourceVideoId) return;

        const collectionPath = TrafficTypeService.getCollectionPath(userId, targetVideoId, snapshotId);
        const docRef = doc(db, collectionPath, sourceVideoId);

        await deleteDoc(docRef);
    }
};
