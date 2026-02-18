/**
 * triggers/onProjectDeleted.ts — Cascade-delete all conversations in a project.
 */
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { db } from "../shared/db.js";

/**
 * When a project document is deleted, cascade-delete all conversations
 * belonging to that project. Each conversation deletion will in turn
 * trigger onConversationDeleted for messages + storage cleanup.
 *
 * Sequential deletion avoids burst CF invocations.
 */
export const onProjectDeleted = onDocumentDeleted(
    "users/{userId}/channels/{channelId}/chatProjects/{projectId}",
    async (event) => {
        const { userId, channelId, projectId } = event.params;

        const convsRef = db.collection(
            `users/${userId}/channels/${channelId}/chatConversations`
        );
        const convsSnap = await convsRef.where("projectId", "==", projectId).get();

        if (convsSnap.empty) {
            console.log(`[onProjectDeleted] No conversations for project ${projectId}`);
            return;
        }

        // Delete conversations sequentially to avoid burst triggers
        for (const convDoc of convsSnap.docs) {
            await convDoc.ref.delete();
        }
        console.log(
            `[onProjectDeleted] Deleted ${convsSnap.size} conversations for project ${projectId}`
        );
    }
);
