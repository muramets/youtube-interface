// =============================================================================
// editMemory handler — LLM patches an existing cross-conversation memory
//
// Accepts operations (replace, insert_after, insert_before) via applyOperations.
// Any memory is addressable by its doc ID (exposed as [mem:id] in system prompt).
// Protected memories cannot be edited. No versioning (MVP).
// =============================================================================

import { db } from "../../../../shared/db.js";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ToolContext } from "../../types.js";
import { applyOperations, type EditOperation } from "../../utils/applyOperations.js";

const CONTENT_PREVIEW_LENGTH = 500;

interface EditMemoryArgs {
    memoryId: string;
    operations: EditOperation[];
}

export async function handleEditMemory(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const { memoryId, operations } = args as unknown as EditMemoryArgs;

    // --- Validation ---

    if (!memoryId) {
        logger.warn("[editMemory] Validation failed: missing memoryId");
        return { error: "Required field: memoryId" };
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
        logger.warn("[editMemory] Validation failed: missing or empty operations");
        return { error: "Required field: operations (non-empty array)" };
    }

    if (!ctx.userId || !ctx.channelId) {
        logger.warn("[editMemory] Validation failed: missing userId or channelId");
        return { error: "userId and channelId are required in tool context" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const memoryRef = db.doc(`${basePath}/conversationMemories/${memoryId}`);

    // --- Read existing memory ---

    const memorySnap = await memoryRef.get();

    if (!memorySnap.exists) {
        logger.warn("[editMemory] Not found", { memoryId });
        return { error: `Memory not found: ${memoryId}. Use saveMemory to create a new one.` };
    }

    const memoryData = memorySnap.data() as Record<string, unknown>;

    // --- Protected guard ---

    if (memoryData.protected === true) {
        logger.warn("[editMemory] Rejected: memory is protected", { memoryId });
        return { error: `Memory "${memoryData.conversationTitle}" is protected. Unprotect it in Settings → AI Memory before editing.` };
    }

    const oldContent = (memoryData.content as string) || "";
    const memoryTitle = (memoryData.conversationTitle as string) || "Untitled";

    // --- Apply operations ---

    const result = applyOperations(oldContent, operations);

    if (!result.success) {
        logger.warn("[editMemory] Operations failed", {
            memoryId, operationIndex: result.operationIndex, error: result.error,
        });
        return { error: result.error };
    }

    // --- Check if content actually changed ---

    if (result.content.trim() === oldContent.trim()) {
        logger.info("[editMemory] Nothing changed, skipping update", { memoryId });
        return {
            content: `Memory unchanged: "${memoryTitle}" [mem:${memoryId}]`,
            memoryId,
            memoryTitle,
            contentLength: oldContent.length,
        };
    }

    // --- Write ---

    await memoryRef.update({
        content: result.content,
        updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("[editMemory] Updated", {
        memoryId,
        title: memoryTitle.slice(0, 60),
        model: ctx.model || "unknown",
        contentLen: result.content.length,
        charsAdded: result.charsAdded,
        charsRemoved: result.charsRemoved,
    });

    return {
        content: `Memory updated: "${memoryTitle}" [mem:${memoryId}]`,
        memoryId,
        memoryTitle,
        contentLength: result.content.length,
        charsAdded: result.charsAdded,
        charsRemoved: result.charsRemoved,
        contentPreview: result.content.slice(0, CONTENT_PREVIEW_LENGTH),
    };
}
