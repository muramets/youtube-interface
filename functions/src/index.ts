import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { SyncService } from "./services/sync.js";
// gemini.ts is lazy-imported inside each handler to avoid deployment timeout
import type {
    TrendChannel,
    UserSettings,
    SyncSettings,
    Notification,
    AiChatRequest,
    GeminiUploadRequest,
    GenerateTitleRequest,
    AiUsageLog,
} from "./types.js";
import { ALLOWED_MODEL_IDS, DEFAULT_MODEL_ID } from "./config/models.js";

admin.initializeApp();
const db = admin.firestore();

// Gemini API key — stored in Firebase Secret Manager
const geminiApiKey = defineSecret("GEMINI_API_KEY");

/**
 * Scheduled Function: Runs every day at midnight (UTC).
 * Uses SyncService to fetch data and update Firestore.
 */
export const scheduledTrendSnapshot = onSchedule({
    schedule: "0 0 * * *",
    timeZone: "Etc/UTC",
    timeoutSeconds: 540, // Increase timeout for long syncs (9 mins)
    memory: "512MiB"
}, async () => {
    console.log("Starting Daily Trend Snapshot (Robust Service Mode)...");
    const syncService = new SyncService();

    // 1. Get all users
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;

        // 2. Get User Channels
        const channelsSnap = await db.collection(`users/${userId}/channels`).get();

        for (const channelDoc of channelsSnap.docs) {
            const userChannelId = channelDoc.id;

            // Scope stats to this specific User Channel
            let processedChannelsCount = 0; // This will now count trend channels processed within this user's channel
            let processedVideosCount = 0;
            let quotaList = 0;
            let quotaDetails = 0;

            // 3. Get Channel-Specific Settings
            const settingsDoc = await db.doc(`users/${userId}/channels/${userChannelId}/settings/general`).get();
            const generalSettings = settingsDoc.data() as UserSettings | undefined;

            const syncSettingsDoc = await db.doc(`users/${userId}/channels/${userChannelId}/settings/sync`).get();
            const syncSettings = syncSettingsDoc.data() as SyncSettings | undefined;

            // CHECK 1: Is Trend Sync Enabled?
            if (!syncSettings?.trendSync?.enabled) {
                console.log(`Skipping channel ${userChannelId}: Trend Sync is disabled.`);
                continue;
            }

            // CHECK 2: Is API Key Configured?
            if (!generalSettings?.apiKey) {
                console.log(`Skipping channel ${userChannelId}: No API Key configured.`);
                continue;
            }

            const apiKey = generalSettings.apiKey;

            // 4. Get Trend Channels (ALL channels, not just visible)
            const trendChannelsRef = db.collection(`users/${userId}/channels/${userChannelId}/trendChannels`);
            const allTrendChannels = await trendChannelsRef.get();

            for (const tChannelDoc of allTrendChannels.docs) {
                const trendChannel = tChannelDoc.data() as TrendChannel;
                try {
                    console.log(`Processing ${trendChannel.name || trendChannel.id} for user ${userId}...`);
                    // Use SyncService
                    const stats = await syncService.syncChannel(userId, userChannelId, trendChannel, apiKey, false, 'auto');

                    if (stats) {
                        processedChannelsCount++; // Increment for each trend channel processed
                        processedVideosCount += stats.videosProcessed;
                        quotaList += stats.quotaList;
                        quotaDetails += stats.quotaDetails;
                    }

                } catch (err) {
                    console.error(`Failed to process channel ${trendChannel.id}`, err);
                }
            }

            // 5. Send Notification (Scoped to this User Channel)
            if (processedChannelsCount > 0) {
                const totalQuota = quotaList + quotaDetails;
                const notification: Notification = {
                    title: 'Daily Trend Sync',
                    message: `Successfully updated ${processedVideosCount} videos across ${processedChannelsCount} trend channels.`,
                    type: 'success',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: false,
                    meta: totalQuota.toString(),
                    quotaBreakdown: {
                        list: quotaList,
                        details: quotaDetails,
                        search: 0
                    }
                };

                await db.collection(`users/${userId}/channels/${userChannelId}/notifications`).add(notification);
                console.log(`Sent notification to channel ${userChannelId} (Quota: ${totalQuota})`);
            }
        }
    }
});

/**
 * Callable Function: Manual Sync from Frontend.
 * Accepts: { channelId: string, targetTrendChannelIds?: string[], forceAvatarRefresh?: boolean }
 */
export const manualTrendSync = onCall({
    timeoutSeconds: 540,
    memory: "512MiB"
}, async (request) => {
    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userId = request.auth.uid;
    const { channelId, targetTrendChannelIds, forceAvatarRefresh } = request.data; // This is the userChannelId (Context)

    if (!channelId) {
        throw new HttpsError('invalid-argument', 'The function must be called with a "channelId" argument.');
    }

    console.log(`Starting Manual Sync for User ${userId}, Channel ${channelId}`);
    const syncService = new SyncService();

    // 2. Get Settings (API Key)
    const settingsDoc = await db.doc(`users/${userId}/channels/${channelId}/settings/general`).get();
    const generalSettings = settingsDoc.data() as UserSettings | undefined;

    if (!generalSettings?.apiKey) {
        throw new HttpsError('failed-precondition', 'API Key is not configured for this channel.');
    }
    const apiKey = generalSettings.apiKey;

    // 3. Get Trend Channels
    const trendChannelsRef = db.collection(`users/${userId}/channels/${channelId}/trendChannels`);
    const allTrendChannelsSnap = await trendChannelsRef.get();
    let trendChannels = allTrendChannelsSnap.docs.map(d => d.data() as TrendChannel);

    // Filter if targets provided
    if (targetTrendChannelIds && Array.isArray(targetTrendChannelIds) && targetTrendChannelIds.length > 0) {
        const targetSet = new Set(targetTrendChannelIds);
        trendChannels = trendChannels.filter(c => targetSet.has(c.id));
    }

    let processedChannelsCount = 0;
    let processedVideosCount = 0;
    let quotaList = 0;
    let quotaDetails = 0;

    for (const trendChannel of trendChannels) {
        try {
            // Check if we need to refresh avatar (force flag or potentially passed in list if we expanded capability)
            const shouldRefreshAvatar = !!forceAvatarRefresh;

            const stats = await syncService.syncChannel(userId, channelId, trendChannel, apiKey, shouldRefreshAvatar, 'manual');
            if (stats) {
                processedChannelsCount++;
                processedVideosCount += stats.videosProcessed;
                quotaList += stats.quotaList;
                quotaDetails += stats.quotaDetails;
            }
        } catch (err) {
            console.error(`Failed to sync trend channel ${trendChannel.id}`, err);
        }
    }

    // 4. Send Notification
    if (processedChannelsCount > 0) {
        await syncService.sendNotification(
            userId,
            channelId,
            'Manual Sync Complete',
            `Successfully updated ${processedVideosCount} videos across ${processedChannelsCount} channels.`,
            {
                processedVideos: processedVideosCount,
                processedChannels: processedChannelsCount,
                quota: quotaList + quotaDetails,
                quotaList,
                quotaDetails
            }
        );
    }

    return {
        success: true,
        processedChannels: processedChannelsCount,
        processedVideos: processedVideosCount,
        quotaUsed: quotaList + quotaDetails
    };
});


// =============================================================================
// AI CHAT: Gemini Proxy Cloud Functions
// =============================================================================

/**
 * Verify Firebase Auth token from Authorization header.
 */
async function verifyAuthToken(authHeader?: string): Promise<string> {
    if (!authHeader?.startsWith("Bearer ")) {
        throw new HttpsError("unauthenticated", "Missing or invalid Authorization header.");
    }
    const token = authHeader.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
}

/**
 * Verify the authenticated user has access to the given channel.
 * Currently checks ownership (channel nested under user).
 * Extensible for shared channels via members subcollection / ACL.
 */
async function verifyChannelAccess(userId: string, channelId: string): Promise<void> {
    const channelDoc = await db.doc(`users/${userId}/channels/${channelId}`).get();
    if (!channelDoc.exists) {
        throw new HttpsError("permission-denied", "Access denied to the specified channel.");
    }
}

/** Max input text length (chars). ~25K tokens — generous but prevents abuse. */
const MAX_TEXT_LENGTH = 100_000;

/**
 * Log AI usage to Firestore.
 */
async function logAiUsage(
    userId: string,
    channelId: string,
    conversationId: string,
    model: string,
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number },
    type: "chat" | "title"
): Promise<void> {
    const log: AiUsageLog = {
        userId,
        channelId,
        conversationId,
        model,
        ...tokenUsage,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type,
    };
    await db.collection(`users/${userId}/channels/${channelId}/aiUsage`).add(log);
}

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
            const { buildMemory, streamChat } = await import("./services/gemini.js");
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

/**
 * Upload a file from Firebase Storage to Gemini File API.
 */
export const geminiUpload = onCall(
    {
        secrets: [geminiApiKey],
        maxInstances: 5,
        timeoutSeconds: 120,
        memory: "512MiB",
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;

        const { storagePath, mimeType, displayName } = request.data as GeminiUploadRequest;
        if (!storagePath || !mimeType) {
            throw new HttpsError("invalid-argument", "storagePath and mimeType are required.");
        }

        // Validate storage path belongs to the authenticated user
        if (!storagePath.startsWith(`users/${userId}/`)) {
            throw new HttpsError("permission-denied", "Access denied to the specified storage path.");
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("internal", "Gemini API key is not configured on the server.");
        }

        try {
            const { uploadFromStoragePath } = await import("./services/gemini.js");
            const result = await uploadFromStoragePath(apiKey, storagePath, mimeType, displayName || "attachment");
            return { uri: result.uri, expiryMs: result.expiryMs };
        } catch (err) {
            if (err instanceof HttpsError) throw err;
            const msg = err instanceof Error ? err.message : "Unknown error";
            console.error("geminiUpload failed", { userId, storagePath, mimeType, error: msg });

            // Cleanup: delete orphaned file from Storage (fire-and-forget)
            try {
                const admin = await import("firebase-admin");
                await admin.default.storage().bucket().file(storagePath).delete();
            } catch { /* ignore cleanup errors */ }

            throw new HttpsError("internal", `File upload to Gemini failed: ${msg}`);
        }
    }
);

/**
 * Generate a short conversation title from the first message.
 */
export const generateChatTitle = onCall(
    {
        secrets: [geminiApiKey],
        maxInstances: 3,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }

        const { firstMessage, model } = request.data as GenerateTitleRequest;
        if (!firstMessage) {
            throw new HttpsError("invalid-argument", "firstMessage is required.");
        }
        const resolvedModel = model || DEFAULT_MODEL_ID;
        if (!ALLOWED_MODEL_IDS.has(resolvedModel)) {
            throw new HttpsError("invalid-argument", `Unsupported model: ${resolvedModel}`);
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("internal", "Gemini API key is not configured on the server.");
        }

        const { generateTitle } = await import("./services/gemini.js");
        const title = await generateTitle(apiKey, firstMessage, resolvedModel);
        return { title };
    }
);


// =============================================================================
// CHAT: Cascading Conversation Cleanup (Firestore Trigger)
// =============================================================================

import { onDocumentDeleted } from "firebase-functions/v2/firestore";

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
