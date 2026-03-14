import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock Firestore ---

const mockUpdate = vi.fn();
const mockGet = vi.fn();
const mockLimit = vi.fn();
const mockWhere = vi.fn();

const createChainedQuery = () => ({
    where: (...args: unknown[]) => {
        mockWhere(...args);
        return createChainedQuery();
    },
    limit: (...args: unknown[]) => {
        mockLimit(...args);
        return createChainedQuery();
    },
    get: () => mockGet(),
});

vi.mock("../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({ path, update: mockUpdate }),
        collection: () => createChainedQuery(),
    },
}));

// --- Import handler wrapper (extract from trigger) ---

// We can't easily invoke the onDocumentDeleted callback directly,
// so we mock the firebase-functions module and capture the handler.
let triggerHandler: (event: unknown) => Promise<void>;

vi.mock("firebase-functions/v2/firestore", () => ({
    onDocumentDeleted: (_path: string, handler: (event: unknown) => Promise<void>) => {
        triggerHandler = handler;
        return handler;
    },
}));

// Must import AFTER mocks
await import("../onKnowledgeItemDeleted.js");

function makeEvent(data: Record<string, unknown>, params: Record<string, string>) {
    return {
        params,
        data: { data: () => data },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("onKnowledgeItemDeleted", () => {
    it("decrements knowledgeItemCount on video doc for video-scoped KI", async () => {
        mockGet.mockResolvedValue({ empty: false, docs: [{ id: "other-ki" }] });

        await triggerHandler(
            makeEvent(
                { scope: "video", videoId: "vid-1", category: "traffic-analysis" },
                { userId: "u1", channelId: "ch1", itemId: "ki-1" }
            )
        );

        // Should update video doc
        expect(mockUpdate).toHaveBeenCalledTimes(1);
        const updateArgs = mockUpdate.mock.calls[0][0];
        // increment(-1) is represented as FieldValue internally
        expect(updateArgs.knowledgeItemCount).toBeDefined();
        // Category still exists — should NOT have arrayRemove
        expect(updateArgs.knowledgeCategories).toBeUndefined();
    });

    it("removes category when no other KI uses it", async () => {
        mockGet.mockResolvedValue({ empty: true, docs: [] });

        await triggerHandler(
            makeEvent(
                { scope: "channel", category: "niche-analysis" },
                { userId: "u1", channelId: "ch1", itemId: "ki-2" }
            )
        );

        expect(mockUpdate).toHaveBeenCalledTimes(1);
        const updateArgs = mockUpdate.mock.calls[0][0];
        expect(updateArgs.knowledgeItemCount).toBeDefined();
        // Category gone — should have arrayRemove
        expect(updateArgs.knowledgeCategories).toBeDefined();
    });

    it("queries remaining KI with correct category filter", async () => {
        mockGet.mockResolvedValue({ empty: true, docs: [] });

        await triggerHandler(
            makeEvent(
                { scope: "video", videoId: "vid-1", category: "packaging-audit" },
                { userId: "u1", channelId: "ch1", itemId: "ki-3" }
            )
        );

        expect(mockWhere).toHaveBeenCalledWith("category", "==", "packaging-audit");
        expect(mockLimit).toHaveBeenCalledWith(1);
    });

    it("skips gracefully when deleted doc has no data", async () => {
        await triggerHandler({
            params: { userId: "u1", channelId: "ch1", itemId: "ki-4" },
            data: { data: () => undefined },
        });

        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("handles entity doc update failure gracefully", async () => {
        mockGet.mockResolvedValue({ empty: true, docs: [] });
        mockUpdate.mockRejectedValue(new Error("NOT_FOUND"));

        // Should not throw
        await triggerHandler(
            makeEvent(
                { scope: "video", videoId: "deleted-vid", category: "traffic-analysis" },
                { userId: "u1", channelId: "ch1", itemId: "ki-5" }
            )
        );

        expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
});
