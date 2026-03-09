// =============================================================================
// Embedding Sync — core logic for daily embedding generation
//
// Discovery: collection group query on trendChannels → unique YouTube channels.
// For each video: check if embedding exists and is current, generate if needed.
// Writes coverage stats to system/embeddingStats as a side-effect.
// =============================================================================

import { logger } from "firebase-functions/v2";
import { db } from "../shared/db.js";
import { checkBudget, recordCost } from "./budgetTracker.js";
import { generatePackagingEmbedding } from "./packagingEmbedding.js";
import { generateThumbnailDescription } from "./thumbnailDescription.js";
import { generateVisualEmbedding } from "./visualEmbedding.js";
import {
    COST_PER_VIDEO,
    CURRENT_PACKAGING_MODEL_VERSION,
    CURRENT_VISUAL_MODEL_VERSION,
    type EmbeddingDoc,
    type EmbeddingSyncResult,
    type EmbeddingStats,
} from "./types.js";

// ---------------------------------------------------------------------------
// Discovery — find unique YouTube channels across all users
// ---------------------------------------------------------------------------

interface ChannelPath {
    userId: string;
    channelId: string;
    trendChannelId: string;
}

/**
 * Discover unique YouTube channels across all users via collection group query.
 * Returns a Map keyed by YouTube channel ID (= trendChannel doc ID).
 * For channels tracked by multiple users, the first encountered path wins.
 */
export async function discoverChannels(): Promise<Map<string, ChannelPath>> {
    const snapshot = await db.collectionGroup("trendChannels").get();
    const channels = new Map<string, ChannelPath>();

    for (const doc of snapshot.docs) {
        const youtubeChannelId = doc.id;

        if (channels.has(youtubeChannelId)) continue;

        // Path: users/{userId}/channels/{channelId}/trendChannels/{trendChannelId}
        const pathParts = doc.ref.path.split("/");
        channels.set(youtubeChannelId, {
            userId: pathParts[1],
            channelId: pathParts[3],
            trendChannelId: pathParts[5],
        });
    }

    return channels;
}

// ---------------------------------------------------------------------------
// Sync core
// ---------------------------------------------------------------------------

export async function syncEmbeddings(apiKey: string): Promise<EmbeddingSyncResult> {
    const t0 = Date.now();
    let discovered = 0;
    let alreadyCurrent = 0;
    let generated = 0;
    let failed = 0;
    let skippedBudget = 0;
    let estimatedCost = 0;

    // --- Discovery ---
    const channels = await discoverChannels();

    if (channels.size === 0) {
        logger.warn("embeddingSync:noVideosFound");
        const result: EmbeddingSyncResult = { discovered: 0, alreadyCurrent: 0, generated: 0, failed: 0, skippedBudget: 0, durationMs: Date.now() - t0, estimatedCost: 0 };
        logger.info("embeddingSync:complete", result);
        return result;
    }

    // --- Budget check ---
    const budget = await checkBudget();
    if (!budget.allowed) {
        // Count all videos across channels as skipped
        for (const [, cp] of channels) {
            const videosSnap = await db.collection(
                `users/${cp.userId}/channels/${cp.channelId}/trendChannels/${cp.trendChannelId}/videos`,
            ).get();
            skippedBudget += videosSnap.size;
        }
        discovered = skippedBudget;
        const result: EmbeddingSyncResult = { discovered, alreadyCurrent: 0, generated: 0, failed: 0, skippedBudget, durationMs: Date.now() - t0, estimatedCost: 0 };
        logger.info("embeddingSync:budgetExhausted", { skippedBudget });
        logger.info("embeddingSync:complete", result);
        return result;
    }

    // --- Process each channel ---
    const coverageStats: EmbeddingStats["byChannel"] = {};

    for (const [youtubeChannelId, cp] of channels) {
        const videosSnap = await db.collection(
            `users/${cp.userId}/channels/${cp.channelId}/trendChannels/${cp.trendChannelId}/videos`,
        ).get();

        let channelPackaging = 0;
        let channelVisual = 0;
        const channelTotal = videosSnap.size;

        for (const videoDoc of videosSnap.docs) {
            discovered++;
            const videoId = videoDoc.id;
            const videoData = videoDoc.data();

            const title = (videoData.title as string) ?? "(untitled)";
            const tags = Array.isArray(videoData.tags) ? (videoData.tags as string[]) : [];
            const description = (videoData.description as string) ?? "";
            const viewCount = typeof videoData.viewCount === "number" ? videoData.viewCount : 0;
            const publishedAt = (videoData.publishedAt as string) ?? "";
            const thumbnailUrl = (videoData.thumbnail as string) ??
                `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
            const channelTitle = (videoData.channelTitle as string) ?? youtubeChannelId;

            try {
                // Check existing embedding doc
                const embeddingRef = db.doc(`globalVideoEmbeddings/${videoId}`);
                const embeddingSnap = await embeddingRef.get();
                const existingDoc = embeddingSnap.exists
                    ? (embeddingSnap.data() as EmbeddingDoc)
                    : null;

                // Determine if generation is needed
                const needsGeneration = !existingDoc
                    || (existingDoc.packagingEmbeddingVersion ?? 0) < CURRENT_PACKAGING_MODEL_VERSION
                    || existingDoc.title !== title
                    || JSON.stringify(existingDoc.tags) !== JSON.stringify(tags);

                const needsThumbnailDescription = !existingDoc
                    || existingDoc.thumbnailDescription === undefined
                    || existingDoc.thumbnailDescription === null;

                const needsVisual = !existingDoc
                    || (existingDoc.visualEmbeddingVersion ?? 0) < CURRENT_VISUAL_MODEL_VERSION;

                if (!needsGeneration && !needsThumbnailDescription && !needsVisual) {
                    // Update denormalized fields if changed
                    if (existingDoc && (existingDoc.viewCount !== viewCount || existingDoc.title !== title)) {
                        await embeddingRef.set(
                            { viewCount, title, updatedAt: Date.now() },
                            { merge: true },
                        );
                    }
                    alreadyCurrent++;

                    // Track coverage
                    if (existingDoc?.packagingEmbedding) channelPackaging++;
                    if (existingDoc?.visualEmbedding) channelVisual++;
                    continue;
                }

                // Re-check budget before generating
                const budgetCheck = await checkBudget();
                if (!budgetCheck.allowed) {
                    skippedBudget++;
                    continue;
                }

                // Generate in parallel: packaging + thumbnail description + visual
                const [packagingEmbedding, thumbnailDesc, visualEmb] = await Promise.all([
                    needsGeneration
                        ? generatePackagingEmbedding(title, tags, description, apiKey)
                        : Promise.resolve(existingDoc?.packagingEmbedding ?? null),
                    needsThumbnailDescription
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

                if (needsGeneration) {
                    docData.packagingEmbedding = packagingEmbedding;
                    docData.packagingEmbeddingVersion = CURRENT_PACKAGING_MODEL_VERSION;
                }

                if (needsThumbnailDescription) {
                    docData.thumbnailDescription = thumbnailDesc;
                }

                if (needsVisual) {
                    docData.visualEmbedding = visualEmb;
                    docData.visualEmbeddingVersion = CURRENT_VISUAL_MODEL_VERSION;
                }

                await embeddingRef.set(docData, { merge: true });

                // Record cost
                const thisCost = COST_PER_VIDEO;
                estimatedCost += thisCost;
                await recordCost(thisCost);

                generated++;

                // Track coverage
                if (packagingEmbedding || existingDoc?.packagingEmbedding) channelPackaging++;
                if (visualEmb || existingDoc?.visualEmbedding) channelVisual++;
            } catch (error) {
                failed++;

                // Increment failCount
                const embeddingRef = db.doc(`globalVideoEmbeddings/${videoId}`);
                try {
                    const snap = await embeddingRef.get();
                    const currentFailCount = snap.exists
                        ? ((snap.data() as EmbeddingDoc).failCount ?? 0)
                        : 0;
                    const newFailCount = currentFailCount + 1;

                    await embeddingRef.set(
                        { failCount: newFailCount, updatedAt: Date.now() },
                        { merge: true },
                    );

                    if (newFailCount >= 3) {
                        logger.warn("embeddingSync:persistentFailure", {
                            videoId,
                            failCount: newFailCount,
                        });
                    }
                } catch {
                    // Best-effort failCount update
                }

                logger.warn("embeddingSync:videoFailed", {
                    videoId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        // Track per-channel coverage
        coverageStats[youtubeChannelId] = {
            packaging: channelPackaging,
            visual: channelVisual,
            total: channelTotal,
        };
    }

    // --- Write coverage stats ---
    const statsDoc: EmbeddingStats = {
        byChannel: coverageStats,
        updatedAt: Date.now(),
    };
    await db.doc("system/embeddingStats").set(statsDoc);

    // --- Observability: anomaly warnings ---
    const totalAttempted = generated + failed;
    if (totalAttempted > 0 && failed / totalAttempted > 0.10) {
        logger.warn("embeddingSync:highFailureRate", {
            failRate: (failed / totalAttempted).toFixed(2),
            generated,
            failed,
        });
    }

    const durationMs = Date.now() - t0;

    // --- Summary log ---
    const result: EmbeddingSyncResult = {
        discovered,
        alreadyCurrent,
        generated,
        failed,
        skippedBudget,
        durationMs,
        estimatedCost,
    };

    logger.info("embeddingSync:complete", result);

    return result;
}
