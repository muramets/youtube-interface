import { db } from '../../../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

type CountField = 'suggestedTrafficSnapshotCount' | 'trafficSourceSnapshotCount';
type TimestampField = 'lastSuggestedTrafficUpload' | 'lastTrafficSourceUpload';

/**
 * Fire-and-forget update of snapshot metadata on the video document.
 * Writes count (for LLM tool awareness) and upload timestamp (for check-in completion).
 */
export function syncSnapshotCount(
    userId: string,
    channelId: string,
    videoId: string,
    field: CountField,
    count: number,
    uploadTimestampField?: TimestampField,
): void {
    const videoRef = doc(db, `users/${userId}/channels/${channelId}/videos/${videoId}`);
    const data: Record<string, number> = { [field]: count };
    if (uploadTimestampField) {
        data[uploadTimestampField] = Date.now();
    }
    updateDoc(videoRef, data).catch((err) => {
        console.warn(`[syncSnapshotCount] Failed to update ${field} for ${videoId}:`, err);
    });
}
