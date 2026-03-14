/**
 * triggers/onKnowledgeItemDeleted.ts — Decrement discovery flags when a KI is deleted.
 *
 * Mirrors the increment logic in saveKnowledge handler:
 * - knowledgeItemCount: FieldValue.increment(-1)
 * - knowledgeCategories: arrayRemove if no other KI uses this category
 *
 * Trigger-based (not client-side) ensures consistency regardless of deletion source
 * (frontend UI, auto-supersede, admin tools).
 */
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../shared/db.js";

export const onKnowledgeItemDeleted = onDocumentDeleted(
    "users/{userId}/channels/{channelId}/knowledgeItems/{itemId}",
    async (event) => {
        const { userId, channelId } = event.params;
        const deletedData = event.data?.data();

        if (!deletedData) {
            console.warn("[onKnowledgeItemDeleted] No data on deleted document, skipping.");
            return;
        }

        const { scope, videoId, category } = deletedData;
        const basePath = `users/${userId}/channels/${channelId}`;

        // Determine which entity doc to update (video or channel)
        const entityRef = scope === "video" && videoId
            ? db.doc(`${basePath}/videos/${videoId}`)
            : db.doc(basePath);

        // Check if any other KI still uses this category
        const remainingSnap = await db
            .collection(`${basePath}/knowledgeItems`)
            .where("category", "==", category)
            .limit(1)
            .get();

        const updates: Record<string, unknown> = {
            knowledgeItemCount: FieldValue.increment(-1),
        };

        if (remainingSnap.empty) {
            updates.knowledgeCategories = FieldValue.arrayRemove(category);
        }

        try {
            await entityRef.update(updates);
            console.log(
                `[onKnowledgeItemDeleted] Updated flags for ${scope} ${videoId || "channel"}: count -1${remainingSnap.empty ? `, removed category "${category}"` : ""}`
            );
        } catch (err) {
            // Entity doc may not exist (e.g. video already deleted) — non-critical
            console.warn(`[onKnowledgeItemDeleted] Failed to update entity doc:`, err);
        }
    }
);
