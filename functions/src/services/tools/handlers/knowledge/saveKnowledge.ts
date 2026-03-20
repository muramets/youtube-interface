// =============================================================================
// saveKnowledge handler — LLM creates a Knowledge Item
//
// Atomic batch: KI doc + discovery flags on video/channel doc.
// Registry update (outside batch): atomic map merge.
// No auto-delete: each KI is a point-in-time snapshot. Idempotency guard prevents duplicates.
// Idempotency: skips if same conversationId + category + videoId already exists.
// =============================================================================

import { db } from "../../../../shared/db.js";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ToolContext } from "../../types.js";
import { SLUG_PATTERN } from "../../../../shared/knowledge.js";
import { resolveVideosByIds } from "../../utils/resolveVideos.js";
import { resolveContentVideoRefs } from "../../utils/resolveContentVideoRefs.js";

interface SaveKnowledgeArgs {
    category: string;
    title: string;
    content: string;
    summary: string;
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
        logger.warn(`[saveKnowledge] ── Validation failed ── missing required fields conv=${ctx.conversationId}`);
        return { error: "Required fields: category, title, content, summary" };
    }

    if (!SLUG_PATTERN.test(category)) {
        logger.warn(`[saveKnowledge] ── Validation failed ── invalid slug "${category}" conv=${ctx.conversationId}`);
        return {
            error: `Invalid category slug "${category}". Must be lowercase kebab-case (e.g. "traffic-analysis"). ` +
                `Pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/`,
        };
    }

    if (!ctx.conversationId) {
        logger.warn(`[saveKnowledge] ── Validation failed ── no conversationId`);
        return { error: "conversationId is required in tool context" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const kiCollectionPath = `${basePath}/knowledgeItems`;

    // --- Resolve video doc ID FIRST (needed for both idempotency and storage) ---
    // LLM passes YouTube ID (A4SkhlJ2mK8), but Firestore doc may be custom-*.
    // Normalize to doc ID so frontend queries by doc ID match.

    let resolvedDocId = videoId;
    let effectiveScope = scope;

    if (scope === "video" && videoId) {
        const { resolved } = await resolveVideosByIds(basePath, [videoId], { skipExternal: true });
        const match = resolved.get(videoId);
        if (match) {
            resolvedDocId = match.docId;
        } else {
            logger.warn(`[saveKnowledge] ── Video not found ── videoId=${videoId}, saving as channel-level`);
            effectiveScope = "channel";
            resolvedDocId = undefined;
        }
    }

    // --- Idempotency guard (uses normalized doc ID) ---

    const idempotencyQuery = db.collection(kiCollectionPath)
        .where("conversationId", "==", ctx.conversationId)
        .where("category", "==", category);

    const idempotencySnapshot = effectiveScope === "video" && resolvedDocId
        ? await idempotencyQuery.where("videoId", "==", resolvedDocId).get()
        : await idempotencyQuery.where("scope", "==", "channel").get();

    if (!idempotencySnapshot.empty) {
        const existingId = idempotencySnapshot.docs[0].id;
        logger.info(`[saveKnowledge] ── Duplicate ── conv=${ctx.conversationId} category=${category} existing=${existingId}`);
        return {
            content: `Knowledge Item already exists for this conversation + category: ${title} [id: ${existingId}] (skipped duplicate)`,
            id: existingId,
            skipped: true,
        };
    }

    // --- Create KI document (with normalized doc ID) ---

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
        scope: effectiveScope,
        videoId: (effectiveScope === "video" && resolvedDocId) ? resolvedDocId : undefined,
        videoRefs: videoRefs || undefined,
        createdAt: FieldValue.serverTimestamp(),
        source: ctx.isConclude ? "conclude" : "chat-tool",
    });

    // --- Atomic batch: KI doc + discovery flags ---

    const batch = db.batch();
    batch.set(kiRef, kiData);

    // Update discovery flags on the entity (video or channel) doc
    const entityRef = effectiveScope === "video"
        ? db.doc(`${basePath}/videos/${resolvedDocId}`)
        : db.doc(`${basePath}`);

    batch.update(entityRef, {
        knowledgeItemCount: FieldValue.increment(1),
        knowledgeCategories: FieldValue.arrayUnion(category),
        lastAnalyzedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    logger.info(
        `[saveKnowledge] ── Persisted ── id=${kiId} scope=${effectiveScope} category=${category}` +
        ` title="${title.slice(0, 60)}" conv=${ctx.conversationId} model=${ctx.model || "unknown"}` +
        ` source=${ctx.isConclude ? "conclude" : "chat-tool"} contentLen=${content.length}` +
        (videoId ? ` videoId=${videoId}${resolvedDocId !== videoId ? ` resolvedDoc=${resolvedDocId}` : ''}` : '')
    );

    // --- Resolve video references from content (code-driven, non-blocking) ---

    try {
        await resolveContentVideoRefs(content, basePath, kiRef, 'saveKnowledge');
    } catch (err) {
        // Non-critical — KI is saved even if video ref resolution fails
        logger.warn(`[saveKnowledge] Video ref resolution failed:`, err);
    }

    // --- Registry update (outside batch, atomic map merge) ---

    try {
        const registryRef = db.doc(`${basePath}/knowledgeCategories/registry`);
        await registryRef.set({
            [`categories.${category}`]: {
                label: category.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
                level: effectiveScope === "video" ? "video" : "channel",
                description: `${title} analysis`,
            },
        }, { merge: true });
    } catch (err) {
        // Non-critical — KI is saved even if registry update fails
        logger.warn(`[saveKnowledge] Registry update failed for category "${category}":`, err);
    }

    // No auto-delete: each KI is a point-in-time snapshot. Multiple KI with the same
    // category+videoId are intentional (e.g. monthly traffic analyses). Idempotency guard
    // (same conversationId + category + videoId) prevents duplicates within one conversation.

    return {
        content: `Knowledge Item saved: ${title} [id: ${kiId}]`,
        id: kiId,
    };
}
