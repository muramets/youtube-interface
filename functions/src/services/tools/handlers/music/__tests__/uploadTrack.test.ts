// =============================================================================
// uploadTrack handler tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../../types.js";

const mockDocGet = vi.fn();
const mockDocSet = vi.fn();

const mockBucketUpload = vi.fn();
const mockFileSave = vi.fn();
const mockFileDelete = vi.fn();

vi.mock("../../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({
            get: () => mockDocGet(path),
            set: (data: unknown) => mockDocSet(path, data),
        }),
    },
    admin: {
        storage: () => ({
            bucket: () => ({
                name: "test-bucket.appspot.com",
                upload: (localPath: string, opts: unknown) => mockBucketUpload(localPath, opts),
                file: (path: string) => ({
                    save: (buffer: Buffer, opts: unknown) => mockFileSave(path, buffer, opts),
                    delete: () => mockFileDelete(path),
                }),
            }),
        }),
    },
}));

// Mock music-metadata to return deterministic values
const mockParseFile = vi.fn();
vi.mock("music-metadata", () => ({
    parseFile: (path: string) => mockParseFile(path),
}));

// Mock fs.stat to simulate file existence
const mockFsStat = vi.fn();
vi.mock("node:fs/promises", () => ({
    stat: (path: string) => mockFsStat(path),
}));

// Mock crypto.randomUUID deterministically
vi.mock("node:crypto", () => ({
    randomUUID: vi.fn(() => "fixed-uuid"),
}));

import { handleUploadTrack } from "../uploadTrack.js";

const CTX: ToolContext = {
    userId: "user1",
    channelId: "channel1",
    reportProgress: vi.fn(),
};

describe("uploadTrack", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFsStat.mockResolvedValue({ isFile: () => true });
        mockBucketUpload.mockResolvedValue([]);
        mockFileSave.mockResolvedValue(undefined);
        mockFileDelete.mockResolvedValue(undefined);
        mockDocSet.mockResolvedValue(undefined);

        // Default settings with all defaults
        mockDocGet.mockImplementation((path: string) => {
            if (path.endsWith("/settings/music")) {
                return Promise.resolve({ exists: false });
            }
            return Promise.resolve({ exists: false });
        });

        mockParseFile.mockResolvedValue({
            common: {
                title: "ID3 Title",
                artist: "ID3 Artist",
                bpm: 128,
            },
            format: { duration: 180 },
        });
    });

    it("rejects when no files provided", async () => {
        const result = await handleUploadTrack({ genre: "lo-fi" }, CTX);
        expect(result.error).toContain("At least one of vocalPath");
    });

    it("rejects when genre is missing", async () => {
        const result = await handleUploadTrack({ vocalPath: "/tmp/song.mp3" }, CTX);
        expect(result.error).toContain("genre is required");
    });

    it("rejects unknown genre", async () => {
        const result = await handleUploadTrack(
            { vocalPath: "/tmp/song.mp3", genre: "not-a-real-genre" },
            CTX,
        );
        expect(result.error).toContain("Unknown genre");
    });

    it("rejects unknown tags", async () => {
        const result = await handleUploadTrack(
            { vocalPath: "/tmp/song.mp3", genre: "lo-fi", tags: ["not-a-tag"] },
            CTX,
        );
        expect(result.error).toContain("Unknown tags");
    });

    it("uploads vocal file with extracted ID3 metadata", async () => {
        const result = await handleUploadTrack(
            { vocalPath: "/tmp/song.mp3", genre: "lo-fi", tags: ["mood-chill"] },
            CTX,
        );

        expect(result.success).toBe(true);
        expect(result.trackId).toBe("fixed-uuid");
        expect(result.title).toBe("ID3 Title");
        expect(result.artist).toBe("ID3 Artist");
        expect(result.bpm).toBe(128);
        expect(result.duration).toBe(180);
        expect(result.hasVocal).toBe(true);
        expect(result.hasInstrumental).toBe(false);
        expect(result.hasCover).toBe(false);

        // Verify storage upload happened with correct path
        expect(mockBucketUpload).toHaveBeenCalledWith(
            "/tmp/song.mp3",
            expect.objectContaining({
                destination: "users/user1/channels/channel1/tracks/fixed-uuid/vocal.mp3",
            }),
        );

        // Verify Firestore doc created with peaks empty
        expect(mockDocSet).toHaveBeenCalledWith(
            "users/user1/channels/channel1/tracks/fixed-uuid",
            expect.objectContaining({
                vocalPeaks: [],
                instrumentalPeaks: [],
            }),
        );
    });

    it("uploads both vocal and instrumental variants", async () => {
        const result = await handleUploadTrack(
            {
                vocalPath: "/tmp/vocal.mp3",
                instrumentalPath: "/tmp/instr.mp3",
                genre: "lo-fi",
            },
            CTX,
        );

        expect(result.hasVocal).toBe(true);
        expect(result.hasInstrumental).toBe(true);
        expect(mockBucketUpload).toHaveBeenCalledTimes(2);
    });

    it("uploads embedded cover from ID3 picture", async () => {
        mockParseFile.mockResolvedValue({
            common: {
                title: "Cover Song",
                picture: [
                    {
                        data: new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]),
                        format: "image/jpeg",
                    },
                ],
            },
            format: { duration: 120 },
        });

        const result = await handleUploadTrack(
            { vocalPath: "/tmp/song.mp3", genre: "lo-fi" },
            CTX,
        );

        expect(result.hasCover).toBe(true);
        expect(mockFileSave).toHaveBeenCalledWith(
            "users/user1/channels/channel1/tracks/fixed-uuid/cover.jpg",
            expect.any(Buffer),
            expect.any(Object),
        );
    });

    it("overrides ID3 metadata with explicit args", async () => {
        const result = await handleUploadTrack(
            {
                vocalPath: "/tmp/song.mp3",
                genre: "lo-fi",
                title: "Explicit Title",
                artist: "Explicit Artist",
                bpm: 90,
            },
            CTX,
        );

        expect(result.title).toBe("Explicit Title");
        expect(result.artist).toBe("Explicit Artist");
        expect(result.bpm).toBe(90);
    });

    it("uses filename as fallback title when no ID3 title", async () => {
        mockParseFile.mockResolvedValue({
            common: {},
            format: { duration: 60 },
        });

        const result = await handleUploadTrack(
            { vocalPath: "/tmp/my-song.mp3", genre: "lo-fi" },
            CTX,
        );

        expect(result.title).toBe("my-song");
    });

    it("cleans up uploaded files when Firestore write fails", async () => {
        mockDocSet.mockRejectedValue(new Error("Firestore write failed"));

        const result = await handleUploadTrack(
            { vocalPath: "/tmp/song.mp3", genre: "lo-fi" },
            CTX,
        );

        expect(result.error).toContain("Firestore write failed");
        expect(mockFileDelete).toHaveBeenCalledWith(
            "users/user1/channels/channel1/tracks/fixed-uuid/vocal.mp3",
        );
    });

    it("writes to targetChannelId scope when provided", async () => {
        await handleUploadTrack(
            { vocalPath: "/tmp/song.mp3", genre: "lo-fi", targetChannelId: "other-channel" },
            CTX,
        );

        expect(mockBucketUpload).toHaveBeenCalledWith(
            "/tmp/song.mp3",
            expect.objectContaining({
                destination: "users/user1/channels/other-channel/tracks/fixed-uuid/vocal.mp3",
            }),
        );
        expect(mockDocSet).toHaveBeenCalledWith(
            "users/user1/channels/other-channel/tracks/fixed-uuid",
            expect.any(Object),
        );
    });
});
