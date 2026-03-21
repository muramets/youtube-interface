// =============================================================================
// editKnowledge handler — LLM updates an existing Knowledge Item
//
// Atomic batch: version snapshot (old content) + main doc update.
// Video ref re-resolution on new content (non-blocking).
// =============================================================================

import { db } from "../../../../shared/db.js";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ToolContext } from "../../types.js";
import { resolveContentVideoRefs } from "../../utils/resolveContentVideoRefs.js";

interface EditKnowledgeArgs {
    kiId: string;
    content: string;
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

export async function handleEditKnowledge(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const { kiId, content } = args as unknown as EditKnowledgeArgs;

    // --- Validation ---

    if (!kiId || !content) {
        logger.warn("[editKnowledge] Validation failed: missing required fields");
        return { error: "Required fields: kiId, content" };
    }

    if (!ctx.userId || !ctx.channelId) {
        logger.warn("[editKnowledge] Validation failed: missing userId or channelId");
        return { error: "userId and channelId are required in tool context" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const kiRef = db.doc(`${basePath}/knowledgeItems/${kiId}`);

    // --- Read existing KI ---

    const kiSnap = await kiRef.get();

    if (!kiSnap.exists) {
        logger.warn("[editKnowledge] Not found", { kiId });
        return { error: `Knowledge Item not found: ${kiId}` };
    }

    const kiData = kiSnap.data() as Record<string, unknown>;
    const oldContent = (kiData.content as string) || '';
    const oldTitle = (kiData.title as string) || '';
    const oldOriginSource = (kiData.source as string) || 'chat-tool';
    const oldOriginModel = (kiData.model as string) || '';
    const oldEditSource = (kiData.lastEditSource as string) || undefined;
    const oldEditModel = (kiData.lastEditedBy as string) || undefined;
    const title = oldTitle;

    // --- Content-changed check: skip version snapshot if content is identical ---

    if (content.trim() === oldContent.trim()) {
        logger.info("[editKnowledge] Content unchanged, skipping version", { kiId });
        return {
            content: `Knowledge Item unchanged: ${title} [id: ${kiId}]`,
            id: kiId,
            title,
            category: (kiData.category as string) || undefined,
            contentLength: content.length,
        };
    }

    // --- Atomic batch: version snapshot + main doc update ---

    const batch = db.batch();

    // 1. Snapshot old content to versions/ subcollection
    const versionRef = db.collection(`${basePath}/knowledgeItems/${kiId}/versions`).doc();
    const updatedAtTs = kiData.updatedAt as { toMillis?: () => number } | undefined;
    const createdAtTs = kiData.createdAt as { toMillis?: () => number } | undefined;
    const contentTimeMs = (updatedAtTs ?? createdAtTs)?.toMillis?.() ?? Date.now();
    const versionData = stripUndefined({
        content: oldContent,
        title: oldTitle || undefined,
        createdAt: contentTimeMs,
        source: oldOriginSource,
        model: oldOriginModel || undefined,
        lastEditSource: oldEditSource,
        lastEditedBy: oldEditModel,
    });
    batch.set(versionRef, versionData);

    // 2. Update main doc with new content
    const source = ctx.isConclude ? 'conclude' : 'chat-edit';
    batch.update(kiRef, {
        content,
        updatedAt: FieldValue.serverTimestamp(),
        lastEditedBy: ctx.model || 'unknown',
        lastEditSource: source,
    });

    await batch.commit();

    logger.info("[editKnowledge] Updated", {
        kiId, title: title.slice(0, 60), source, model: ctx.model || "unknown", contentLen: content.length,
    });

    // --- Resolve video references from new content (non-blocking) ---

    try {
        await resolveContentVideoRefs(content, basePath, kiRef, 'editKnowledge');
    } catch (err) {
        // Non-critical — KI is updated even if video ref resolution fails
        logger.warn("[editKnowledge] Video ref resolution failed", { kiId, error: String(err) });
    }

    return {
        content: `Knowledge Item updated: ${title} [id: ${kiId}]`,
        id: kiId,
        title,
        category: (kiData.category as string) || undefined,
        contentLength: content.length,
    };
}
