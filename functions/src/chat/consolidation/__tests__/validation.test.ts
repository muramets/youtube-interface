import { describe, it, expect, vi } from "vitest";

// Mock MODEL_REGISTRY before import
vi.mock("../../../shared/models.js", () => ({
    MODEL_REGISTRY: [
        { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", contextLimit: 1_000_000 },
        { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", contextLimit: 1_000_000 },
        { id: "claude-opus-4-6", label: "Claude Opus 4.6", contextLimit: 1_000_000 },
    ],
}));

vi.mock("../../../services/memory.js", () => ({
    CHARS_PER_TOKEN: 4,
}));

import { validateContentLimits } from "../validation.js";

describe("validateContentLimits", () => {
    it("passes for short text with known model", () => {
        // 1M context × 4 chars/token × 0.7 = 2,800,000 chars
        expect(() => validateContentLimits("short text", "gemini-2.5-pro")).not.toThrow();
    });

    it("throws for very long text exceeding context limit", () => {
        // 1M context × 4 × 0.7 = 2,800,000 chars limit
        const longText = "x".repeat(3_000_000);
        expect(() => validateContentLimits(longText, "gemini-2.5-pro"))
            .toThrow(/exceed the context window/);
    });

    it("includes model label in error message", () => {
        const longText = "x".repeat(3_000_000);
        expect(() => validateContentLimits(longText, "gemini-2.5-pro"))
            .toThrow(/Gemini 2.5 Pro/);
    });

    it("throws for unknown model", () => {
        expect(() => validateContentLimits("text", "unknown-model"))
            .toThrow(/Unknown model/);
    });

    it("works with different models", () => {
        expect(() => validateContentLimits("short", "claude-opus-4-6")).not.toThrow();
    });
});
