/**
 * trends/manualSync.ts — Manual sync triggered from frontend.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../shared/db.js";
import { SyncService } from "../services/sync.js";
import type { TrendChannel, UserSettings } from "../types.js";

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
    const { channelId, targetTrendChannelIds, forceAvatarRefresh } = request.data;

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
