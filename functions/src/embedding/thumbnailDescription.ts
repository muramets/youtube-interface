// =============================================================================
// Thumbnail Description Generator
//
// Uses Gemini 2.0 Flash Vision to generate a detailed text description
// of a YouTube video thumbnail for similarity search.
// Cost: ~$0.0001 per call.
// =============================================================================

import { logger } from "firebase-functions/v2";
import { getClient } from "../services/gemini/client.js";
import { downloadThumbnail } from "./thumbnailDownload.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VISION_PROMPT =
    "Describe this YouTube video thumbnail in detail for similarity search. " +
    "Focus on: visual composition, colors, text overlays, people/objects, " +
    "emotional tone, style. Be specific and concise. Max 200 words.";

// ---------------------------------------------------------------------------
// Description generation
// ---------------------------------------------------------------------------

/**
 * Generate a text description of a video thumbnail using Gemini Flash Vision.
 *
 * @param videoId - YouTube video ID (used to construct thumbnail URLs)
 * @param apiKey - Gemini API key
 * @returns Description string, or null on error
 */
export async function generateThumbnailDescription(
    videoId: string,
    apiKey: string,
): Promise<string | null> {
    try {
        const downloaded = await downloadThumbnail(videoId);
        if (!downloaded) {
            logger.warn("thumbnailDescription:downloadFailed", { videoId });
            return null;
        }

        const base64 = downloaded.buffer.toString("base64");
        const client = await getClient(apiKey);

        const response = await client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [
                {
                    parts: [
                        { text: VISION_PROMPT },
                        {
                            inlineData: {
                                mimeType: downloaded.mimeType,
                                data: base64,
                            },
                        },
                    ],
                },
            ],
        });

        const text = response.text;
        if (!text) {
            logger.warn("thumbnailDescription:emptyResponse", { videoId });
            return null;
        }

        return text;
    } catch (error) {
        logger.warn("thumbnailDescription:failed", {
            videoId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
