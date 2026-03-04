// =============================================================================
// executeToolBatch — unit tests
//
// Tests the shared tool dispatch orchestrator that all AI providers use.
// Verifies callback ordering, image processing, batch index offsets,
// and progress reporting wiring.
//
// Mocking strategy:
//   - `executeTool` from tools/executor is mocked to return predictable results.
//   - The toolExecution module is the system-under-test.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — vi.hoisted() ensures the fn exists when the factory runs
// ---------------------------------------------------------------------------

const { mockExecuteTool } = vi.hoisted(() => ({
    mockExecuteTool: vi.fn(),
}));

vi.mock("../../tools/executor.js", () => ({
    executeTool: mockExecuteTool,
}));

// ---------------------------------------------------------------------------
// Import the system-under-test AFTER mocks are in place
// ---------------------------------------------------------------------------

import {
    executeToolBatch,
    type ExecuteToolBatchOpts,
    type ProcessImagesResult,
} from "../toolExecution.js";
import type { ToolContext } from "../../tools/types.js";
import type { StreamCallbacks } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
        userId: "user-test",
        channelId: "channel-test",
        ...overrides,
    };
}

function makeCallbacks(
    overrides: Partial<Pick<StreamCallbacks, "onToolCall" | "onToolResult" | "onToolProgress">> = {},
): Pick<StreamCallbacks, "onToolCall" | "onToolResult" | "onToolProgress"> {
    return {
        onToolCall: vi.fn(),
        onToolResult: vi.fn(),
        onToolProgress: vi.fn(),
        ...overrides,
    };
}

/** Build a predictable executeTool result for a given tool name. */
function fakeExecuteToolResult(name: string, response: Record<string, unknown> = {}) {
    return { name, response };
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

describe("executeToolBatch — single tool call", () => {
    it("fires callbacks in order: onToolCall, then execute, then onToolResult", async () => {
        const callOrder: string[] = [];

        const callbacks = {
            onToolCall: vi.fn(() => callOrder.push("onToolCall")),
            onToolResult: vi.fn(() => callOrder.push("onToolResult")),
            onToolProgress: vi.fn(),
        };

        mockExecuteTool.mockImplementation(async () => {
            callOrder.push("executeTool");
            return fakeExecuteToolResult("mentionVideo", { found: true });
        });

        const opts: ExecuteToolBatchOpts = {
            calls: [{ name: "mentionVideo", args: { videoId: "v1" } }],
            toolContext: makeToolContext(),
            callbacks,
            batchStartIndex: 0,
        };

        await executeToolBatch(opts);

        expect(callOrder).toEqual(["onToolCall", "executeTool", "onToolResult"]);
    });

    it("returns the correct ToolBatchResult for a single tool", async () => {
        mockExecuteTool.mockResolvedValue(
            fakeExecuteToolResult("mentionVideo", { found: true, videoId: "v1" }),
        );

        const result = await executeToolBatch({
            calls: [{ name: "mentionVideo", args: { videoId: "v1" } }],
            toolContext: makeToolContext(),
            callbacks: makeCallbacks(),
            batchStartIndex: 0,
        });

        expect(result.results).toHaveLength(1);
        expect(result.results[0]).toEqual({
            name: "mentionVideo",
            args: { videoId: "v1" },
            result: { found: true, videoId: "v1" },
            imageUrls: undefined,
        });
        expect(result.blockedCount).toBeUndefined();
    });
});

describe("executeToolBatch — batch of 3 tools", () => {
    it("fires all onToolCall callbacks before any executeTool call", async () => {
        const callOrder: string[] = [];

        const callbacks = {
            onToolCall: vi.fn((name: string) => {
                callOrder.push(`onToolCall:${name}`);
            }),
            onToolResult: vi.fn(),
            onToolProgress: vi.fn(),
        };

        mockExecuteTool.mockImplementation(
            async (call: { name: string; args: Record<string, unknown> }) => {
                callOrder.push(`executeTool:${call.name}`);
                return fakeExecuteToolResult(call.name, { ok: true });
            },
        );

        await executeToolBatch({
            calls: [
                { name: "toolA", args: { a: 1 } },
                { name: "toolB", args: { b: 2 } },
                { name: "toolC", args: { c: 3 } },
            ],
            toolContext: makeToolContext(),
            callbacks,
            batchStartIndex: 0,
        });

        // All onToolCall entries should appear before the first executeTool entry
        // (use findIndex to avoid microtask scheduling assumptions about which tool runs first)
        const firstExecIdx = callOrder.findIndex((e) => e.startsWith("executeTool:"));
        const onToolCallEntries = callOrder.filter((e) => e.startsWith("onToolCall:"));

        expect(onToolCallEntries).toHaveLength(3);
        expect(firstExecIdx).toBeGreaterThanOrEqual(3);
        for (const entry of onToolCallEntries) {
            expect(callOrder.indexOf(entry)).toBeLessThan(firstExecIdx);
        }
    });

    it("returns results for all 3 tools", async () => {
        mockExecuteTool.mockImplementation(
            async (call: { name: string; args: Record<string, unknown> }) =>
                fakeExecuteToolResult(call.name, { done: true }),
        );

        const result = await executeToolBatch({
            calls: [
                { name: "toolA", args: { a: 1 } },
                { name: "toolB", args: { b: 2 } },
                { name: "toolC", args: { c: 3 } },
            ],
            toolContext: makeToolContext(),
            callbacks: makeCallbacks(),
            batchStartIndex: 0,
        });

        expect(result.results).toHaveLength(3);
        expect(result.results.map((r) => r.name)).toEqual(["toolA", "toolB", "toolC"]);
    });
});

describe("executeToolBatch — processImages callback", () => {
    it("calls processImages for each result and forwards imageUrls to ToolExecEntry", async () => {
        mockExecuteTool.mockResolvedValue(
            fakeExecuteToolResult("viewThumbnails", {
                videos: [{ id: "v1" }],
                rawImages: ["img1.jpg", "img2.jpg"],
            }),
        );

        const processImages = vi.fn(
            async (response: Record<string, unknown>): Promise<ProcessImagesResult> => {
                const { rawImages, ...cleaned } = response;
                return {
                    imageUrls: rawImages as string[],
                    cleanedResponse: cleaned,
                    blockedCount: 0,
                };
            },
        );

        const result = await executeToolBatch({
            calls: [{ name: "viewThumbnails", args: { videoIds: ["v1"] } }],
            toolContext: makeToolContext(),
            callbacks: makeCallbacks(),
            batchStartIndex: 0,
            processImages,
        });

        expect(processImages).toHaveBeenCalledOnce();
        expect(processImages).toHaveBeenCalledWith({
            videos: [{ id: "v1" }],
            rawImages: ["img1.jpg", "img2.jpg"],
        });

        expect(result.results[0].imageUrls).toEqual(["img1.jpg", "img2.jpg"]);
        // rawImages should be stripped from the result
        expect(result.results[0].result).toEqual({ videos: [{ id: "v1" }] });
    });

    it("aggregates blockedCount across multiple tools", async () => {
        mockExecuteTool
            .mockResolvedValueOnce(fakeExecuteToolResult("toolA", { data: "a" }))
            .mockResolvedValueOnce(fakeExecuteToolResult("toolB", { data: "b" }));

        const processImages = vi.fn()
            .mockResolvedValueOnce({
                imageUrls: [],
                cleanedResponse: { data: "a" },
                blockedCount: 2,
            } satisfies ProcessImagesResult)
            .mockResolvedValueOnce({
                imageUrls: [],
                cleanedResponse: { data: "b" },
                blockedCount: 3,
            } satisfies ProcessImagesResult);

        const result = await executeToolBatch({
            calls: [
                { name: "toolA", args: {} },
                { name: "toolB", args: {} },
            ],
            toolContext: makeToolContext(),
            callbacks: makeCallbacks(),
            batchStartIndex: 0,
            processImages,
        });

        expect(result.blockedCount).toBe(5);
    });

    it("does not set imageUrls when processImages returns empty array", async () => {
        mockExecuteTool.mockResolvedValue(
            fakeExecuteToolResult("toolA", { data: "value" }),
        );

        const processImages = vi.fn(async (): Promise<ProcessImagesResult> => ({
            imageUrls: [],
            cleanedResponse: { data: "value" },
        }));

        const result = await executeToolBatch({
            calls: [{ name: "toolA", args: {} }],
            toolContext: makeToolContext(),
            callbacks: makeCallbacks(),
            batchStartIndex: 0,
            processImages,
        });

        expect(result.results[0].imageUrls).toBeUndefined();
    });
});

describe("executeToolBatch — no processImages callback", () => {
    it("uses raw response as-is and does not set imageUrls", async () => {
        const rawResponse = { videos: [{ id: "v1" }], someField: "data" };
        mockExecuteTool.mockResolvedValue(
            fakeExecuteToolResult("viewThumbnails", rawResponse),
        );

        const result = await executeToolBatch({
            calls: [{ name: "viewThumbnails", args: { videoIds: ["v1"] } }],
            toolContext: makeToolContext(),
            callbacks: makeCallbacks(),
            batchStartIndex: 0,
            // processImages intentionally omitted
        });

        expect(result.results[0].result).toEqual(rawResponse);
        expect(result.results[0].imageUrls).toBeUndefined();
        expect(result.blockedCount).toBeUndefined();
    });
});

describe("executeToolBatch — batchStartIndex offset", () => {
    it("passes offset indices to onToolCall and onToolResult", async () => {
        mockExecuteTool.mockImplementation(
            async (call: { name: string; args: Record<string, unknown> }) =>
                fakeExecuteToolResult(call.name, { ok: true }),
        );

        const callbacks = makeCallbacks();

        await executeToolBatch({
            calls: [
                { name: "toolA", args: { a: 1 } },
                { name: "toolB", args: { b: 2 } },
                { name: "toolC", args: { c: 3 } },
            ],
            toolContext: makeToolContext(),
            callbacks,
            batchStartIndex: 5,
        });

        // onToolCall should receive indices 5, 6, 7
        expect(callbacks.onToolCall).toHaveBeenCalledTimes(3);
        expect(callbacks.onToolCall).toHaveBeenNthCalledWith(1, "toolA", { a: 1 }, 5);
        expect(callbacks.onToolCall).toHaveBeenNthCalledWith(2, "toolB", { b: 2 }, 6);
        expect(callbacks.onToolCall).toHaveBeenNthCalledWith(3, "toolC", { c: 3 }, 7);

        // onToolResult should also receive indices 5, 6, 7
        expect(callbacks.onToolResult).toHaveBeenCalledTimes(3);
        expect(callbacks.onToolResult).toHaveBeenNthCalledWith(1, "toolA", { ok: true }, 5);
        expect(callbacks.onToolResult).toHaveBeenNthCalledWith(2, "toolB", { ok: true }, 6);
        expect(callbacks.onToolResult).toHaveBeenNthCalledWith(3, "toolC", { ok: true }, 7);
    });

    it("first tool gets the exact batchStartIndex value", async () => {
        mockExecuteTool.mockResolvedValue(
            fakeExecuteToolResult("singleTool", { result: "data" }),
        );

        const callbacks = makeCallbacks();

        await executeToolBatch({
            calls: [{ name: "singleTool", args: {} }],
            toolContext: makeToolContext(),
            callbacks,
            batchStartIndex: 10,
        });

        expect(callbacks.onToolCall).toHaveBeenCalledWith("singleTool", {}, 10);
        expect(callbacks.onToolResult).toHaveBeenCalledWith("singleTool", { result: "data" }, 10);
    });
});

describe("executeToolBatch — reportProgress wiring", () => {
    it("wires toolContext.reportProgress to onToolProgress callback", async () => {
        const callbacks = makeCallbacks();

        mockExecuteTool.mockImplementation(
            async (
                _call: { name: string; args: Record<string, unknown> },
                ctx: ToolContext,
            ) => {
                // Simulate the tool calling reportProgress during execution
                ctx.reportProgress?.("Loading data...");
                ctx.reportProgress?.("Processing complete");
                return fakeExecuteToolResult("analyzeSuggestedTraffic", { analysis: "done" });
            },
        );

        await executeToolBatch({
            calls: [{ name: "analyzeSuggestedTraffic", args: { videoId: "v1" } }],
            toolContext: makeToolContext(),
            callbacks,
            batchStartIndex: 0,
        });

        expect(callbacks.onToolProgress).toHaveBeenCalledTimes(2);
        expect(callbacks.onToolProgress).toHaveBeenNthCalledWith(
            1,
            "analyzeSuggestedTraffic",
            "Loading data...",
            0,
        );
        expect(callbacks.onToolProgress).toHaveBeenNthCalledWith(
            2,
            "analyzeSuggestedTraffic",
            "Processing complete",
            0,
        );
    });

    it("wires reportProgress with correct offset index for batched tools", async () => {
        const callbacks = makeCallbacks();

        mockExecuteTool.mockImplementation(
            async (
                call: { name: string; args: Record<string, unknown> },
                ctx: ToolContext,
            ) => {
                if (call.name === "toolB") {
                    ctx.reportProgress?.("Step 1 of toolB");
                }
                return fakeExecuteToolResult(call.name, { ok: true });
            },
        );

        await executeToolBatch({
            calls: [
                { name: "toolA", args: {} },
                { name: "toolB", args: {} },
            ],
            toolContext: makeToolContext(),
            callbacks,
            batchStartIndex: 3,
        });

        // toolB is at index 1 in the batch, with batchStartIndex=3 → callIndex=4
        expect(callbacks.onToolProgress).toHaveBeenCalledWith("toolB", "Step 1 of toolB", 4);
    });

    it("does not crash when onToolProgress is undefined", async () => {
        mockExecuteTool.mockImplementation(
            async (
                _call: { name: string; args: Record<string, unknown> },
                ctx: ToolContext,
            ) => {
                // reportProgress should be safe to call even if onToolProgress is not provided
                ctx.reportProgress?.("test progress");
                return fakeExecuteToolResult("toolA", { ok: true });
            },
        );

        const callbacks = {
            onToolCall: vi.fn(),
            onToolResult: vi.fn(),
            // onToolProgress intentionally omitted
        };

        // Should not throw
        await expect(
            executeToolBatch({
                calls: [{ name: "toolA", args: {} }],
                toolContext: makeToolContext(),
                callbacks,
                batchStartIndex: 0,
            }),
        ).resolves.toBeDefined();
    });
});

describe("executeToolBatch — error propagation", () => {
    it("rejects the entire batch if any tool throws", async () => {
        mockExecuteTool
            .mockResolvedValueOnce(fakeExecuteToolResult("toolA", { ok: true }))
            .mockRejectedValueOnce(new Error("toolB exploded"));

        await expect(
            executeToolBatch({
                calls: [
                    { name: "toolA", args: {} },
                    { name: "toolB", args: {} },
                ],
                toolContext: makeToolContext(),
                callbacks: makeCallbacks(),
                batchStartIndex: 0,
            }),
        ).rejects.toThrow("toolB exploded");
    });
});

describe("executeToolBatch — optional callback resilience", () => {
    it("works when onToolCall is undefined", async () => {
        mockExecuteTool.mockResolvedValue(
            fakeExecuteToolResult("toolA", { ok: true }),
        );

        const callbacks = {
            onToolResult: vi.fn(),
            onToolProgress: vi.fn(),
        };

        const result = await executeToolBatch({
            calls: [{ name: "toolA", args: {} }],
            toolContext: makeToolContext(),
            callbacks,
            batchStartIndex: 0,
        });

        expect(result.results).toHaveLength(1);
        expect(callbacks.onToolResult).toHaveBeenCalledOnce();
    });

    it("works when onToolResult is undefined", async () => {
        mockExecuteTool.mockResolvedValue(
            fakeExecuteToolResult("toolA", { ok: true }),
        );

        const callbacks = {
            onToolCall: vi.fn(),
            onToolProgress: vi.fn(),
        };

        const result = await executeToolBatch({
            calls: [{ name: "toolA", args: {} }],
            toolContext: makeToolContext(),
            callbacks,
            batchStartIndex: 0,
        });

        expect(result.results).toHaveLength(1);
        expect(callbacks.onToolCall).toHaveBeenCalledOnce();
    });
});
