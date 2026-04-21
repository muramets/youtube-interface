// =============================================================================
// addMusicTag handler tests
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

import { handleAddMusicTag } from "../addMusicTag.js";

const CTX: ToolContext = {
    userId: "user1",
    channelId: "channel1",
    reportProgress: vi.fn(),
};

describe("addMusicTag", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDocSet.mockResolvedValue(undefined);
    });

    it("rejects invalid kebab-case id", async () => {
        const result = await handleAddMusicTag({ id: "BAD", name: "Bad" }, CTX);
        expect(result.error).toContain("kebab-case");
    });

    it("rejects missing name", async () => {
        const result = await handleAddMusicTag({ id: "valid-id", name: "" }, CTX);
        expect(result.error).toContain("name is required");
    });

    it("rejects duplicate id", async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                genres: [],
                tags: [{ id: "mood-chill", name: "Chill", category: "Mood" }],
            }),
        });

        const result = await handleAddMusicTag({ id: "mood-chill", name: "Dup" }, CTX);
        expect(result.error).toContain("already exists");
    });

    it("appends tag with category", async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({ genres: [], tags: [] }),
        });

        const result = await handleAddMusicTag(
            { id: "mood-nostalgic", name: "Nostalgic", category: "Mood" },
            CTX,
        );

        expect(result.success).toBe(true);
        expect(result.tag).toEqual({ id: "mood-nostalgic", name: "Nostalgic", category: "Mood" });
    });

    it("appends tag without category when not provided", async () => {
        mockDocGet.mockResolvedValue({ exists: false });

        const result = await handleAddMusicTag({ id: "custom-tag", name: "Custom" }, CTX);

        expect(result.success).toBe(true);
        expect(result.tag).toEqual({ id: "custom-tag", name: "Custom" });
    });
});
