/**
 * triggers/onConversationDeleted.ts — Cascade-delete messages and storage attachments.
 */
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { admin, db } from "../shared/db.js";

/**
 * When a conversation document is deleted, cascade-delete:
 * 1. All messages in the subcollection
 * 2. Storage attachments folder
 *
 * This runs server-side with Firebase's built-in retry logic,
 * guaranteeing cleanup even if the client disconnects mid-delete.
 */
export const onConversationDeleted = onDocumentDeleted(
    "users/{userId}/channels/{channelId}/chatConversations/{conversationId}",
    async (event) => {
        const { userId, channelId, conversationId } = event.params;

        // 1. Batch-delete all messages in the subcollection
        const messagesRef = db.collection(
            `users/${userId}/channels/${channelId}/chatConversations/${conversationId}/messages`
        );
        const messageSnap = await messagesRef.get();
        if (!messageSnap.empty) {
            const docs = messageSnap.docs;
            for (let i = 0; i < docs.length; i += 500) {
                const batch = db.batch();
                const chunk = docs.slice(i, i + 500);
                for (const doc of chunk) {
                    batch.delete(doc.ref);
                }
                await batch.commit();
            }
            console.log(`[onConversationDeleted] Deleted ${docs.length} messages for conversation ${conversationId}`);
        }

        // 2. Delete Storage attachments folder (conversation-scoped)
        const bucket = admin.storage().bucket();
        const prefix = `users/${userId}/channels/${channelId}/chatAttachments/${conversationId}/`;
        try {
            await bucket.deleteFiles({ prefix });
            console.log(`[onConversationDeleted] Deleted storage folder: ${prefix}`);
        } catch (err) {
            // Folder may not exist — that's fine
            console.warn(`[onConversationDeleted] Storage cleanup skipped (may not exist): ${prefix}`, err);
        }
    }
);
