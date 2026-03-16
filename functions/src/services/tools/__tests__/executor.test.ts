// =============================================================================
// executeTool — characterization tests
//
// Lock down the existing dispatch/error-handling behavior of executeTool()
// before refactoring. Every test documents a specific contract the current
// implementation fulfils.
//
// Mocking strategy:
//   - Individual handler modules are mocked so executeTool can be tested as
//     a black box (dispatch + error wrapping).
//   - The executor module itself is NOT mocked.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — vi.hoisted() ensures fns exist when vi.mock factories run
// ---------------------------------------------------------------------------

const {
    mockHandleMentionVideo,
    mockHandleGetMultipleVideoDetails,
    mockHandleAnalyzeSuggestedTraffic,
    mockHandleViewThumbnails,
} = vi.hoisted(() => ({
    mockHandleMentionVideo: vi.fn(),
    mockHandleGetMultipleVideoDetails: vi.fn(),
    mockHandleAnalyzeSuggestedTraffic: vi.fn(),
    mockHandleViewThumbnails: vi.fn(),
}));

vi.mock("../handlers/utility/mentionVideo.js", () => ({
    handleMentionVideo: mockHandleMentionVideo,
}));

vi.mock("../handlers/detail/getMultipleVideoDetails.js", () => ({
    handleGetMultipleVideoDetails: mockHandleGetMultipleVideoDetails,
}));

vi.mock("../handlers/analysis/analyzeSuggestedTraffic.js", () => ({
    handleAnalyzeSuggestedTraffic: mockHandleAnalyzeSuggestedTraffic,
}));

vi.mock("../handlers/detail/viewThumbnails.js", () => ({
    handleViewThumbnails: mockHandleViewThumbnails,
}));

// ---------------------------------------------------------------------------
// Import the system-under-test AFTER mocks are in place
// ---------------------------------------------------------------------------

import { executeTool } from "../executor.js";
import type { ToolContext, FunctionCallInput } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
        userId: "user-123",
        channelId: "channel-456",
        ...overrides,
    };
}

function makeCall(
    name: string,
    args: Record<string, unknown> = {},
): FunctionCallInput {
    return { name, args };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeTool — dispatch logic", () => {
    it("routes 'mentionVideo' to handleMentionVideo and returns its result", async () => {
        const handlerResult = { found: true, videoId: "abc", title: "Test" };
        mockHandleMentionVideo.mockResolvedValue(handlerResult);

        const result = await executeTool(
            makeCall("mentionVideo", { videoId: "abc" }),
            makeCtx(),
        );

        expect(mockHandleMentionVideo).toHaveBeenCalledOnce();
        expect(result).toEqual({ name: "mentionVideo", response: handlerResult });
    });

    it("routes 'getMultipleVideoDetails' to its handler", async () => {
        const handlerResult = { videos: [{ videoId: "v1" }] };
        mockHandleGetMultipleVideoDetails.mockResolvedValue(handlerResult);

        const result = await executeTool(
            makeCall("getMultipleVideoDetails", { videoIds: ["v1"] }),
            makeCtx(),
        );

        expect(mockHandleGetMultipleVideoDetails).toHaveBeenCalledOnce();
        expect(result).toEqual({
            name: "getMultipleVideoDetails",
            response: handlerResult,
        });
    });

    it("routes 'analyzeSuggestedTraffic' to its handler", async () => {
        const handlerResult = { analysis: "data" };
        mockHandleAnalyzeSuggestedTraffic.mockResolvedValue(handlerResult);

        const result = await executeTool(
            makeCall("analyzeSuggestedTraffic", { videoId: "v1" }),
            makeCtx(),
        );

        expect(mockHandleAnalyzeSuggestedTraffic).toHaveBeenCalledOnce();
        expect(result).toEqual({
            name: "analyzeSuggestedTraffic",
            response: handlerResult,
        });
    });

    it("routes 'viewThumbnails' to its handler", async () => {
        const handlerResult = { videos: [], notFound: [] };
        mockHandleViewThumbnails.mockResolvedValue(handlerResult);

        const result = await executeTool(
            makeCall("viewThumbnails", { videoIds: ["v1"] }),
            makeCtx(),
        );

        expect(mockHandleViewThumbnails).toHaveBeenCalledOnce();
        expect(result).toEqual({
            name: "viewThumbnails",
            response: handlerResult,
        });
    });
});

describe("executeTool — result format", () => {
    it("result.name always matches the input call name", async () => {
        mockHandleMentionVideo.mockResolvedValue({ ok: true });

        const result = await executeTool(
            makeCall("mentionVideo", { videoId: "xyz" }),
            makeCtx(),
        );

        expect(result.name).toBe("mentionVideo");
    });

    it("result.response is the exact object returned by the handler", async () => {
        const payload = { found: true, videoId: "v1", title: "Title", extra: [1, 2] };
        mockHandleMentionVideo.mockResolvedValue(payload);

        const result = await executeTool(
            makeCall("mentionVideo", { videoId: "v1" }),
            makeCtx(),
        );

        expect(result.response).toBe(payload); // referential equality
    });
});

describe("executeTool — unknown tool handling", () => {
    it("returns a graceful error for an unknown tool name", async () => {
        const result = await executeTool(
            makeCall("nonExistentTool", { foo: "bar" }),
            makeCtx(),
        );

        expect(result).toEqual({
            name: "nonExistentTool",
            response: { error: "Unknown tool: nonExistentTool" },
        });
    });

    it("does not throw for an unknown tool name", async () => {
        await expect(
            executeTool(makeCall("unknownTool"), makeCtx()),
        ).resolves.toBeDefined();
    });

    it("preserves the unknown tool name in the returned result.name", async () => {
        const result = await executeTool(
            makeCall("totally_made_up"),
            makeCtx(),
        );

        expect(result.name).toBe("totally_made_up");
    });

    it("does not invoke any handler for an unknown tool", async () => {
        await executeTool(makeCall("ghost"), makeCtx());

        expect(mockHandleMentionVideo).not.toHaveBeenCalled();
        expect(mockHandleGetMultipleVideoDetails).not.toHaveBeenCalled();
        expect(mockHandleAnalyzeSuggestedTraffic).not.toHaveBeenCalled();
        expect(mockHandleViewThumbnails).not.toHaveBeenCalled();
    });
});

describe("executeTool — error handling", () => {
    it("catches a thrown Error and returns { error: error.message }", async () => {
        mockHandleMentionVideo.mockRejectedValue(new Error("Firestore timeout"));

        const result = await executeTool(
            makeCall("mentionVideo", { videoId: "v1" }),
            makeCtx(),
        );

        expect(result).toEqual({
            name: "mentionVideo",
            response: { error: "Firestore timeout" },
        });
    });

    it("catches a thrown string and returns generic error message", async () => {
        mockHandleMentionVideo.mockRejectedValue("unexpected string error");

        const result = await executeTool(
            makeCall("mentionVideo", { videoId: "v1" }),
            makeCtx(),
        );

        expect(result).toEqual({
            name: "mentionVideo",
            response: { error: "Tool execution failed" },
        });
    });

    it("catches a thrown number and returns generic error message", async () => {
        mockHandleMentionVideo.mockRejectedValue(42);

        const result = await executeTool(
            makeCall("mentionVideo", { videoId: "v1" }),
            makeCtx(),
        );

        expect(result).toEqual({
            name: "mentionVideo",
            response: { error: "Tool execution failed" },
        });
    });

    it("catches a thrown null and returns generic error message", async () => {
        mockHandleMentionVideo.mockRejectedValue(null);

        const result = await executeTool(
            makeCall("mentionVideo", { videoId: "v1" }),
            makeCtx(),
        );

        expect(result).toEqual({
            name: "mentionVideo",
            response: { error: "Tool execution failed" },
        });
    });

    it("never throws — always resolves even when handler rejects", async () => {
        mockHandleViewThumbnails.mockRejectedValue(new Error("boom"));

        await expect(
            executeTool(makeCall("viewThumbnails", { videoIds: [] }), makeCtx()),
        ).resolves.toBeDefined();
    });
});

describe("executeTool — argument and context forwarding", () => {
    it("passes args to the handler as the first argument", async () => {
        mockHandleMentionVideo.mockResolvedValue({ ok: true });
        const args = { videoId: "abc", extra: 123 };

        await executeTool(makeCall("mentionVideo", args), makeCtx());

        expect(mockHandleMentionVideo).toHaveBeenCalledWith(
            args,
            expect.any(Object),
        );
    });

    it("passes ToolContext to the handler as the second argument", async () => {
        mockHandleMentionVideo.mockResolvedValue({ ok: true });
        const ctx = makeCtx({ userId: "u-999", channelId: "ch-777" });

        await executeTool(makeCall("mentionVideo", { videoId: "x" }), ctx);

        expect(mockHandleMentionVideo).toHaveBeenCalledWith(
            expect.any(Object),
            ctx,
        );
    });

    it("passes reportProgress callback through to the handler", async () => {
        const reportProgress = vi.fn();
        mockHandleAnalyzeSuggestedTraffic.mockResolvedValue({ ok: true });

        const ctx = makeCtx({ reportProgress });

        await executeTool(
            makeCall("analyzeSuggestedTraffic", { videoId: "v1" }),
            ctx,
        );

        // Verify the handler received the context with reportProgress intact
        const receivedCtx = mockHandleAnalyzeSuggestedTraffic.mock.calls[0][1] as ToolContext;
        expect(receivedCtx.reportProgress).toBe(reportProgress);
    });

    it("works with empty args object", async () => {
        mockHandleMentionVideo.mockResolvedValue({ error: "videoId is required" });

        const result = await executeTool(makeCall("mentionVideo", {}), makeCtx());

        expect(mockHandleMentionVideo).toHaveBeenCalledWith({}, expect.any(Object));
        expect(result).toEqual({
            name: "mentionVideo",
            response: { error: "videoId is required" },
        });
    });

    it("works with ToolContext that has no reportProgress", async () => {
        mockHandleMentionVideo.mockResolvedValue({ found: true });

        const ctx: ToolContext = { userId: "u", channelId: "c" };
        const result = await executeTool(makeCall("mentionVideo", { videoId: "v1" }), ctx);

        expect(result.name).toBe("mentionVideo");
        expect(result.response).toEqual({ found: true });
    });
});
