/**
 * chat/concludeConversation.ts — Generate and save a cross-conversation memory (Layer 4).
 *
 * Called when user clicks "Memorize" in chat. Reads conversation history,
 * generates a focused summary (with optional user guidance), and saves it
 * as a ConversationMemory document in Firestore.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { admin, db } from "../shared/db.js";
import { verifyChannelAccess } from "../shared/auth.js";
import { logAiUsage } from "./helpers.js";
import { ALLOWED_MODEL_IDS, DEFAULT_MODEL_ID } from "../config/models.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const concludeConversation = onCall(
    {
        secrets: [geminiApiKey],
        maxInstances: 3,
        timeoutSeconds: 120,
        memory: "512MiB",
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }

        const userId = request.auth.uid;
        const { channelId, conversationId, guidance, model } = request.data as {
            channelId: string;
            conversationId: string;
            guidance?: string;
            model?: string;
        };

        if (!channelId || !conversationId) {
            throw new HttpsError("invalid-argument", "channelId and conversationId are required.");
        }

        const resolvedModel = model || DEFAULT_MODEL_ID;
        if (!ALLOWED_MODEL_IDS.has(resolvedModel)) {
            throw new HttpsError("invalid-argument", `Unsupported model: ${resolvedModel}`);
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("internal", "Gemini API key is not configured on the server.");
        }

        // Verify channel access
        await verifyChannelAccess(userId, channelId);

        // Read conversation title
        const convPath = `users/${userId}/channels/${channelId}/chatConversations/${conversationId}`;
        const convDoc = await db.doc(convPath).get();
        if (!convDoc.exists) {
            throw new HttpsError("not-found", "Conversation not found.");
        }
        const conversationTitle = convDoc.data()?.title || "Untitled";

        // Read all messages with appContext (Layer 2 labels)
        const messagesPath = `${convPath}/messages`;
        const messagesSnap = await db.collection(messagesPath)
            .orderBy("createdAt", "asc")
            .get();

        if (messagesSnap.empty) {
            throw new HttpsError("failed-precondition", "Cannot memorize an empty conversation.");
        }

        const allMessages = messagesSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                role: data.role as "user" | "model",
                text: data.text as string,
                attachments: data.attachments,
                appContext: data.appContext,
            };
        });

        // Log request
        const msgsWithContext = allMessages.filter(m => m.appContext?.length > 0).length;
        console.info(`[concludeConversation] ── Request ── conv=${conversationId} model=${resolvedModel}` +
            ` messages=${allMessages.length} withContext=${msgsWithContext}` +
            ` guidance=${guidance ? `"${guidance.slice(0, 80)}"` : "none"}`);

        const startTime = Date.now();

        // Generate focused summary via Gemini
        const { generateConcludeSummary } = await import("../services/memory.js");
        let content: string;
        let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
        try {
            const result = await generateConcludeSummary(apiKey, allMessages, guidance, resolvedModel);
            content = result.text;
            tokenUsage = result.tokenUsage;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[concludeConversation] Generation error: conv=${conversationId}`, message);
            throw new HttpsError("internal", `Summary generation failed: ${message}`);
        }

        if (!content) {
            console.warn(`[concludeConversation] Empty summary: conv=${conversationId}`);
            throw new HttpsError("internal", "Failed to generate memory summary.");
        }

        // Save to Firestore
        const memoriesPath = `users/${userId}/channels/${channelId}/conversationMemories`;
        const now = admin.firestore.FieldValue.serverTimestamp();
        const memoryRef = await db.collection(memoriesPath).add({
            conversationId,
            conversationTitle,
            content,
            ...(guidance ? { guidance } : {}),
            createdAt: now,
            updatedAt: now,
        });

        const durationMs = Date.now() - startTime;
        console.info(`[concludeConversation] ── Response ── conv=${conversationId}` +
            ` memory=${memoryRef.id} len=${content.length}chars duration=${durationMs}ms` +
            ` tokens=${tokenUsage.totalTokens}`);

        // Log AI usage (non-blocking)
        logAiUsage(userId, channelId, conversationId, resolvedModel, tokenUsage, "memorize")
            .catch(err => console.warn('[concludeConversation] Failed to log usage (non-fatal):', err));

        return {
            memoryId: memoryRef.id,
            content,
        };
    }
);
