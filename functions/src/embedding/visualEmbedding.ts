// =============================================================================
// Visual Embedding Generator
//
// Downloads a YouTube video thumbnail and generates a 1408-dimensional
// visual embedding using Vertex AI multimodalembedding@001.
// Auth: Application Default Credentials (service account in Cloud Functions).
// Cost: ~$0.0001 per image.
// =============================================================================

import { logger } from "firebase-functions/v2";
import { downloadThumbnail } from "./thumbnailDownload.js";

// ---------------------------------------------------------------------------
// Lazy-initialized Vertex AI client (dynamic import + module-level cache)
//
// @google-cloud/aiplatform is ~50MB. A top-level import would force EVERY
// Cloud Function container to load it at startup (ES modules are evaluated
// eagerly). Dynamic import ensures only embedding functions pay the cost —
// and only on first actual invocation, not at cold-start.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedClient: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedHelpers: any | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getVertexClient(): Promise<{ client: any; helpers: any }> {
    if (!cachedClient) {
        const aiplatform = await import("@google-cloud/aiplatform");
        cachedClient = new aiplatform.PredictionServiceClient({
            apiEndpoint: "us-central1-aiplatform.googleapis.com",
        });
        cachedHelpers = aiplatform.helpers;
    }
    return { client: cachedClient, helpers: cachedHelpers };
}

/** Reset cached client (for testing) */
export function resetVertexClient(): void {
    cachedClient = null;
    cachedHelpers = null;
}

// ---------------------------------------------------------------------------
// Visual embedding generation
// ---------------------------------------------------------------------------

/**
 * Generate a visual embedding from a YouTube video thumbnail.
 *
 * @param videoId - YouTube video ID (used to download thumbnail)
 * @returns 1408-dimensional embedding vector, or null on error
 */
export async function generateVisualEmbedding(
    videoId: string,
): Promise<number[] | null> {
    try {
        // Download thumbnail
        const downloaded = await downloadThumbnail(videoId);
        if (!downloaded) {
            logger.warn("visualEmbedding:downloadFailed", { videoId });
            return null;
        }

        const base64 = downloaded.buffer.toString("base64");

        // Get project ID
        const projectId = process.env.GCLOUD_PROJECT
            || process.env.GOOGLE_CLOUD_PROJECT
            || process.env.GCP_PROJECT;
        if (!projectId) {
            logger.warn("visualEmbedding:missingProjectId");
            return null;
        }

        // Call Vertex AI multimodal embedding (dynamic import — see module header)
        const { client, helpers: h } = await getVertexClient();
        const endpoint = `projects/${projectId}/locations/us-central1/publishers/google/models/multimodalembedding@001`;

        const instance = h.toValue({
            image: { bytesBase64Encoded: base64 },
        });

        if (!instance) {
            logger.warn("visualEmbedding:toValueFailed", { videoId });
            return null;
        }

        const [response] = await client.predict({
            endpoint,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            instances: [instance as any],
        });

        if (!response.predictions || response.predictions.length === 0) {
            logger.warn("visualEmbedding:emptyResponse", { videoId });
            return null;
        }

        const prediction = h.fromValue(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            response.predictions[0] as any,
        ) as Record<string, unknown> | null;

        if (
            !prediction
            || !prediction.imageEmbedding
            || !Array.isArray(prediction.imageEmbedding)
        ) {
            logger.warn("visualEmbedding:unexpectedFormat", { videoId });
            return null;
        }

        return prediction.imageEmbedding as number[];
    } catch (error) {
        logger.warn("visualEmbedding:failed", {
            videoId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
