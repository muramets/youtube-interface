import { describe, it, expect } from "vitest";
import { buildUserPrompt, validateConsolidationResult } from "../prompt.js";

// ---------------------------------------------------------------------------
// buildUserPrompt
// ---------------------------------------------------------------------------

describe("buildUserPrompt", () => {
    const memories = [
        { title: "Session 1", content: "Content A", createdAt: "2026-01-15T10:00:00Z" },
        { title: "Session 2", content: "Content B", createdAt: "2026-02-20T14:00:00Z" },
    ];

    it("formats memories in crossConversationLayer pattern", () => {
        const result = buildUserPrompt(memories);

        expect(result).toContain('### "Session 1" (2026-01-15)');
        expect(result).toContain("Content A");
        expect(result).toContain('### "Session 2" (2026-02-20)');
        expect(result).toContain("Content B");
    });

    it("preserves memory order (no re-sorting)", () => {
        const result = buildUserPrompt(memories);
        const idx1 = result.indexOf("Session 1");
        const idx2 = result.indexOf("Session 2");
        expect(idx1).toBeLessThan(idx2);
    });

    it("appends intention when provided", () => {
        const result = buildUserPrompt(memories, "merge session summaries");
        expect(result).toContain("User's consolidation intent:");
        expect(result).toContain('"merge session summaries"');
    });

    it("does not include intention section when omitted", () => {
        const result = buildUserPrompt(memories);
        expect(result).not.toContain("consolidation intent");
    });

    it("does not include intention section when empty string", () => {
        const result = buildUserPrompt(memories, "   ");
        expect(result).not.toContain("consolidation intent");
    });
});

// ---------------------------------------------------------------------------
// validateConsolidationResult
// ---------------------------------------------------------------------------

describe("validateConsolidationResult", () => {
    it("noChangesNeeded: true → returns normalized result with empty memories", () => {
        const input = {
            memories: [{ title: "X", content: "Y" }], // should be ignored
            reasoning: "Memories are independent",
            noChangesNeeded: true,
        };

        const result = validateConsolidationResult(input);

        expect(result.noChangesNeeded).toBe(true);
        expect(result.memories).toEqual([]);
        expect(result.reasoning).toBe("Memories are independent");
    });

    it("noChangesNeeded: false + valid memories → passes through", () => {
        const input = {
            memories: [
                { title: "Traffic Patterns", content: "Long analysis..." },
                { title: "Content Strategy", content: "Key decisions..." },
            ],
            reasoning: "Merged by topic",
            noChangesNeeded: false,
        };

        const result = validateConsolidationResult(input);

        expect(result.noChangesNeeded).toBe(false);
        expect(result.memories).toHaveLength(2);
        expect(result.memories[0].title).toBe("Traffic Patterns");
    });

    it("noChangesNeeded: false + empty memories → throws", () => {
        expect(() => validateConsolidationResult({
            memories: [],
            reasoning: "Oops",
            noChangesNeeded: false,
        })).toThrow(/empty result/);
    });

    it("memory with empty title → throws", () => {
        expect(() => validateConsolidationResult({
            memories: [{ title: "", content: "Some content" }],
            reasoning: "R",
            noChangesNeeded: false,
        })).toThrow(/empty or missing title/);
    });

    it("memory with empty content → throws", () => {
        expect(() => validateConsolidationResult({
            memories: [{ title: "T", content: "  " }],
            reasoning: "R",
            noChangesNeeded: false,
        })).toThrow(/empty or missing content/);
    });

    it("non-object input → throws", () => {
        expect(() => validateConsolidationResult("string")).toThrow(/not an object/);
        expect(() => validateConsolidationResult(null)).toThrow(/not an object/);
    });

    it("missing reasoning → throws", () => {
        expect(() => validateConsolidationResult({
            memories: [],
            noChangesNeeded: true,
        })).toThrow(/missing 'reasoning'/);
    });

    it("missing noChangesNeeded → throws", () => {
        expect(() => validateConsolidationResult({
            memories: [],
            reasoning: "R",
        })).toThrow(/missing 'noChangesNeeded'/);
    });

    it("trims title and content whitespace", () => {
        const result = validateConsolidationResult({
            memories: [{ title: "  Trimmed  ", content: "  Content  " }],
            reasoning: "R",
            noChangesNeeded: false,
        });
        expect(result.memories[0].title).toBe("Trimmed");
        expect(result.memories[0].content).toBe("Content");
    });
});
