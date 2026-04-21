// =============================================================================
// updateTrack handler tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../../types.js";

const mockDocGet = vi.fn();
const mockDocUpdate = vi.fn();

const FIELD_VALUE_DELETE = Symbol("FieldValue.delete");

vi.mock("../../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({
            get: () => mockDocGet(path),
            update: (data: unknown) => mockDocUpdate(path, data),
        }),
    },
    admin: {
        firestore: {
            FieldValue: {
                delete: () => FIELD_VALUE_DELETE,
            },
        },
    },
}));

import { handleUpdateTrack } from "../updateTrack.js";

const CTX: ToolContext = {
    userId: "user1",
    channelId: "channel1",
    reportProgress: vi.fn(),
};

const TRACK_PATH = "users/user1/channels/channel1/tracks/track1";
const SETTINGS_PATH = "users/user1/channels/channel1/settings/music";

describe("updateTrack", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDocUpdate.mockResolvedValue(undefined);

        // Default: settings empty (use defaults), track exists with initial values
        mockDocGet.mockImplementation((path: string) => {
            if (path === SETTINGS_PATH) {
                return Promise.resolve({ exists: false });
            }
            if (path === TRACK_PATH) {
                return Promise.resolve({
                    exists: true,
                    data: () => ({
                        id: "track1",
                        title: "Old Title",
                        artist: "Old Artist",
                        genre: "lo-fi",
                        tags: ["mood-chill"],
                        duration: 180,
                    }),
                });
            }
            return Promise.resolve({ exists: false });
        });
    });

    it("rejects when trackId is missing", async () => {
        const result = await handleUpdateTrack({ title: "New" }, CTX);
        expect(result.error).toContain("trackId is required");
    });

    it("rejects when no editable fields are provided", async () => {
        const result = await handleUpdateTrack({ trackId: "track1" }, CTX);
        expect(result.error).toContain("No editable fields");
    });

    it("rejects when track does not exist", async () => {
        mockDocGet.mockImplementation((path: string) => {
            if (path === SETTINGS_PATH) return Promise.resolve({ exists: false });
            return Promise.resolve({ exists: false });
        });

        const result = await handleUpdateTrack(
            { trackId: "ghost-track", title: "New" },
            CTX,
        );
        expect(result.error).toContain("Track not found");
    });

    it("updates title only", async () => {
        const result = await handleUpdateTrack(
            { trackId: "track1", title: "Brand New Title" },
            CTX,
        );

        expect(result.success).toBe(true);
        expect(result.changed).toEqual(["title"]);
        expect(mockDocUpdate).toHaveBeenCalledWith(
            TRACK_PATH,
            expect.objectContaining({
                title: "Brand New Title",
                updatedAt: expect.any(Number) as unknown,
            }),
        );
    });

    it("updates title + artist + prompt together", async () => {
        const result = await handleUpdateTrack(
            {
                trackId: "track1",
                title: "New Title",
                artist: "New Artist",
                prompt: "lo-fi piano for studying",
            },
            CTX,
        );

        expect(result.success).toBe(true);
        expect(result.changed).toContain("title");
        expect(result.changed).toContain("artist");
        expect(result.changed).toContain("prompt");
    });

    it("clears artist when passed null", async () => {
        await handleUpdateTrack({ trackId: "track1", artist: null }, CTX);

        expect(mockDocUpdate).toHaveBeenCalledWith(
            TRACK_PATH,
            expect.objectContaining({ artist: FIELD_VALUE_DELETE }),
        );
    });

    it("clears bpm when passed null", async () => {
        await handleUpdateTrack({ trackId: "track1", bpm: null }, CTX);

        expect(mockDocUpdate).toHaveBeenCalledWith(
            TRACK_PATH,
            expect.objectContaining({ bpm: FIELD_VALUE_DELETE }),
        );
    });

    it("rejects invalid bpm values", async () => {
        const result = await handleUpdateTrack({ trackId: "track1", bpm: 0 }, CTX);
        expect(result.error).toContain("bpm");
    });

    it("updates bpm with valid positive number", async () => {
        await handleUpdateTrack({ trackId: "track1", bpm: 90 }, CTX);

        expect(mockDocUpdate).toHaveBeenCalledWith(
            TRACK_PATH,
            expect.objectContaining({ bpm: 90 }),
        );
    });

    it("rejects invalid genre", async () => {
        const result = await handleUpdateTrack(
            { trackId: "track1", genre: "not-a-genre" },
            CTX,
        );
        expect(result.error).toContain("Unknown genre");
        expect(mockDocUpdate).not.toHaveBeenCalled();
    });

    it("rejects invalid tags", async () => {
        const result = await handleUpdateTrack(
            { trackId: "track1", tags: ["not-a-tag"] },
            CTX,
        );
        expect(result.error).toContain("Unknown tags");
        expect(mockDocUpdate).not.toHaveBeenCalled();
    });

    it("accepts empty tags array (clears all tags)", async () => {
        const result = await handleUpdateTrack({ trackId: "track1", tags: [] }, CTX);

        expect(result.success).toBe(true);
        expect(mockDocUpdate).toHaveBeenCalledWith(
            TRACK_PATH,
            expect.objectContaining({ tags: [] }),
        );
    });

    it("updates liked", async () => {
        await handleUpdateTrack({ trackId: "track1", liked: true }, CTX);

        expect(mockDocUpdate).toHaveBeenCalledWith(
            TRACK_PATH,
            expect.objectContaining({ liked: true }),
        );
    });

    it("rejects non-boolean liked", async () => {
        const result = await handleUpdateTrack(
            { trackId: "track1", liked: "yes" },
            CTX,
        );
        expect(result.error).toContain("liked");
    });

    it("updates in targetChannelId scope", async () => {
        mockDocGet.mockImplementation((path: string) => {
            if (path.endsWith("/settings/music")) return Promise.resolve({ exists: false });
            if (path.endsWith("/tracks/track1")) {
                return Promise.resolve({
                    exists: true,
                    data: () => ({ title: "T", genre: "lo-fi", tags: [], duration: 0 }),
                });
            }
            return Promise.resolve({ exists: false });
        });

        await handleUpdateTrack(
            { trackId: "track1", title: "New", targetChannelId: "other" },
            CTX,
        );

        expect(mockDocUpdate).toHaveBeenCalledWith(
            "users/user1/channels/other/tracks/track1",
            expect.objectContaining({ title: "New" }),
        );
    });

    it("returns updated track summary", async () => {
        // After update, read-back returns the merged state
        let callCount = 0;
        mockDocGet.mockImplementation((path: string) => {
            if (path === SETTINGS_PATH) return Promise.resolve({ exists: false });
            if (path === TRACK_PATH) {
                callCount++;
                // First call: pre-update check. Second: post-update read-back.
                if (callCount === 1) {
                    return Promise.resolve({
                        exists: true,
                        data: () => ({ title: "Old", genre: "lo-fi", tags: [], duration: 180 }),
                    });
                }
                return Promise.resolve({
                    exists: true,
                    data: () => ({
                        title: "New Title",
                        artist: "New Artist",
                        genre: "lo-fi",
                        tags: [],
                        duration: 180,
                    }),
                });
            }
            return Promise.resolve({ exists: false });
        });

        const result = await handleUpdateTrack(
            { trackId: "track1", title: "New Title", artist: "New Artist" },
            CTX,
        );

        expect(result.track).toEqual(
            expect.objectContaining({
                id: "track1",
                title: "New Title",
                artist: "New Artist",
            }),
        );
    });
});
