// =============================================================================
// Embedding Sync Batch — self-chaining Cloud Task batch processor
//
// Reads system/syncState, processes a batch of videos using processOneVideo,
// updates counters atomically, and enqueues the next batch. On last batch:
// writes coverage stats, sends notifications, deletes syncState.
// =============================================================================

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { db, admin } from "../shared/db.js";
import { checkBudget, recordCost } from "./budgetTracker.js";
import { processOneVideo, type VideoInput } from "./processOneVideo.js";
import { enqueueBatch, pLimit } from "./taskQueue.js";
import {
    COST_PER_VIDEO,
    EMBEDDING_QUEUE_PATH,
    SYNC_BATCH_SIZE,
    type SyncState,
    type EmbeddingStats,
} from "./types.js";
import type { Notification } from "../types.js";

// ---------------------------------------------------------------------------
// Gemini API key
// ---------------------------------------------------------------------------

const geminiApiKey = defineSecret("GEMINI_API_KEY");

// ---------------------------------------------------------------------------
// Core logic — exported for testing
// ---------------------------------------------------------------------------

interface SyncBatchResult {
    statusCode?: number;
    body: Record<string, unknown>;
}

export async function processSyncBatch(params: {
    apiKey: string;
    offset: number;
    selfUrl: string;
}): Promise<SyncBatchResult> {
    const { apiKey, offset, selfUrl } = params;
    const batchNumber = Math.floor(offset / SYNC_BATCH_SIZE);

    try {
        logger.info("embeddingSyncBatch:batchStart", { batch: batchNumber, offset });

        // --- Read sync state ---
        const stateRef = db.doc("system/syncState");
        const stateSnap = await stateRef.get();

        if (!stateSnap.exists) {
            logger.warn("embeddingSyncBatch:noSyncState", { offset });
            return { body: { message: "No syncState found — nothing to do" } };
        }

        const state = stateSnap.data() as SyncState;

        // --- Slice batch ---
        const batch = state.videos.slice(offset, offset + SYNC_BATCH_SIZE);

        if (batch.length === 0) {
            // Edge case: offset beyond total — clean up
            await stateRef.delete();
            logger.info("embeddingSync:complete", { totalProcessed: offset });
            return { body: { message: "Sync complete (empty batch)", totalProcessed: offset } };
        }

        // --- Budget check ---
        const budget = await checkBudget();
        if (!budget.allowed) {
            // Update skipped count and stop chain
            const remaining = state.totalVideos - offset;
            await stateRef.update({
                totalSkippedBudget: admin.firestore.FieldValue.increment(remaining),
            });

            logger.info("embeddingSyncBatch:budgetExhausted", {
                batch: batchNumber,
                offset,
                totalRemaining: remaining,
            });

            // Budget exhausted = effectively last batch — run finalization
            await finalize(stateRef, state);

            return {
                body: {
                    message: "Budget exhausted — chain stopped",
                    batch: batchNumber,
                    totalProcessed: offset,
                    skippedBudget: remaining,
                },
            };
        }

        // --- Process batch (concurrent with limiter) ---
        let batchGenerated = 0;
        let batchFailed = 0;
        const successfulVideoIds: string[] = [];
        const channelCoverage: Record<string, { packaging: number; visual: number }> = {};
        const limit = pLimit(10);

        await Promise.all(batch.map(({ videoId, youtubeChannelId }) => limit(async () => {
            // Read video doc from trendChannel path
            const cp = state.channelPaths[youtubeChannelId];
            if (!cp) {
                logger.warn("embeddingSyncBatch:missingChannelPath", { videoId, youtubeChannelId });
                batchFailed++;
                return;
            }

            const videoDocSnap = await db.doc(
                `users/${cp.userId}/channels/${cp.channelId}/trendChannels/${cp.trendChannelId}/videos/${videoId}`,
            ).get();

            if (!videoDocSnap.exists) {
                logger.warn("embeddingSyncBatch:videoDocNotFound", { videoId });
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
                channelTitle: cp.channelTitle,
            };

            const result = await processOneVideo(videoInput, apiKey);

            if (result.status === "generated") {
                batchGenerated++;
                successfulVideoIds.push(videoId);
            } else if (result.status === "failed") {
                batchFailed++;
            } else {
                // alreadyCurrent — still successful, remove from queue
                successfulVideoIds.push(videoId);
            }

            // Track per-channel coverage (generated + alreadyCurrent contribute)
            if (!channelCoverage[youtubeChannelId]) {
                channelCoverage[youtubeChannelId] = { packaging: 0, visual: 0 };
            }
            if (result.hasPackaging) channelCoverage[youtubeChannelId].packaging++;
            if (result.hasVisual) channelCoverage[youtubeChannelId].visual++;
        })));

        // --- Queue cleanup: remove successfully processed videos ---
        if (successfulVideoIds.length > 0) {
            try {
                const cleanupBatch = db.batch();
                for (const videoId of successfulVideoIds) {
                    cleanupBatch.delete(db.doc(`${EMBEDDING_QUEUE_PATH}/${videoId}`));
                }
                await cleanupBatch.commit();
                logger.info("embeddingSyncBatch:queueCleanup", {
                    cleaned: successfulVideoIds.length,
                    failed: batchFailed,
                });
            } catch (err) {
                // Best-effort: videos stay in queue → retry next run → idempotent
                logger.warn("embeddingSyncBatch:queueCleanupFailed", { error: err });
            }
        }

        // --- Record cost ---
        const batchEstimatedCost = batchGenerated * COST_PER_VIDEO;
        if (batchEstimatedCost > 0) {
            await recordCost(batchEstimatedCost);
        }

        // --- Update syncState counters + coverage atomically ---
        const stateUpdate: Record<string, unknown> = {
            totalGenerated: admin.firestore.FieldValue.increment(batchGenerated),
            totalFailed: admin.firestore.FieldValue.increment(batchFailed),
            estimatedCost: admin.firestore.FieldValue.increment(batchEstimatedCost),
        };

        for (const [channelId, delta] of Object.entries(channelCoverage)) {
            if (delta.packaging > 0) {
                stateUpdate[`coverageByChannel.${channelId}.packaging`] = admin.firestore.FieldValue.increment(delta.packaging);
            }
            if (delta.visual > 0) {
                stateUpdate[`coverageByChannel.${channelId}.visual`] = admin.firestore.FieldValue.increment(delta.visual);
            }
        }

        await stateRef.update(stateUpdate);

        // --- Log batch summary ---
        const batchAlreadyCurrent = batch.length - batchGenerated - batchFailed;
        const batchResult = {
            batch: batchNumber,
            batchGenerated,
            batchAlreadyCurrent,
            batchFailed,
            totalProcessed: offset + batch.length,
            totalRemaining: state.totalVideos - offset - batch.length,
            estimatedCost: batchEstimatedCost,
        };

        logger.info("embeddingSyncBatch:batchComplete", batchResult);

        // --- Chain control ---
        const nextOffset = offset + SYNC_BATCH_SIZE;

        if (nextOffset < state.totalVideos) {
            // More videos — enqueue next batch
            await enqueueBatch(selfUrl, nextOffset);
            return { body: { ...batchResult, message: "Batch complete, next enqueued" } };
        } else {
            // Last batch — finalize
            await finalize(stateRef, state);

            logger.info("embeddingSync:complete", {
                totalProcessed: offset + batch.length,
                totalVideos: state.totalVideos,
            });

            return { body: { ...batchResult, message: "Sync complete" } };
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("embeddingSyncBatch:error", { batch: batchNumber, offset, error: msg });
        return { statusCode: 500, body: { error: msg } };
    }
}

// ---------------------------------------------------------------------------
// Finalize — coverage stats, notifications, cleanup
// ---------------------------------------------------------------------------

async function finalize(
    stateRef: FirebaseFirestore.DocumentReference,
    state: SyncState,
): Promise<void> {
    // Re-read state to get final accumulated counters + coverage
    const finalSnap = await stateRef.get();
    const finalState = finalSnap.exists ? (finalSnap.data() as SyncState) : state;

    // --- Resolve fresh `total` per channel from trendChannels docs ---
    // Trends Sync writes `videoCount` on every sync — always fresh.
    // Queue-based flow sets total=0 as placeholder; finalize resolves actual counts.
    const channelVideoTotals = new Map<string, number>();
    try {
        const channelEntries = Object.entries(finalState.channelPaths);
        if (channelEntries.length > 0) {
            const channelRefs = channelEntries.map(([, cp]) =>
                db.doc(`users/${cp.userId}/channels/${cp.channelId}/trendChannels/${cp.trendChannelId}`),
            );
            const channelDocs = await db.getAll(...channelRefs);
            for (let i = 0; i < channelEntries.length; i++) {
                const [channelId] = channelEntries[i];
                const snap = channelDocs[i];
                const videoCount = snap.exists ? (snap.data()?.videoCount as number ?? 0) : 0;
                channelVideoTotals.set(channelId, videoCount);
            }
        }
    } catch {
        // Best-effort: fallback to syncState totals (may be 0 for queue-based)
        logger.warn("embeddingSyncBatch:channelTotalsReadFailed");
    }

    // --- Write coverage stats ---
    const coverageStats: EmbeddingStats["byChannel"] = {};
    for (const [channelId, stats] of Object.entries(finalState.coverageByChannel)) {
        coverageStats[channelId] = {
            packaging: stats.packaging,
            visual: stats.visual,
            total: channelVideoTotals.get(channelId) ?? stats.total,
        };
    }

    const statsDoc: EmbeddingStats = {
        byChannel: coverageStats,
        updatedAt: Date.now(),
    };
    await db.doc("system/embeddingStats").set(statsDoc);

    logger.info("embeddingSyncBatch:finalized", {
        channels: Object.keys(coverageStats).length,
        generated: finalState.totalGenerated,
        failed: finalState.totalFailed,
        skippedBudget: finalState.totalSkippedBudget,
        estimatedCost: finalState.estimatedCost,
    });

    // --- Anomaly detection ---
    const generated = finalState.totalGenerated;
    const failed = finalState.totalFailed;
    const skippedBudget = finalState.totalSkippedBudget;
    const totalAttempted = generated + failed;

    if (totalAttempted > 0 && failed / totalAttempted > 0.10) {
        logger.warn("embeddingSync:highFailureRate", {
            failRate: (failed / totalAttempted).toFixed(2),
            generated,
            failed,
        });
    }

    // --- Send notifications ---

    if (generated > 0 || skippedBudget > 0) {
        // Collect unique user/channel pairs for notifications
        const userChannelPairs = new Map<string, { userId: string; channelId: string }>();
        for (const channelId of Object.keys(state.channelPaths)) {
            const cp = state.channelPaths[channelId];
            const key = `${cp.userId}/${cp.channelId}`;
            if (!userChannelPairs.has(key)) {
                userChannelPairs.set(key, { userId: cp.userId, channelId: cp.channelId });
            }
        }

        const notification: Notification = skippedBudget > 0 && generated === 0
            ? {
                title: "Smart Search Paused: monthly budget limit reached",
                message: `${skippedBudget} videos skipped due to budget limit. Search still works for previously indexed videos.`,
                type: "warning",
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: false,
                category: "smart-search",
            }
            : {
                title: `Smart Search Updated: ${generated} videos processed`,
                message: `Indexed ${generated} videos for AI search.${skippedBudget > 0 ? ` ${skippedBudget} skipped (budget).` : ""}`,
                type: "success",
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: false,
                category: "smart-search",
            };

        for (const [, pair] of userChannelPairs) {
            try {
                await db.collection(`users/${pair.userId}/channels/${pair.channelId}/notifications`).add(notification);
            } catch (err) {
                logger.warn("embeddingSyncBatch:notificationFailed", { userId: pair.userId, error: err });
            }
        }
    }

    // --- Cleanup ---
    await stateRef.delete();
}

// ---------------------------------------------------------------------------
// HTTP entry point
// ---------------------------------------------------------------------------

export const embeddingSyncBatch = onRequest(
    {
        timeoutSeconds: 540,
        memory: "512MiB",
        secrets: [geminiApiKey],
    },
    async (req, res) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            logger.error("embeddingSyncBatch:missingApiKey");
            res.status(500).json({ error: "Missing GEMINI_API_KEY" });
            return;
        }

        const offset = typeof req.body?.offset === "number" ? req.body.offset : 0;
        // Hardcoded URL — req.originalUrl is "/" on Cloud Run (Firebase strips
        // the function name during routing), breaking self-chaining.
        const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
        const selfUrl = `https://us-central1-${projectId}.cloudfunctions.net/embeddingSyncBatch`;

        const result = await processSyncBatch({ apiKey, offset, selfUrl });

        if (result.statusCode) {
            res.status(result.statusCode).json(result.body);
        } else {
            res.json(result.body);
        }
    },
);
