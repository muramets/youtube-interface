// =============================================================================
// Embedding Sync — channel discovery for daily embedding generation
//
// Discovery: collection group query on trendChannels → unique YouTube channels.
// Used by scheduledEmbeddingSync (launcher) and backfillEmbeddings.
// =============================================================================

import { db } from "../shared/db.js";

// ---------------------------------------------------------------------------
// Discovery — find unique YouTube channels across all users
// ---------------------------------------------------------------------------

export interface ChannelPath {
    userId: string;
    channelId: string;
    trendChannelId: string;
    channelTitle: string;
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
        const data = doc.data();
        channels.set(youtubeChannelId, {
            userId: pathParts[1],
            channelId: pathParts[3],
            trendChannelId: pathParts[5],
            channelTitle: (data?.title as string) || youtubeChannelId,
        });
    }

    return channels;
}
