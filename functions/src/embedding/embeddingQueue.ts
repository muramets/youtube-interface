// =============================================================================
// Embedding Queue — dirty queue utilities for incremental embedding sync
//
// isContentChanged: pure function — detects content-relevant field changes
// enqueueVideoForEmbedding: adds queue entry to an existing WriteBatch
// =============================================================================

import { logger } from "firebase-functions/v2";
import { db } from "../shared/db.js";
import {
    EMBEDDING_QUEUE_PATH,
    type ChannelPath,
    type EmbeddingQueueEntry,
} from "./types.js";

const QUEUE_SIZE_CANARY = 500;

// ---------------------------------------------------------------------------
// Dirty detection — pure function, no I/O
// ---------------------------------------------------------------------------

/** Content fields that affect embeddings (viewCount/likeCount/commentCount do NOT) */
interface ContentFields {
    title: string;
    tags: string[];
    description: string;
    thumbnail: string;
}

/**
 * Determines whether content-relevant fields changed between previous and current video data.
 * Returns `true` if any of the 4 content fields differ (or if this is a new video).
 *
 * @param previous - Previous Firestore doc data (undefined for new videos)
 * @param current - Current content fields from YouTube API
 */
export function isContentChanged(
    previous: Record<string, unknown> | undefined,
    current: ContentFields,
): boolean {
    if (!previous) return true;

    if ((previous.title ?? "") !== current.title) return true;
    if ((previous.description ?? "") !== current.description) return true;
    if ((previous.thumbnail ?? "") !== current.thumbnail) return true;
    if (JSON.stringify(previous.tags ?? []) !== JSON.stringify(current.tags)) return true;

    return false;
}

// ---------------------------------------------------------------------------
// Queue writer — adds to caller's WriteBatch for atomicity
// ---------------------------------------------------------------------------

/**
 * Adds a queue entry to the provided WriteBatch.
 * Does NOT commit — the caller commits their batch (atomicity with video writes).
 * Uses `{ merge: true }` for idempotency (re-enqueue = overwrite, not duplicate).
 */
export function enqueueVideoForEmbedding(
    batch: FirebaseFirestore.WriteBatch,
    entry: EmbeddingQueueEntry,
): void {
    const ref = db.doc(`${EMBEDDING_QUEUE_PATH}/${entry.videoId}`);
    batch.set(ref, entry, { merge: true });
}

// ---------------------------------------------------------------------------
// Queue reader — reads all pending entries for embedding sync
// ---------------------------------------------------------------------------

/**
 * Reads all entries from the embedding dirty queue.
 * Deduplicates channelPaths by youtubeChannelId (first path wins).
 * Returns videos sorted by videoId for deterministic processing.
 */
export async function readEmbeddingQueue(): Promise<{
    videos: Array<{ videoId: string; youtubeChannelId: string }>;
    channelPaths: Record<string, ChannelPath>;
    queueSize: number;
}> {
    const snapshot = await db.collection(EMBEDDING_QUEUE_PATH).get();

    const videos: Array<{ videoId: string; youtubeChannelId: string }> = [];
    const channelPaths: Record<string, ChannelPath> = {};

    for (const doc of snapshot.docs) {
        const entry = doc.data() as EmbeddingQueueEntry;
        videos.push({ videoId: doc.id, youtubeChannelId: entry.youtubeChannelId });

        // First path wins (dedup for same YouTube channel tracked by multiple users)
        if (!channelPaths[entry.youtubeChannelId]) {
            channelPaths[entry.youtubeChannelId] = {
                userId: entry.userId,
                channelId: entry.channelId,
                trendChannelId: entry.trendChannelId,
                channelTitle: entry.channelTitle,
            };
        }
    }

    videos.sort((a, b) => a.videoId.localeCompare(b.videoId));

    if (snapshot.size > QUEUE_SIZE_CANARY) {
        logger.warn("readEmbeddingQueue:largeQueue", {
            queueSize: snapshot.size,
            message: "Queue growing — check for persistent embedding failures or stalled sync",
        });
    }

    return { videos, channelPaths, queueSize: snapshot.size };
}
