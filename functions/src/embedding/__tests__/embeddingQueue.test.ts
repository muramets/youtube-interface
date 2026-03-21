import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockBatchSet = vi.fn();
const mockDocFn = vi.fn((path: string) => ({ path }));
const mockCollectionGet = vi.fn().mockResolvedValue({ docs: [], size: 0 });

vi.mock("../../shared/db.js", () => ({
    db: {
        doc: (path: string) => mockDocFn(path),
        collection: () => ({ get: () => mockCollectionGet() }),
    },
}));

import { isContentChanged, enqueueVideoForEmbedding, readEmbeddingQueue } from "../embeddingQueue.js";
import type { EmbeddingQueueEntry } from "../types.js";

// ---------------------------------------------------------------------------
// isContentChanged
// ---------------------------------------------------------------------------

describe("isContentChanged", () => {
    const baseCurrent = {
        title: "Test Video",
        tags: ["tag1", "tag2"],
        description: "A test description",
        thumbnail: "https://i.ytimg.com/vi/abc/maxresdefault.jpg",
    };

    it("returns true when previous is undefined (new video)", () => {
        expect(isContentChanged(undefined, baseCurrent)).toBe(true);
    });

    it("returns false when all content fields are the same", () => {
        const previous = {
            title: "Test Video",
            tags: ["tag1", "tag2"],
            description: "A test description",
            thumbnail: "https://i.ytimg.com/vi/abc/maxresdefault.jpg",
            viewCount: 1000,
        };
        expect(isContentChanged(previous, baseCurrent)).toBe(false);
    });

    it("returns true when title changed", () => {
        const previous = { ...baseCurrent, title: "Old Title" };
        expect(isContentChanged(previous, baseCurrent)).toBe(true);
    });

    it("returns true when tags changed (different array)", () => {
        const previous = { ...baseCurrent, tags: ["tag1", "tag3"] };
        expect(isContentChanged(previous, baseCurrent)).toBe(true);
    });

    it("returns true when tags reordered (JSON.stringify order-sensitive)", () => {
        const previous = { ...baseCurrent, tags: ["tag2", "tag1"] };
        expect(isContentChanged(previous, baseCurrent)).toBe(true);
    });

    it("returns true when description changed", () => {
        const previous = { ...baseCurrent, description: "Old description" };
        expect(isContentChanged(previous, baseCurrent)).toBe(true);
    });

    it("returns true when thumbnail changed", () => {
        const previous = { ...baseCurrent, thumbnail: "https://old-thumb.jpg" };
        expect(isContentChanged(previous, baseCurrent)).toBe(true);
    });

    it("returns false when only viewCount changed (not a content field)", () => {
        const previous = {
            ...baseCurrent,
            viewCount: 5000,
            likeCount: 100,
            commentCount: 50,
        };
        expect(isContentChanged(previous, baseCurrent)).toBe(false);
    });

    it("returns true when previous has missing title field (undefined !== string)", () => {
        const previous = {
            tags: ["tag1", "tag2"],
            description: "A test description",
            thumbnail: "https://i.ytimg.com/vi/abc/maxresdefault.jpg",
        };
        expect(isContentChanged(previous, baseCurrent)).toBe(true);
    });

    it("returns true when previous has missing description field", () => {
        const previous = {
            title: "Test Video",
            tags: ["tag1", "tag2"],
            thumbnail: "https://i.ytimg.com/vi/abc/maxresdefault.jpg",
        };
        expect(isContentChanged(previous, baseCurrent)).toBe(true);
    });

    it("returns true when previous has missing tags field", () => {
        const previous = {
            title: "Test Video",
            description: "A test description",
            thumbnail: "https://i.ytimg.com/vi/abc/maxresdefault.jpg",
        };
        // previous.tags = undefined → JSON.stringify([]) !== JSON.stringify(["tag1","tag2"])
        expect(isContentChanged(previous, baseCurrent)).toBe(true);
    });

    it("handles empty tags arrays as unchanged", () => {
        const previous = { ...baseCurrent, tags: [] };
        const current = { ...baseCurrent, tags: [] as string[] };
        expect(isContentChanged(previous, current)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// enqueueVideoForEmbedding
// ---------------------------------------------------------------------------

describe("enqueueVideoForEmbedding", () => {
    const entry: EmbeddingQueueEntry = {
        videoId: "vid-123",
        youtubeChannelId: "UC-abc",
        channelTitle: "Test Channel",
        userId: "user-1",
        channelId: "ch-1",
        trendChannelId: "UC-abc",
        enqueuedAt: 1700000000000,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("adds batch.set with correct path", () => {
        const batch = { set: mockBatchSet } as unknown as FirebaseFirestore.WriteBatch;
        enqueueVideoForEmbedding(batch, entry);

        expect(mockDocFn).toHaveBeenCalledWith("system/embeddingQueue/videos/vid-123");
    });

    it("uses { merge: true } option for idempotency", () => {
        const batch = { set: mockBatchSet } as unknown as FirebaseFirestore.WriteBatch;
        enqueueVideoForEmbedding(batch, entry);

        expect(mockBatchSet).toHaveBeenCalledWith(
            expect.objectContaining({ path: "system/embeddingQueue/videos/vid-123" }),
            entry,
            { merge: true },
        );
    });

    it("passes entry data matching EmbeddingQueueEntry shape", () => {
        const batch = { set: mockBatchSet } as unknown as FirebaseFirestore.WriteBatch;
        enqueueVideoForEmbedding(batch, entry);

        const writtenData = mockBatchSet.mock.calls[0][1] as EmbeddingQueueEntry;
        expect(writtenData.videoId).toBe("vid-123");
        expect(writtenData.youtubeChannelId).toBe("UC-abc");
        expect(writtenData.channelTitle).toBe("Test Channel");
        expect(writtenData.userId).toBe("user-1");
        expect(writtenData.channelId).toBe("ch-1");
        expect(writtenData.trendChannelId).toBe("UC-abc");
        expect(writtenData.enqueuedAt).toBe(1700000000000);
    });

    it("does NOT call batch.commit (caller responsibility)", () => {
        const mockCommit = vi.fn();
        const batch = { set: mockBatchSet, commit: mockCommit } as unknown as FirebaseFirestore.WriteBatch;
        enqueueVideoForEmbedding(batch, entry);

        expect(mockCommit).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// readEmbeddingQueue
// ---------------------------------------------------------------------------

describe("readEmbeddingQueue", () => {
    function makeQueueDoc(videoId: string, overrides?: Partial<EmbeddingQueueEntry>) {
        return {
            id: videoId,
            data: () => ({
                videoId,
                youtubeChannelId: overrides?.youtubeChannelId ?? "UC-abc",
                channelTitle: overrides?.channelTitle ?? "Test Channel",
                userId: overrides?.userId ?? "user-1",
                channelId: overrides?.channelId ?? "ch-1",
                trendChannelId: overrides?.trendChannelId ?? "UC-abc",
                enqueuedAt: overrides?.enqueuedAt ?? 1700000000000,
            }),
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 3 videos and 2 channelPaths for 3 entries across 2 channels", async () => {
        mockCollectionGet.mockResolvedValue({
            docs: [
                makeQueueDoc("vid-1", { youtubeChannelId: "UC-a", channelTitle: "Channel A" }),
                makeQueueDoc("vid-2", { youtubeChannelId: "UC-a", channelTitle: "Channel A" }),
                makeQueueDoc("vid-3", { youtubeChannelId: "UC-b", channelTitle: "Channel B" }),
            ],
            size: 3,
        });

        const result = await readEmbeddingQueue();

        expect(result.videos).toHaveLength(3);
        expect(Object.keys(result.channelPaths)).toHaveLength(2);
        expect(result.queueSize).toBe(3);
        expect(result.channelPaths["UC-a"].channelTitle).toBe("Channel A");
        expect(result.channelPaths["UC-b"].channelTitle).toBe("Channel B");
    });

    it("deduplicates channelPaths by youtubeChannelId (first path wins)", async () => {
        mockCollectionGet.mockResolvedValue({
            docs: [
                makeQueueDoc("vid-1", { youtubeChannelId: "UC-shared", userId: "user-1", channelTitle: "First" }),
                makeQueueDoc("vid-2", { youtubeChannelId: "UC-shared", userId: "user-2", channelTitle: "Second" }),
            ],
            size: 2,
        });

        const result = await readEmbeddingQueue();

        expect(Object.keys(result.channelPaths)).toHaveLength(1);
        expect(result.channelPaths["UC-shared"].userId).toBe("user-1");
        expect(result.channelPaths["UC-shared"].channelTitle).toBe("First");
    });

    it("returns empty result for empty queue", async () => {
        mockCollectionGet.mockResolvedValue({ docs: [], size: 0 });

        const result = await readEmbeddingQueue();

        expect(result.videos).toHaveLength(0);
        expect(result.channelPaths).toEqual({});
        expect(result.queueSize).toBe(0);
    });

    it("sorts videos by videoId (deterministic)", async () => {
        mockCollectionGet.mockResolvedValue({
            docs: [
                makeQueueDoc("vid-c"),
                makeQueueDoc("vid-a"),
                makeQueueDoc("vid-b"),
            ],
            size: 3,
        });

        const result = await readEmbeddingQueue();

        expect(result.videos.map(v => v.videoId)).toEqual(["vid-a", "vid-b", "vid-c"]);
    });
});
