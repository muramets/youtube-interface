import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { SyncService } from "./services/sync";
import { TrendChannel, UserSettings, SyncSettings, Notification } from "./types";

admin.initializeApp();
const db = admin.firestore();

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
    console.log("Starting Daily Trend Snapshot (Robust Service Mode)...");
    const syncService = new SyncService();

    // 1. Get all users
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;

        // 2. Get User Channels
        const channelsSnap = await db.collection(`users/${userId}/channels`).get();

        for (const channelDoc of channelsSnap.docs) {
            const userChannelId = channelDoc.id;

            // Scope stats to this specific User Channel
            let processedChannelsCount = 0; // This will now count trend channels processed within this user's channel
            let processedVideosCount = 0;
            let quotaList = 0;
            let quotaDetails = 0;

            // 3. Get Channel-Specific Settings
            const settingsDoc = await db.doc(`users/${userId}/channels/${userChannelId}/settings/general`).get();
            const generalSettings = settingsDoc.data() as UserSettings | undefined;

            const syncSettingsDoc = await db.doc(`users/${userId}/channels/${userChannelId}/settings/sync`).get();
            const syncSettings = syncSettingsDoc.data() as SyncSettings | undefined;

            // CHECK 1: Is Trend Sync Enabled?
            if (!syncSettings?.trendSync?.enabled) {
                console.log(`Skipping channel ${userChannelId}: Trend Sync is disabled.`);
                continue;
            }

            // CHECK 2: Is API Key Configured?
            if (!generalSettings?.apiKey) {
                console.log(`Skipping channel ${userChannelId}: No API Key configured.`);
                continue;
            }

            const apiKey = generalSettings.apiKey;

            // 4. Get Trend Channels (ALL channels, not just visible)
            const trendChannelsRef = db.collection(`users/${userId}/channels/${userChannelId}/trendChannels`);
            const allTrendChannels = await trendChannelsRef.get();

            for (const tChannelDoc of allTrendChannels.docs) {
                const trendChannel = tChannelDoc.data() as TrendChannel;
                try {
                    console.log(`Processing ${trendChannel.name || trendChannel.id} for user ${userId}...`);
                    // Use SyncService
                    const stats = await syncService.syncChannel(userId, userChannelId, trendChannel, apiKey, false, 'auto');

                    if (stats) {
                        processedChannelsCount++; // Increment for each trend channel processed
                        processedVideosCount += stats.videosProcessed;
                        quotaList += stats.quotaList;
                        quotaDetails += stats.quotaDetails;
                    }

                } catch (err) {
                    console.error(`Failed to process channel ${trendChannel.id}`, err);
                }
            }

            // 5. Send Notification (Scoped to this User Channel)
            if (processedChannelsCount > 0) {
                const totalQuota = quotaList + quotaDetails;
                const notification: Notification = {
                    title: 'Daily Trend Sync',
                    message: `Successfully updated ${processedVideosCount} videos across ${processedChannelsCount} trend channels.`,
                    type: 'success',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: false,
                    meta: totalQuota.toString(),
                    quotaBreakdown: {
                        list: quotaList,
                        details: quotaDetails,
                        search: 0
                    }
                };

                await db.collection(`users/${userId}/channels/${userChannelId}/notifications`).add(notification);
                console.log(`Sent notification to channel ${userChannelId} (Quota: ${totalQuota})`);
            }
        }
    }
});

/**
 * Callable Function: Manual Sync from Frontend.
 * Accepts: { channelId: string, targetTrendChannelIds?: string[], forceAvatarRefresh?: boolean }
 */
export const manualTrendSync = onCall({
    timeoutSeconds: 540,
    memory: "512MiB"
}, async (request) => {
    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userId = request.auth.uid;
    const { channelId, targetTrendChannelIds, forceAvatarRefresh } = request.data; // This is the userChannelId (Context)

    if (!channelId) {
        throw new HttpsError('invalid-argument', 'The function must be called with a "channelId" argument.');
    }

    console.log(`Starting Manual Sync for User ${userId}, Channel ${channelId}`);
    const syncService = new SyncService();

    // 2. Get Settings (API Key)
    const settingsDoc = await db.doc(`users/${userId}/channels/${channelId}/settings/general`).get();
    const generalSettings = settingsDoc.data() as UserSettings | undefined;

    if (!generalSettings?.apiKey) {
        throw new HttpsError('failed-precondition', 'API Key is not configured for this channel.');
    }
    const apiKey = generalSettings.apiKey;

    // 3. Get Trend Channels
    const trendChannelsRef = db.collection(`users/${userId}/channels/${channelId}/trendChannels`);
    const allTrendChannelsSnap = await trendChannelsRef.get();
    let trendChannels = allTrendChannelsSnap.docs.map(d => d.data() as TrendChannel);

    // Filter if targets provided
    if (targetTrendChannelIds && Array.isArray(targetTrendChannelIds) && targetTrendChannelIds.length > 0) {
        const targetSet = new Set(targetTrendChannelIds);
        trendChannels = trendChannels.filter(c => targetSet.has(c.id));
    }

    let processedChannelsCount = 0;
    let processedVideosCount = 0;
    let quotaList = 0;
    let quotaDetails = 0;

    for (const trendChannel of trendChannels) {
        try {
            // Check if we need to refresh avatar (force flag or potentially passed in list if we expanded capability)
            const shouldRefreshAvatar = !!forceAvatarRefresh;

            const stats = await syncService.syncChannel(userId, channelId, trendChannel, apiKey, shouldRefreshAvatar, 'manual');
            if (stats) {
                processedChannelsCount++;
                processedVideosCount += stats.videosProcessed;
                quotaList += stats.quotaList;
                quotaDetails += stats.quotaDetails;
            }
        } catch (err) {
            console.error(`Failed to sync trend channel ${trendChannel.id}`, err);
        }
    }

    // 4. Send Notification
    if (processedChannelsCount > 0) {
        await syncService.sendNotification(
            userId,
            channelId,
            'Manual Sync Complete',
            `Successfully updated ${processedVideosCount} videos across ${processedChannelsCount} channels.`,
            {
                processedVideos: processedVideosCount,
                processedChannels: processedChannelsCount,
                quota: quotaList + quotaDetails,
                quotaList,
                quotaDetails
            }
        );
    }

    return {
        success: true,
        processedChannels: processedChannelsCount,
        processedVideos: processedVideosCount,
        quotaUsed: quotaList + quotaDetails
    };
});


