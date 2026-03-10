// =============================================================================
// Backfill Embeddings — Cloud Task chain for existing videos
//
// Callable HTTP function (not scheduled). Processes videos in batches of 100.
// Batch 0: discovery -> write backfillState -> process first batch.
// Batches 1+: read backfillState -> process batch -> enqueue next.
// Budget-aware, idempotent, self-chaining via Cloud Tasks.
// =============================================================================

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { db } from "../shared/db.js";
import { discoverChannels } from "./embeddingSync.js";
import { checkBudget, recordCost } from "./budgetTracker.js";
import { processOneVideo, type VideoInput } from "./processOneVideo.js";
import { enqueueBatch, pLimit } from "./taskQueue.js";
import {
    BACKFILL_BATCH_SIZE,
    COST_PER_VIDEO,
    type BackfillState,
    type BackfillBatchResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKFILL_CONCURRENCY = 10;

// ---------------------------------------------------------------------------
// Gemini API key
// ---------------------------------------------------------------------------

const geminiApiKey = defineSecret("GEMINI_API_KEY");

// ---------------------------------------------------------------------------
// Core logic — exported for testing
// ---------------------------------------------------------------------------

interface BackfillResult {
    statusCode?: number;
    body: Record<string, unknown>;
}

export async function processBackfill(params: {
    apiKey: string;
    offset: number;
    selfUrl: string;
}): Promise<BackfillResult> {
    const { apiKey, offset, selfUrl } = params;
    const batchNumber = Math.floor(offset / BACKFILL_BATCH_SIZE);

    try {
        // --- Get or create backfill state ---
        const stateRef = db.doc("system/backfillState");
        let state: BackfillState;

        const stateSnap = await stateRef.get();

        if (offset === 0 || !stateSnap.exists) {
            // Batch 0: discovery
            logger.info("backfill:discovery:start");

            const channels = await discoverChannels();
            if (channels.size === 0) {
                logger.warn("backfill:noChannelsFound");
                return { body: { message: "No trend channels found", totalVideos: 0 } };
            }

            // Build channelPaths
            const channelPaths: BackfillState["channelPaths"] = {};
            for (const [youtubeChannelId, cp] of channels) {
                channelPaths[youtubeChannelId] = cp;
            }

            // Collect all videos across all channels
            const videos: BackfillState["videos"] = [];
            for (const [youtubeChannelId, cp] of channels) {
                const videosSnap = await db.collection(
                    `users/${cp.userId}/channels/${cp.channelId}/trendChannels/${cp.trendChannelId}/videos`,
                ).get();

                for (const videoDoc of videosSnap.docs) {
                    videos.push({ videoId: videoDoc.id, youtubeChannelId });
                }
            }

            // Sort deterministically by videoId
            videos.sort((a, b) => a.videoId.localeCompare(b.videoId));

            state = {
                channelPaths,
                videos,
                totalVideos: videos.length,
                createdAt: Date.now(),
            };

            await stateRef.set(state);
            logger.info("backfill:discovery:complete", {
                channels: channels.size,
                totalVideos: videos.length,
            });
        } else {
            state = stateSnap.data() as BackfillState;
        }

        // --- Budget check ---
        const budget = await checkBudget();
        if (!budget.allowed) {
            logger.info("backfill:budgetExhausted", {
                batch: batchNumber,
                offset,
                totalRemaining: state.totalVideos - offset,
            });
            return {
                body: {
                    message: "Budget exhausted — chain stopped",
                    batch: batchNumber,
                    totalProcessed: offset,
                },
            };
        }

        // --- Slice batch ---
        const batch = state.videos.slice(offset, offset + BACKFILL_BATCH_SIZE);

        if (batch.length === 0) {
            await stateRef.delete();
            logger.info("backfill:complete", {
                totalProcessed: offset,
                totalVideos: state.totalVideos,
            });
            return { body: { message: "Backfill complete", totalProcessed: offset } };
        }

        // --- Process batch (concurrent with limiter) ---
        let batchGenerated = 0;
        let batchFailed = 0;
        let batchEstimatedCost = 0;

        const limit = pLimit(BACKFILL_CONCURRENCY);

        await Promise.all(batch.map(({ videoId, youtubeChannelId }) => limit(async () => {
            // Read video doc from trendChannel path
            const cp = state.channelPaths[youtubeChannelId];
            if (!cp) {
                logger.warn("backfill:missingChannelPath", { videoId, youtubeChannelId });
                batchFailed++;
                return;
            }

            const videoDocSnap = await db.doc(
                `users/${cp.userId}/channels/${cp.channelId}/trendChannels/${cp.trendChannelId}/videos/${videoId}`,
            ).get();

            if (!videoDocSnap.exists) {
                logger.warn("backfill:videoDocNotFound", { videoId });
                batchFailed++;
                return;
            }

            const videoData = videoDocSnap.data()!;
            const videoInput: VideoInput = {
                videoId,
                youtubeChannelId,
                title: (videoData.title as string) ?? "(untitled)",
                tags: Array.isArray(videoData.tags) ? (videoData.tags as string[]) : [],
                description: (videoData.description as string) ?? "",
                viewCount: typeof videoData.viewCount === "number" ? videoData.viewCount : 0,
                publishedAt: (videoData.publishedAt as string) ?? "",
                thumbnailUrl: (videoData.thumbnail as string) ??
                    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
                channelTitle: (videoData.channelTitle as string) ?? youtubeChannelId,
            };

            const result = await processOneVideo(videoInput, apiKey);

            if (result.status === "generated") {
                batchGenerated++;
            } else if (result.status === "failed") {
                batchFailed++;
            }
        })));

        // Calculate and record cost for this batch
        batchEstimatedCost = batchGenerated * COST_PER_VIDEO;
        if (batchEstimatedCost > 0) {
            await recordCost(batchEstimatedCost);
        }

        // Log batch summary
        const batchResult: BackfillBatchResult = {
            batch: batchNumber,
            batchGenerated,
            batchFailed,
            totalProcessed: offset + batch.length,
            totalRemaining: state.totalVideos - offset - batch.length,
            estimatedCost: batchEstimatedCost,
        };

        logger.info("backfill:batchComplete", batchResult);

        // --- Chain control ---
        const nextOffset = offset + BACKFILL_BATCH_SIZE;

        if (nextOffset < state.totalVideos) {
            // More videos — enqueue next batch via Cloud Task
            await enqueueBatch(selfUrl, nextOffset);
            return { body: { ...batchResult, message: "Batch complete, next enqueued" } };
        } else {
            // Last batch — cleanup
            await stateRef.delete();
            logger.info("backfill:complete", {
                totalProcessed: offset + batch.length,
                totalVideos: state.totalVideos,
            });
            return { body: { ...batchResult, message: "Backfill complete" } };
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("backfill:error", { batch: batchNumber, offset, error: msg });
        return { statusCode: 500, body: { error: msg } };
    }
}

// ---------------------------------------------------------------------------
// HTTP entry point
// ---------------------------------------------------------------------------

export const backfillEmbeddings = onRequest(
    {
        timeoutSeconds: 540,
        memory: "512MiB",
        secrets: [geminiApiKey],
    },
    async (req, res) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            logger.error("backfill:missingApiKey");
            res.status(500).json({ error: "Missing GEMINI_API_KEY" });
            return;
        }

        const offset = typeof req.body?.offset === "number" ? req.body.offset : 0;
        const selfUrl = `${req.protocol}://${req.get("host")}${req.originalUrl.split("?")[0]}`;

        const result = await processBackfill({ apiKey, offset, selfUrl });

        if (result.statusCode) {
            res.status(result.statusCode).json(result.body);
        } else {
            res.json(result.body);
        }
    },
);
