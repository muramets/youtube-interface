// =============================================================================
// Scheduled Embedding Sync — Cloud Scheduler entry point
//
// Runs at 00:30 UTC daily, 30 minutes after video sync (scheduledTrendSnapshot).
// Completely decoupled from scheduledSync — independent schedule, timeout, memory.
// =============================================================================

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { db, admin } from "../shared/db.js";
import { syncEmbeddings, discoverChannels } from "./embeddingSync.js";
import type { Notification } from "../types.js";

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

        // Discover user/channel pairs before sync (for notifications)
        const channels = await discoverChannels();
        const userChannelPairs = new Map<string, { userId: string; channelId: string }>();
        for (const [, cp] of channels) {
            const key = `${cp.userId}/${cp.channelId}`;
            if (!userChannelPairs.has(key)) {
                userChannelPairs.set(key, { userId: cp.userId, channelId: cp.channelId });
            }
        }

        const result = await syncEmbeddings(apiKey);
        logger.info("scheduledEmbeddingSync:done", result);

        // Send notifications to each user/channel pair
        if (result.generated > 0 || result.skippedBudget > 0) {
            const notification: Notification = result.skippedBudget > 0 && result.generated === 0
                ? {
                    title: "Smart Search Paused: monthly budget limit reached",
                    message: `${result.skippedBudget} videos skipped due to budget limit. Search still works for previously indexed videos.`,
                    type: "warning",
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: false,
                    category: "smart-search",
                }
                : {
                    title: `Smart Search Updated: ${result.generated} videos processed`,
                    message: `Indexed ${result.generated} videos for AI search.${result.skippedBudget > 0 ? ` ${result.skippedBudget} skipped (budget).` : ""}`,
                    type: "success",
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: false,
                    category: "smart-search",
                };

            for (const [, pair] of userChannelPairs) {
                try {
                    await db.collection(`users/${pair.userId}/channels/${pair.channelId}/notifications`).add(notification);
                } catch (err) {
                    logger.warn("scheduledEmbeddingSync:notificationFailed", { userId: pair.userId, error: err });
                }
            }
        }
    },
);
