// =============================================================================
// Scheduled Embedding Sync — Cloud Scheduler entry point (thin launcher)
//
// Runs at 00:30 UTC daily, 30 minutes after video sync (scheduledTrendSnapshot).
// Discovers channels, collects all video IDs, writes syncState, enqueues
// first batch to embeddingSyncBatch. Does NOT process any videos itself.
// =============================================================================

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { db } from "../shared/db.js";
import { discoverChannels } from "./embeddingSync.js";
import { enqueueBatch } from "./taskQueue.js";
import { SYNC_BATCH_SIZE, type SyncState } from "./types.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const scheduledEmbeddingSync = onSchedule(
    {
        schedule: "30 0 * * *",
        timeZone: "Etc/UTC",
        timeoutSeconds: 540,
        memory: "512MiB",
        secrets: [geminiApiKey],
    },
    async () => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            logger.error("scheduledEmbeddingSync:missingApiKey");
            return;
        }

        // --- Discovery ---
        const channels = await discoverChannels();

        if (channels.size === 0) {
            logger.warn("scheduledEmbeddingSync:noChannelsFound");
            return;
        }

        // --- Collect all video IDs across all channels ---
        const channelPaths: SyncState["channelPaths"] = {};
        const videos: SyncState["videos"] = [];

        for (const [youtubeChannelId, cp] of channels) {
            channelPaths[youtubeChannelId] = cp;

            const videosSnap = await db.collection(
                `users/${cp.userId}/channels/${cp.channelId}/trendChannels/${cp.trendChannelId}/videos`,
            ).get();

            for (const videoDoc of videosSnap.docs) {
                videos.push({ videoId: videoDoc.id, youtubeChannelId });
            }
        }

        if (videos.length === 0) {
            logger.warn("scheduledEmbeddingSync:noVideosFound");
            return;
        }

        // Canary: syncState doc has 1MB Firestore limit (~16K videos max)
        if (videos.length > 12_000) {
            logger.warn("scheduledEmbeddingSync:videoListLarge", {
                count: videos.length,
                message: "Approaching syncState doc size limit — migrate to subcollection batches",
            });
        }

        // --- Sort deterministically by videoId ---
        videos.sort((a, b) => a.videoId.localeCompare(b.videoId));

        // --- Compute per-channel video totals ---
        const coverageByChannel: SyncState["coverageByChannel"] = {};
        for (const video of videos) {
            if (!coverageByChannel[video.youtubeChannelId]) {
                coverageByChannel[video.youtubeChannelId] = { packaging: 0, visual: 0, total: 0 };
            }
            coverageByChannel[video.youtubeChannelId].total++;
        }

        // --- Write syncState ---
        const syncState: SyncState = {
            channelPaths,
            videos,
            totalVideos: videos.length,
            createdAt: Date.now(),
            totalGenerated: 0,
            totalFailed: 0,
            totalSkippedBudget: 0,
            estimatedCost: 0,
            coverageByChannel,
        };

        await db.doc("system/syncState").set(syncState);

        logger.info("scheduledEmbeddingSync:stateWritten", {
            channels: channels.size,
            totalVideos: videos.length,
        });

        // --- Enqueue first batch ---
        const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
        if (!projectId) {
            logger.error("scheduledEmbeddingSync:missingProjectId");
            return;
        }

        const batchUrl = `https://us-central1-${projectId}.cloudfunctions.net/embeddingSyncBatch`;
        await enqueueBatch(batchUrl, 0);

        logger.info("scheduledEmbeddingSync:launched", {
            totalVideos: videos.length,
            batchSize: SYNC_BATCH_SIZE,
            totalBatches: Math.ceil(videos.length / SYNC_BATCH_SIZE),
        });
    },
);
