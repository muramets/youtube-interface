
import {
    writeBatch,
    doc,
    getDocs,
    collection,
} from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { getVideosPath, getSuggestedVideosPath } from '../../../core/services/videoService';

/**
 * MIGRATION SCRIPT: Move Suggested Videos
 * 
 * Moves videos that do NOT belong to the current channel (suggested videos)
 * from the main `videos` collection to `cached_suggested_traffic_videos`.
 */
export const migrateSuggestedVideos = async (userId: string, channelId: string) => {
    console.log(`Starting migration for User: ${userId}, Channel: ${channelId}...`);

    try {
        const videosPath = getVideosPath(userId, channelId);
        const suggestedPath = getSuggestedVideosPath(userId, channelId);

        // 1. Fetch ALL videos (we filter in memory to be safe, or use query)
        // Using query to only get videos where channelId != currentChannelId is better,
        // BUT Firestore might require a composite index if we mix it with other filters.
        // Let's fetch all and filter client-side for safety and simplicity (one-time script).
        const videosSnapshot = await getDocs(collection(db, videosPath));

        let movedCount = 0;
        let batch = writeBatch(db);
        let operationCount = 0;

        for (const videoDoc of videosSnapshot.docs) {
            const videoData = videoDoc.data();

            // CHECK: Is this a "suggested" video?
            // It is suggested if its `channelId` DOES NOT match the current `channelId`.
            // (Assuming data integrity: Home videos have channelId == currentChannelId)
            // Also check for `isCustom` - custom videos might have different structure, 
            // but usually they belong to the channel.

            if (videoData.channelId && videoData.channelId !== channelId) {
                console.log(`Moving video: ${videoData.title} (${videoData.id}) - Owner: ${videoData.channelId}`);

                // 1. Add to new collection
                const newDocRef = doc(db, suggestedPath, videoData.id);
                batch.set(newDocRef, videoData);

                // 2. Delete from old collection
                const oldDocRef = doc(db, videosPath, videoData.id);
                batch.delete(oldDocRef);

                movedCount++;
                operationCount += 2; // set + delete

                // Commit batch every 250 videos (500 operations)
                if (operationCount >= 400) {
                    await batch.commit();
                    batch = writeBatch(db); // Reset batch
                    operationCount = 0;
                    console.log('Committed intermediate batch...');
                }
            }
        }

        // Commit remaining
        if (operationCount > 0) {
            await batch.commit();
        }

        console.log(`Migration Complete. Moved ${movedCount} videos.`);
        return movedCount;

    } catch (error) {
        console.error("Migration failed:", error);
        throw error;
    }
};
