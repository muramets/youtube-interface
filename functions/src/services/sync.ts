import * as admin from "firebase-admin";
import { YouTubeService } from "./youtube";
import { TrendChannel, ProcessStats, Notification, YouTubeVideoItem } from "../types";

export class SyncService {
    private db = admin.firestore();

    /**
     * Synchronizes a single trend channel:
     * 1. Fetches all video IDs.
     * 2. Fetches details (snippet + stats) for all videos.
     * 3. Updates 'videos' collection (metadata).
     * 4. Creates a 'snapshot' (history).
     */
    async syncChannel(
        userId: string,
        userChannelId: string,
        trendChannel: TrendChannel,
        apiKey: string,
        refreshAvatar: boolean = false,
        snapshotType: 'auto' | 'manual' = 'manual'
    ): Promise<ProcessStats> {
        const yt = new YouTubeService(apiKey);

        let quotaList = 0;
        let quotaDetails = 0;

        // 0. Refresh Avatar if requested
        if (refreshAvatar) {
            const { avatarUrl, quotaUsed } = await yt.getChannelAvatar(trendChannel.id);
            quotaDetails += quotaUsed; // Count as details/overhead quota

            if (avatarUrl) {
                await this.db.doc(`users/${userId}/channels/${userChannelId}/trendChannels/${trendChannel.id}`).update({
                    avatarUrl: avatarUrl
                });
                console.log(`Updated avatar for ${trendChannel.name}`);
            }
        }

        // 1. Fetch ALL videos
        const { videoIds, quotaUsed: qList } = await yt.getPlaylistVideos(trendChannel.uploadsPlaylistId);
        quotaList += qList;

        if (videoIds.length === 0) {
            return { videosProcessed: 0, quotaList, quotaDetails };
        }

        // 2. Fetch Details (Full Metadata)
        const { videos, quotaUsed: qDetails } = await yt.getVideoDetails(videoIds);
        quotaDetails += qDetails;

        // 3. Save to Firestore (Batch checks)
        // We have potentially hundreds of videos. Batches are limited to 500 ops.
        // We will update 'videos' collection.

        const videoViews: Record<string, number> = {};
        const timestamp = Date.now();

        // Chunk for Firestore batches
        const batchSize = 400; // Safe margin below 500
        for (let i = 0; i < videos.length; i += batchSize) {
            const chunk = videos.slice(i, i + batchSize);
            const batch = this.db.batch();

            chunk.forEach((v: YouTubeVideoItem) => {
                const viewCount = parseInt(v.statistics.viewCount || '0');
                videoViews[v.id] = viewCount;

                // Reference to the video document in 'videos' subcollection
                const videoRef = this.db.doc(`users/${userId}/channels/${userChannelId}/trendChannels/${trendChannel.id}/videos/${v.id}`);

                // Update Metadata + Stats
                batch.set(videoRef, {
                    id: v.id,
                    channelId: trendChannel.id,
                    title: v.snippet.title,
                    thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url,
                    publishedAt: v.snippet.publishedAt,
                    publishedAtTimestamp: new Date(v.snippet.publishedAt).getTime(), // Added critical timestamp field
                    viewCount: viewCount,
                    likeCount: parseInt(v.statistics.likeCount || '0'),
                    commentCount: parseInt(v.statistics.commentCount || '0'),
                    description: v.snippet.description || '',
                    tags: v.snippet.tags || [],
                    lastUpdated: timestamp
                }, { merge: true });
            });

            await batch.commit();
        }

        // 4. Save Snapshot
        const snapshotRef = this.db.doc(`users/${userId}/channels/${userChannelId}/trendChannels/${trendChannel.id}/snapshots/${timestamp}`);
        await snapshotRef.set({
            timestamp: timestamp,
            videoViews: videoViews,
            videoCount: videos.length,
            type: snapshotType
        });

        // 5. Update Channel Stats (Total Views, Last Updated)
        await this.updateChannelStats(userId, userChannelId, trendChannel.id, videos, timestamp);

        return {
            videosProcessed: videos.length,
            quotaList,
            quotaDetails
        };
    }

    private async updateChannelStats(
        userId: string,
        userChannelId: string,
        trendChannelId: string,
        videos: YouTubeVideoItem[],
        timestamp: number
    ) {
        const totalViews = videos.reduce((sum, v) => sum + parseInt(v.statistics.viewCount || '0'), 0);
        const averageViews = videos.length > 0 ? totalViews / videos.length : 0;

        const channelRef = this.db.doc(`users/${userId}/channels/${userChannelId}/trendChannels/${trendChannelId}`);
        await channelRef.update({
            lastUpdated: timestamp,
            totalViewCount: totalViews,
            averageViews: averageViews
        });
    }

    /**
     * Sends a notification to the user channel.
     */
    async sendNotification(
        userId: string,
        userChannelId: string,
        title: string,
        message: string,
        stats: { processedVideos: number, processedChannels: number, quota: number, quotaList: number, quotaDetails: number }
    ) {
        const notification: Notification = {
            title: title,
            message: message,
            type: 'success',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            isRead: false,
            meta: stats.quota.toString(),
            quotaBreakdown: {
                list: stats.quotaList,
                details: stats.quotaDetails,
                search: 0
            }
        };

        await this.db.collection(`users/${userId}/channels/${userChannelId}/notifications`).add(notification);
    }
}
