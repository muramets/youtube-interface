import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const { mockCollectionGroupGet } = vi.hoisted(() => ({
    mockCollectionGroupGet: vi.fn(),
}));

vi.mock("../../shared/db.js", () => ({
    db: {
        collectionGroup: () => ({ get: mockCollectionGroupGet }),
    },
}));

import { discoverChannels } from "../embeddingSync.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrendChannelDoc(youtubeChannelId: string, userId: string, channelId: string) {
    return {
        id: youtubeChannelId,
        ref: {
            path: `users/${userId}/channels/${channelId}/trendChannels/${youtubeChannelId}`,
        },
    };
}

// ---------------------------------------------------------------------------
// discoverChannels
// ---------------------------------------------------------------------------

describe("discoverChannels", () => {
    beforeEach(() => vi.clearAllMocks());

    it("deduplicates channels tracked by multiple users", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [
                makeTrendChannelDoc("UCabc", "user1", "ch1"),
                makeTrendChannelDoc("UCabc", "user2", "ch2"), // duplicate
                makeTrendChannelDoc("UCxyz", "user1", "ch1"),
            ],
        });

        const channels = await discoverChannels();

        expect(channels.size).toBe(2);
        expect(channels.has("UCabc")).toBe(true);
        expect(channels.has("UCxyz")).toBe(true);
        // First user's path wins
        expect(channels.get("UCabc")!.userId).toBe("user1");
    });

    it("returns empty map when no trend channels exist", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({ docs: [] });

        const channels = await discoverChannels();

        expect(channels.size).toBe(0);
    });
});
