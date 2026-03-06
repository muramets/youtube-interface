// =============================================================================
// Title Generation — short chat title from first message
// =============================================================================

import { getClient } from "./client.js";

export interface TitleResult {
    title: string;
    tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export async function generateTitle(
    apiKey: string,
    firstMessage: string,
    model: string
): Promise<TitleResult> {
    try {
        const ai = await getClient(apiKey);
        const response = await ai.models.generateContent({
            model,
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `You are a chat title generator. Output ONLY the title itself — exactly one line, 3-5 words. No lists, no numbering, no multiple options, no quotes, no explanation, no markdown.\n\nChat's first message:\n"${firstMessage.slice(0, 200)}"`,
                        },
                    ],
                },
            ],
        });
        const usage = (response as Record<string, unknown>).usageMetadata as
            { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
        return {
            title: sanitizeTitle(response.text?.trim()),
            tokenUsage: usage ? {
                promptTokens: usage.promptTokenCount ?? 0,
                completionTokens: usage.candidatesTokenCount ?? 0,
                totalTokens: usage.totalTokenCount ?? 0,
            } : undefined,
        };
    } catch (err) {
        console.warn(`[generateTitle] Failed to generate title via ${model}:`, err);
        return { title: "New Chat" };
    }
}

/** Defence in depth: strip markdown/numbering if model ignores instructions. */
function sanitizeTitle(raw: string | undefined): string {
    if (!raw) return "New Chat";
    // Take only the first line (in case model returned a list)
    const firstLine = raw.split('\n')[0];
    const clean = firstLine
        .replace(/^\d+\.\s*/, '')       // "1. Title" → "Title"
        .replace(/^[-•]\s*/, '')         // "- Title" → "Title"
        .replace(/\*\*/g, '')            // "**Title**" → "Title"
        .replace(/^["']|["']$/g, '')     // '"Title"' → 'Title'
        .trim();
    return clean || "New Chat";
}
