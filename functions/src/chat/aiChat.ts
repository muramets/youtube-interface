/**
 * chat/aiChat.ts — SSE streaming endpoint for AI conversation.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { admin, db } from "../shared/db.js";
import { verifyAuthToken, verifyChannelAccess } from "../shared/auth.js";
import { logAiUsage, MAX_TEXT_LENGTH } from "./helpers.js";
import { ALLOWED_MODEL_IDS, DEFAULT_MODEL_ID } from "../config/models.js";
import type { AiChatRequest } from "../types.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

/**
 * AI Chat — SSE streaming endpoint.
 * Uses onRequest for Server-Sent Events streaming support.
 * Auth is verified manually from the Authorization header.
 */
export const aiChat = onRequest(
    {
        secrets: [geminiApiKey],
        maxInstances: 3,
        timeoutSeconds: 300,
        memory: "512MiB",
        cors: true,
    },
    async (req, res) => {
        // Only accept POST
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed" });
            return;
        }

        // Auth
        let userId: string;
        try {
            userId = await verifyAuthToken(req.headers.authorization);
        } catch {
            res.status(401).json({ error: "Unauthenticated" });
            return;
        }

        const body = req.body as AiChatRequest;
        if (!body.channelId || !body.text || !body.conversationId) {
            res.status(400).json({ error: "Missing required fields: channelId, conversationId, text" });
            return;
        }

        // Validate input constraints
        if (body.text.length > MAX_TEXT_LENGTH) {
            res.status(400).json({ error: `Text exceeds maximum length (${MAX_TEXT_LENGTH} chars).` });
            return;
        }
        const model = body.model || DEFAULT_MODEL_ID;
        if (!ALLOWED_MODEL_IDS.has(model)) {
            res.status(400).json({ error: `Unsupported model: ${model}` });
            return;
        }

        // Verify channel ownership
        try {
            await verifyChannelAccess(userId, body.channelId);
        } catch {
            res.status(403).json({ error: "Access denied to the specified channel." });
            return;
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            res.status(500).json({ error: "Gemini API key is not configured on the server." });
            return;
        }

        // SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const convPath = `users/${userId}/channels/${body.channelId}/chatConversations/${body.conversationId}`;

        try {
            // Read conversation history from Firestore
            const messagesPath = `${convPath}/messages`;
            const [messagesSnap, convDoc] = await Promise.all([
                db.collection(messagesPath).orderBy("createdAt", "asc").get(),
                db.doc(convPath).get(),
            ]);
            const allMessages = messagesSnap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    role: data.role as "user" | "model",
                    text: data.text as string,
                    attachments: data.attachments,
                };
            });
            const convData = convDoc.data();

            // Build optimal memory: full history or summary + recent window
            const { buildMemory, streamChat } = await import("../services/gemini.js");
            const memory = await buildMemory({
                apiKey,
                model,
                allMessages,
                existingSummary: convData?.summary,
                existingSummarizedUpTo: convData?.summarizedUpTo,
            });

            const { text: responseText, tokenUsage } = await streamChat({
                apiKey,
                model,
                systemPrompt: body.systemPrompt,
                history: memory.history,
                text: body.text,
                attachments: body.attachments,
                thumbnailUrls: body.thumbnailUrls,
                onChunk: (fullText) => {
                    res.write(`data: ${JSON.stringify({ type: "chunk", text: fullText })}\n\n`);
                },
                onAttachmentUpdate: async (messageId, attachmentIndex, geminiFileUri, geminiFileExpiry) => {
                    // Persist re-uploaded Gemini URI back to Firestore
                    try {
                        const msgRef = db.doc(`${messagesPath}/${messageId}`);
                        const msgDoc = await msgRef.get();
                        if (msgDoc.exists) {
                            const data = msgDoc.data();
                            if (data?.attachments) {
                                const updated = [...data.attachments];
                                updated[attachmentIndex] = {
                                    ...updated[attachmentIndex],
                                    geminiFileUri,
                                    geminiFileExpiry,
                                };
                                await msgRef.update({ attachments: updated });
                            }
                        }
                    } catch (err) {
                        console.warn(`[aiChat] Failed to update attachment URI for message ${messageId}`, err);
                    }
                },
            });

            // Final event with complete response + token usage + summary status
            res.write(
                `data: ${JSON.stringify({
                    type: "done",
                    text: responseText,
                    tokenUsage,
                    usedSummary: memory.usedSummary,
                    summary: memory.newSummary,
                })}\n\n`
            );

            // Cache summary + log usage + clear error BEFORE ending response
            // (CF runtime may be deallocated after res.end())
            const afterTasks: Promise<unknown>[] = [];

            // Always clear lastError on success
            const convUpdate: Record<string, unknown> = { lastError: admin.firestore.FieldValue.delete() };
            if (memory.newSummary && memory.summarizedUpTo) {
                convUpdate.summary = memory.newSummary;
                convUpdate.summarizedUpTo = memory.summarizedUpTo;
            }
            afterTasks.push(
                db.doc(convPath).update(convUpdate)
                    .catch(err => console.warn(`[aiChat] Failed to update conversation for ${convPath}`, err))
            );

            if (tokenUsage) {
                afterTasks.push(
                    logAiUsage(userId, body.channelId, body.conversationId, model, tokenUsage, "chat").catch(err => console.warn('[aiChat] Failed to log usage', err))
                );
            }
            await Promise.allSettled(afterTasks);
            res.end();
        } catch (err) {
            const message = err instanceof Error ? err.message : "AI generation failed";

            // Write lastError to conversation doc so the client can recover.
            // Find the last user message ID to tag the error.
            const messagesForError = await db.collection(`${convPath}/messages`)
                .where('role', '==', 'user').orderBy('createdAt', 'desc').limit(1).get();
            const lastUserMsgId = messagesForError.docs[0]?.id;
            if (lastUserMsgId) {
                db.doc(convPath).update({
                    lastError: { messageId: lastUserMsgId, error: message },
                }).catch(e => console.warn('[aiChat] Failed to write lastError', e));
            }

            res.write(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`);
            res.end();
        }
    }
);
