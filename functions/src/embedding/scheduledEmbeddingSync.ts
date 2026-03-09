// =============================================================================
// Scheduled Embedding Sync — Cloud Scheduler entry point
//
// Runs at 00:30 UTC daily, 30 minutes after video sync (scheduledTrendSnapshot).
// Completely decoupled from scheduledSync — independent schedule, timeout, memory.
// =============================================================================

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { syncEmbeddings } from "./embeddingSync.js";

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

        const result = await syncEmbeddings(apiKey);
        logger.info("scheduledEmbeddingSync:done", result);
    },
);
