import {
    collection,
    doc,
    onSnapshot,
    setDoc,
    deleteDoc,
    query
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { VideoReactionEdge } from '../types/videoReaction';

/**
 * Firestore service for video reactions.
 * 
 * Path: users/{userId}/channels/{channelId}/video_reactions/{videoId}
 * 
 * ARCHITECTURE: Channel-level storage (not per-video) so reactions
 * are shared across all suggested traffic tables. One listener per channel.
 */
export class VideoReactionService {

    /**
     * Subscribe to all video reactions for a channel.
     * Single onSnapshot listener — delta-only updates, minimal Firebase quota.
     */
    static subscribeToReactions(
        userId: string,
        channelId: string,
        callback: (reactions: VideoReactionEdge[]) => void
    ) {
        if (!userId || !channelId) return () => { };

        const path = `users/${userId}/channels/${channelId}/video_reactions`;
        const q = query(collection(db, path));

        return onSnapshot(q, (snapshot) => {
            const reactions = snapshot.docs.map(doc => doc.data() as VideoReactionEdge);
            callback(reactions);
        }, (error) => {
            console.error('Error subscribing to video reactions:', error);
            callback([]);
        });
    }

    /**
     * Set or update a reaction for a source video.
     * Uses videoId as document ID — natural upsert.
     */
    static async setReaction(
        userId: string,
        channelId: string,
        videoId: string,
        reaction: VideoReactionEdge['reaction']
    ): Promise<void> {
        if (!userId || !channelId || !videoId) return;

        const path = `users/${userId}/channels/${channelId}/video_reactions`;
        const ref = doc(db, path, videoId);

        const edge: VideoReactionEdge = {
            videoId,
            reaction,
            updatedAt: Date.now()
        };

        await setDoc(ref, edge);
    }

    /**
     * Remove a reaction from a source video.
     */
    static async deleteReaction(
        userId: string,
        channelId: string,
        videoId: string
    ): Promise<void> {
        if (!userId || !channelId || !videoId) return;

        const path = `users/${userId}/channels/${channelId}/video_reactions`;
        const ref = doc(db, path, videoId);

        await deleteDoc(ref);
    }
}
