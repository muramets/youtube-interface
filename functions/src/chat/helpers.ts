/**
 * chat/helpers.ts — Shared helpers for AI Chat Cloud Functions.
 */
import { admin, db } from "../shared/db.js";
import type { AiUsageLog } from "../types.js";
import type { TokenUsage } from "../services/ai/types.js";

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
    tokenUsage: TokenUsage,
    type: "chat" | "title" | "memorize" | "summarize"
): Promise<void> {
    const log: AiUsageLog = {
        userId,
        channelId,
        conversationId,
        model,
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens,
        ...(tokenUsage.cachedTokens != null && tokenUsage.cachedTokens > 0 ? { cachedTokens: tokenUsage.cachedTokens } : {}),
        ...(tokenUsage.cacheWriteTokens != null && tokenUsage.cacheWriteTokens > 0 ? { cacheWriteTokens: tokenUsage.cacheWriteTokens } : {}),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type,
    };
    await db.collection(`users/${userId}/channels/${channelId}/aiUsage`).add(log);
}
