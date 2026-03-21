// =============================================================================
// Process One Video — shared per-video embedding logic
//
// Downloads thumbnail once, generates packaging + description + visual
// embeddings, writes to globalVideoEmbeddings. Handles thumbnailUnavailable
// sentinel for deleted/private videos.
//
// Used by both scheduled sync batches and backfill batches.
// Budget checking is NOT done here — the orchestrator handles it.
// =============================================================================

import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../shared/db.js";
import { downloadThumbnail } from "./thumbnailDownload.js";
import { generatePackagingEmbedding } from "./packagingEmbedding.js";
import { generateThumbnailDescription } from "./thumbnailDescription.js";
import { generateVisualEmbedding } from "./visualEmbedding.js";
import {
    CURRENT_PACKAGING_MODEL_VERSION,
    CURRENT_VISUAL_MODEL_VERSION,
    type EmbeddingDoc,
} from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoInput {
    videoId: string;
    youtubeChannelId: string;
    title: string;
    tags: string[];
    description: string;
    viewCount: number;
    publishedAt: string;
    thumbnailUrl: string;
    channelTitle: string;
}

export interface ProcessResult {
    status: "generated" | "alreadyCurrent" | "failed";
    hasPackaging: boolean;
    hasVisual: boolean;
    thumbnailUnavailable: boolean;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export async function processOneVideo(
    input: VideoInput,
    apiKey: string,
): Promise<ProcessResult> {
    const {
        videoId, youtubeChannelId, title, tags, description,
        viewCount, publishedAt, thumbnailUrl, channelTitle,
    } = input;

    try {
        // --- Check existing embedding doc ---
        const embeddingRef = db.doc(`globalVideoEmbeddings/${videoId}`);
        const embeddingSnap = await embeddingRef.get();
        const existingDoc = embeddingSnap.exists
            ? (embeddingSnap.data() as EmbeddingDoc)
            : null;

        // --- Determine what needs generation ---
        const needsPackaging = !existingDoc
            || (existingDoc.packagingEmbeddingVersion ?? 0) < CURRENT_PACKAGING_MODEL_VERSION
            || existingDoc.title !== title
            || existingDoc.description !== description
            || JSON.stringify(existingDoc.tags) !== JSON.stringify(tags);

        const needsThumbnailDesc = !existingDoc
            || existingDoc.thumbnailUrl !== thumbnailUrl
            || (existingDoc.thumbnailDescription == null && !existingDoc.thumbnailUnavailable);

        const needsVisual = !existingDoc
            || existingDoc.thumbnailUrl !== thumbnailUrl
            || ((existingDoc.visualEmbeddingVersion ?? 0) < CURRENT_VISUAL_MODEL_VERSION
                && !existingDoc.thumbnailUnavailable);

        if (!needsPackaging && !needsThumbnailDesc && !needsVisual) {
            // Update denormalized fields if changed
            if (existingDoc && (existingDoc.viewCount !== viewCount || existingDoc.title !== title)) {
                await embeddingRef.set(
                    { viewCount, title, updatedAt: Date.now() },
                    { merge: true },
                );
            }
            return {
                status: "alreadyCurrent",
                hasPackaging: !!existingDoc?.packagingEmbedding,
                hasVisual: !!existingDoc?.visualEmbedding,
                thumbnailUnavailable: !!existingDoc?.thumbnailUnavailable,
            };
        }

        // --- Download thumbnail ONCE (if needed for description or visual) ---
        const needsThumbnail = needsThumbnailDesc || needsVisual;
        const thumbnail = needsThumbnail ? await downloadThumbnail(videoId) : null;
        const isThumbnailUnavailable = needsThumbnail && !thumbnail;

        if (isThumbnailUnavailable) {
            logger.warn("processOneVideo:thumbnailUnavailable", { videoId });
        }

        // --- Generate in parallel ---
        const [packagingEmbedding, thumbnailDesc, visualEmb] = await Promise.all([
            needsPackaging
                ? generatePackagingEmbedding(title, tags, description, apiKey)
                : Promise.resolve(existingDoc?.packagingEmbedding ?? null),
            (needsThumbnailDesc && thumbnail)
                ? generateThumbnailDescription(videoId, thumbnail, apiKey)
                : Promise.resolve(existingDoc?.thumbnailDescription ?? null),
            (needsVisual && thumbnail)
                ? generateVisualEmbedding(videoId, thumbnail)
                : Promise.resolve(existingDoc?.visualEmbedding ?? null),
        ]);

        // --- Build doc update ---
        const docData: Partial<EmbeddingDoc> = {
            videoId,
            youtubeChannelId,
            channelTitle,
            title,
            tags,
            description,
            viewCount,
            publishedAt,
            thumbnailUrl,
            updatedAt: Date.now(),
            failCount: 0,
        };

        if (needsPackaging && packagingEmbedding) {
            // FieldValue.vector() is a Firestore write sentinel, not a real number[].
            // Cast satisfies EmbeddingDoc type. On READ, lookupVideo() normalizes
            // the resulting VectorValue back to number[] via vectorToArray().
            docData.packagingEmbedding = FieldValue.vector(packagingEmbedding) as unknown as number[];
            docData.packagingEmbeddingVersion = CURRENT_PACKAGING_MODEL_VERSION;
        }

        if (needsThumbnailDesc && thumbnail) {
            docData.thumbnailDescription = thumbnailDesc;
        }

        if (needsVisual && thumbnail && visualEmb) {
            // Same write sentinel pattern — see packagingEmbedding comment above.
            docData.visualEmbedding = FieldValue.vector(visualEmb) as unknown as number[];
            docData.visualEmbeddingVersion = CURRENT_VISUAL_MODEL_VERSION;
        }

        if (isThumbnailUnavailable) {
            docData.thumbnailUnavailable = true;
        }

        await embeddingRef.set(docData, { merge: true });

        return {
            status: "generated",
            hasPackaging: !!(packagingEmbedding || existingDoc?.packagingEmbedding),
            hasVisual: !!(visualEmb || existingDoc?.visualEmbedding),
            thumbnailUnavailable: isThumbnailUnavailable,
        };
    } catch (error) {
        // --- Increment failCount ---
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
                logger.warn("processOneVideo:persistentFailure", {
                    videoId,
                    failCount: newFailCount,
                });
            }
        } catch (failCountErr) {
            logger.warn("processOneVideo:failCountUpdateFailed", {
                videoId,
                error: failCountErr instanceof Error ? failCountErr.message : String(failCountErr),
            });
        }

        logger.warn("processOneVideo:failed", {
            videoId,
            error: error instanceof Error ? error.message : String(error),
        });

        return {
            status: "failed",
            hasPackaging: false,
            hasVisual: false,
            thumbnailUnavailable: false,
        };
    }
}
