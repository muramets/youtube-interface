// =============================================================================
// saveMemory handler — cross-conversation memory tool
//
// Deterministic doc ID (= conversationId), upsert: get → exists ? update : set.
// Always available in TOOL_DECLARATIONS. LLM can call mid-conversation or
// during memorize/conclude flow.
// =============================================================================

import { db } from "../../../../shared/db.js";
import { FieldValue } from "firebase-admin/firestore";
import type { ToolContext } from "../../types.js";

export async function handleSaveMemory(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const content = args.content as string | undefined;

    if (!content) {
        return { error: "content is required — provide a memory summary" };
    }

    if (!ctx.conversationId) {
        return { error: "conversationId is required in tool context" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const memoriesPath = `${basePath}/conversationMemories`;
    const convPath = `${basePath}/chatConversations/${ctx.conversationId}`;

    // --- Orphan guard: verify conversation still exists ---

    const convSnap = await db.doc(convPath).get();
    if (!convSnap.exists) {
        console.warn(`[saveMemory] Orphan prevented: conv=${ctx.conversationId} deleted`);
        return { error: "Conversation was deleted during memorization." };
    }

    const convData = convSnap.data();
    const conversationTitle = convData?.title || "Untitled conversation";

    // --- Upsert with deterministic doc ID (= conversationId) ---

    const memoryRef = db.doc(`${memoriesPath}/${ctx.conversationId}`);
    const existing = await memoryRef.get();

    if (existing.exists) {
        await memoryRef.update({
            content,
            conversationTitle,
            updatedAt: FieldValue.serverTimestamp(),
        });

        console.info(`[saveMemory] Updated memory conv=${ctx.conversationId}`);

        return {
            content: `Memory updated [id: ${ctx.conversationId}]`,
            memoryId: ctx.conversationId,
            updated: true,
        };
    }

    await memoryRef.set({
        conversationId: ctx.conversationId,
        conversationTitle,
        content,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    console.info(`[saveMemory] Created memory conv=${ctx.conversationId}`);

    return {
        content: `Memory saved [id: ${ctx.conversationId}]`,
        memoryId: ctx.conversationId,
    };
}
