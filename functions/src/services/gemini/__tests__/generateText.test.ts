import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock Gemini SDK ---
const mockGenerateContent = vi.fn();

vi.mock("../index.js", () => ({
    getClient: vi.fn().mockResolvedValue({
        models: { generateContent: (...args: unknown[]) => mockGenerateContent(...args) },
    }),
}));

// Import after mocks
import { geminiFactory } from "../factory.js";

describe("Gemini generateText", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const provider = geminiFactory({ apiKey: "test-key" });

    it("returns text and tokenUsage for plain text (no schema)", async () => {
        mockGenerateContent.mockResolvedValue({
            text: "Hello world",
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        });

        const result = await provider.generateText!({
            model: "gemini-2.5-pro",
            text: "Say hello",
        });

        expect(result.text).toBe("Hello world");
        expect(result.tokenUsage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, thinkingTokens: 0 });
        expect(result.parsed).toBeUndefined();
    });

    it("sends systemInstruction when systemPrompt is provided", async () => {
        mockGenerateContent.mockResolvedValue({
            text: "response",
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        });

        await provider.generateText!({
            model: "gemini-2.5-pro",
            text: "test",
            systemPrompt: "Be helpful",
        });

        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.config.systemInstruction).toBe("Be helpful");
    });

    it("returns parsed JSON with responseSchema", async () => {
        const jsonResponse = { memories: [{ title: "T", content: "C" }], reasoning: "R", noChangesNeeded: false };
        mockGenerateContent.mockResolvedValue({
            text: JSON.stringify(jsonResponse),
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
        });

        const result = await provider.generateText!({
            model: "gemini-2.5-pro",
            text: "Consolidate",
            responseSchema: { type: "object", properties: { memories: { type: "array" } } },
        });

        expect(result.parsed).toEqual(jsonResponse);
        expect(result.text).toBe(JSON.stringify(jsonResponse));
    });

    it("sets responseMimeType and converts schema to Gemini format", async () => {
        mockGenerateContent.mockResolvedValue({
            text: '{"ok": true}',
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        });

        await provider.generateText!({
            model: "gemini-2.5-pro",
            text: "test",
            responseSchema: { type: "object", properties: { ok: { type: "boolean" } } },
        });

        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.config.responseMimeType).toBe("application/json");
        expect(callArgs.config.responseSchema.type).toBe("OBJECT");
        expect(callArgs.config.responseSchema.properties.ok.type).toBe("BOOLEAN");
    });

    it("throws on JSON parse error when schema is provided", async () => {
        mockGenerateContent.mockResolvedValue({
            text: "not valid json",
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        });

        await expect(
            provider.generateText!({
                model: "gemini-2.5-pro",
                text: "test",
                responseSchema: { type: "object" },
            }),
        ).rejects.toThrow(/JSON parse failed/);
    });

    it("handles missing usageMetadata gracefully", async () => {
        mockGenerateContent.mockResolvedValue({ text: "hi", usageMetadata: undefined });

        const result = await provider.generateText!({
            model: "gemini-2.5-pro",
            text: "test",
        });

        expect(result.tokenUsage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0, thinkingTokens: 0 });
    });
});
