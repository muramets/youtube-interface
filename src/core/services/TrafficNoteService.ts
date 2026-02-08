import {
    collection,
    doc,
    onSnapshot,
    setDoc,
    deleteDoc,
    query
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { TrafficNote } from '../types/trafficNote';

export class TrafficNoteService {

    /**
     * Subscribe to all traffic notes for a channel.
     * One listener — all notes in memory, delta-only updates.
     */
    static subscribeToNotes(
        userId: string,
        channelId: string,
        callback: (notes: TrafficNote[]) => void
    ) {
        if (!userId || !channelId) return () => { };

        const path = `users/${userId}/channels/${channelId}/traffic_notes`;
        const q = query(collection(db, path));

        return onSnapshot(q, (snapshot) => {
            const notes = snapshot.docs.map(doc => doc.data() as TrafficNote);
            callback(notes);
        }, (error) => {
            console.error("Error subscribing to traffic notes:", error);
            callback([]);
        });
    }

    /**
     * Set or update a note for a source video.
     * Uses sourceVideoId as document ID — natural upsert.
     */
    static async setNote(
        userId: string,
        channelId: string,
        videoId: string,
        text: string
    ): Promise<void> {
        if (!userId || !channelId || !videoId) return;

        const path = `users/${userId}/channels/${channelId}/traffic_notes`;
        const ref = doc(db, path, videoId);

        const note: TrafficNote = {
            videoId,
            text,
            updatedAt: Date.now()
        };

        await setDoc(ref, note);
    }

    /**
     * Delete a note for a source video.
     */
    static async deleteNote(
        userId: string,
        channelId: string,
        videoId: string
    ): Promise<void> {
        if (!userId || !channelId || !videoId) return;

        const path = `users/${userId}/channels/${channelId}/traffic_notes`;
        const ref = doc(db, path, videoId);

        await deleteDoc(ref);
    }
}
