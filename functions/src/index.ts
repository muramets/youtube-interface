import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();
const db = admin.firestore();

// Интерфейсы данных
interface TrendChannel {
    id: string;
    uploadsPlaylistId: string;
    isVisible: boolean;
    name?: string;
}

interface Notification {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    timestamp: admin.firestore.FieldValue;
    isRead: boolean;
    meta?: string;
    quotaBreakdown?: {
        search?: number;
        list?: number;
        details?: number;
    };
}

interface UserSettings {
    apiKey?: string; // YouTube API Key
}

interface SyncSettings {
    trendSync?: {
        enabled: boolean;
    };
}

/**
 * Scheduled Function: Runs every day at midnight (UTC).
 * Fetches data for ALL channels and videos to ensure complete history.
 */
export const scheduledTrendSnapshot = onSchedule({
    schedule: "0 0 * * *",
    timeZone: "Etc/UTC",
}, async () => {
    console.log("Starting Daily Trend Snapshot (Full Sync)...");

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
                    const stats = await processChannelSnapshot(userId, userChannelId, trendChannel, apiKey);

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

interface YouTubePlaylistItem {
    contentDetails: {
        videoId: string;
    };
}

interface YouTubePlaylistResponse {
    items?: YouTubePlaylistItem[];
    nextPageToken?: string;
}

interface YouTubeVideoStatistics {
    viewCount?: string;
}

interface YouTubeVideoitem {
    id: string;
    statistics: YouTubeVideoStatistics;
}

interface YouTubeVideoResponse {
    items?: YouTubeVideoitem[];
}

interface ProcessStats {
    videosProcessed: number;
    quotaList: number;
    quotaDetails: number;
}

async function processChannelSnapshot(userId: string, userChannelId: string, channel: TrendChannel, apiKey: string): Promise<ProcessStats> {
    const allVideoIds: string[] = [];
    let nextPageToken: string | undefined = undefined;

    let quotaList = 0;
    let quotaDetails = 0;

    // 1. Fetch ALL videos from Uploads playlist (Pagination)
    do {
        try {
            const res: axios.AxiosResponse<YouTubePlaylistResponse> = await axios.get(`https://www.googleapis.com/youtube/v3/playlistItems`, {
                params: {
                    part: 'contentDetails',
                    playlistId: channel.uploadsPlaylistId,
                    maxResults: 50,
                    key: apiKey,
                    pageToken: nextPageToken
                }
            });

            quotaList++; // Cost: 1 unit

            const items = res.data.items || [];
            if (items.length > 0) {
                const ids = items.map((i: YouTubePlaylistItem) => i.contentDetails.videoId);
                allVideoIds.push(...ids);
            }

            nextPageToken = res.data.nextPageToken;
        } catch (error) {
            console.error(`Error fetching playlist page for ${channel.id}:`, error);
            break;
        }
    } while (nextPageToken);

    if (allVideoIds.length === 0) return { videosProcessed: 0, quotaList, quotaDetails };

    // 2. Get View Counts for ALL videos (Batching)
    const videoViews: Record<string, number> = {};
    const chunkSize = 50;

    for (let i = 0; i < allVideoIds.length; i += chunkSize) {
        const chunk = allVideoIds.slice(i, i + chunkSize);
        const idsString = chunk.join(',');

        try {
            const statsRes: axios.AxiosResponse<YouTubeVideoResponse> = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
                params: {
                    part: 'statistics',
                    id: idsString,
                    key: apiKey
                }
            });

            quotaDetails++; // Cost: 1 unit

            if (statsRes.data.items) {
                statsRes.data.items.forEach((v: YouTubeVideoitem) => {
                    videoViews[v.id] = parseInt(v.statistics.viewCount || '0');
                });
            }
        } catch (error) {
            console.error(`Error fetching video stats chunk for ${channel.id}:`, error);
        }
    }

    // 3. Save Snapshot
    // Create a new snapshot document based on current timestamp
    const timestamp = Date.now().toString();
    const snapshotRef = db.doc(`users/${userId}/channels/${userChannelId}/trendChannels/${channel.id}/snapshots/${timestamp}`);

    await snapshotRef.set({
        timestamp: Date.now(),
        videoViews: videoViews,
        videoCount: allVideoIds.length
    });

    return {
        videosProcessed: allVideoIds.length,
        quotaList,
        quotaDetails
    };
}
