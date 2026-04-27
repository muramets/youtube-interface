import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── In-memory Firestore + Storage fake ────────────────────────────────

const { store, fakeDb, fakeBucket } = vi.hoisted(() => {
    interface FakeStore {
        docs: Map<string, Record<string, unknown>>;
        files: Map<string, { tokens?: string }>;
        callLog: string[];
    }
    const store: FakeStore = { docs: new Map(), files: new Map(), callLog: [] };

    function fakeDocRef(path: string) {
        return {
            path,
            get: async () => ({
                exists: store.docs.has(path),
                data: () => store.docs.get(path),
            }),
            set: async (data: Record<string, unknown>) => {
                store.docs.set(path, data);
                store.callLog.push(`set:${path}`);
            },
            update: async (data: Record<string, unknown>) => {
                const cur = store.docs.get(path) ?? {};
                store.docs.set(path, { ...cur, ...data });
                store.callLog.push(`update:${path}`);
            },
            delete: async () => {
                store.docs.delete(path);
                store.callLog.push(`delete:${path}`);
            },
        };
    }

    function fakeCollectionRef(basePath: string) {
        return {
            get: async () => {
                const prefix = basePath + "/";
                const docs: Array<{ id: string; data: () => Record<string, unknown>; ref: ReturnType<typeof fakeDocRef> }> = [];
                for (const p of store.docs.keys()) {
                    if (p.startsWith(prefix)) {
                        const rest = p.slice(prefix.length);
                        if (!rest.includes("/")) {
                            docs.push({
                                id: rest,
                                data: () => store.docs.get(p)!,
                                ref: fakeDocRef(p),
                            });
                        }
                    }
                }
                return { docs, empty: docs.length === 0 };
            },
        };
    }

    function fakeBatch() {
        const ops: Array<() => Promise<void>> = [];
        return {
            update: (
                ref: { update: (d: Record<string, unknown>) => Promise<void> },
                data: Record<string, unknown>,
            ) => ops.push(() => ref.update(data)),
            commit: async () => {
                store.callLog.push(`batchCommit:${ops.length}`);
                for (const op of ops) await op();
            },
        };
    }

    const fakeDb = {
        doc: (path: string) => fakeDocRef(path),
        collection: (path: string) => fakeCollectionRef(path),
        batch: () => fakeBatch(),
    };

    function fakeFile(name: string) {
        return {
            name,
            copy: async (target: { name: string }) => {
                const src = store.files.get(name);
                store.files.set(target.name, { tokens: src?.tokens });
                store.callLog.push(`storageCopy:${name}->${target.name}`);
            },
            setMetadata: async (meta: { metadata?: { firebaseStorageDownloadTokens?: string } }) => {
                const cur = store.files.get(name) ?? {};
                if (meta.metadata?.firebaseStorageDownloadTokens) {
                    store.files.set(name, { ...cur, tokens: meta.metadata.firebaseStorageDownloadTokens });
                }
                store.callLog.push(`setMetadata:${name}`);
            },
            delete: async () => {
                store.files.delete(name);
                store.callLog.push(`storageDelete:${name}`);
            },
        };
    }

    const fakeBucket = {
        name: "test-bucket",
        file: (n: string) => fakeFile(n),
    };

    return { store, fakeDb, fakeBucket };
});

vi.mock("../../shared/db.js", () => ({
    db: fakeDb,
    admin: {
        storage: () => ({ bucket: () => fakeBucket }),
    },
}));

import { runTrackMove } from "../moveTrack.js";

const UID = "user1";
const SRC = "channelSource";
const DST = "channelDest";
const TID = "track-abc";

const seed = (): void => {
    store.docs.clear();
    store.files.clear();
    store.callLog.length = 0;
};

const seedHappyPath = (): void => {
    seed();
    store.docs.set(`users/${UID}/channels/${SRC}`, { name: "Source" });
    store.docs.set(`users/${UID}/channels/${DST}`, { name: "Dest" });
    store.docs.set(`users/${UID}/channels/${SRC}/tracks/${TID}`, {
        id: TID,
        ownerUserId: UID,
        ownerChannelId: SRC,
        title: "My Track",
        artist: "Artist",
        genre: "lo-fi",
        tags: ["mood-chill"],
        duration: 120,
        vocalUrl: `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/old?alt=media&token=oldtoken`,
        vocalStoragePath: `users/${UID}/channels/${SRC}/music/${TID}/vocal.mp3`,
        instrumentalUrl: `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/old?alt=media&token=oldtoken`,
        instrumentalStoragePath: `users/${UID}/channels/${SRC}/music/${TID}/instrumental.mp3`,
        coverUrl: `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/oldcover?alt=media&token=oldtoken`,
        coverStoragePath: `users/${UID}/channels/${SRC}/music/${TID}/cover.jpg`,
        groupId: "group-1",
        groupOrder: 0,
        linkedVideoIds: ["video-from-source-1"],
        createdAt: 1000,
        updatedAt: 2000,
    });
    store.files.set(`users/${UID}/channels/${SRC}/music/${TID}/vocal.mp3`, { tokens: "oldtoken" });
    store.files.set(`users/${UID}/channels/${SRC}/music/${TID}/instrumental.mp3`, { tokens: "oldtoken" });
    store.files.set(`users/${UID}/channels/${SRC}/music/${TID}/cover.jpg`, { tokens: "oldtoken" });
    store.docs.set(`users/${UID}/channels/${SRC}/musicPlaylists/pl1`, {
        id: "pl1",
        name: "My PL",
        trackIds: ["other-track", TID],
        trackAddedAt: { "other-track": 100, [TID]: 200 },
        trackSources: { [TID]: { ownerUserId: UID, ownerChannelId: SRC } },
    });
};

beforeEach(seed);

describe("runTrackMove validation", () => {
    it("throws when source channel does not exist", async () => {
        store.docs.set(`users/${UID}/channels/${DST}`, { name: "Dest" });
        await expect(
            runTrackMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID }),
        ).rejects.toThrow(/Source channel/);
    });

    it("throws when dest channel does not exist", async () => {
        store.docs.set(`users/${UID}/channels/${SRC}`, { name: "Source" });
        await expect(
            runTrackMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID }),
        ).rejects.toThrow(/Destination channel/);
    });

    it("throws when source track does not exist", async () => {
        store.docs.set(`users/${UID}/channels/${SRC}`, { name: "Source" });
        store.docs.set(`users/${UID}/channels/${DST}`, { name: "Dest" });
        await expect(
            runTrackMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID }),
        ).rejects.toThrow(/not found in source channel/);
    });

    it("refuses to overwrite an existing dest track", async () => {
        seedHappyPath();
        store.docs.set(`users/${UID}/channels/${DST}/tracks/${TID}`, { existing: true });
        await expect(
            runTrackMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID }),
        ).rejects.toThrow(/already exists in destination/);
    });
});

describe("runTrackMove happy path", () => {
    it("copies all storage files with fresh tokens, writes dest doc, deletes source", async () => {
        seedHappyPath();
        const result = await runTrackMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID,
        });

        expect(result.success).toBe(true);
        expect(result.storageFilesCopied).toBe(3); // vocal + instrumental + cover
        expect(result.sourcePlaylistsUpdated).toBe(1);

        // Dest doc has rewritten paths
        const dst = store.docs.get(`users/${UID}/channels/${DST}/tracks/${TID}`) as Record<string, unknown>;
        expect(dst).toBeDefined();
        expect(dst.vocalStoragePath).toBe(`users/${UID}/channels/${DST}/music/${TID}/vocal.mp3`);
        expect(dst.instrumentalStoragePath).toBe(`users/${UID}/channels/${DST}/music/${TID}/instrumental.mp3`);
        expect(dst.coverStoragePath).toBe(`users/${UID}/channels/${DST}/music/${TID}/cover.jpg`);

        // URLs were rebuilt and contain the new path encoded + a fresh token
        expect(dst.vocalUrl).toMatch(/firebasestorage\.googleapis\.com/);
        expect(dst.vocalUrl).toMatch(new RegExp(`o/users%2F${UID}%2Fchannels%2F${DST}`));
        expect(dst.vocalUrl).not.toMatch(/token=oldtoken/);

        // Ownership stamped to dest
        expect(dst.ownerChannelId).toBe(DST);
        expect(dst.ownerUserId).toBe(UID);
        expect(dst.id).toBe(TID);

        // Source-scoped relationships cleared
        expect(dst.groupId).toBeUndefined();
        expect(dst.groupOrder).toBeUndefined();
        expect(dst.linkedVideoIds).toBeUndefined();

        // Source doc + storage gone
        expect(store.docs.has(`users/${UID}/channels/${SRC}/tracks/${TID}`)).toBe(false);
        expect(store.files.has(`users/${UID}/channels/${SRC}/music/${TID}/vocal.mp3`)).toBe(false);
        expect(store.files.has(`users/${UID}/channels/${SRC}/music/${TID}/instrumental.mp3`)).toBe(false);
        expect(store.files.has(`users/${UID}/channels/${SRC}/music/${TID}/cover.jpg`)).toBe(false);
    });

    it("preserves track metadata (title, artist, genre, tags, peaks, lyrics, etc.)", async () => {
        seedHappyPath();
        const srcDoc = store.docs.get(`users/${UID}/channels/${SRC}/tracks/${TID}`)!;
        srcDoc.lyrics = "la la la";
        srcDoc.bpm = 90;
        srcDoc.vocalPeaks = [0.1, 0.2, 0.3];
        srcDoc.liked = true;

        await runTrackMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID });

        const dst = store.docs.get(`users/${UID}/channels/${DST}/tracks/${TID}`) as Record<string, unknown>;
        expect(dst.title).toBe("My Track");
        expect(dst.artist).toBe("Artist");
        expect(dst.genre).toBe("lo-fi");
        expect(dst.tags).toEqual(["mood-chill"]);
        expect(dst.duration).toBe(120);
        expect(dst.lyrics).toBe("la la la");
        expect(dst.bpm).toBe(90);
        expect(dst.vocalPeaks).toEqual([0.1, 0.2, 0.3]);
        expect(dst.liked).toBe(true);
    });

    it("writes destination before deleting source (atomicity contract)", async () => {
        seedHappyPath();
        await runTrackMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID });

        const firstDestSet = store.callLog.findIndex(
            (op) => op === `set:users/${UID}/channels/${DST}/tracks/${TID}`,
        );
        const firstSourceDelete = store.callLog.findIndex(
            (op) => op === `delete:users/${UID}/channels/${SRC}/tracks/${TID}`,
        );
        expect(firstDestSet).toBeGreaterThanOrEqual(0);
        expect(firstSourceDelete).toBeGreaterThanOrEqual(0);
        expect(firstDestSet).toBeLessThan(firstSourceDelete);
    });

    it("handles vocal-only track (no instrumental, no cover)", async () => {
        seedHappyPath();
        const srcDoc = store.docs.get(`users/${UID}/channels/${SRC}/tracks/${TID}`)!;
        delete srcDoc.instrumentalUrl;
        delete srcDoc.instrumentalStoragePath;
        delete srcDoc.coverUrl;
        delete srcDoc.coverStoragePath;
        store.files.delete(`users/${UID}/channels/${SRC}/music/${TID}/instrumental.mp3`);
        store.files.delete(`users/${UID}/channels/${SRC}/music/${TID}/cover.jpg`);

        const result = await runTrackMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID,
        });

        expect(result.storageFilesCopied).toBe(1); // vocal only
        const dst = store.docs.get(`users/${UID}/channels/${DST}/tracks/${TID}`) as Record<string, unknown>;
        expect(dst.vocalStoragePath).toBe(`users/${UID}/channels/${DST}/music/${TID}/vocal.mp3`);
        expect(dst.instrumentalStoragePath).toBeUndefined();
        expect(dst.coverStoragePath).toBeUndefined();
    });

    it("strips trackId from source playlists trackIds, trackAddedAt, trackSources", async () => {
        seedHappyPath();
        await runTrackMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID });

        const pl = store.docs.get(`users/${UID}/channels/${SRC}/musicPlaylists/pl1`) as {
            trackIds: string[];
            trackAddedAt: Record<string, number>;
            trackSources: Record<string, unknown>;
        };
        expect(pl.trackIds).toEqual(["other-track"]);
        expect(pl.trackAddedAt).toEqual({ "other-track": 100 });
        expect(pl.trackSources).toEqual({});
    });

    it("does NOT touch playlists that don't reference the track", async () => {
        seedHappyPath();
        store.docs.set(`users/${UID}/channels/${SRC}/musicPlaylists/pl-other`, {
            id: "pl-other",
            trackIds: ["only-other-track"],
        });

        const result = await runTrackMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID,
        });
        expect(result.sourcePlaylistsUpdated).toBe(1);

        const plOther = store.docs.get(`users/${UID}/channels/${SRC}/musicPlaylists/pl-other`) as { trackIds: string[] };
        expect(plOther.trackIds).toEqual(["only-other-track"]);
    });

    it("does NOT create music playlists in destination", async () => {
        seedHappyPath();
        await runTrackMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, trackId: TID });

        const destPlaylistKeys = [...store.docs.keys()].filter((k) =>
            k.startsWith(`users/${UID}/channels/${DST}/musicPlaylists/`),
        );
        expect(destPlaylistKeys).toEqual([]);
    });
});
