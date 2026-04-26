import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── In-memory Firestore + Storage fake ────────────────────────────────
//
// vi.hoisted lifts the store + builders above the module mock factory
// (which itself is hoisted to the top of the file). This lets the mocked
// module return objects that close over the test-controlled store.

const { store, fakeDb, fakeBucket } = vi.hoisted(() => {
    interface FakeStore {
        docs: Map<string, Record<string, unknown>>;
        subcollections: Map<string, string[]>;
        files: Map<string, Buffer>;
        callLog: string[];
    }

    const store: FakeStore = {
        docs: new Map(),
        subcollections: new Map(),
        files: new Map(),
        callLog: [],
    };

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
            listCollections: async () => {
                const subs = store.subcollections.get(path) ?? [];
                return subs.map((name) => ({
                    id: name,
                    ...fakeCollectionRef(`${path}/${name}`),
                }));
            },
            collection: (name: string) => fakeCollectionRef(`${path}/${name}`),
        };
    }

    function fakeCollectionRef(basePath: string) {
        const docIds = (): string[] => {
            const prefix = basePath + "/";
            const ids = new Set<string>();
            for (const p of store.docs.keys()) {
                if (p.startsWith(prefix)) {
                    const rest = p.slice(prefix.length);
                    if (!rest.includes("/")) ids.add(rest);
                }
            }
            return [...ids];
        };
        return {
            get: async () => {
                const ids = docIds();
                return {
                    docs: ids.map((id) => ({
                        id,
                        data: () => store.docs.get(`${basePath}/${id}`)!,
                        ref: fakeDocRef(`${basePath}/${id}`),
                    })),
                    empty: ids.length === 0,
                };
            },
            doc: (id: string) => fakeDocRef(`${basePath}/${id}`),
        };
    }

    function fakeBatch() {
        const ops: Array<() => Promise<void>> = [];
        return {
            set: (
                ref: { set: (d: Record<string, unknown>) => Promise<void> },
                data: Record<string, unknown>,
            ) => ops.push(() => ref.set(data)),
            update: (
                ref: { update: (d: Record<string, unknown>) => Promise<void> },
                data: Record<string, unknown>,
            ) => ops.push(() => ref.update(data)),
            delete: (ref: { delete: () => Promise<void> }) =>
                ops.push(() => ref.delete()),
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
        runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
            const tx = {
                get: (ref: { get: () => Promise<unknown> }) => ref.get(),
                set: (
                    ref: { set: (d: Record<string, unknown>) => Promise<void> },
                    data: Record<string, unknown>,
                ) => ref.set(data),
                update: (
                    ref: { update: (d: Record<string, unknown>) => Promise<void> },
                    data: Record<string, unknown>,
                ) => ref.update(data),
                delete: (ref: { delete: () => Promise<void> }) => ref.delete(),
            };
            return fn(tx);
        },
    };

    function fakeFile(name: string) {
        return {
            name,
            copy: async (target: { name: string }) => {
                store.files.set(target.name, store.files.get(name) ?? Buffer.from(""));
                store.callLog.push(`storageCopy:${name}->${target.name}`);
            },
            delete: async () => {
                store.files.delete(name);
                store.callLog.push(`storageDelete:${name}`);
            },
        };
    }

    const fakeBucket = {
        getFiles: async ({ prefix }: { prefix: string }) => {
            const files = [...store.files.keys()]
                .filter((k) => k.startsWith(prefix))
                .map((n) => fakeFile(n));
            return [files] as const;
        },
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

import { runMove } from "../moveVideo.js";

const UID = "user1";
const SRC = "channelSource";
const DST = "channelDest";
const VID = "custom-123";

const seed = (): void => {
    store.docs.clear();
    store.subcollections.clear();
    store.files.clear();
    store.callLog.length = 0;
};

const seedHappyPath = (): void => {
    seed();
    store.docs.set(`users/${UID}/channels/${SRC}`, { title: "Source" });
    store.docs.set(`users/${UID}/channels/${DST}`, { title: "Dest" });
    store.docs.set(`users/${UID}/channels/${SRC}/videos/${VID}`, {
        id: VID,
        title: "Test video",
        customImage: `users/${UID}/channels/${SRC}/videos/${VID}/img.jpg`,
    });
    store.subcollections.set(`users/${UID}/channels/${SRC}/videos/${VID}`, [
        "traffic",
        "trafficSource",
    ]);
    store.docs.set(`users/${UID}/channels/${SRC}/videos/${VID}/traffic/main`, {
        snapshots: [
            { id: "snap1", storagePath: `users/${UID}/channels/${SRC}/videos/${VID}/snapshots/snap_1.csv` },
        ],
    });
    store.docs.set(`users/${UID}/channels/${SRC}/videos/${VID}/trafficSource/main`, {
        snapshots: [
            { id: "ts1", storagePath: `users/${UID}/channels/${SRC}/videos/${VID}/trafficSources/ts_1.csv` },
        ],
    });
    store.files.set(`users/${UID}/channels/${SRC}/videos/${VID}/img.jpg`, Buffer.from("img"));
    store.files.set(`users/${UID}/channels/${SRC}/videos/${VID}/snapshots/snap_1.csv`, Buffer.from("csv1"));
    store.files.set(`users/${UID}/channels/${SRC}/videos/${VID}/trafficSources/ts_1.csv`, Buffer.from("csv2"));
    store.docs.set(`users/${UID}/channels/${SRC}/settings/videoOrder`, {
        order: ["other-vid", VID, "third"],
    });
    store.docs.set(`users/${UID}/channels/${DST}/settings/videoOrder`, {
        order: ["existing-vid"],
    });
    store.docs.set(`users/${UID}/channels/${SRC}/playlists/p1`, {
        name: "Source PL",
        videoIds: ["other-vid", VID],
    });
};

beforeEach(seed);

describe("runMove validation", () => {
    it("throws when source channel does not exist", async () => {
        store.docs.set(`users/${UID}/channels/${DST}`, { title: "Dest" });
        await expect(
            runMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID }),
        ).rejects.toThrow(/Source channel/);
    });

    it("throws when dest channel does not exist", async () => {
        store.docs.set(`users/${UID}/channels/${SRC}`, { title: "Source" });
        await expect(
            runMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID }),
        ).rejects.toThrow(/Destination channel/);
    });

    it("throws when source video does not exist", async () => {
        store.docs.set(`users/${UID}/channels/${SRC}`, { title: "Source" });
        store.docs.set(`users/${UID}/channels/${DST}`, { title: "Dest" });
        await expect(
            runMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID }),
        ).rejects.toThrow(/not found in source channel/);
    });

    it("refuses to overwrite an existing dest video", async () => {
        seedHappyPath();
        store.docs.set(`users/${UID}/channels/${DST}/videos/${VID}`, { existing: true });
        await expect(
            runMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID }),
        ).rejects.toThrow(/already exists in destination/);
    });
});

describe("runMove happy path", () => {
    it("moves doc tree, copies storage, updates orders, cleans playlists, deletes source", async () => {
        seedHappyPath();
        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID,
        });

        expect(result.success).toBe(true);
        expect(result.docsCopied).toBe(3);
        expect(result.storageFilesCopied).toBe(3);
        expect(result.playlistsUpdated).toBe(1);

        const dst = store.docs.get(`users/${UID}/channels/${DST}/videos/${VID}`);
        expect(dst).toBeDefined();
        expect(dst!.customImage).toBe(`users/${UID}/channels/${DST}/videos/${VID}/img.jpg`);

        const trafficMain = store.docs.get(
            `users/${UID}/channels/${DST}/videos/${VID}/traffic/main`,
        ) as { snapshots: Array<{ storagePath: string }> };
        expect(trafficMain.snapshots[0].storagePath).toBe(
            `users/${UID}/channels/${DST}/videos/${VID}/snapshots/snap_1.csv`,
        );

        expect(store.docs.has(`users/${UID}/channels/${SRC}/videos/${VID}`)).toBe(false);

        const srcOrder = store.docs.get(`users/${UID}/channels/${SRC}/settings/videoOrder`) as { order: string[] };
        expect(srcOrder.order).toEqual(["other-vid", "third"]);
        const dstOrder = store.docs.get(`users/${UID}/channels/${DST}/settings/videoOrder`) as { order: string[] };
        expect(dstOrder.order).toEqual(["existing-vid", VID]);

        const playlist = store.docs.get(`users/${UID}/channels/${SRC}/playlists/p1`) as { videoIds: string[] };
        expect(playlist.videoIds).toEqual(["other-vid"]);

        expect(store.files.has(`users/${UID}/channels/${DST}/videos/${VID}/img.jpg`)).toBe(true);
        expect(store.files.has(`users/${UID}/channels/${SRC}/videos/${VID}/img.jpg`)).toBe(false);
    });

    it("writes destination before deleting source (atomicity contract)", async () => {
        seedHappyPath();
        await runMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID });

        const firstDestSet = store.callLog.findIndex(
            (op) => op === `set:users/${UID}/channels/${DST}/videos/${VID}`,
        );
        const firstSourceDelete = store.callLog.findIndex(
            (op) => op === `delete:users/${UID}/channels/${SRC}/videos/${VID}`,
        );

        expect(firstDestSet).toBeGreaterThanOrEqual(0);
        expect(firstSourceDelete).toBeGreaterThanOrEqual(0);
        expect(firstDestSet).toBeLessThan(firstSourceDelete);
    });

    it("discovers subcollections via listCollections (no hardcoded names)", async () => {
        seedHappyPath();
        store.subcollections.set(`users/${UID}/channels/${SRC}/videos/${VID}`, [
            "traffic",
            "trafficSource",
            "futureFeature",
        ]);
        store.docs.set(`users/${UID}/channels/${SRC}/videos/${VID}/futureFeature/data`, {
            payload: "anything",
        });

        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID,
        });
        expect(result.docsCopied).toBe(4);

        const futureDoc = store.docs.get(
            `users/${UID}/channels/${DST}/videos/${VID}/futureFeature/data`,
        );
        expect(futureDoc).toEqual({ payload: "anything" });
    });

    it("mirrors source isPlaylistOnly=true (video stays out of dest Home)", async () => {
        seedHappyPath();
        const srcDoc = store.docs.get(`users/${UID}/channels/${SRC}/videos/${VID}`)!;
        srcDoc.isPlaylistOnly = true;
        srcDoc.addedToHomeAt = 100;

        await runMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID });

        const dst = store.docs.get(`users/${UID}/channels/${DST}/videos/${VID}`) as {
            isPlaylistOnly: boolean;
            addedToHomeAt: number;
        };
        expect(dst.isPlaylistOnly).toBe(true);
        // addedToHomeAt is not refreshed when the video stays playlist-only
        expect(dst.addedToHomeAt).toBe(100);
    });

    it("surfaces a Home-visible source video on dest Home with fresh addedToHomeAt", async () => {
        seedHappyPath();
        const srcDoc = store.docs.get(`users/${UID}/channels/${SRC}/videos/${VID}`)!;
        srcDoc.isPlaylistOnly = false;
        srcDoc.addedToHomeAt = 100;

        const before = Date.now();
        await runMove({ userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID });
        const after = Date.now();

        const dst = store.docs.get(`users/${UID}/channels/${DST}/videos/${VID}`) as {
            isPlaylistOnly: boolean;
            addedToHomeAt: number;
        };
        expect(dst.isPlaylistOnly).toBe(false);
        expect(dst.addedToHomeAt).toBeGreaterThanOrEqual(before);
        expect(dst.addedToHomeAt).toBeLessThanOrEqual(after);
    });

    it("handles videos with no subcollections and no storage files", async () => {
        seed();
        store.docs.set(`users/${UID}/channels/${SRC}`, { title: "Source" });
        store.docs.set(`users/${UID}/channels/${DST}`, { title: "Dest" });
        store.docs.set(`users/${UID}/channels/${SRC}/videos/${VID}`, { id: VID, title: "Bare" });

        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID,
        });
        expect(result.docsCopied).toBe(1);
        expect(result.storageFilesCopied).toBe(0);
        expect(result.playlistsUpdated).toBe(0);
    });

    it("returns mode='move' by default", async () => {
        seedHappyPath();
        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID,
        });
        expect(result.mode).toBe('move');
    });
});

describe("runMove copy mode", () => {
    it("copies tree to dest while leaving source untouched", async () => {
        seedHappyPath();
        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID, mode: 'copy',
        });

        expect(result.success).toBe(true);
        expect(result.mode).toBe('copy');
        expect(result.docsCopied).toBe(3);
        expect(result.storageFilesCopied).toBe(3);
        expect(result.playlistsUpdated).toBe(0); // copy never touches source playlists

        // Dest got the full tree
        expect(store.docs.get(`users/${UID}/channels/${DST}/videos/${VID}`)).toBeDefined();
        expect(store.docs.get(
            `users/${UID}/channels/${DST}/videos/${VID}/traffic/main`,
        )).toBeDefined();

        // Source video doc still there
        expect(store.docs.has(`users/${UID}/channels/${SRC}/videos/${VID}`)).toBe(true);
        // Source subcollections still there
        expect(store.docs.has(`users/${UID}/channels/${SRC}/videos/${VID}/traffic/main`)).toBe(true);
        // Source storage still there
        expect(store.files.has(`users/${UID}/channels/${SRC}/videos/${VID}/img.jpg`)).toBe(true);
        // Source playlist still references the video
        const playlist = store.docs.get(`users/${UID}/channels/${SRC}/playlists/p1`) as { videoIds: string[] };
        expect(playlist.videoIds).toEqual(["other-vid", VID]);
    });

    it("preserves source videoOrder on copy (only dest is updated)", async () => {
        seedHappyPath();
        await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID, mode: 'copy',
        });

        const srcOrder = store.docs.get(`users/${UID}/channels/${SRC}/settings/videoOrder`) as { order: string[] };
        expect(srcOrder.order).toEqual(["other-vid", VID, "third"]); // unchanged

        const dstOrder = store.docs.get(`users/${UID}/channels/${DST}/settings/videoOrder`) as { order: string[] };
        expect(dstOrder.order).toEqual(["existing-vid", VID]); // appended
    });

    it("never emits source-delete operations in callLog", async () => {
        seedHappyPath();
        await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID, mode: 'copy',
        });

        const sourceDeletes = store.callLog.filter(
            op => op.startsWith(`delete:users/${UID}/channels/${SRC}/`)
                || op.startsWith(`storageDelete:users/${UID}/channels/${SRC}/`),
        );
        expect(sourceDeletes).toEqual([]);
    });

    it("refuses to overwrite an existing dest video in copy mode (same as move)", async () => {
        seedHappyPath();
        store.docs.set(`users/${UID}/channels/${DST}/videos/${VID}`, { existing: true });
        await expect(
            runMove({
                userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID, mode: 'copy',
            }),
        ).rejects.toThrow(/already exists in destination/);
    });
});

describe("runMove playlist mirroring", () => {
    it("creates a target playlist mirroring source when target has none with that ID", async () => {
        seedHappyPath();
        // seedHappyPath already creates source playlist p1 = [other-vid, VID]
        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID,
        });

        expect(result.targetPlaylistsCreated).toBe(1);
        expect(result.targetPlaylistsUpdated).toBe(0);

        const destPL = store.docs.get(`users/${UID}/channels/${DST}/playlists/p1`) as {
            id: string;
            name: string;
            videoIds: string[];
        };
        expect(destPL).toBeDefined();
        expect(destPL.id).toBe('p1');
        expect(destPL.name).toBe('Source PL'); // copied from source metadata
        expect(destPL.videoIds).toEqual([VID]); // ONLY this video, not source's other-vid
    });

    it("appends the video to an existing target playlist (matched by ID)", async () => {
        seedHappyPath();
        // Pre-existing target playlist with same ID and other videos
        store.docs.set(`users/${UID}/channels/${DST}/playlists/p1`, {
            id: 'p1',
            name: 'Target PL Custom Name',
            videoIds: ['target-only-vid'],
            createdAt: 1000,
        });

        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID,
        });

        expect(result.targetPlaylistsCreated).toBe(0);
        expect(result.targetPlaylistsUpdated).toBe(1);

        const destPL = store.docs.get(`users/${UID}/channels/${DST}/playlists/p1`) as {
            name: string;
            videoIds: string[];
        };
        expect(destPL.name).toBe('Target PL Custom Name'); // existing name preserved (not overwritten)
        expect(destPL.videoIds).toEqual(['target-only-vid', VID]);
    });

    it("dedupes when video is already in the target playlist", async () => {
        seedHappyPath();
        store.docs.set(`users/${UID}/channels/${DST}/playlists/p1`, {
            id: 'p1',
            name: 'Target PL',
            videoIds: [VID, 'other'],
            createdAt: 1000,
        });

        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID,
        });

        expect(result.targetPlaylistsCreated).toBe(0);
        expect(result.targetPlaylistsUpdated).toBe(0); // no-op, already present

        const destPL = store.docs.get(`users/${UID}/channels/${DST}/playlists/p1`) as { videoIds: string[] };
        expect(destPL.videoIds).toEqual([VID, 'other']); // unchanged
    });

    it("mirrors multiple source playlists when video belongs to several", async () => {
        seedHappyPath();
        store.docs.set(`users/${UID}/channels/${SRC}/playlists/p2`, {
            id: 'p2',
            name: 'Second Source PL',
            videoIds: [VID],
        });

        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID,
        });

        expect(result.targetPlaylistsCreated).toBe(2);
        expect(store.docs.get(`users/${UID}/channels/${DST}/playlists/p1`)).toBeDefined();
        expect(store.docs.get(`users/${UID}/channels/${DST}/playlists/p2`)).toBeDefined();
    });

    it("returns zero counts when video is in no source playlists", async () => {
        seedHappyPath();
        // Wipe the source playlist so the video is unaffiliated
        store.docs.delete(`users/${UID}/channels/${SRC}/playlists/p1`);

        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID,
        });

        expect(result.targetPlaylistsCreated).toBe(0);
        expect(result.targetPlaylistsUpdated).toBe(0);
        // No target playlists created
        const destPlaylistKeys = [...store.docs.keys()].filter(k =>
            k.startsWith(`users/${UID}/channels/${DST}/playlists/`),
        );
        expect(destPlaylistKeys).toEqual([]);
    });

    it("works in copy mode (target playlist created, source playlist preserved)", async () => {
        seedHappyPath();

        const result = await runMove({
            userId: UID, sourceChannelId: SRC, destChannelId: DST, videoId: VID, mode: 'copy',
        });

        expect(result.mode).toBe('copy');
        expect(result.targetPlaylistsCreated).toBe(1);

        // Source playlist still has the video reference
        const srcPL = store.docs.get(`users/${UID}/channels/${SRC}/playlists/p1`) as { videoIds: string[] };
        expect(srcPL.videoIds).toContain(VID);

        // Dest playlist has the video
        const destPL = store.docs.get(`users/${UID}/channels/${DST}/playlists/p1`) as { videoIds: string[] };
        expect(destPL.videoIds).toEqual([VID]);
    });
});
