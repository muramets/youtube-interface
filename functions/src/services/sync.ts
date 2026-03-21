import axios from "axios";
import { logger } from "firebase-functions/v2";
import { YouTubeService } from "./youtube";
import { TrendChannel, ProcessStats, Notification, YouTubeVideoItem } from "../types";
import { getPercentileDistribution } from "../shared/percentiles.js";
import { db, admin } from "../shared/db.js";
import { isContentChanged, enqueueVideoForEmbedding } from "../embedding/embeddingQueue.js";
import type { EmbeddingQueueEntry } from "../embedding/types.js";

export class SyncService {

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
                await db.doc(`users/${userId}/channels/${userChannelId}/trendChannels/${trendChannel.id}`).update({
                    avatarUrl: avatarUrl
                });
                logger.info("syncChannel:avatarUpdated", { channel: trendChannel.id });
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
        // Each video = up to 2 ops: 1 video write + 1 potential queue write
        const FIRESTORE_BATCH_LIMIT = 500;
        const OPS_PER_VIDEO = 2;
        const BATCH_SAFETY_MARGIN = 50;
        const batchSize = Math.floor((FIRESTORE_BATCH_LIMIT - BATCH_SAFETY_MARGIN) / OPS_PER_VIDEO);

        for (let i = 0; i < videos.length; i += batchSize) {
            const chunk = videos.slice(i, i + batchSize);

            // YouTube Data API often omits `maxres` from snippet.thumbnails even when
            // the CDN file exists (maxresdefault.jpg returns 200).
            // A lightweight HEAD probe upgrades ~5% of thumbnails from 320×180 to 1280×720.
            const thumbnailMap = new Map<string, string>();
            const cdnProbes: Promise<void>[] = [];

            for (const v of chunk) {
                const thumbnails = v.snippet.thumbnails;
                if (thumbnails?.maxres?.url) {
                    thumbnailMap.set(v.id, thumbnails.maxres.url);
                } else {
                    const apiFallback = thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || '';
                    thumbnailMap.set(v.id, apiFallback);
                    const cdnUrl = `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`;
                    cdnProbes.push(
                        axios.head(cdnUrl, { timeout: 3000 })
                            .then(() => { thumbnailMap.set(v.id, cdnUrl); })
                            .catch(() => { /* 404 or timeout — keep API fallback */ })
                    );
                }
            }
            if (cdnProbes.length > 0) await Promise.all(cdnProbes);

            // Pre-read existing video docs for dirty detection (embedding queue)
            // Best-effort: if pre-read fails, video sync continues without queue writes
            const existingDocsMap = new Map<string, Record<string, unknown>>();
            try {
                const videoRefs = chunk.map(v =>
                    db.doc(`users/${userId}/channels/${userChannelId}/trendChannels/${trendChannel.id}/videos/${v.id}`),
                );
                if (videoRefs.length > 0) {
                    const existingDocs = await db.getAll(...videoRefs);
                    for (const snap of existingDocs) {
                        if (snap.exists) {
                            existingDocsMap.set(snap.id, snap.data() as Record<string, unknown>);
                        }
                    }
                }
            } catch (err) {
                logger.warn("syncChannel:embeddingQueuePreReadFailed", {
                    error: err,
                    channel: trendChannel.id,
                });
            }

            const batch = db.batch();
            let enqueuedCount = 0;

            chunk.forEach((v: YouTubeVideoItem) => {
                const viewCount = parseInt(v.statistics.viewCount || '0');
                videoViews[v.id] = viewCount;

                const videoRef = db.doc(`users/${userId}/channels/${userChannelId}/trendChannels/${trendChannel.id}/videos/${v.id}`);

                batch.set(videoRef, {
                    id: v.id,
                    channelId: trendChannel.id,
                    channelTitle: v.snippet.channelTitle || '',
                    title: v.snippet.title,
                    thumbnail: thumbnailMap.get(v.id) || '',
                    publishedAt: v.snippet.publishedAt,
                    publishedAtTimestamp: new Date(v.snippet.publishedAt).getTime(),
                    viewCount: viewCount,
                    likeCount: parseInt(v.statistics.likeCount || '0'),
                    commentCount: parseInt(v.statistics.commentCount || '0'),
                    duration: v.contentDetails?.duration || '',
                    description: v.snippet.description || '',
                    tags: v.snippet.tags || [],
                    lastUpdated: timestamp
                }, { merge: true });

                // Dirty detection: enqueue for embedding sync if content changed
                // If pre-read failed, existingDocsMap is empty → all videos look "new" →
                // all enqueued. Safe: queue entries are idempotent (merge:true),
                // processOneVideo returns "alreadyCurrent" for unchanged videos.
                const previousData = existingDocsMap.get(v.id);
                const currentContent = {
                    title: v.snippet.title,
                    tags: v.snippet.tags || [],
                    description: v.snippet.description || '',
                    thumbnail: thumbnailMap.get(v.id) || '',
                };

                if (isContentChanged(previousData, currentContent)) {
                    const entry: EmbeddingQueueEntry = {
                        videoId: v.id,
                        youtubeChannelId: trendChannel.id,
                        channelTitle: trendChannel.name || trendChannel.title || trendChannel.id,
                        userId,
                        channelId: userChannelId,
                        trendChannelId: trendChannel.id,
                        enqueuedAt: timestamp,
                    };
                    enqueueVideoForEmbedding(batch, entry);
                    enqueuedCount++;
                }
            });

            await batch.commit();

            if (enqueuedCount > 0) {
                logger.info("syncChannel:embeddingQueueEnqueued", {
                    channel: trendChannel.id,
                    enqueued: enqueuedCount,
                    chunkSize: chunk.length,
                });
            }
        }

        // 4. Save Snapshot (with idempotency guard — max 1 per UTC day)
        const snapshotsCol = db.collection(
            `users/${userId}/channels/${userChannelId}/trendChannels/${trendChannel.id}/snapshots`,
        );
        const todayStart = new Date(timestamp);
        todayStart.setUTCHours(0, 0, 0, 0);
        const todayEnd = new Date(timestamp);
        todayEnd.setUTCHours(23, 59, 59, 999);

        const existingToday = await snapshotsCol
            .where("timestamp", ">=", todayStart.getTime())
            .where("timestamp", "<=", todayEnd.getTime())
            .limit(1)
            .get();

        if (existingToday.empty) {
            await snapshotsCol.doc(`${timestamp}`).set({
                timestamp: timestamp,
                videoViews: videoViews,
                videoCount: videos.length,
                type: snapshotType,
            });
        } else {
            logger.info("syncChannel:snapshotSkipped", {
                channel: trendChannel.id,
                date: todayStart.toISOString().split("T")[0],
            });
        }

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

        const performanceDistribution = getPercentileDistribution(
            videos.map(v => ({ viewCount: parseInt(v.statistics.viewCount || '0') }))
        );

        const channelRef = db.doc(`users/${userId}/channels/${userChannelId}/trendChannels/${trendChannelId}`);
        await channelRef.update({
            lastUpdated: timestamp,
            totalViewCount: totalViews,
            averageViews: averageViews,
            performanceDistribution,
            videoCount: videos.length,
        });
    }

    /**
     * Batch-refreshes subscriberCount for trend channels.
     * Makes a single YouTube API call for all channels (1 quota unit per 50 channels).
     */
    async refreshSubscriberCounts(
        userId: string,
        userChannelId: string,
        trendChannelIds: string[],
        apiKey: string
    ): Promise<number> {
        if (trendChannelIds.length === 0) return 0;

        const yt = new YouTubeService(apiKey);
        const { counts, quotaUsed } = await yt.getChannelSubscriberCounts(trendChannelIds);

        const entries = Array.from(counts.entries());
        const batchSize = 400; // Safe margin below Firestore 500-op limit
        for (let i = 0; i < entries.length; i += batchSize) {
            const chunk = entries.slice(i, i + batchSize);
            const batch = db.batch();
            for (const [channelId, subscriberCount] of chunk) {
                const ref = db.doc(`users/${userId}/channels/${userChannelId}/trendChannels/${channelId}`);
                batch.update(ref, { subscriberCount });
            }
            await batch.commit();
        }

        return quotaUsed;
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
            },
            category: 'trends'
        };

        await db.collection(`users/${userId}/channels/${userChannelId}/notifications`).add(notification);
    }
}
