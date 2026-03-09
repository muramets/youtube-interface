// =============================================================================
// Packaging Embedding Generator
//
// Converts video metadata (title, tags, description) into a 768d embedding
// vector using Gemini Embedding API (gemini-embedding-001 with MRL).
// Cost: ~$0.00004 per call.
// =============================================================================

import { logger } from "firebase-functions/v2";
import { getClient } from "../services/gemini/client.js";
import { EMBEDDING_DIMENSIONS, MAX_DESCRIPTION_LENGTH } from "./types.js";

/**
 * Generate a packaging embedding from video metadata.
 *
 * @returns 768d embedding vector, or null on error
 */
export async function generatePackagingEmbedding(
    title: string,
    tags: string[],
    description: string,
    apiKey: string,
): Promise<number[] | null> {
    try {
        // Truncate long descriptions before sending to API
        const truncatedDesc = description.length > MAX_DESCRIPTION_LENGTH
            ? description.slice(0, MAX_DESCRIPTION_LENGTH)
            : description;

        const inputText = [
            `Title: ${title}`,
            `Tags: ${tags.join(", ")}`,
            `Description: ${truncatedDesc}`,
        ].join("\n");

        const client = await getClient(apiKey);

        const response = await client.models.embedContent({
            model: "gemini-embedding-001",
            contents: inputText,
            config: {
                outputDimensionality: EMBEDDING_DIMENSIONS.packaging,
            },
        });

        const values = response.embeddings?.[0]?.values;
        if (!values || values.length === 0) {
            logger.warn("packagingEmbedding:emptyResponse", { title });
            return null;
        }

        return values;
    } catch (error) {
        logger.warn("packagingEmbedding:failed", {
            title,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
