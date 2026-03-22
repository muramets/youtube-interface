// =============================================================================
// getKnowledge handler — retrieve full content of Knowledge Items
//
// Heavy operation (~3-5K tokens per KI). LLM should use listKnowledge first
// to decide which items to fetch.
// =============================================================================

import { db } from "../../../../shared/db.js";
import { logger } from "firebase-functions/v2";
import type { ToolContext } from "../../types.js";

export async function handleGetKnowledge(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const ids = args.ids as string[] | undefined;
    const videoId = args.videoId as string | undefined;
    const categories = args.categories as string[] | undefined;

    if (!ids && !videoId && !categories) {
        return { error: "At least one filter is required: ids, videoId, or categories" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const collectionPath = `${basePath}/knowledgeItems`;

    let docs: FirebaseFirestore.DocumentSnapshot[] = [];

    if (ids && ids.length > 0) {
        // Batch read by IDs
        const refs = ids.map(id => db.doc(`${collectionPath}/${id}`));
        docs = await db.getAll(...refs);
    } else {
        // Query by filters
        let query: FirebaseFirestore.Query = db.collection(collectionPath);

        if (videoId) {
            query = query.where("videoId", "==", videoId);
        }
        if (categories && categories.length > 0) {
            query = query.where("category", "in", categories);
        }

        query = query.orderBy("createdAt", "desc").limit(20);
        const snapshot = await query.get();
        docs = snapshot.docs;
    }

    const items = docs
        .filter(doc => doc.exists)
        .map(doc => {
            const data = doc.data()!;
            return {
                id: doc.id,
                title: data.title,
                content: data.content,
                summary: data.summary,
                category: data.category,
                scope: data.scope,
                videoId: data.videoId || undefined,
                videoRefs: data.videoRefs || undefined,
                model: data.model,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
                toolsUsed: data.toolsUsed || [],
                source: data.source,
            };
        });

    logger.info("[getKnowledge] Fetched", {
        count: items.length,
        ...(ids && { ids }),
        ...(videoId && { videoId }),
        ...(categories && { categories }),
    });

    if (items.length === 0) {
        return {
            content: "No Knowledge Items found matching the criteria.",
            count: 0,
            items: [],
        };
    }

    return {
        content: JSON.stringify(items, null, 2),
        count: items.length,
        items: items.map(item => ({
            id: item.id,
            title: item.title,
            category: item.category,
            videoId: item.videoId,
            scope: item.scope,
        })),
    };
}
