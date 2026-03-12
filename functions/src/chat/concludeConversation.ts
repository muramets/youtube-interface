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
import type { ToolCallRecord } from "../services/ai/types.js";
import { verifyChannelAccess } from "../shared/auth.js";
import { logAiUsage } from "./helpers.js";
import { resolveUtilityModel } from "../config/models.js";

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

        // Resolve utility model: Gemini users keep their model, Claude users fallback to Flash
        const resolvedModel = resolveUtilityModel(model || 'gemini-2.5-flash');

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("internal", "Gemini API key is not configured on the server.");
        }

        // Verify channel access
        await verifyChannelAccess(userId, channelId);

        // Read conversation + messages from Firestore
        const convPath = `users/${userId}/channels/${channelId}/chatConversations/${conversationId}`;
        const convDoc = await db.doc(convPath).get();
        if (!convDoc.exists) {
            throw new HttpsError("not-found", "Conversation not found.");
        }
        const conversationTitle = convDoc.data()?.title || "Untitled";

        // Read messages with appContext (Layer 2 labels), capped to last 2000
        const MAX_MESSAGES = 2000;
        const messagesPath = `${convPath}/messages`;
        const messagesSnap = await db.collection(messagesPath)
            .orderBy("createdAt", "asc")
            .get();

        if (messagesSnap.empty) {
            throw new HttpsError("failed-precondition", "Cannot memorize an empty conversation.");
        }

        const totalMessageCount = messagesSnap.size;
        const cappedDocs = totalMessageCount > MAX_MESSAGES
            ? messagesSnap.docs.slice(-MAX_MESSAGES)
            : messagesSnap.docs;

        if (totalMessageCount > MAX_MESSAGES) {
            console.warn(`[concludeConversation] ── Capped ── conv=${conversationId}` +
                ` total=${totalMessageCount} using last ${MAX_MESSAGES}`);
        }

        console.info(`[concludeConversation] ── Data loaded ── conv=${conversationId}` +
            ` title="${conversationTitle}" messages=${cappedDocs.length}${totalMessageCount > MAX_MESSAGES ? ` (of ${totalMessageCount})` : ''}`);

        const allMessages = cappedDocs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                role: data.role as "user" | "model",
                text: data.text as string,
                attachments: data.attachments,
                appContext: data.appContext,
                toolCalls: data.toolCalls as ToolCallRecord[] | undefined,
            };
        });

        // Log request
        const msgsWithContext = allMessages.filter(m => m.appContext?.length > 0).length;
        console.info(`[concludeConversation] ── Request ── conv=${conversationId} model=${resolvedModel}` +
            ` messages=${allMessages.length} withContext=${msgsWithContext}` +
            ` guidance=${guidance ? `"${guidance.slice(0, 80)}"` : "none"}`);

        const startTime = Date.now();

        // Extract candidate videos from conversation (deterministic, code-driven)
        const { generateConcludeSummary, extractCandidateVideos } = await import("../services/memory.js");
        const candidateVideos = extractCandidateVideos(allMessages);

        console.info(`[concludeConversation] ── Candidates ── videos=${candidateVideos.length}` +
            ` ids=[${candidateVideos.map(v => v.videoId).join(', ')}]`);

        // Generate focused summary via Gemini (structured output with video selection)
        let content: string;
        let referencedVideoIds: string[];
        let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
        try {
            const result = await generateConcludeSummary(apiKey, allMessages, guidance, resolvedModel, candidateVideos);
            content = result.text;
            referencedVideoIds = result.referencedVideoIds;
            tokenUsage = result.tokenUsage;
            if (result.jsonParseFailed) {
                console.warn(`[concludeConversation] ── JSON fallback ── conv=${conversationId}` +
                    ` rawLen=${content.length} (Gemini returned non-JSON, using raw text)`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[concludeConversation] Generation error: conv=${conversationId}`, message);
            throw new HttpsError("internal", `Summary generation failed: ${message}`);
        }

        if (!content) {
            console.warn(`[concludeConversation] Empty summary: conv=${conversationId}`);
            throw new HttpsError("internal", "Failed to generate memory summary.");
        }

        // Filter candidates to only those the LLM selected as relevant to the insight
        const referencedSet = new Set(referencedVideoIds);
        const videoRefs = candidateVideos.filter(v => referencedSet.has(v.videoId));

        // Pre-write guards
        const memoriesPath = `users/${userId}/channels/${channelId}/conversationMemories`;

        // Guard 1: Idempotency — check for duplicate memory created in last 60s
        const recentCutoff = new Date(Date.now() - 60_000);
        const duplicateSnap = await db.collection(memoriesPath)
            .where("conversationId", "==", conversationId)
            .where("createdAt", ">=", recentCutoff)
            .limit(1)
            .get();

        if (!duplicateSnap.empty) {
            const existingId = duplicateSnap.docs[0].id;
            console.warn(`[concludeConversation] ── Duplicate ── conv=${conversationId}` +
                ` existing=${existingId} (created <60s ago, returning existing)`);
            return {
                memoryId: existingId,
                content: duplicateSnap.docs[0].data().content as string,
            };
        }

        // Guard 2: Re-verify conversation still exists (could be deleted during Gemini generation)
        const convStillExists = await db.doc(convPath).get();
        if (!convStillExists.exists) {
            console.warn(`[concludeConversation] ── Orphan prevented ── conv=${conversationId}` +
                ` (deleted during generation)`);
            throw new HttpsError("not-found", "Conversation was deleted during memorization.");
        }

        // Save to Firestore
        const now = admin.firestore.FieldValue.serverTimestamp();
        const memoryRef = await db.collection(memoriesPath).add({
            conversationId,
            conversationTitle,
            content,
            videoRefs,
            ...(guidance ? { guidance } : {}),
            createdAt: now,
            updatedAt: now,
        });

        console.info(`[concludeConversation] ── Persisted ── memory=${memoryRef.id} path=${memoriesPath}`);

        const durationMs = Date.now() - startTime;
        console.info(`[concludeConversation] ── Response ── conv=${conversationId}` +
            ` memory=${memoryRef.id} len=${content.length}chars duration=${durationMs}ms` +
            ` tokens=${tokenUsage.totalTokens} videoRefs=${videoRefs.length}`);

        // Log AI usage (non-blocking)
        logAiUsage(userId, channelId, conversationId, resolvedModel, tokenUsage, "memorize")
            .catch(err => console.warn('[concludeConversation] Failed to log usage (non-fatal):', err));

        return {
            memoryId: memoryRef.id,
            content,
        };
    }
);
