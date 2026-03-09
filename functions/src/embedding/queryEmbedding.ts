// =============================================================================
// Query Embedding Generator
//
// Converts a free-text search query into a 768d embedding vector using
// Gemini Embedding API with taskType: RETRIEVAL_QUERY.
//
// Unlike generatePackagingEmbedding (which formats input as Title/Tags/Description),
// this function sends raw query text — no wrappers, no formatting.
// Cost: ~$0.00004 per call.
// =============================================================================

import { logger } from "firebase-functions/v2";
import { getClient } from "../services/gemini/client.js";
import { EMBEDDING_DIMENSIONS } from "./types.js";

/**
 * Generate a query embedding optimized for retrieval search.
 *
 * Uses taskType: RETRIEVAL_QUERY to produce a vector optimized for
 * searching against document embeddings (asymmetric search).
 *
 * @returns 768d embedding vector, or null on error
 */
export async function generateQueryEmbedding(
    query: string,
    apiKey: string,
): Promise<number[] | null> {
    try {
        const client = await getClient(apiKey);

        const response = await client.models.embedContent({
            model: "gemini-embedding-001",
            contents: query,
            config: {
                outputDimensionality: EMBEDDING_DIMENSIONS.packaging,
                taskType: "RETRIEVAL_QUERY",
            },
        });

        const values = response.embeddings?.[0]?.values;
        if (!values || values.length === 0) {
            logger.warn("queryEmbedding:emptyResponse", { query });
            return null;
        }

        return values;
    } catch (error) {
        logger.warn("queryEmbedding:failed", {
            query,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
