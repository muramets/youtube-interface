// =============================================================================
// getHiddenVideoIds — reads hidden video IDs from Firestore
//
// Hidden videos are stored at: users/{userId}/channels/{channelId}/hiddenVideos/
// Each document ID = YouTube video ID.
// Returns a flat Set<string> of video IDs (globally unique, no channel filtering needed).
// =============================================================================

import { db } from "../../../shared/db.js";

/**
 * Read all hidden video IDs for the user's channel.
 *
 * @param basePath  Firestore base path: `users/{userId}/channels/{channelId}`
 * @returns Set of hidden YouTube video IDs
 */
export async function getHiddenVideoIds(basePath: string): Promise<Set<string>> {
    const snap = await db.collection(`${basePath}/hiddenVideos`).get();
    const ids = new Set<string>();
    for (const doc of snap.docs) {
        ids.add(doc.id);
    }
    return ids;
}
