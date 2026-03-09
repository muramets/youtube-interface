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
import { CloudTasksClient } from "@google-cloud/tasks";
import { db } from "../shared/db.js";
import { discoverChannels } from "./embeddingSync.js";
import { checkBudget, recordCost } from "./budgetTracker.js";
import { generatePackagingEmbedding } from "./packagingEmbedding.js";
import { generateThumbnailDescription } from "./thumbnailDescription.js";
import { generateVisualEmbedding } from "./visualEmbedding.js";
import {
    BACKFILL_BATCH_SIZE,
    COST_PER_VIDEO,
    CURRENT_PACKAGING_MODEL_VERSION,
    CURRENT_VISUAL_MODEL_VERSION,
    type BackfillState,
    type BackfillBatchResult,
    type EmbeddingDoc,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_NAME = "embedding-backfill";
const LOCATION = "us-central1";
const BACKFILL_CONCURRENCY = 10;

// ---------------------------------------------------------------------------
// Inline concurrency limiter (zero dependencies, same API as p-limit)
// ---------------------------------------------------------------------------

function pLimit(concurrency: number) {
    let active = 0;
    const queue: Array<() => void> = [];
    const next = () => {
        if (queue.length > 0 && active < concurrency) {
            active++;
            queue.shift()!();
        }
    };
    return <T>(fn: () => Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            const run = () =>
                fn()
                    .then(resolve, reject)
                    .finally(() => {
                        active--;
                        next();
                    });
            queue.push(run);
            next();
        });
}

// ---------------------------------------------------------------------------
// Gemini API key
// ---------------------------------------------------------------------------

const geminiApiKey = defineSecret("GEMINI_API_KEY");

// ---------------------------------------------------------------------------
// Cloud Task enqueue helper
// ---------------------------------------------------------------------------

export async function enqueueNextBatch(
    selfUrl: string,
    nextOffset: number,
): Promise<void> {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
        throw new Error("Missing GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT env var");
    }

    const tasksClient = new CloudTasksClient();
    const queuePath = tasksClient.queuePath(projectId, LOCATION, QUEUE_NAME);
    const serviceAccountEmail = `${projectId}@appspot.gserviceaccount.com`;

    await tasksClient.createTask({
        parent: queuePath,
        task: {
            httpRequest: {
                httpMethod: "POST",
                url: selfUrl,
                body: Buffer.from(JSON.stringify({ offset: nextOffset })).toString("base64"),
                headers: { "Content-Type": "application/json" },
                oidcToken: {
                    serviceAccountEmail,
                    audience: selfUrl,
                },
            },
            dispatchDeadline: { seconds: 600 },
        },
    });

    logger.info("backfill:nextEnqueued", { nextOffset, url: selfUrl });
}

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
            try {
                // Check existing embedding doc
                const embeddingRef = db.doc(`globalVideoEmbeddings/${videoId}`);
                const embeddingSnap = await embeddingRef.get();
                const existingDoc = embeddingSnap.exists
                    ? (embeddingSnap.data() as EmbeddingDoc)
                    : null;

                // Idempotent: skip if all embeddings current
                if (
                    existingDoc &&
                    (existingDoc.packagingEmbeddingVersion ?? 0) >= CURRENT_PACKAGING_MODEL_VERSION &&
                    existingDoc.thumbnailDescription != null &&
                    (existingDoc.visualEmbeddingVersion ?? 0) >= CURRENT_VISUAL_MODEL_VERSION
                ) {
                    return;
                }

                // Read video doc from trendChannel for description
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
                const title = (videoData.title as string) ?? "(untitled)";
                const tags = Array.isArray(videoData.tags) ? (videoData.tags as string[]) : [];
                const description = (videoData.description as string) ?? "";
                const viewCount = typeof videoData.viewCount === "number" ? videoData.viewCount : 0;
                const publishedAt = (videoData.publishedAt as string) ?? "";
                const thumbnailUrl = (videoData.thumbnail as string) ??
                    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
                const channelTitle = (videoData.channelTitle as string) ?? youtubeChannelId;

                // Determine what needs generation
                const needsPackaging = !existingDoc
                    || (existingDoc.packagingEmbeddingVersion ?? 0) < CURRENT_PACKAGING_MODEL_VERSION;
                const needsDescription = !existingDoc
                    || existingDoc.thumbnailDescription == null;
                const needsVisual = !existingDoc
                    || (existingDoc.visualEmbeddingVersion ?? 0) < CURRENT_VISUAL_MODEL_VERSION;

                // Generate packaging + description + visual in parallel (per video)
                const [packagingEmbedding, thumbnailDesc, visualEmb] = await Promise.all([
                    needsPackaging
                        ? generatePackagingEmbedding(title, tags, description, apiKey)
                        : Promise.resolve(existingDoc?.packagingEmbedding ?? null),
                    needsDescription
                        ? generateThumbnailDescription(videoId, apiKey)
                        : Promise.resolve(existingDoc?.thumbnailDescription ?? null),
                    needsVisual
                        ? generateVisualEmbedding(videoId)
                        : Promise.resolve(existingDoc?.visualEmbedding ?? null),
                ]);

                // Save to globalVideoEmbeddings
                const docData: Partial<EmbeddingDoc> = {
                    videoId,
                    youtubeChannelId,
                    channelTitle,
                    title,
                    tags,
                    viewCount,
                    publishedAt,
                    thumbnailUrl,
                    updatedAt: Date.now(),
                    failCount: 0,
                };

                if (needsPackaging) {
                    docData.packagingEmbedding = packagingEmbedding;
                    docData.packagingEmbeddingVersion = CURRENT_PACKAGING_MODEL_VERSION;
                }

                if (needsDescription) {
                    docData.thumbnailDescription = thumbnailDesc;
                }

                if (needsVisual) {
                    docData.visualEmbedding = visualEmb;
                    docData.visualEmbeddingVersion = CURRENT_VISUAL_MODEL_VERSION;
                }

                await embeddingRef.set(docData, { merge: true });

                batchEstimatedCost += COST_PER_VIDEO;
                batchGenerated++;
            } catch (error) {
                batchFailed++;
                logger.warn("backfill:videoFailed", {
                    videoId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        })));

        // Record cost for this batch
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
            await enqueueNextBatch(selfUrl, nextOffset);
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
        const selfUrl = `https://${req.hostname}`;

        const result = await processBackfill({ apiKey, offset, selfUrl });

        if (result.statusCode) {
            res.status(result.statusCode).json(result.body);
        } else {
            res.json(result.body);
        }
    },
);
