// =============================================================================
// listMusicLibrary handler tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../../types.js";

const mockDocGet = vi.fn();
const mockCollectionGet = vi.fn();

vi.mock("../../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({
            get: () => mockDocGet(path),
        }),
        collection: (path: string) => ({
            get: () => mockCollectionGet(path),
        }),
    },
}));

import { handleListMusicLibrary } from "../listMusicLibrary.js";

const CTX: ToolContext = {
    userId: "user1",
    channelId: "channel1",
    reportProgress: vi.fn(),
};

describe("listMusicLibrary", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns defaults when settings doc does not exist", async () => {
        mockDocGet.mockResolvedValue({ exists: false });

        const result = await handleListMusicLibrary({}, CTX);

        expect(result.channelId).toBe("channel1");
        expect(Array.isArray(result.genres)).toBe(true);
        expect((result.genres as unknown[]).length).toBe(14); // DEFAULT_GENRES count
        expect(Array.isArray(result.tags)).toBe(true);
        expect((result.tags as unknown[]).length).toBe(12); // DEFAULT_TAGS count
    });

    it("returns custom genres + tags when settings doc exists", async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                genres: [{ id: "custom-genre", name: "Custom", color: "#000000", order: 0 }],
                tags: [{ id: "custom-tag", name: "Custom Tag" }],
            }),
        });

        const result = await handleListMusicLibrary({}, CTX);

        expect(result.genres).toEqual([
            { id: "custom-genre", name: "Custom", color: "#000000", order: 0 },
        ]);
        expect(result.tags).toEqual([{ id: "custom-tag", name: "Custom Tag", category: undefined }]);
    });

    it("uses targetChannelId for scope when provided", async () => {
        mockDocGet.mockResolvedValue({ exists: false });

        const result = await handleListMusicLibrary({ targetChannelId: "other-channel" }, CTX);

        expect(result.channelId).toBe("other-channel");
        expect(mockDocGet).toHaveBeenCalledWith("users/user1/channels/other-channel/settings/music");
    });

    it("includes tracks when includeTracks=true", async () => {
        mockDocGet.mockResolvedValue({ exists: false });
        mockCollectionGet.mockResolvedValue({
            docs: [
                {
                    id: "track1",
                    data: () => ({
                        title: "Track 1",
                        artist: "Artist A",
                        genre: "lo-fi",
                        tags: ["mood-chill"],
                        duration: 180,
                        vocalUrl: "https://...",
                        coverUrl: "https://...",
                        createdAt: 2000,
                    }),
                },
                {
                    id: "track2",
                    data: () => ({
                        title: "Track 2",
                        genre: "ambient",
                        tags: [],
                        duration: 240,
                        instrumentalUrl: "https://...",
                        createdAt: 1000,
                    }),
                },
            ],
        });

        const result = await handleListMusicLibrary({ includeTracks: true }, CTX);

        expect(result.trackCount).toBe(2);
        const tracks = result.tracks as Array<Record<string, unknown>>;
        expect(tracks[0].id).toBe("track1"); // sorted by createdAt DESC
        expect(tracks[0].hasVocal).toBe(true);
        expect(tracks[0].hasCover).toBe(true);
        expect(tracks[1].id).toBe("track2");
        expect(tracks[1].hasInstrumental).toBe(true);
        expect(tracks[1].hasVocal).toBe(false);
    });

    it("does not read tracks collection when includeTracks is false", async () => {
        mockDocGet.mockResolvedValue({ exists: false });

        await handleListMusicLibrary({}, CTX);

        expect(mockCollectionGet).not.toHaveBeenCalled();
    });

    it("returns error on Firestore failure", async () => {
        mockDocGet.mockRejectedValue(new Error("Firestore unavailable"));

        const result = await handleListMusicLibrary({}, CTX);

        expect(result.error).toContain("Failed to list music library");
        expect(result.error).toContain("Firestore unavailable");
    });
});
