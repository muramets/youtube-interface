// =============================================================================
// Consolidation Prompt — System prompt, schema, user prompt builder, validator
//
// CONSOLIDATION_SCHEMA is the single source of truth: used both in the system
// prompt (as guidance) and in native structured output enforcement per provider.
// =============================================================================

// --- Schema (standard JSON Schema, lowercase types) ---

export const CONSOLIDATION_SCHEMA = {
    type: "object",
    properties: {
        memories: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    content: { type: "string" },
                },
                required: ["title", "content"],
            },
        },
        reasoning: { type: "string" },
        noChangesNeeded: { type: "boolean" },
    },
    required: ["memories", "reasoning", "noChangesNeeded"],
} as const;

// --- Result type ---

export interface ConsolidationResult {
    memories: Array<{ title: string; content: string }>;
    reasoning: string;
    noChangesNeeded: boolean;
    /** USD cost of the LLM call (computed server-side from ModelPricing). */
    costUsd?: number;
    /** Raw token counts for transparency. */
    tokens?: { input: number; output: number };
}

// --- System prompt ---

export const CONSOLIDATION_SYSTEM_PROMPT = `You are a memory consolidation system. Your task is to analyze multiple conversation memories and produce a smaller set of comprehensive, up-to-date memories that preserve all valuable information.

This is SYNTHESIS, not compression. You must:
1. Identify overlapping topics across memories and merge them into coherent units
2. Resolve contradictions — when memories disagree, the MORE RECENT one wins (check dates)
3. Remove obsolete information (completed action items, superseded decisions)
4. Preserve ALL specific details: video titles, numbers, dates, metric values, percentages
5. Keep the chronological context — when a decision was made matters

Structure each output memory with these markdown headers (omit empty sections):
## Decisions — what was chosen and why (with dates)
## Insights — patterns observed, lessons learned
## Channel State — current snapshot of metrics and situation
## Action Items — pending tasks (remove completed ones)
## Open Questions — unresolved issues

Video & Knowledge Item references:
- Input memories contain internal links: [video title](vid://VIDEO_ID) and [KI title](ki://kiId).
  These are rendered as interactive UI elements (clickable chips with tooltips).
- PRESERVE these links exactly as they appear — same title, same vid:// or ki:// URI, same markdown syntax.
- Do NOT convert vid:// links to plain text, YouTube URLs, or any other format.
- Do NOT strip or rewrite ki:// links.
- When merging content that references the same video from multiple memories, keep one [title](vid://ID) link.
- When referencing videos in newly written text, use [video title](vid://VIDEO_ID) format.

Rules:
- Output 1-5 memories. Split by TOPIC, not by source conversation.
  Good split: "Traffic Patterns" + "Content Strategy" + "Open Questions"
  Bad split: "From conversation 1" + "From conversation 2"
- Each memory: 100-500 words. Shorter is better if nothing is lost.
- If memories don't overlap and have no obsolete content — return them unchanged
  and set "noChangesNeeded" to true.
- Language: match the language of the input memories.
- Do NOT invent new insights — only reorganize and synthesize existing ones.
- Do NOT use vague references like "the video" — always use exact titles and vid:// links.
- When merging overlapping action items or open questions, keep the most specific formulation.

Return a JSON object with these fields:
- "memories": array of { "title": string, "content": string }
- "reasoning": string — 1-3 sentences explaining your consolidation logic
- "noChangesNeeded": boolean — true ONLY if input memories are already optimal
  When noChangesNeeded is true, set memories to an empty array [].
  When noChangesNeeded is false, memories MUST contain at least one item.`;

// --- User prompt builder ---

interface MemoryInput {
    title: string;
    content: string;
    createdAt: string;
}

/**
 * Build the user prompt from memories and optional intention.
 * Format matches crossConversationLayer: `### "Title" (date)\n{content}`.
 * Memories arrive pre-sorted by createdAt asc from frontend — we format as-is.
 */
export function buildUserPrompt(memories: MemoryInput[], intention?: string): string {
    const parts = ["Memories to consolidate:\n"];

    for (const mem of memories) {
        const date = mem.createdAt.slice(0, 10); // ISO → YYYY-MM-DD
        parts.push(`---\n### "${mem.title}" (${date})\n${mem.content}\n`);
    }

    parts.push("---");

    if (intention?.trim()) {
        parts.push(`\nUser's consolidation intent:\n"${intention.trim()}"`);
    }

    return parts.join("\n");
}

// --- Result validator ---

/**
 * Runtime validation of structured LLM output.
 * - noChangesNeeded: true → normalize to empty memories array
 * - noChangesNeeded: false + empty memories → error
 * - Validate each memory has non-empty title and content
 */
export function validateConsolidationResult(parsed: unknown): ConsolidationResult {
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Consolidation result is not an object");
    }

    const data = parsed as Record<string, unknown>;

    if (typeof data.reasoning !== "string") {
        throw new Error("Consolidation result missing 'reasoning' field");
    }

    if (typeof data.noChangesNeeded !== "boolean") {
        throw new Error("Consolidation result missing 'noChangesNeeded' field");
    }

    // No-op path: LLM decided memories are already optimal
    if (data.noChangesNeeded) {
        return {
            memories: [],
            reasoning: data.reasoning,
            noChangesNeeded: true,
        };
    }

    // Merge path: validate memories array
    if (!Array.isArray(data.memories) || data.memories.length === 0) {
        throw new Error("Model returned empty result — noChangesNeeded is false but no memories provided");
    }

    const memories: Array<{ title: string; content: string }> = [];
    for (const [i, mem] of (data.memories as unknown[]).entries()) {
        if (!mem || typeof mem !== "object") {
            throw new Error(`Memory at index ${i} is not an object`);
        }
        const m = mem as Record<string, unknown>;
        if (!m.title || typeof m.title !== "string" || !m.title.trim()) {
            throw new Error(`Memory at index ${i} has empty or missing title`);
        }
        if (!m.content || typeof m.content !== "string" || !m.content.trim()) {
            throw new Error(`Memory at index ${i} has empty or missing content`);
        }
        memories.push({ title: m.title.trim(), content: m.content.trim() });
    }

    return {
        memories,
        reasoning: data.reasoning,
        noChangesNeeded: false,
    };
}
