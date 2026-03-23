import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock Claude SDK ---
const mockFinalMessage = vi.fn();
const mockStream = vi.fn(() => ({ finalMessage: () => mockFinalMessage() }));

vi.mock("../client.js", () => ({
    getClaudeClient: vi.fn().mockResolvedValue({
        messages: { stream: (...args: unknown[]) => mockStream(...args) },
    }),
}));

// Mock MODEL_REGISTRY for max_tokens resolution
vi.mock("../../../shared/models.js", () => ({
    MODEL_REGISTRY: [
        { id: "claude-opus-4-6", maxOutputTokens: 128_000, thinkingOptions: [{ id: "off", label: "Off", value: "off" }], thinkingDefault: "off", thinkingMode: "adaptive" },
        { id: "claude-sonnet-4-6", maxOutputTokens: 64_000, thinkingOptions: [{ id: "off", label: "Off", value: "off" }], thinkingDefault: "off", thinkingMode: "adaptive" },
    ],
}));

import { claudeFactory } from "../factory.js";

describe("Claude generateText", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const provider = claudeFactory({ apiKey: "sk-test" });

    it("returns text and tokenUsage for plain text (no schema)", async () => {
        mockFinalMessage.mockResolvedValue({
            content: [{ type: "text", text: "Hello world" }],
            usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await provider.generateText!({
            model: "claude-opus-4-6",
            text: "Say hello",
        });

        expect(result.text).toBe("Hello world");
        expect(result.tokenUsage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, thinkingTokens: 0 });
        expect(result.parsed).toBeUndefined();
    });

    it("uses tool_use pattern with responseSchema", async () => {
        const parsedResult = { memories: [], reasoning: "OK", noChangesNeeded: true };
        mockFinalMessage.mockResolvedValue({
            content: [{ type: "tool_use", id: "t1", name: "respond", input: parsedResult }],
            usage: { input_tokens: 100, output_tokens: 50 },
        });

        const result = await provider.generateText!({
            model: "claude-opus-4-6",
            text: "Consolidate",
            responseSchema: { type: "object" },
        });

        expect(result.parsed).toEqual(parsedResult);
        expect(result.tokenUsage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150, thinkingTokens: 0 });

        // Verify tool_choice was forced
        const params = mockStream.mock.calls[0][0];
        expect(params.tools).toEqual([
            expect.objectContaining({ name: "respond", input_schema: { type: "object" } }),
        ]);
        expect(params.tool_choice).toEqual({ type: "tool", name: "respond" });
    });

    it("throws when tool_use block is missing in schema response", async () => {
        mockFinalMessage.mockResolvedValue({
            content: [{ type: "text", text: "oops" }],
            usage: { input_tokens: 10, output_tokens: 5 },
        });

        await expect(
            provider.generateText!({
                model: "claude-opus-4-6",
                text: "test",
                responseSchema: { type: "object" },
            }),
        ).rejects.toThrow(/Expected tool_use block/);
    });

    it("resolves max_tokens from MODEL_REGISTRY for known model", async () => {
        mockFinalMessage.mockResolvedValue({
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 1, output_tokens: 1 },
        });

        await provider.generateText!({
            model: "claude-opus-4-6",
            text: "test",
        });

        const params = mockStream.mock.calls[0][0];
        expect(params.max_tokens).toBe(128_000);
    });

    it("uses fallback max_tokens for unknown model", async () => {
        mockFinalMessage.mockResolvedValue({
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 1, output_tokens: 1 },
        });

        await provider.generateText!({
            model: "claude-unknown-model",
            text: "test",
        });

        const params = mockStream.mock.calls[0][0];
        expect(params.max_tokens).toBe(16384);
    });

    it("sends system prompt when provided", async () => {
        mockFinalMessage.mockResolvedValue({
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 1, output_tokens: 1 },
        });

        await provider.generateText!({
            model: "claude-opus-4-6",
            text: "test",
            systemPrompt: "Be concise",
        });

        const params = mockStream.mock.calls[0][0];
        expect(params.system).toBe("Be concise");
    });

    it("does not send system param when systemPrompt is omitted", async () => {
        mockFinalMessage.mockResolvedValue({
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 1, output_tokens: 1 },
        });

        await provider.generateText!({
            model: "claude-opus-4-6",
            text: "test",
        });

        const params = mockStream.mock.calls[0][0];
        expect(params.system).toBeUndefined();
    });

    it("does not include tools/tool_choice when no schema", async () => {
        mockFinalMessage.mockResolvedValue({
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 1, output_tokens: 1 },
        });

        await provider.generateText!({
            model: "claude-opus-4-6",
            text: "test",
        });

        const params = mockStream.mock.calls[0][0];
        expect(params.tools).toBeUndefined();
        expect(params.tool_choice).toBeUndefined();
    });
});
