// =============================================================================
// Task Queue — shared Cloud Tasks helper for embedding batch operations
//
// Used by both scheduledEmbeddingSync and backfillEmbeddings to enqueue
// the next batch in a self-chaining pattern.
// =============================================================================

import { CloudTasksClient } from "@google-cloud/tasks";
import { logger } from "firebase-functions/v2";
import { EMBEDDING_TASK_QUEUE } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCATION = "us-central1";

// ---------------------------------------------------------------------------
// Enqueue next batch
// ---------------------------------------------------------------------------

/**
 * Enqueue the next batch of embedding work via Cloud Tasks.
 *
 * @param targetUrl - The HTTP endpoint URL to call (batch processor function)
 * @param offset - Starting offset for the next batch
 */
export async function enqueueBatch(
    targetUrl: string,
    offset: number,
): Promise<void> {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
        throw new Error("Missing GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT env var");
    }

    const tasksClient = new CloudTasksClient();
    const queuePath = tasksClient.queuePath(projectId, LOCATION, EMBEDDING_TASK_QUEUE);
    const serviceAccountEmail = `${projectId}@appspot.gserviceaccount.com`;

    await tasksClient.createTask({
        parent: queuePath,
        task: {
            httpRequest: {
                httpMethod: "POST",
                url: targetUrl,
                body: Buffer.from(JSON.stringify({ offset })).toString("base64"),
                headers: { "Content-Type": "application/json" },
                oidcToken: {
                    serviceAccountEmail,
                    audience: targetUrl,
                },
            },
            dispatchDeadline: { seconds: 600 },
        },
    });

    logger.info("taskQueue:enqueued", { targetUrl, offset });
}

// ---------------------------------------------------------------------------
// Concurrency limiter (zero dependencies, same API as p-limit)
// ---------------------------------------------------------------------------

export function pLimit(concurrency: number) {
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
