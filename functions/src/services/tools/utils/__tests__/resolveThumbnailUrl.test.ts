import { describe, it, expect } from "vitest";
import { resolveThumbnailUrl } from "../resolveThumbnailUrl.js";

describe("resolveThumbnailUrl", () => {
    it("returns YouTube CDN URL for a regular video ID", () => {
        expect(resolveThumbnailUrl("dQw4w9WgXcQ")).toBe(
            "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
        );
    });

    it("returns undefined for custom-* video without thumbnail", () => {
        expect(resolveThumbnailUrl("custom-abc123")).toBeUndefined();
    });

    it("passes through a Firebase Storage thumbnail URL", () => {
        const storageUrl = "https://firebasestorage.googleapis.com/v0/b/bucket/o/thumb.jpg";
        expect(resolveThumbnailUrl("custom-abc123", storageUrl)).toBe(storageUrl);
    });

    it("passes through a YouTube CDN thumbnail URL from sync", () => {
        const cdnUrl = "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg";
        expect(resolveThumbnailUrl("dQw4w9WgXcQ", cdnUrl)).toBe(cdnUrl);
    });

    it("falls back to CDN when firestoreThumbnail is empty string", () => {
        expect(resolveThumbnailUrl("dQw4w9WgXcQ", "")).toBe(
            "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
        );
    });

    it("falls back to CDN when firestoreThumbnail is null", () => {
        expect(resolveThumbnailUrl("dQw4w9WgXcQ", null)).toBe(
            "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
        );
    });

    it("falls back to CDN when firestoreThumbnail is undefined", () => {
        expect(resolveThumbnailUrl("dQw4w9WgXcQ", undefined)).toBe(
            "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
        );
    });

    it("returns undefined for custom-* with empty string thumbnail", () => {
        expect(resolveThumbnailUrl("custom-xyz", "")).toBeUndefined();
    });

    it("returns undefined for custom-* with null thumbnail", () => {
        expect(resolveThumbnailUrl("custom-xyz", null)).toBeUndefined();
    });
});
