/**
 * trends/scheduledSync.ts — Daily scheduled trend snapshot.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../shared/db.js";
import { SyncService } from "../services/sync.js";
import type { TrendChannel, UserSettings, Notification } from "../types.js";
import * as admin from "firebase-admin";

/**
 * Scheduled Function: Runs every day at midnight (UTC).
 * Uses SyncService to fetch data and update Firestore.
 */
export const scheduledTrendSnapshot = onSchedule({
    schedule: "0 0 * * *",
    timeZone: "Etc/UTC",
    timeoutSeconds: 540, // Increase timeout for long syncs (9 mins)
    memory: "512MiB"
}, async () => {
    console.log("Starting scheduled daily trend snapshot...");
    const syncService = new SyncService();

    // 1. Get all users who have channels
    const usersSnap = await db.collectionGroup("settings")
        .where("apiKey", "!=", null)
        .get();

    // Unique { userId, channelId } pairs with settings
    const userChannels: Array<{
        userId: string;
        channelId: string;
        apiKey: string;
    }> = [];
    const seen = new Set<string>();

    for (const doc of usersSnap.docs) {
        const pathParts = doc.ref.path.split("/");
        const userId = pathParts[1];
        const channelId = pathParts[3];
        const key = `${userId}/${channelId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const data = doc.data() as UserSettings;
        if (!data.apiKey) continue;

        userChannels.push({
            userId,
            channelId,
            apiKey: data.apiKey,
        });
    }

    console.log(`Found ${userChannels.length} user-channel pairs with API keys.`);

    // 2. Process each user-channel pair
    let totalProcessedChannels = 0;
    let totalProcessedVideos = 0;

    for (const uc of userChannels) {
        try {
            const trendChannelsSnap = await db.collection(
                `users/${uc.userId}/channels/${uc.channelId}/trendChannels`
            ).get();
            const trendChannels = trendChannelsSnap.docs.map(d => d.data() as TrendChannel);

            for (const tc of trendChannels) {
                try {
                    const stats = await syncService.syncChannel(uc.userId, uc.channelId, tc, uc.apiKey, false, 'auto');
                    if (stats) {
                        totalProcessedChannels++;
                        totalProcessedVideos += stats.videosProcessed;
                    }
                } catch (err) {
                    console.error(`Scheduled sync failed for trend channel ${tc.id}`, err);
                }
            }
        } catch (err) {
            console.error(`Failed to process user-channel ${uc.userId}/${uc.channelId}`, err);
        }
    }

    // 3. Create global notification
    for (const uc of userChannels) {
        if (totalProcessedChannels > 0) {
            const notification: Notification = {
                title: 'Daily Sync Complete',
                message: `Updated ${totalProcessedVideos} videos across ${totalProcessedChannels} channels.`,
                type: 'info',
                isRead: false,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            };

            try {
                await db.collection(
                    `users/${uc.userId}/channels/${uc.channelId}/notifications`
                ).add(notification);
            } catch (err) {
                console.error(`Failed to create notification for ${uc.userId}/${uc.channelId}`, err);
            }
        }
    }

    console.log(`Scheduled sync complete: ${totalProcessedChannels} channels, ${totalProcessedVideos} videos.`);
});
