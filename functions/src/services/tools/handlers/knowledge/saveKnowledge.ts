// =============================================================================
// saveKnowledge handler — LLM creates a Knowledge Item
//
// Atomic batch: KI doc + discovery flags on video/channel doc.
// Registry update (outside batch): atomic map merge.
// Auto-supersede: marks old KI with supersededBy.
// Idempotency: skips if same conversationId + category + videoId already exists.
// =============================================================================

import { db } from "../../../../shared/db.js";
import { FieldValue } from "firebase-admin/firestore";
import type { ToolContext } from "../../types.js";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface SaveKnowledgeArgs {
    category: string;
    title: string;
    content: string;
    summary: string;
    scope?: "video" | "channel";
    videoId?: string;
    videoRefs?: string[];
    toolsUsed?: string[];
}

/**
 * Strip undefined values from an object — Firestore throws on undefined.
 */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}

export async function handleSaveKnowledge(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const {
        category,
        title,
        content,
        summary,
        videoId,
        videoRefs,
        toolsUsed,
    } = args as unknown as SaveKnowledgeArgs;

    // Infer scope from videoId presence
    const scope = videoId ? "video" : "channel";

    // --- Validation ---

    if (!category || !title || !content || !summary) {
        return { error: "Required fields: category, title, content, summary" };
    }

    if (!SLUG_PATTERN.test(category)) {
        return {
            error: `Invalid category slug "${category}". Must be lowercase kebab-case (e.g. "traffic-analysis"). ` +
                `Pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/`,
        };
    }

    if (!ctx.conversationId) {
        return { error: "conversationId is required in tool context" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const kiCollectionPath = `${basePath}/knowledgeItems`;

    // --- Idempotency guard ---

    const idempotencyQuery = db.collection(kiCollectionPath)
        .where("conversationId", "==", ctx.conversationId)
        .where("category", "==", category);

    // For video-level KI, also filter by videoId
    const idempotencySnapshot = videoId
        ? await idempotencyQuery.where("videoId", "==", videoId).get()
        : await idempotencyQuery.where("scope", "==", "channel").get();

    if (!idempotencySnapshot.empty) {
        const existingId = idempotencySnapshot.docs[0].id;
        return {
            content: `Knowledge Item already exists for this conversation + category: ${title} [id: ${existingId}] (skipped duplicate)`,
            id: existingId,
            skipped: true,
        };
    }

    // --- Create KI document ---

    const kiRef = db.collection(kiCollectionPath).doc();
    const kiId = kiRef.id;

    const kiData = stripUndefined({
        category,
        title,
        content,
        summary,
        conversationId: ctx.conversationId,
        model: ctx.model || "unknown",
        toolsUsed: toolsUsed || [],
        scope,
        videoId: videoId || undefined,
        videoRefs: videoRefs || undefined,
        createdAt: FieldValue.serverTimestamp(),
        source: ctx.isConclude ? "conclude" : "chat-tool",
    });

    // --- Atomic batch: KI doc + discovery flags ---

    const batch = db.batch();
    batch.set(kiRef, kiData);

    // Update discovery flags on the entity (video or channel) doc
    const entityRef = scope === "video"
        ? db.doc(`${basePath}/videos/${videoId}`)
        : db.doc(`${basePath}`); // Channel doc is at basePath itself... but channels are at users/{uid}/channels/{chId}

    batch.update(entityRef, {
        knowledgeItemCount: FieldValue.increment(1),
        knowledgeCategories: FieldValue.arrayUnion(category),
        lastAnalyzedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // --- Registry update (outside batch, atomic map merge) ---

    try {
        const registryRef = db.doc(`${basePath}/knowledgeCategories/registry`);
        await registryRef.set({
            [`categories.${category}`]: {
                label: args.label as string || category.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
                level: scope === "video" ? "video" : "channel",
                description: args.description as string || `${title} analysis`,
            },
        }, { merge: true });
    } catch (err) {
        // Non-critical — KI is saved even if registry update fails
        console.warn(`[saveKnowledge] Registry update failed for category "${category}":`, err);
    }

    // --- Auto-supersede old KI ---

    try {
        const supersedeQuery = db.collection(kiCollectionPath)
            .where("category", "==", category)
            .where("supersededBy", "==", null);

        const supersedeSnapshot = videoId
            ? await supersedeQuery.where("videoId", "==", videoId).get()
            : await supersedeQuery.where("scope", "==", "channel").get();

        const supersedeBatch = db.batch();
        let supersededCount = 0;

        for (const doc of supersedeSnapshot.docs) {
            if (doc.id !== kiId) {
                supersedeBatch.update(doc.ref, { supersededBy: kiId });
                supersededCount++;
            }
        }

        if (supersededCount > 0) {
            await supersedeBatch.commit();
        }
    } catch (err) {
        // Non-critical — KI is saved even if supersede fails
        console.warn(`[saveKnowledge] Auto-supersede failed:`, err);
    }

    return {
        content: `Knowledge Item saved: ${title} [id: ${kiId}]`,
        id: kiId,
    };
}
