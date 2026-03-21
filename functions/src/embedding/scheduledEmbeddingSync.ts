// =============================================================================
// Scheduled Embedding Sync — Cloud Scheduler entry point (thin launcher)
//
// Runs at 00:30 UTC daily, 30 minutes after video sync (scheduledTrendSnapshot).
// Reads embedding dirty queue, writes syncState, enqueues first batch.
// Falls back to full scan on first run (empty queue + empty embeddings).
// Does NOT process any videos itself.
// =============================================================================

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { db } from "../shared/db.js";
import { discoverChannels } from "./embeddingSync.js";
import { readEmbeddingQueue } from "./embeddingQueue.js";
import { enqueueBatch } from "./taskQueue.js";
import { SYNC_BATCH_SIZE, type SyncState } from "./types.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

// ---------------------------------------------------------------------------
// Full-scan fallback — used on first run when queue is empty
// ---------------------------------------------------------------------------

async function buildSyncStateFromFullScan(): Promise<{
    videos: SyncState["videos"];
    channelPaths: SyncState["channelPaths"];
    coverageByChannel: SyncState["coverageByChannel"];
} | null> {
    const channels = await discoverChannels();
    if (channels.size === 0) return null;

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

    if (videos.length === 0) return null;

    videos.sort((a, b) => a.videoId.localeCompare(b.videoId));

    const coverageByChannel: SyncState["coverageByChannel"] = {};
    for (const video of videos) {
        if (!coverageByChannel[video.youtubeChannelId]) {
            coverageByChannel[video.youtubeChannelId] = { packaging: 0, visual: 0, total: 0 };
        }
        coverageByChannel[video.youtubeChannelId].total++;
    }

    return { videos, channelPaths, coverageByChannel };
}

// ---------------------------------------------------------------------------
// Scheduled function
// ---------------------------------------------------------------------------

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

        logger.info("scheduledEmbeddingSync:start");

        // --- Read embedding queue ---
        const { videos, channelPaths, queueSize } = await readEmbeddingQueue();

        let syncVideos = videos;
        let syncChannelPaths = channelPaths;
        let coverageByChannel: SyncState["coverageByChannel"] = {};

        if (videos.length === 0) {
            // Check if this is first run (no embeddings exist yet)
            const embeddingsCheck = await db.collection("globalVideoEmbeddings").limit(1).get();

            if (embeddingsCheck.empty) {
                logger.info("scheduledEmbeddingSync:fallbackFullScan", {
                    reason: "empty queue + empty globalVideoEmbeddings = first run",
                });

                const fullScan = await buildSyncStateFromFullScan();
                if (!fullScan) {
                    logger.warn("scheduledEmbeddingSync:noVideosFound");
                    return;
                }

                syncVideos = fullScan.videos;
                syncChannelPaths = fullScan.channelPaths;
                coverageByChannel = fullScan.coverageByChannel;
            } else {
                logger.info("scheduledEmbeddingSync:emptyQueue", {
                    reason: "all embeddings current",
                });
                return;
            }
        } else {
            // Queue-based: coverage totals will be resolved in finalize()
            for (const video of syncVideos) {
                if (!coverageByChannel[video.youtubeChannelId]) {
                    coverageByChannel[video.youtubeChannelId] = { packaging: 0, visual: 0, total: 0 };
                }
            }
        }

        // Canary: syncState doc has 1MB Firestore limit (~16K videos max)
        if (syncVideos.length > 12_000) {
            logger.warn("scheduledEmbeddingSync:videoListLarge", {
                count: syncVideos.length,
                message: "Approaching syncState doc size limit — migrate to subcollection batches",
            });
        }

        // --- Write syncState ---
        const syncState: SyncState = {
            channelPaths: syncChannelPaths,
            videos: syncVideos,
            totalVideos: syncVideos.length,
            createdAt: Date.now(),
            totalGenerated: 0,
            totalFailed: 0,
            totalSkippedBudget: 0,
            estimatedCost: 0,
            coverageByChannel,
        };

        await db.doc("system/syncState").set(syncState);

        logger.info("scheduledEmbeddingSync:stateWritten", {
            queueSize,
            totalVideos: syncVideos.length,
            channels: Object.keys(syncChannelPaths).length,
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
            queueSize,
            totalVideos: syncVideos.length,
            batchSize: SYNC_BATCH_SIZE,
            totalBatches: Math.ceil(syncVideos.length / SYNC_BATCH_SIZE),
        });
    },
);
