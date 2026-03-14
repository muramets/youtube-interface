// =============================================================================
// saveMemory handler — save cross-conversation memory during Conclude
//
// Conclude-only tool: injected into tool list when isConclude = true.
// Replaces the standalone concludeConversation Cloud Function.
// Reuses idempotency + orphan guard patterns from the original CF.
// =============================================================================

import { db } from "../../../../shared/db.js";
import { FieldValue } from "firebase-admin/firestore";
import type { ToolContext } from "../../types.js";

export async function handleSaveMemory(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const content = args.content as string | undefined;
    const kiRefs = args.kiRefs as string[] | undefined;

    if (!content) {
        return { error: "content is required — provide a memory summary" };
    }

    if (!ctx.conversationId) {
        return { error: "conversationId is required in tool context" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const memoriesPath = `${basePath}/conversationMemories`;
    const convPath = `${basePath}/chatConversations/${ctx.conversationId}`;

    // --- Idempotency guard: check for duplicate memory in last 60s ---

    const recentCutoff = new Date(Date.now() - 60_000);
    const duplicateSnap = await db.collection(memoriesPath)
        .where("conversationId", "==", ctx.conversationId)
        .where("createdAt", ">=", recentCutoff)
        .limit(1)
        .get();

    if (!duplicateSnap.empty) {
        const existingId = duplicateSnap.docs[0].id;
        console.warn(
            `[saveMemory] Duplicate memory for conv=${ctx.conversationId}, existing=${existingId}`
        );
        return {
            content: `Memory already saved for this conversation [id: ${existingId}] (skipped duplicate)`,
            memoryId: existingId,
            skipped: true,
        };
    }

    // --- Orphan guard: verify conversation still exists ---

    const convExists = await db.doc(convPath).get();
    if (!convExists.exists) {
        console.warn(`[saveMemory] Orphan prevented: conv=${ctx.conversationId} deleted`);
        return { error: "Conversation was deleted during memorization." };
    }

    // Get conversation title
    const convData = convExists.data();
    const conversationTitle = convData?.title || "Untitled conversation";

    // --- Save memory document ---

    const now = FieldValue.serverTimestamp();
    const memoryData: Record<string, unknown> = {
        conversationId: ctx.conversationId,
        conversationTitle,
        content,
        createdAt: now,
        updatedAt: now,
    };

    if (kiRefs && kiRefs.length > 0) {
        // Validate that referenced KI documents exist
        const kiCollectionPath = `${basePath}/knowledgeItems`;
        const kiDocRefs = kiRefs.map(id => db.doc(`${kiCollectionPath}/${id}`));
        const kiDocs = await db.getAll(...kiDocRefs);
        const validKiRefs = kiDocs.filter(doc => doc.exists).map(doc => doc.id);

        if (validKiRefs.length < kiRefs.length) {
            console.warn(
                `[saveMemory] ${kiRefs.length - validKiRefs.length} of ${kiRefs.length} kiRefs not found — saving only valid ones`
            );
        }

        if (validKiRefs.length > 0) {
            memoryData.kiRefs = validKiRefs;
        }
    }

    const memoryRef = await db.collection(memoriesPath).add(memoryData);

    console.info(
        `[saveMemory] Persisted memory=${memoryRef.id} conv=${ctx.conversationId} kiRefs=${kiRefs?.length || 0}`
    );

    return {
        content: `Memory saved with ${kiRefs?.length || 0} Knowledge Item references [id: ${memoryRef.id}]`,
        memoryId: memoryRef.id,
    };
}
