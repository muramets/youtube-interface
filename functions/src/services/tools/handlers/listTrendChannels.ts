// =============================================================================
// listTrendChannels handler — Layer 4: Firestore-only
//
// Returns all trend channels the user is tracking, with cached metadata.
// Zero YouTube API calls — all data comes from Firestore trendChannels docs.
// =============================================================================

import { db } from "../../../shared/db.js";
import type { ToolContext } from "../types.js";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleListTrendChannels(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    void args; // no arguments needed for this handler

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;

    let docs: FirebaseFirestore.QuerySnapshot;
    try {
        docs = await db.collection(`${basePath}/trendChannels`).get();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Failed to read trendChannels collection: ${msg}` };
    }

    if (docs.empty) {
        return {
            channels: [],
            totalChannels: 0,
            totalVideos: 0,
            dataFreshness: [],
        };
    }

    const channels: Record<string, unknown>[] = [];
    const dataFreshness: Record<string, unknown>[] = [];
    let totalVideos = 0;

    for (const doc of docs.docs) {
        const data = doc.data();

        const videoCount = typeof data.videoCount === "number" ? data.videoCount : 0;
        totalVideos += videoCount;

        // Resolve lastUpdated to ISO string
        let lastUpdated: string | null = null;
        if (data.lastUpdated) {
            if (typeof data.lastUpdated === "string") {
                lastUpdated = data.lastUpdated;
            } else if (typeof data.lastUpdated.toDate === "function") {
                lastUpdated = data.lastUpdated.toDate().toISOString();
            } else if (data.lastUpdated instanceof Date) {
                lastUpdated = data.lastUpdated.toISOString();
            }
        }

        const channel: Record<string, unknown> = {
            channelId: doc.id,
            title: data.title,
            ...(data.handle ? { handle: data.handle } : {}),
            avatarUrl: data.avatarUrl,
            videoCount,
            subscriberCount: data.subscriberCount,
            averageViews: typeof data.averageViews === "number"
                ? Math.round(data.averageViews)
                : data.averageViews,
            lastUpdated,
        };

        if (data.performanceDistribution != null) {
            channel.performanceDistribution = data.performanceDistribution;
        }

        channels.push(channel);

        dataFreshness.push({
            channelId: doc.id,
            channelTitle: data.title,
            lastSynced: lastUpdated,
        });
    }

    return {
        channels,
        totalChannels: channels.length,
        totalVideos,
        dataFreshness,
    };
}
