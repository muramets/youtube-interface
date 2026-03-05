import { db } from '../../../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

/**
 * Fire-and-forget update of a snapshot count field on the video document.
 * Used for denormalization so that backend tools (getMultipleVideoDetails)
 * can expose traffic data availability to the LLM without extra reads.
 */
export function syncSnapshotCount(
    userId: string,
    channelId: string,
    videoId: string,
    field: 'suggestedTrafficSnapshotCount' | 'trafficSourceSnapshotCount',
    count: number,
): void {
    const videoRef = doc(db, `users/${userId}/channels/${channelId}/videos/${videoId}`);
    updateDoc(videoRef, { [field]: count }).catch((err) => {
        console.warn(`[syncSnapshotCount] Failed to update ${field} for ${videoId}:`, err);
    });
}
