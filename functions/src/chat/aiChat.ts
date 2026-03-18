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
import { TOOL_DECLARATIONS, CONCLUDE_TOOL_DECLARATIONS } from "../services/tools/definitions.js";
import type { StreamCallbacks, AttachmentRef, ToolCallRecord } from "../services/ai/types.js";
import { AiStreamTimeoutError } from "../services/ai/retry.js";
import { writeSSE } from "./sseWriter.js";
import type { ContextBreakdown, AuxiliaryCost } from "../shared/models.js";
import { estimateImageTokens } from "../shared/imageTokens.js";
import { formatContextLabel } from "../services/memory.js";

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
        timeoutSeconds: 1200,
        memory: "1GiB",
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

        // Verify channel ownership and retrieve channel name for ownership detection
        let channelName: string | undefined;
        try {
            channelName = await verifyChannelAccess(userId, body.channelId);
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

        // Hoisted for catch block access (thinking timeout persistence)
        const messagesPath = `${convPath}/messages`;
        let thinkingAccumulator = '';
        let firstThoughtTs = 0;

        try {
            // Read conversation history from Firestore
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
                        toolCalls: data.toolCalls as ToolCallRecord[] | undefined,
                    };
                });
            const convData = convDoc.data();

            // The current user message is already in Firestore (frontend persists it
            // before calling this function). It arrives separately as body.text, so
            // exclude it from history to avoid sending it to the model twice.
            const priorMessages = allMessages.slice(0, -1);

            // Build optimal memory: full history or summary + recent window
            // NOTE: buildMemory always uses Gemini Flash for summarization,
            // regardless of which provider handles the main chat.
            const { buildMemory } = await import("../services/memory.js");
            const { UTILITY_MODEL_ID } = await import("../config/models.js");
            const memory = await buildMemory({
                apiKey,
                chatModel: model,
                summaryModel: UTILITY_MODEL_ID,
                allMessages: priorMessages,
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
                    if (text) {
                        if (!firstThoughtTs) firstThoughtTs = Date.now();
                        thinkingAccumulator += text;
                        writeSSE(res, { type: "thought", text });
                    }
                },
                onToolProgress: (toolName, message, toolCallIndex) => {
                    writeSSE(res, { type: "toolProgress", toolName, message, toolCallIndex });
                },
                onRetry: (attempt) => {
                    writeSSE(res, { type: "retry", attempt });
                },
                onHeartbeat: () => {
                    writeSSE(res, { type: "heartbeat" });
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
            // Include Layer 2 context labels (prepended to user messages by buildHistory)
            let historyChars = 0;
            let historyToolResultChars = 0;
            for (const m of memory.history) {
                let chars = m.text.length;
                if (m.role === 'user' && m.appContext?.length) {
                    chars += formatContextLabel(m.appContext).length + 2; // +2 for "\n\n"
                }
                historyChars += chars;
                // Reconstructed tool_use/tool_result blocks from previous turns
                if (m.toolCalls?.length) {
                    historyToolResultChars += JSON.stringify(m.toolCalls).length;
                }
            }
            const imageAttachments = (body.attachments ?? [])
                .filter(att => att.mimeType?.startsWith('image/'));
            const thumbnailCount = body.thumbnailUrls?.length ?? 0;
            const allImages: Array<{ width?: number; height?: number }> = [
                // Attachments: dimensions passed from frontend (captured via Image.onload)
                ...imageAttachments.map(att => ({ width: att.width, height: att.height })),
                // YouTube thumbnails: hardcoded 1280x720
                ...Array.from({ length: thumbnailCount }, () => ({ width: 1280, height: 720 })),
            ];
            const contextBreakdown: ContextBreakdown = {
                systemPrompt: body.systemPrompt?.length ?? 0,
                toolDefinitions: JSON.stringify(TOOL_DECLARATIONS).length,
                history: historyChars,
                historyToolResults: historyToolResultChars,
                memory: memory.usedSummary
                    ? (memory.newSummary?.length ?? (convData?.summary as string)?.length ?? 0)
                    : 0,
                currentMessage: body.text.length,
                toolResults: 0, // Updated post agentic loop
                imageTokens: estimateImageTokens(model, allImages),
                imageCount: allImages.length,
                historyMessageCount: priorMessages.length,
                usedSummary: memory.usedSummary,
                ...(memory.newSummary ? { triggeredAuxiliary: ['summary'] } : {}),
                ...(body.systemLayers ? { systemLayers: body.systemLayers } : {}),
            };

            // --- Enrich conclude text with existing KI (avoids duplicate creation) ---
            let concludeText = body.text;
            if (body.isConclude && body.conversationId) {
                try {
                    const kiPath = `users/${userId}/channels/${body.channelId}/knowledgeItems`;
                    const existingKI = await db.collection(kiPath)
                        .where("conversationId", "==", body.conversationId)
                        .where("supersededBy", "==", null)
                        .get();
                    if (!existingKI.empty) {
                        const kiList = existingKI.docs.map(doc => {
                            const d = doc.data();
                            return `- ${d.category}: "${d.title}" [id: ${doc.id}]`;
                        }).join('\n');
                        concludeText += `\n\nKnowledge Items already saved for this conversation (do NOT recreate):\n${kiList}`;
                        console.info(`[aiChat] ── Conclude context ── ${existingKI.size} existing KI injected`);
                    }
                } catch (err) {
                    console.warn('[aiChat] Failed to load existing KI for conclude:', err);
                }
            }

            // --- Provider-agnostic stream call via router ---
            const result = await router.streamChat({
                model,
                systemPrompt: body.systemPrompt,
                history: memory.history,
                text: concludeText,
                attachments: body.isConclude ? undefined : currentAttachments, // Skip attachments for conclude — context already in history
                imageUrls: body.isConclude ? undefined : body.thumbnailUrls, // Skip thumbnails for conclude — AI doesn't need images when memorizing
                tools: body.isConclude ? [...TOOL_DECLARATIONS, ...CONCLUDE_TOOL_DECLARATIONS] : TOOL_DECLARATIONS,
                toolContext: { userId, channelId: body.channelId, channelName, youtubeApiKey: userYoutubeApiKey, conversationId: body.conversationId, model, isConclude: body.isConclude },
                thinkingOptionId,
                callbacks,
                providerContext,
                signal: abortController.signal,
            });

            // Unpack provider-agnostic result
            const { text: responseText, tokenUsage, normalizedUsage, toolCalls, providerMeta, agenticImages, partial } = result;
            const updatedThumbnailCache = providerMeta?.updatedThumbnailCache as ThumbnailCache | undefined;

            // Update contextBreakdown with actual tool results size (post agentic loop).
            // NOTE: counts only result size, not args. Args are typically small (<500 chars).
            // If a tool with large args appears, consider including args in this calculation.
            if (toolCalls?.length) {
                contextBreakdown.toolResults = toolCalls.reduce(
                    (sum, tc) => sum + JSON.stringify(tc.result ?? {}).length, 0
                );
            }

            // Update image accounting with images injected during the agentic loop
            // (e.g. viewThumbnails → visualContextUrls → ImageBlockParam)
            if (agenticImages) {
                contextBreakdown.imageCount += agenticImages.count;
                contextBreakdown.imageTokens += agenticImages.tokens;
            }

            // --- Production logging: response metrics ---
            const durationMs = Date.now() - requestStart;
            const contextLimit = modelConfig?.contextLimit ?? 1_000_000;
            const contextPercent = tokenUsage ? ((tokenUsage.promptTokens / contextLimit) * 100).toFixed(1) : '?';
            console.info(`[aiChat] ── Response ── conv=${body.conversationId}` +
                ` prompt=${tokenUsage?.promptTokens ?? '?'} completion=${tokenUsage?.completionTokens ?? '?'} total=${tokenUsage?.totalTokens ?? '?'}` +
                ` context=${contextPercent}%` +
                ` toolCalls=${toolCalls?.length ?? 0}` +
                ` historyLen=${priorMessages.length} usedSummary=${memory.usedSummary} newSummary=${!!memory.newSummary}` +
                ` duration=${durationMs}ms`);

            // Determine message status (immutable after write)
            const messageStatus = partial ? 'stopped' as const : 'complete' as const;

            // Strip large KI content from toolCalls before sending to client / persisting
            // Replaces saveKnowledge args.content with a lightweight reference pointer.
            // Preserves summary (lightweight, useful for history reconstruction).
            const persistToolCalls = toolCalls?.map(tc => {
                if (tc.name === 'saveKnowledge' && tc.args?.content && tc.result?.id) {
                    return { ...tc, args: { ...tc.args, content: `[Saved as KI ${tc.result.id}]` } };
                }
                if (tc.name === 'editKnowledge' && tc.args?.content && tc.result?.id) {
                    return { ...tc, args: { ...tc.args, content: `[Updated KI ${tc.result.id}]` } };
                }
                return tc;
            });

            // Final event with complete response + token usage + summary status
            writeSSE(res, {
                type: "done",
                text: responseText,
                tokenUsage,
                normalizedUsage,
                toolCalls: persistToolCalls,
                usedSummary: memory.usedSummary,
                summary: memory.newSummary,
                status: messageStatus,
                partial,
                contextBreakdown,
            });

            // Cache summary + log usage + clear error BEFORE ending response
            // (CF runtime may be deallocated after res.end())
            const afterTasks: Promise<unknown>[] = [];

            // Persist stopped messages directly to Firestore (SSE may not reach client)
            // Also persist when thinking was accumulated but no text (thinking timeout)
            if (partial && (responseText || thinkingAccumulator)) {
                const stoppedMsg: Record<string, unknown> = {
                    role: 'model',
                    text: responseText,
                    model,
                    status: 'stopped',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                };
                if (tokenUsage) stoppedMsg.tokenUsage = tokenUsage;
                if (normalizedUsage) stoppedMsg.normalizedUsage = normalizedUsage;
                if (persistToolCalls) stoppedMsg.toolCalls = persistToolCalls;
                stoppedMsg.contextBreakdown = contextBreakdown;
                if (thinkingAccumulator) {
                    stoppedMsg.thinking = thinkingAccumulator;
                    stoppedMsg.thinkingElapsedMs = firstThoughtTs ? Date.now() - firstThoughtTs : 0;
                }
                afterTasks.push(
                    db.collection(messagesPath).add(stoppedMsg)
                        .then(() => console.info(`[aiChat] Persisted stopped message for conv=${body.conversationId}`))
                        .catch(err => console.warn(`[aiChat] Failed to persist stopped message`, err))
                );
            }

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
                const utilityConfig = MODEL_REGISTRY.find(m => m.id === UTILITY_MODEL_ID);
                if (!utilityConfig?.pricing) {
                    console.error(`[aiChat] UTILITY_MODEL_ID="${UTILITY_MODEL_ID}" not found in MODEL_REGISTRY — summary cost will be $0`);
                }
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
                    createdAt: Date.now(),
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

            // --- Thinking timeout: persist partial thinking as stopped message ---
            if (err instanceof AiStreamTimeoutError && err.hadThinkingProgress && thinkingAccumulator) {
                // Build partial tokenUsage from enriched error
                let partialTokenUsage: Record<string, unknown> | undefined;
                if (err.earlyInputTokens != null) {
                    const cached = err.earlyCacheRead ?? 0;
                    const cacheWrite = err.earlyCacheWrite ?? 0;
                    partialTokenUsage = {
                        promptTokens: err.earlyInputTokens,
                        completionTokens: 0,
                        totalTokens: err.earlyInputTokens + cached + cacheWrite,
                        cachedTokens: cached > 0 ? cached : undefined,
                        cacheWriteTokens: cacheWrite > 0 ? cacheWrite : undefined,
                    };
                }

                try {
                    const stoppedMsg: Record<string, unknown> = {
                        role: 'model',
                        text: '',
                        model,
                        status: 'stopped',
                        thinking: thinkingAccumulator,
                        thinkingElapsedMs: firstThoughtTs ? Date.now() - firstThoughtTs : 0,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    };
                    if (partialTokenUsage) stoppedMsg.tokenUsage = partialTokenUsage;
                    await db.collection(messagesPath).add(stoppedMsg);
                    console.info(`[aiChat] Persisted thinking-timeout stopped message for conv=${body.conversationId}`);
                } catch (persistErr) {
                    console.warn('[aiChat] Failed to persist thinking-timeout stopped message', persistErr);
                }

                // Send SSE done (stopped) BEFORE error — client can display partial thinking
                writeSSE(res, {
                    type: "done",
                    text: '',
                    status: 'stopped',
                    partial: true,
                    tokenUsage: partialTokenUsage as import("../services/ai/types.js").TokenUsage | undefined,
                });
            }

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
