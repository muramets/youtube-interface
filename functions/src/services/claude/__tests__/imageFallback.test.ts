// =============================================================================
// Image Download Fallback — unit tests
//
// Tests for isImageDownloadError() and convertUrlImagesToBase64():
//   - Suite A: isImageDownloadError — error detection
//   - Suite B: convertUrlImagesToBase64 — URL→base64 conversion
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { APIError } from "@anthropic-ai/sdk/error.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { isImageDownloadError, convertUrlImagesToBase64 } from "../streamChat.js";

/** Helper: create APIError with proper Headers object. */
function makeAPIError(status: number, message: string): APIError {
    return new APIError(
        status,
        { type: "error", error: { type: "invalid_request_error", message } },
        message,
        new Headers({ "request-id": "req_test" }),
    );
}

// ---------------------------------------------------------------------------
// fetch mock
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetchResponses(responses: Map<string, { ok: boolean; buffer?: ArrayBuffer; contentType?: string }>) {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        const mock = responses.get(url);
        if (!mock) {
            return { ok: false, status: 404 } as Response;
        }
        if (!mock.ok) {
            return { ok: false, status: 500 } as Response;
        }
        return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": mock.contentType ?? "image/jpeg" }),
            arrayBuffer: async () => mock.buffer ?? new ArrayBuffer(8),
        } as unknown as Response;
    });
}

// ---------------------------------------------------------------------------
// Suite A: isImageDownloadError
// ---------------------------------------------------------------------------

describe("isImageDownloadError", () => {
    it("returns true for 400 APIError with 'Unable to download the file' message", () => {
        const error = makeAPIError(400, "Unable to download the file. Please verify the URL and try again.");
        expect(isImageDownloadError(error)).toBe(true);
    });

    it("returns false for 400 APIError with different message", () => {
        const error = makeAPIError(400, "Invalid model");
        expect(isImageDownloadError(error)).toBe(false);
    });

    it("returns false for 429 rate limit error", () => {
        const error = makeAPIError(429, "Rate limited");
        expect(isImageDownloadError(error)).toBe(false);
    });

    it("returns false for non-APIError", () => {
        expect(isImageDownloadError(new Error("Unable to download the file"))).toBe(false);
    });

    it("returns false for non-Error values", () => {
        expect(isImageDownloadError("Unable to download the file")).toBe(false);
        expect(isImageDownloadError(null)).toBe(false);
        expect(isImageDownloadError(undefined)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Suite B: convertUrlImagesToBase64
// ---------------------------------------------------------------------------

describe("convertUrlImagesToBase64", () => {
    beforeEach(() => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it("returns 0/0 when no messages have image blocks", async () => {
        const messages: MessageParam[] = [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi there" },
        ];
        const result = await convertUrlImagesToBase64(messages);
        expect(result).toEqual({ converted: 0, failed: 0 });
    });

    it("converts URL image blocks to base64 in place", async () => {
        const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]).buffer;
        mockFetchResponses(new Map([
            ["https://i.ytimg.com/vi/abc123/hqdefault.jpg", { ok: true, buffer: jpegBytes, contentType: "image/jpeg" }],
        ]));

        const messages: MessageParam[] = [
            {
                role: "user",
                content: [
                    {
                        type: "image",
                        source: { type: "url", url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg" },
                    },
                    { type: "text", text: "Analyze this" },
                ],
            },
        ];

        const result = await convertUrlImagesToBase64(messages);
        expect(result).toEqual({ converted: 1, failed: 0 });

        // Verify in-place mutation
        const imgBlock = (messages[0].content as Array<Record<string, unknown>>)[0];
        expect(imgBlock.type).toBe("image");
        const source = imgBlock.source as Record<string, unknown>;
        expect(source.type).toBe("base64");
        expect(source.media_type).toBe("image/jpeg");
        expect(typeof source.data).toBe("string");
    });

    it("handles multiple images across multiple messages", async () => {
        const buffer = new Uint8Array([1, 2, 3]).buffer;
        mockFetchResponses(new Map([
            ["https://i.ytimg.com/vi/a/hqdefault.jpg", { ok: true, buffer, contentType: "image/jpeg" }],
            ["https://i.ytimg.com/vi/b/hqdefault.jpg", { ok: true, buffer, contentType: "image/jpeg" }],
            ["https://i.ytimg.com/vi/c/hqdefault.jpg", { ok: true, buffer, contentType: "image/png" }],
        ]));

        const messages: MessageParam[] = [
            {
                role: "user",
                content: [
                    { type: "image", source: { type: "url", url: "https://i.ytimg.com/vi/a/hqdefault.jpg" } },
                    { type: "text", text: "First message" },
                ],
            },
            {
                role: "user",
                content: [
                    { type: "tool_result", tool_use_id: "t1", content: [
                        { type: "text", text: '{"ok":true}' },
                        { type: "image", source: { type: "url", url: "https://i.ytimg.com/vi/b/hqdefault.jpg" } },
                        { type: "image", source: { type: "url", url: "https://i.ytimg.com/vi/c/hqdefault.jpg" } },
                    ] },
                ],
            },
        ];

        const result = await convertUrlImagesToBase64(messages);
        expect(result).toEqual({ converted: 3, failed: 0 });
    });

    it("replaces failed downloads with text placeholder", async () => {
        mockFetchResponses(new Map([
            ["https://i.ytimg.com/vi/ok/hqdefault.jpg", { ok: true, buffer: new ArrayBuffer(4), contentType: "image/jpeg" }],
            ["https://i.ytimg.com/vi/broken/hqdefault.jpg", { ok: false }],
        ]));

        const messages: MessageParam[] = [
            {
                role: "user",
                content: [
                    { type: "image", source: { type: "url", url: "https://i.ytimg.com/vi/ok/hqdefault.jpg" } },
                    { type: "image", source: { type: "url", url: "https://i.ytimg.com/vi/broken/hqdefault.jpg" } },
                    { type: "text", text: "Check these" },
                ],
            },
        ];

        const result = await convertUrlImagesToBase64(messages);
        expect(result).toEqual({ converted: 1, failed: 1 });

        const content = messages[0].content as Array<Record<string, unknown>>;
        // First image: converted to base64
        expect((content[0].source as Record<string, unknown>).type).toBe("base64");
        // Second image: replaced with text
        expect(content[1].type).toBe("text");
        expect(content[1].text).toBe("[Thumbnail unavailable]");
    });

    it("skips already-base64 images", async () => {
        const messages: MessageParam[] = [
            {
                role: "user",
                content: [
                    {
                        type: "image",
                        source: { type: "base64", data: "abc123", media_type: "image/jpeg" },
                    },
                ],
            },
        ];

        const result = await convertUrlImagesToBase64(messages);
        expect(result).toEqual({ converted: 0, failed: 0 });
    });

    it("infers media type from URL extension", async () => {
        const buffer = new ArrayBuffer(4);
        mockFetchResponses(new Map([
            ["https://example.com/image.png", { ok: true, buffer, contentType: "" }],
            ["https://example.com/image.webp", { ok: true, buffer, contentType: "" }],
        ]));

        const messages: MessageParam[] = [
            {
                role: "user",
                content: [
                    { type: "image", source: { type: "url", url: "https://example.com/image.png" } },
                    { type: "image", source: { type: "url", url: "https://example.com/image.webp" } },
                ],
            },
        ];

        await convertUrlImagesToBase64(messages);

        const content = messages[0].content as Array<Record<string, unknown>>;
        expect((content[0].source as Record<string, unknown>).media_type).toBe("image/png");
        expect((content[1].source as Record<string, unknown>).media_type).toBe("image/webp");
    });

    it("handles tool_result content blocks with nested images", async () => {
        const buffer = new ArrayBuffer(4);
        mockFetchResponses(new Map([
            ["https://i.ytimg.com/vi/x/hqdefault.jpg", { ok: true, buffer, contentType: "image/jpeg" }],
        ]));

        const messages: MessageParam[] = [
            {
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: "toolu_123",
                        content: [
                            { type: "text", text: '{"videos":[]}' },
                            { type: "image", source: { type: "url", url: "https://i.ytimg.com/vi/x/hqdefault.jpg" } },
                        ],
                    },
                ],
            },
        ];

        const result = await convertUrlImagesToBase64(messages);
        expect(result).toEqual({ converted: 1, failed: 0 });
    });

    it("downloads all images in parallel", async () => {
        const callOrder: string[] = [];
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            callOrder.push(url);
            return {
                ok: true,
                status: 200,
                headers: new Headers({ "content-type": "image/jpeg" }),
                arrayBuffer: async () => new ArrayBuffer(4),
            } as unknown as Response;
        });

        const messages: MessageParam[] = [
            {
                role: "user",
                content: [
                    { type: "image", source: { type: "url", url: "https://a.com/1.jpg" } },
                    { type: "image", source: { type: "url", url: "https://b.com/2.jpg" } },
                    { type: "image", source: { type: "url", url: "https://c.com/3.jpg" } },
                ],
            },
        ];

        await convertUrlImagesToBase64(messages);

        // All 3 fetched (parallel — order may vary)
        expect(callOrder).toHaveLength(3);
        expect(new Set(callOrder)).toEqual(new Set(["https://a.com/1.jpg", "https://b.com/2.jpg", "https://c.com/3.jpg"]));
    });
});
