import { db } from '../../config/firebase';
import {
    collection,
    doc,
    onSnapshot,
    setDoc,
    query,
    where,
    serverTimestamp
} from 'firebase/firestore';
import type { TrafficType, TrafficTypeEdge } from '../types/videoTrafficType';

const COLLECTION_NAME = 'traffic_type_edges';

export const TrafficTypeService = {
    /**
     * Subscribe to all traffic type edges for a specific target video (MY video).
     * This allows us to show the "Autoplay vs Click" status for all sources in the table.
     */
    subscribeToEdges: (
        targetVideoId: string,
        onUpdate: (edges: TrafficTypeEdge[]) => void
    ) => {
        if (!targetVideoId) return () => { };

        const q = query(
            collection(db, COLLECTION_NAME),
            where('targetVideoId', '==', targetVideoId)
        );

        return onSnapshot(q, (snapshot) => {
            const edges: TrafficTypeEdge[] = [];
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
     * Set or update the traffic type for a specific source on a specific target video.
     * Uses a composite key to ensure uniqueness per pair.
     */
    setEdgeType: async (
        targetVideoId: string,
        sourceVideoId: string,
        type: TrafficType,
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
     * Delete the traffic type edge (unset it).
     */
    deleteEdgeType: async (
        targetVideoId: string,
        sourceVideoId: string
    ) => {
        if (!targetVideoId || !sourceVideoId) return;

        const id = `${targetVideoId}_${sourceVideoId}`;
        const docRef = doc(db, COLLECTION_NAME, id);

        // We can either delete the doc entirely or set type to null.
        // Deleting doc is cleaner for sparse data (defaults to unknown).
        await import('firebase/firestore').then(mod => mod.deleteDoc(docRef));
    }
};
