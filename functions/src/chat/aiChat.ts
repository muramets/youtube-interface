/**
 * chat/aiChat.ts — SSE streaming endpoint for AI conversation.
 *
 * Uses the provider router to dispatch to the correct AI provider
 * (Gemini, Anthropic, etc.) based on the selected model.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { admin, db } from "../shared/db.js";
import { verifyAuthToken, verifyChannelAccess } from "../shared/auth.js";
import { logAiUsage, MAX_TEXT_LENGTH } from "./helpers.js";
import { ALLOWED_MODEL_IDS, DEFAULT_MODEL_ID, validateThinkingOptionId, resolveModelId, MODEL_REGISTRY } from "../config/models.js";
import type { AiChatRequest } from "../types.js";
import type { ThumbnailCache } from "../services/gemini/index.js";
import { createProviderRouter } from "../services/ai/providerRouter.js";
import { geminiFactory } from "../services/gemini/factory.js";
import { geminiContext } from "../services/gemini/context.js";
import { claudeFactory } from "../services/claude/factory.js";
import { TOOL_DECLARATIONS } from "../services/tools/definitions.js";
import type { StreamCallbacks, AttachmentRef } from "../services/ai/types.js";
import { writeSSE } from "./sseWriter.js";
import type { ContextBreakdown, AuxiliaryCost } from "../shared/models.js";
import { estimateImageTokens } from "../shared/imageTokens.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");
// NOTE: buildMemory always uses Gemini Flash for summarization. GEMINI_API_KEY required regardless of provider.
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

/**
 * AI Chat — SSE streaming endpoint.
 * Uses onRequest for Server-Sent Events streaming support.
 * Auth is verified manually from the Authorization header.
 */
export const aiChat = onRequest(
    {
        secrets: [geminiApiKey, anthropicApiKey],
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
        const model = resolveModelId(body.model || '') || DEFAULT_MODEL_ID;
        if (!ALLOWED_MODEL_IDS.has(model)) {
            res.status(400).json({ error: `Unsupported model: ${body.model}` });
            return;
        }
        const thinkingOptionId = validateThinkingOptionId(model, body.thinkingOptionId);

        // Verify channel ownership
        try {
            await verifyChannelAccess(userId, body.channelId);
        } catch {
            res.status(403).json({ error: "Access denied to the specified channel." });
            return;
        }

        // Resolve model config for context limit logging and provider routing
        const modelConfig = MODEL_REGISTRY.find(m => m.id === model);

        // Gemini API key is always required: buildMemory uses Gemini Flash for summarization,
        // and it's the primary provider.
        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            res.status(500).json({ error: "Gemini API key is not configured on the server." });
            return;
        }
        // Anthropic API key is required when using a Claude model.
        const isAnthropicModel = modelConfig?.provider === "anthropic";
        const anthropicKey = anthropicApiKey.value();
        if (isAnthropicModel && !anthropicKey) {
            res.status(500).json({ error: "Anthropic API key is not configured on the server." });
            return;
        }

        // SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const convPath = `users/${userId}/channels/${body.channelId}/chatConversations/${body.conversationId}`;
        const requestStart = Date.now();

        // --- Abort controller: fires when client disconnects (Stop button) ---
        const abortController = new AbortController();
        res.on('close', () => {
            if (!abortController.signal.aborted) {
                abortController.abort();
            }
        });

        // --- Production logging: request context ---
        const ctx = body.contextMeta;
        console.info(`[aiChat] ── Request ── conv=${body.conversationId} model=${model}` +
            ` systemPrompt=${body.systemPrompt?.length ?? 0}chars` +
            ` context=${ctx ? `${ctx.totalItems ?? 0} items (${ctx.videoCards ?? 0} video, ${ctx.trafficSources ?? 0} traffic, ${ctx.canvasNodes ?? 0} canvas)` : 'none'}` +
            ` attachments=${body.attachments?.length ?? 0} thumbnails=${body.thumbnailUrls?.length ?? 0}` +
            ` textLen=${body.text.length}`);

        try {
            // Read conversation history from Firestore
            const messagesPath = `${convPath}/messages`;
            const [messagesSnap, convDoc] = await Promise.all([
                db.collection(messagesPath).orderBy("createdAt", "asc").get(),
                db.doc(convPath).get(),
            ]);
            const allMessages = messagesSnap.docs
                .filter(doc => {
                    // Only complete and legacy (undefined) messages sent to AI.
                    // Stopped/deleted/error messages excluded from history.
                    const status = doc.data().status as string | undefined;
                    return !status || status === 'complete';
                })
                .map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        role: data.role as "user" | "model",
                        text: data.text as string,
                        attachments: data.attachments,
                        appContext: data.appContext,
                    };
                });
            const convData = convDoc.data();

            // Build optimal memory: full history or summary + recent window
            // NOTE: buildMemory always uses Gemini Flash for summarization,
            // regardless of which provider handles the main chat.
            const { buildMemory } = await import("../services/memory.js");
            const { UTILITY_MODEL_ID } = await import("../config/models.js");
            const memory = await buildMemory({
                apiKey,
                chatModel: model,
                summaryModel: UTILITY_MODEL_ID,
                allMessages,
                existingSummary: convData?.summary,
                existingSummarizedUpTo: convData?.summarizedUpTo,
            });

            // --- Provider router: model → provider dispatch ---
            const router = createProviderRouter({
                registry: {
                    gemini: {
                        factory: geminiFactory,
                        config: { apiKey },
                    },
                    anthropic: {
                        factory: claudeFactory,
                        config: { apiKey: anthropicKey },
                    },
                },
                modelToProvider: Object.fromEntries(
                    MODEL_REGISTRY.map(m => [m.id, m.provider]),
                ),
            });

            // --- Callbacks: SSE streaming events ---
            const callbacks: StreamCallbacks = {
                onChunk: (fullText) => {
                    writeSSE(res, { type: "chunk", text: fullText });
                },
                onToolCall: (name, args, toolCallIndex) => {
                    writeSSE(res, { type: "toolCall", name, args, toolCallIndex });
                },
                onToolResult: (name, result, toolCallIndex) => {
                    writeSSE(res, { type: "toolResult", name, result, toolCallIndex });
                },
                onThought: (text) => {
                    writeSSE(res, { type: "thought", text });
                },
                onToolProgress: (toolName, message, toolCallIndex) => {
                    writeSSE(res, { type: "toolProgress", toolName, message, toolCallIndex });
                },
                onRetry: (attempt) => {
                    writeSSE(res, { type: "retry", attempt });
                },
            };

            // --- Provider-agnostic attachments from request ---
            const currentAttachments: AttachmentRef[] | undefined = body.attachments?.map(a => ({
                type: a.type,
                url: a.url,
                mimeType: a.mimeType,
                name: a.name,
            }));

            // --- Provider context: only Gemini needs extra context ---
            const providerContext = isAnthropicModel
                ? undefined
                : geminiContext({
                    thumbnailCache: convData?.thumbnailCache as ThumbnailCache | undefined,
                    largePayloadApproved: body.largePayloadApproved,
                    currentMessageGeminiRefs: body.attachments
                        ?.filter(a => a.fileRef)
                        .map(a => ({ geminiFileUri: a.fileRef!, mimeType: a.mimeType })),
                    onLargePayloadBlocked: (count) => {
                        writeSSE(res, { type: "confirmLargePayload", count });
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

            // --- Read user's YouTube API key for tool calls ---
            // Settings are stored per-channel: users/{uid}/channels/{channelId}/settings/general
            const userSettingsSnap = await db.doc(`users/${userId}/channels/${body.channelId}/settings/general`).get();
            const userYoutubeApiKey = userSettingsSnap.exists
                ? (userSettingsSnap.data()?.apiKey as string | undefined)
                : undefined;

            // --- Context breakdown: measure char sizes before API call ---
            const historyChars = memory.history.reduce((sum, m) => sum + m.text.length, 0);
            const imageAttachmentCount = (body.attachments ?? [])
                .filter(att => att.mimeType?.startsWith('image/')).length;
            const thumbnailCount = body.thumbnailUrls?.length ?? 0;
            const allImages: Array<{ width?: number; height?: number }> = [
                // Attachments: no dimensions available server-side (captured on client only)
                ...Array.from({ length: imageAttachmentCount }, () => ({ width: undefined, height: undefined })),
                // YouTube thumbnails: hardcoded 1280x720
                ...Array.from({ length: thumbnailCount }, () => ({ width: 1280, height: 720 })),
            ];
            const contextBreakdown: ContextBreakdown = {
                systemPrompt: body.systemPrompt?.length ?? 0,
                toolDefinitions: JSON.stringify(TOOL_DECLARATIONS).length,
                history: historyChars,
                memory: memory.usedSummary
                    ? (memory.newSummary?.length ?? (convData?.summary as string)?.length ?? 0)
                    : 0,
                currentMessage: body.text.length,
                toolResults: 0, // First iteration has no tool results
                imageTokens: estimateImageTokens(model, allImages),
                imageCount: allImages.length,
                historyMessageCount: allMessages.length,
                usedSummary: memory.usedSummary,
                ...(memory.newSummary ? { triggeredAuxiliary: ['summary'] } : {}),
            };

            // --- Provider-agnostic stream call via router ---
            const result = await router.streamChat({
                model,
                systemPrompt: body.systemPrompt,
                history: memory.history,
                text: body.text,
                attachments: currentAttachments,
                imageUrls: body.thumbnailUrls,
                tools: TOOL_DECLARATIONS,
                toolContext: { userId, channelId: body.channelId, youtubeApiKey: userYoutubeApiKey },
                thinkingOptionId,
                callbacks,
                providerContext,
                signal: abortController.signal,
            });

            // Unpack provider-agnostic result
            const { text: responseText, tokenUsage, normalizedUsage, toolCalls, providerMeta, partial } = result;
            const updatedThumbnailCache = providerMeta?.updatedThumbnailCache as ThumbnailCache | undefined;

            // --- Production logging: response metrics ---
            const durationMs = Date.now() - requestStart;
            const contextLimit = modelConfig?.contextLimit ?? 1_000_000;
            const contextPercent = tokenUsage ? ((tokenUsage.promptTokens / contextLimit) * 100).toFixed(1) : '?';
            console.info(`[aiChat] ── Response ── conv=${body.conversationId}` +
                ` prompt=${tokenUsage?.promptTokens ?? '?'} completion=${tokenUsage?.completionTokens ?? '?'} total=${tokenUsage?.totalTokens ?? '?'}` +
                ` context=${contextPercent}%` +
                ` toolCalls=${toolCalls?.length ?? 0}` +
                ` historyLen=${allMessages.length} usedSummary=${memory.usedSummary} newSummary=${!!memory.newSummary}` +
                ` duration=${durationMs}ms`);

            // Determine message status (immutable after write)
            const messageStatus = partial ? 'stopped' as const : 'complete' as const;

            // Final event with complete response + token usage + summary status
            writeSSE(res, {
                type: "done",
                text: responseText,
                tokenUsage,
                normalizedUsage,
                toolCalls,
                usedSummary: memory.usedSummary,
                summary: memory.newSummary,
                status: messageStatus,
                partial,
                contextBreakdown,
            });

            // Persist stopped messages directly to Firestore (SSE may not reach client)
            if (partial && responseText) {
                const messagesPath = `${convPath}/messages`;
                const stoppedMsg: Record<string, unknown> = {
                    role: 'model',
                    text: responseText,
                    model,
                    status: 'stopped',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                };
                if (tokenUsage) stoppedMsg.tokenUsage = tokenUsage;
                if (normalizedUsage) stoppedMsg.normalizedUsage = normalizedUsage;
                if (toolCalls) stoppedMsg.toolCalls = toolCalls;
                stoppedMsg.contextBreakdown = contextBreakdown;
                db.collection(messagesPath).add(stoppedMsg)
                    .then(() => console.info(`[aiChat] Persisted stopped message for conv=${body.conversationId}`))
                    .catch(err => console.warn(`[aiChat] Failed to persist stopped message`, err));
            }

            // Cache summary + log usage + clear error BEFORE ending response
            // (CF runtime may be deallocated after res.end())
            const afterTasks: Promise<unknown>[] = [];

            // Always clear lastError on success
            const convUpdate: Record<string, unknown> = { lastError: admin.firestore.FieldValue.delete() };
            if (memory.newSummary && memory.summarizedUpTo) {
                convUpdate.summary = memory.newSummary;
                convUpdate.summarizedUpTo = memory.summarizedUpTo;
            }
            // Persist updated thumbnail cache (fire-and-forget)
            if (updatedThumbnailCache) {
                convUpdate.thumbnailCache = updatedThumbnailCache;
                console.info(`[aiChat] Persisting thumbnail cache: ${Object.keys(updatedThumbnailCache).length} entries`);
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
            if (memory.summaryTokenUsage) {
                afterTasks.push(
                    logAiUsage(userId, body.channelId, body.conversationId, model, memory.summaryTokenUsage, "summarize").catch(err => console.warn('[aiChat] Failed to log summary usage', err))
                );
                // Persist summary as AuxiliaryCost on conversation doc
                const { UTILITY_MODEL_ID } = await import("../config/models.js");
                const utilityConfig = MODEL_REGISTRY.find(m => m.id === UTILITY_MODEL_ID);
                const summaryCostUsd = utilityConfig?.pricing
                    ? (memory.summaryTokenUsage.promptTokens / 1_000_000 * utilityConfig.pricing.inputPerMillion) +
                      (memory.summaryTokenUsage.completionTokens / 1_000_000 * utilityConfig.pricing.outputPerMillion)
                    : 0;
                const summaryCost: AuxiliaryCost = {
                    id: `summary-${Date.now()}`,
                    type: 'summary',
                    model: UTILITY_MODEL_ID,
                    costUsd: summaryCostUsd,
                    tokens: {
                        input: memory.summaryTokenUsage.promptTokens,
                        output: memory.summaryTokenUsage.completionTokens,
                    },
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                };
                afterTasks.push(
                    db.doc(convPath).update({
                        auxiliaryCosts: admin.firestore.FieldValue.arrayUnion(summaryCost),
                    }).catch(err => console.warn('[aiChat] Failed to persist summary auxiliary cost', err))
                );
            }
            await Promise.allSettled(afterTasks);
            res.end();
        } catch (err) {
            const message = err instanceof Error ? err.message : "AI generation failed";
            console.error('[aiChat] Generation error:', message);

            // Best-effort: persist lastError so the client can recover on reload.
            // Wrapped in try/catch — must NEVER prevent the SSE error from being sent.
            try {
                // Simple query (no composite index needed): get latest messages, filter in-memory
                const recentMsgs = await db.collection(`${convPath}/messages`)
                    .orderBy('createdAt', 'desc').limit(5).get();
                const lastUserMsgId = recentMsgs.docs.find(d => d.data().role === 'user')?.id;
                if (lastUserMsgId) {
                    await db.doc(convPath).update({
                        lastError: { messageId: lastUserMsgId, error: message },
                    });
                }
            } catch (persistErr) {
                console.warn('[aiChat] Failed to persist lastError (non-fatal):', persistErr);
            }

            writeSSE(res, { type: "error", error: message });
            res.end();
        }
    }
);
