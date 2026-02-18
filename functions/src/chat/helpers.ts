/**
 * chat/helpers.ts — Shared helpers for AI Chat Cloud Functions.
 */
import { admin, db } from "../shared/db.js";
import type { AiUsageLog } from "../types.js";

/** Max input text length (chars). ~25K tokens — generous but prevents abuse. */
export const MAX_TEXT_LENGTH = 100_000;

/**
 * Log AI usage to Firestore.
 */
export async function logAiUsage(
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
