// =============================================================================
// editKnowledge handler — LLM updates an existing Knowledge Item
//
// Atomic batch: version snapshot (old content) + main doc update.
// Video ref re-resolution on new content (non-blocking).
// =============================================================================

import { db } from "../../../../shared/db.js";
import { FieldValue } from "firebase-admin/firestore";
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
        console.warn(`[editKnowledge] ── Validation failed ── missing required fields`);
        return { error: "Required fields: kiId, content" };
    }

    if (!ctx.userId || !ctx.channelId) {
        console.warn(`[editKnowledge] ── Validation failed ── missing userId or channelId`);
        return { error: "userId and channelId are required in tool context" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const kiRef = db.doc(`${basePath}/knowledgeItems/${kiId}`);

    // --- Read existing KI ---

    const kiSnap = await kiRef.get();

    if (!kiSnap.exists) {
        console.warn(`[editKnowledge] ── Not found ── kiId=${kiId}`);
        return { error: `Knowledge Item not found: ${kiId}` };
    }

    const kiData = kiSnap.data() as Record<string, unknown>;
    const oldContent = (kiData.content as string) || '';
    const oldTitle = (kiData.title as string) || '';
    const oldSource = (kiData.source as string) || 'chat-tool';
    const oldModel = (kiData.model as string) || '';
    const title = oldTitle;

    // --- Atomic batch: version snapshot + main doc update ---

    const batch = db.batch();

    // 1. Snapshot old content to versions/ subcollection
    const versionRef = db.collection(`${basePath}/knowledgeItems/${kiId}/versions`).doc();
    const versionData = stripUndefined({
        content: oldContent,
        title: oldTitle || undefined,
        createdAt: Date.now(),
        source: oldSource,
        model: oldModel || undefined,
    });
    batch.set(versionRef, versionData);

    // 2. Update main doc with new content
    const source = ctx.isConclude ? 'conclude' : 'chat-tool';
    batch.update(kiRef, {
        content,
        updatedAt: FieldValue.serverTimestamp(),
        lastEditedBy: ctx.model || 'unknown',
        lastEditSource: source,
    });

    await batch.commit();

    console.info(
        `[editKnowledge] ── Updated ── id=${kiId} title="${title.slice(0, 60)}"` +
        ` source=${source} model=${ctx.model || "unknown"} contentLen=${content.length}`,
    );

    // --- Resolve video references from new content (non-blocking) ---

    try {
        await resolveContentVideoRefs(content, basePath, kiRef, 'editKnowledge');
    } catch (err) {
        // Non-critical — KI is updated even if video ref resolution fails
        console.warn(`[editKnowledge] Video ref resolution failed:`, err);
    }

    return {
        content: `Knowledge Item updated: ${title} [id: ${kiId}]`,
        id: kiId,
    };
}
