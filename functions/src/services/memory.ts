// =============================================================================
// Memory Layer — Token estimation, summarization, and memory management.
//
// Extracted from gemini.ts to separate streaming/upload logic from
// memory management (Layer 3: Summarization).
// =============================================================================

import type { HistoryMessage } from "./gemini.js";
import { MODEL_CONTEXT_LIMITS } from "../config/models.js";

// --- Token estimation ---

/** Rough per-token char count: ~4 chars per token for mixed content. */
const CHARS_PER_TOKEN = 4;

/** Tokens allocated to each file/image attachment in the estimate. */
const ATTACHMENT_TOKEN_ESTIMATE = 1500;

/** History gets at most 60% of model context; rest is reserved for response + system prompt. */
const HISTORY_BUDGET_RATIO = 0.6;

/** Minimum # of recent messages to always keep verbatim in the sliding window. */
const MIN_RECENT_MESSAGES = 10;

/** Approximate chars per appContext label item (title + ownership + delimiters). */
const CONTEXT_LABEL_CHARS_PER_ITEM = 50;

function estimateTokens(messages: HistoryMessage[]): number {
    let total = 0;
    for (const msg of messages) {
        total += Math.ceil(msg.text.length / CHARS_PER_TOKEN);
        if (msg.attachments) {
            total += msg.attachments.length * ATTACHMENT_TOKEN_ESTIMATE;
        }
        // Layer 2: account for prepended context labels
        if (msg.appContext && msg.appContext.length > 0) {
            total += Math.ceil((msg.appContext.length * CONTEXT_LABEL_CHARS_PER_ITEM) / CHARS_PER_TOKEN);
        }
    }
    return total;
}

// --- Layer 2 label for summarization ---

/**
 * Format a concise context label from per-message appContext.
 * Used by both buildHistory (gemini.ts) and generateSummary (this file)
 * to give Gemini temporal awareness of what was attached when.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatContextLabel(appContext: any[]): string {
    const labels: string[] = [];
    for (const item of appContext) {
        if (item.type === 'video-card') {
            const ownership = item.ownership === 'own-draft' ? 'your draft'
                : item.ownership === 'own-published' ? 'your published' : 'competitor';
            labels.push(`Video "${item.title}" (${ownership})`);
        } else if (item.type === 'suggested-traffic') {
            labels.push(`Traffic: "${item.sourceVideo?.title}" → ${item.suggestedVideos?.length ?? 0} suggested`);
        } else if (item.type === 'canvas-selection') {
            const nodes = item.nodes || [];
            const videos = nodes.filter((n: { nodeType: string }) => n.nodeType === 'video');
            const traffic = nodes.filter((n: { nodeType: string }) => n.nodeType === 'traffic-source');
            const notes = nodes.filter((n: { nodeType: string }) => n.nodeType === 'sticky-note');
            const images = nodes.filter((n: { nodeType: string }) => n.nodeType === 'image');
            const parts: string[] = [];
            if (videos.length > 0) {
                parts.push(videos.map((v: { title: string; ownership: string }) => {
                    const own = v.ownership === 'own-draft' ? 'your draft'
                        : v.ownership === 'own-published' ? 'your published' : 'competitor';
                    return `Video "${v.title}" (${own})`;
                }).join(', '));
            }
            if (traffic.length > 0) parts.push(`${traffic.length} traffic source(s)`);
            if (notes.length > 0) {
                parts.push(notes.map((n: { content: string }) =>
                    `Note: "${(n.content || '').slice(0, 40)}${(n.content || '').length > 40 ? '…' : ''}"`
                ).join(', '));
            }
            if (images.length > 0) parts.push(`${images.length} image(s)`);
            labels.push(`Canvas: ${parts.join(', ')}`);
        }
    }
    return `[📎 Attached to this message: ${labels.join('; ')}]`;
}

// --- Summary generation ---

const SUMMARY_SYSTEM_PROMPT = `You are a conversation memory system. Your task is to create a comprehensive, \
structured summary that will REPLACE the original messages in future AI context.

CRITICAL: Any detail you omit will be permanently lost — the AI will have "amnesia" about it.

You MUST preserve:
1. ALL specific decisions, choices, and conclusions (with reasoning)
2. ALL technical details: names, numbers, configurations, code snippets, file paths
3. Context and motivations behind each decision
4. Unresolved questions, pending tasks, or open threads
5. User preferences, communication style, and recurring themes
6. Chronological flow of how the conversation evolved
7. Which video/traffic/canvas items were discussed at each stage (from [📎 Attached] labels)

Format: Use structured markdown with clear sections and bullet points.
Length: Be thorough. A longer, complete summary is better than a short one with gaps.`;

/**
 * Format a message for summarization, including Layer 2 context labels.
 */
function formatMessageForSummary(msg: HistoryMessage): string {
    let text = msg.text;
    // Layer 2 integration: include appContext labels so summarizer knows
    // which videos/data were attached to each message
    if (msg.role === 'user' && msg.appContext && msg.appContext.length > 0) {
        const label = formatContextLabel(msg.appContext);
        text = `${label}\n${msg.text}`;
    }
    return `[${msg.role}]: ${text}`;
}

export async function generateSummary(
    apiKey: string,
    messages: HistoryMessage[],
    existingSummary: string | undefined,
    model: string
): Promise<string> {
    // Lazy-load to avoid CF cold-start overhead
    const { getClient } = await import("./gemini.js");

    const ai = await getClient(apiKey);

    let userPrompt: string;
    if (existingSummary) {
        // Incremental update — extend existing summary
        const newMessagesText = messages
            .map(formatMessageForSummary)
            .join("\n\n");
        userPrompt = `Here is the existing conversation summary:\n\n${existingSummary}\n\n---\n\nHere are NEW messages that happened AFTER the summary above:\n\n${newMessagesText}\n\n---\n\nProduce an UPDATED comprehensive summary that integrates both the existing summary and the new messages. Keep all important details from the existing summary and add the new information.`;
    } else {
        // First summary — summarize from scratch
        const conversationText = messages
            .map(formatMessageForSummary)
            .join("\n\n");
        userPrompt = `Summarize the following conversation:\n\n${conversationText}`;
    }

    const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config: {
            systemInstruction: SUMMARY_SYSTEM_PROMPT,
        },
    });

    return response.text?.trim() || existingSummary || "";
}

// --- Build memory (decides full history vs summary + recent) ---

export interface MemoryResult {
    /** Messages to pass to Gemini as history. */
    history: HistoryMessage[];
    /** If a new summary was generated, return it for caching. */
    newSummary?: string;
    /** ID of the last message included in the summary. */
    summarizedUpTo?: string;
    /** Whether summary was used (for logging). */
    usedSummary: boolean;
}

export async function buildMemory(opts: {
    apiKey: string;
    model: string;
    allMessages: HistoryMessage[];
    existingSummary?: string;
    existingSummarizedUpTo?: string;
}): Promise<MemoryResult> {
    const { apiKey, model, allMessages, existingSummary, existingSummarizedUpTo } = opts;

    const totalTokens = estimateTokens(allMessages);
    const budget = (MODEL_CONTEXT_LIMITS[model] || 1_000_000) * HISTORY_BUDGET_RATIO;

    // If everything fits — use full history, no summarization needed
    if (totalTokens <= budget) {
        return { history: allMessages, usedSummary: false };
    }

    // Need truncation: summary + sliding window of recent messages
    // Figure out which messages are already summarized vs new
    let summarizedIdx = -1;
    if (existingSummarizedUpTo) {
        summarizedIdx = allMessages.findIndex(m => m.id === existingSummarizedUpTo);
    }

    // Determine sliding window size — keep as many recent messages as budget allows
    // Reserve ~20% of budget for summary text
    const recentBudget = budget * 0.8;

    // Walk backwards from end to fill recent window
    let recentTokens = 0;
    let windowStart = allMessages.length;
    for (let i = allMessages.length - 1; i >= 0; i--) {
        const msgTokens =
            Math.ceil(allMessages[i].text.length / CHARS_PER_TOKEN) +
            (allMessages[i].attachments?.length || 0) * ATTACHMENT_TOKEN_ESTIMATE;
        if (recentTokens + msgTokens > recentBudget && windowStart < allMessages.length - MIN_RECENT_MESSAGES + 1) {
            break;
        }
        recentTokens += msgTokens;
        windowStart = i;
    }
    windowStart = Math.min(windowStart, Math.max(0, allMessages.length - MIN_RECENT_MESSAGES));

    const recentMessages = allMessages.slice(windowStart);

    // Determine messages that need to be summarized (those before the window)
    const messagesToSummarize = allMessages.slice(0, windowStart);

    // Check if we need a new summary
    let summary = existingSummary || "";
    let newSummary: string | undefined;
    let newSummarizedUpTo: string | undefined;

    if (messagesToSummarize.length > 0) {
        const lastSummarizedMsg = messagesToSummarize[messagesToSummarize.length - 1];

        // Only regenerate if there are unsummarized messages before the window
        if (lastSummarizedMsg.id !== existingSummarizedUpTo) {
            // Find messages that are new since last summary
            const newMessages = summarizedIdx >= 0
                ? messagesToSummarize.slice(summarizedIdx + 1)
                : messagesToSummarize;

            if (newMessages.length > 0) {
                summary = await generateSummary(apiKey, newMessages, existingSummary, model);
                newSummary = summary;
                newSummarizedUpTo = lastSummarizedMsg.id;
            }
        }
    }

    // Inject summary as a synthetic "model" message at the start
    const summaryMessage: HistoryMessage = {
        id: "__summary__",
        role: "model",
        text: `[Conversation Summary — Earlier Messages]\n\n${summary}`,
    };

    return {
        history: [summaryMessage, ...recentMessages],
        newSummary,
        summarizedUpTo: newSummarizedUpTo,
        usedSummary: true,
    };
}

// =============================================================================
// Layer 4: Conclude Conversation — Generate a focused memory for cross-chat use.
//
// Distinct from Layer 3 (generateSummary) which compresses history for context
// window management. This produces a PERMANENT actionable insight that will be
// injected into all future conversations.
// =============================================================================

const CONCLUDE_SYSTEM_PROMPT = `You are a knowledge extraction system. Your task is to distill a conversation \
into a concise, actionable memory that will be injected into future AI conversations.

CRITICAL: This memory will be the ONLY record of this conversation. It must be self-contained.

Extract and preserve:
1. **Decisions made** — what was chosen and why
2. **Strategies identified** — specific approaches, patterns, techniques learned
3. **Key data points** — concrete numbers, names, comparisons that support decisions
4. **Action items** — anything planned but not yet done
5. **Lessons learned** — insights about what works or doesn't

Do NOT include:
- Greetings, chitchat, or procedural back-and-forth
- Step-by-step conversation flow ("then I asked... then you said...")
- Redundant context that would already be in the attached data
- Video reference numbers like "Video 3" — always use the video's actual title instead

Format: Use bullet points grouped by topic. Be concise but complete.
Length: 100-300 words. Shorter is better if nothing is lost.
Language: Write the summary in the same language as the conversation.`;

/**
 * Layer 4: Generate a focused summary for cross-conversation memory.
 * Unlike Layer 3's generateSummary (context compression), this produces
 * a permanent actionable insight that will live in future system prompts.
 */
export async function generateConcludeSummary(
    apiKey: string,
    messages: HistoryMessage[],
    guidance: string | undefined,
    model: string
): Promise<{ text: string; tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    const { getClient } = await import("./gemini.js");
    const ai = await getClient(apiKey);

    const conversationText = messages
        .map(formatMessageForSummary)
        .join("\n\n");

    let userPrompt = `Extract the key insights from this conversation:\n\n${conversationText}`;

    if (guidance) {
        userPrompt += `\n\n---\n\nUser guidance — focus the summary on this:\n"${guidance}"`;
    }

    const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config: {
            systemInstruction: CONCLUDE_SYSTEM_PROMPT,
        },
    });

    const tokenUsage = {
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
    };

    return { text: response.text?.trim() || "", tokenUsage };
}
