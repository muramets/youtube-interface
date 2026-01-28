import {
    collection,
    doc,
    onSnapshot,
    query,
    setDoc,
    deleteDoc,
    writeBatch,
    deleteField
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { SuggestedTrafficNiche, TrafficNicheAssignment } from '../types/suggestedTrafficNiches';

export class TrafficNicheService {

    // --- Niches ---

    static subscribeToTrafficNiches(
        userId: string,
        channelId: string,
        callback: (niches: SuggestedTrafficNiche[]) => void
    ) {
        if (!userId || !channelId) return () => { };

        const path = `users/${userId}/channels/${channelId}/suggested_traffic_niches`;
        const q = query(collection(db, path));

        return onSnapshot(q, (snapshot) => {
            const niches = snapshot.docs.map(doc => doc.data() as SuggestedTrafficNiche);
            // Sort by creation time desc (newest first)
            niches.sort((a, b) => b.createdAt - a.createdAt);
            callback(niches);
        }, (error) => {
            console.error("Error subscribing to suggested traffic niches:", error);
            callback([]);
        });
    }

    static async addTrafficNiche(
        userId: string,
        channelId: string,
        niche: Omit<SuggestedTrafficNiche, 'createdAt'>
    ): Promise<void> {
        if (!userId || !channelId) return;

        const path = `users/${userId}/channels/${channelId}/suggested_traffic_niches`;
        const nicheRef = doc(db, path, niche.id);

        await setDoc(nicheRef, {
            ...niche,
            createdAt: Date.now()
        });
    }

    static async updateTrafficNiche(
        userId: string,
        channelId: string,
        nicheId: string,
        updates: Partial<SuggestedTrafficNiche>
    ): Promise<void> {
        if (!userId || !channelId) return;

        const path = `users/${userId}/channels/${channelId}/suggested_traffic_niches`;
        const nicheRef = doc(db, path, nicheId);

        // Prepare updates: if value is undefined, use deleteField() to remove it from Firestore
        const firestoreUpdates: Record<string, unknown> = { ...updates };
        Object.keys(firestoreUpdates).forEach(key => {
            if (firestoreUpdates[key] === undefined) {
                firestoreUpdates[key] = deleteField();
            }
        });

        await setDoc(nicheRef, firestoreUpdates, { merge: true });
    }

    static async deleteTrafficNiche(
        userId: string,
        channelId: string,
        nicheId: string,
        assignments: TrafficNicheAssignment[] // Pass current assignments to batch delete them
    ): Promise<void> {
        if (!userId || !channelId) return;

        const batch = writeBatch(db);

        // Delete the niche meta
        const nichePath = `users/${userId}/channels/${channelId}/suggested_traffic_niches`;
        const nicheRef = doc(db, nichePath, nicheId);
        batch.delete(nicheRef);

        // Delete all assignments for this niche
        const assignmentsPath = `users/${userId}/channels/${channelId}/traffic_niche_assignments`;

        // Filter assignments strictly for this niche
        const relatedAssignments = assignments.filter(a => a.nicheId === nicheId);

        relatedAssignments.forEach(assignment => {
            // Assignment Key is typically composite videoId_nicheId for easy direct access, 
            // but here we might store them as individual docs. 
            // Let's assume ID is `${videoId}_${nicheId}`.
            const assignmentId = `${assignment.videoId}_${assignment.nicheId}`;
            const assignmentRef = doc(db, assignmentsPath, assignmentId);
            batch.delete(assignmentRef);
        });

        await batch.commit();
    }


    // --- Assignments ---

    static subscribeToTrafficAssignments(
        userId: string,
        channelId: string,
        callback: (assignments: TrafficNicheAssignment[]) => void
    ) {
        if (!userId || !channelId) return () => { };

        const path = `users/${userId}/channels/${channelId}/traffic_niche_assignments`;
        const q = query(collection(db, path));

        return onSnapshot(q, (snapshot) => {
            const assignments = snapshot.docs.map(doc => doc.data() as TrafficNicheAssignment);
            callback(assignments);
        }, (error) => {
            console.error("Error subscribing to traffic niche assignments:", error);
            callback([]);
        });
    }

    static async assignVideoToTrafficNiche(
        userId: string,
        channelId: string,
        videoId: string,
        nicheId: string
    ): Promise<void> {
        if (!userId || !channelId) return;

        const path = `users/${userId}/channels/${channelId}/traffic_niche_assignments`;
        const assignmentId = `${videoId}_${nicheId}`;
        const ref = doc(db, path, assignmentId);

        const assignment: TrafficNicheAssignment = {
            videoId,
            nicheId,
            addedAt: Date.now()
        };

        await setDoc(ref, assignment);
    }

    static async removeVideoFromTrafficNiche(
        userId: string,
        channelId: string,
        videoId: string,
        nicheId: string
    ): Promise<void> {
        if (!userId || !channelId) return;

        const path = `users/${userId}/channels/${channelId}/traffic_niche_assignments`;
        const assignmentId = `${videoId}_${nicheId}`;
        const ref = doc(db, path, assignmentId);

        await deleteDoc(ref);
    }
}
