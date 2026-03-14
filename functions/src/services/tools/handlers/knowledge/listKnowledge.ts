// =============================================================================
// listKnowledge handler — lightweight listing of Knowledge Items
//
// Returns summary + metadata, NOT full content (~500 tokens per response).
// Excludes superseded KI by default.
// =============================================================================

import { db } from "../../../../shared/db.js";
import type { ToolContext } from "../../types.js";

export async function handleListKnowledge(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const videoId = args.videoId as string | undefined;
    const scope = args.scope as string | undefined;
    const category = args.category as string | undefined;

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    let query: FirebaseFirestore.Query = db.collection(`${basePath}/knowledgeItems`);

    // Apply filters
    if (videoId) {
        query = query.where("videoId", "==", videoId);
    }
    if (scope) {
        query = query.where("scope", "==", scope);
    }
    if (category) {
        query = query.where("category", "==", category);
    }

    // Order by newest first, cap at 50 results
    query = query.orderBy("createdAt", "desc").limit(50);

    const snapshot = await query.get();

    // Filter out superseded KI in-memory (Firestore doesn't support != null natively in compound queries)
    const items = snapshot.docs
        .filter(doc => !doc.data().supersededBy)
        .map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title,
                summary: data.summary,
                category: data.category,
                scope: data.scope,
                videoId: data.videoId || undefined,
                model: data.model,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                toolsUsed: data.toolsUsed || [],
                source: data.source,
            };
        });

    console.info(
        `[listKnowledge] ── Query ── ${items.length} active of ${snapshot.size} total` +
        `${videoId ? ` videoId=${videoId}` : ""}${scope ? ` scope=${scope}` : ""}${category ? ` category=${category}` : ""}`
    );

    if (items.length === 0) {
        return {
            content: videoId
                ? `No Knowledge Items found for video ${videoId}.`
                : scope
                    ? `No ${scope}-level Knowledge Items found.`
                    : "No Knowledge Items found.",
            items: [],
        };
    }

    return {
        content: JSON.stringify(items, null, 2),
        count: items.length,
    };
}
