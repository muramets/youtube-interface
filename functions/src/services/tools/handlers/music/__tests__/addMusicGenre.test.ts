// =============================================================================
// addMusicGenre handler tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../../types.js";

const mockDocGet = vi.fn();
const mockDocSet = vi.fn();

vi.mock("../../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({
            get: () => mockDocGet(path),
            set: (data: unknown, options?: unknown) => mockDocSet(path, data, options),
        }),
    },
}));

import { handleAddMusicGenre } from "../addMusicGenre.js";

const CTX: ToolContext = {
    userId: "user1",
    channelId: "channel1",
    reportProgress: vi.fn(),
};

describe("addMusicGenre", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDocSet.mockResolvedValue(undefined);
    });

    it("rejects invalid kebab-case id", async () => {
        const result = await handleAddMusicGenre(
            { id: "Bad Id!", name: "Bad", color: "#FFFFFF" },
            CTX,
        );
        expect(result.error).toContain("kebab-case");
        expect(mockDocSet).not.toHaveBeenCalled();
    });

    it("rejects missing name", async () => {
        const result = await handleAddMusicGenre(
            { id: "valid-id", name: "", color: "#FFFFFF" },
            CTX,
        );
        expect(result.error).toContain("name is required");
    });

    it("rejects invalid hex color", async () => {
        const result = await handleAddMusicGenre(
            { id: "valid-id", name: "Valid", color: "red" },
            CTX,
        );
        expect(result.error).toContain("hex");
    });

    it("rejects duplicate id", async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                genres: [{ id: "existing", name: "Existing", color: "#000000", order: 0 }],
                tags: [],
            }),
        });

        const result = await handleAddMusicGenre(
            { id: "existing", name: "Dup", color: "#FFFFFF" },
            CTX,
        );

        expect(result.error).toContain("already exists");
        expect(mockDocSet).not.toHaveBeenCalled();
    });

    it("appends new genre with next order number", async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                genres: [
                    { id: "a", name: "A", color: "#000000", order: 0 },
                    { id: "b", name: "B", color: "#111111", order: 5 },
                ],
                tags: [],
            }),
        });

        const result = await handleAddMusicGenre(
            { id: "new-genre", name: "New Genre", color: "#ABCDEF" },
            CTX,
        );

        expect(result.success).toBe(true);
        expect(result.genre).toEqual({ id: "new-genre", name: "New Genre", color: "#ABCDEF", order: 6 });
        expect(mockDocSet).toHaveBeenCalledWith(
            "users/user1/channels/channel1/settings/music",
            expect.objectContaining({
                genres: expect.arrayContaining([
                    expect.objectContaining({ id: "new-genre", order: 6 }),
                ]) as unknown,
            }),
            { merge: true },
        );
    });

    it("writes to targetChannelId scope when provided", async () => {
        mockDocGet.mockResolvedValue({ exists: false });

        await handleAddMusicGenre(
            { id: "new-genre", name: "New", color: "#FFFFFF", targetChannelId: "other" },
            CTX,
        );

        expect(mockDocSet).toHaveBeenCalledWith(
            "users/user1/channels/other/settings/music",
            expect.any(Object),
            { merge: true },
        );
    });
});
