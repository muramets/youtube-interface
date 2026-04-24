// =============================================================================
// trendService — unit tests
// Covers: parseChannelInput, addTrendChannel, syncChannelCloud, copyTrendChannel,
//         deleteSourceTrendChannelData, moveTrendChannel.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory Firestore mock
//
// Stores docs keyed by their full path. `writeBatch` accumulates operations
// and commits them atomically to the store. Mirrors enough of the real SDK
// surface to let copy/delete paths exercise their actual logic.
// ---------------------------------------------------------------------------

type DocRef = { __kind: 'doc'; collectionPath: string; docId: string; path: string };
type CollectionRef = { __kind: 'collection'; path: string };

const store: Map<string, Map<string, unknown>> = new Map();

const resetStore = () => {
    store.clear();
};

const getCollection = (path: string): Map<string, unknown> => {
    if (!store.has(path)) store.set(path, new Map());
    return store.get(path)!;
};

const seedDoc = (collPath: string, id: string, data: unknown) => {
    getCollection(collPath).set(id, data);
};

const docRef = (path: string, id?: string): DocRef => {
    if (id !== undefined) {
        return { __kind: 'doc', collectionPath: path, docId: id, path: `${path}/${id}` };
    }
    const lastSlash = path.lastIndexOf('/');
    return {
        __kind: 'doc',
        collectionPath: path.substring(0, lastSlash),
        docId: path.substring(lastSlash + 1),
        path
    };
};

const collectionRef = (path: string): CollectionRef => ({ __kind: 'collection', path });

const setDocImpl = vi.fn((ref: DocRef, data: unknown) => {
    getCollection(ref.collectionPath).set(ref.docId, { ...(data as object) });
    return Promise.resolve();
});

const updateDocImpl = vi.fn((ref: DocRef, updates: Record<string, unknown>) => {
    const coll = getCollection(ref.collectionPath);
    const existing = (coll.get(ref.docId) as Record<string, unknown> | undefined) ?? {};
    coll.set(ref.docId, { ...existing, ...updates });
    return Promise.resolve();
});

const deleteDocImpl = vi.fn((ref: DocRef) => {
    getCollection(ref.collectionPath).delete(ref.docId);
    return Promise.resolve();
});

const getDocImpl = vi.fn((ref: DocRef) => {
    const coll = getCollection(ref.collectionPath);
    const data = coll.get(ref.docId);
    return Promise.resolve({
        exists: () => data !== undefined,
        data: () => data,
        id: ref.docId
    });
});

const getDocsImpl = vi.fn((ref: CollectionRef | { path: string }) => {
    const path = ref.path;
    const coll = getCollection(path);
    const docs = Array.from(coll.entries()).map(([id, data]) => ({
        id,
        data: () => data,
        exists: () => true
    }));
    return Promise.resolve({ docs, size: docs.length });
});

type BatchOp =
    | { type: 'set'; ref: DocRef; data: unknown; merge?: boolean }
    | { type: 'update'; ref: DocRef; data: Record<string, unknown> }
    | { type: 'delete'; ref: DocRef };

const batchCommitsLog: BatchOp[][] = [];

const writeBatchImpl = vi.fn(() => {
    const ops: BatchOp[] = [];
    return {
        set: (ref: DocRef, data: unknown, options?: { merge?: boolean }) => {
            ops.push({ type: 'set', ref, data, merge: options?.merge });
        },
        update: (ref: DocRef, data: Record<string, unknown>) => {
            ops.push({ type: 'update', ref, data });
        },
        delete: (ref: DocRef) => {
            ops.push({ type: 'delete', ref });
        },
        commit: () => {
            batchCommitsLog.push([...ops]);
            for (const op of ops) {
                if (op.type === 'set') {
                    if (op.merge) {
                        const coll = getCollection(op.ref.collectionPath);
                        const existing = (coll.get(op.ref.docId) as Record<string, unknown> | undefined) ?? {};
                        coll.set(op.ref.docId, { ...existing, ...(op.data as object) });
                    } else {
                        getCollection(op.ref.collectionPath).set(op.ref.docId, { ...(op.data as object) });
                    }
                } else if (op.type === 'update') {
                    const coll = getCollection(op.ref.collectionPath);
                    const existing = (coll.get(op.ref.docId) as Record<string, unknown> | undefined) ?? {};
                    coll.set(op.ref.docId, { ...existing, ...op.data });
                } else {
                    getCollection(op.ref.collectionPath).delete(op.ref.docId);
                }
            }
            return Promise.resolve();
        }
    };
});

const incrementMarker = (amount: number) => ({ __increment: amount });

vi.mock('firebase/firestore', () => ({
    collection: (_db: unknown, path: string) => collectionRef(path),
    doc: (_db: unknown, path: string, id?: string) => docRef(path, id),
    setDoc: (...args: unknown[]) => setDocImpl(args[0] as DocRef, args[1]),
    updateDoc: (...args: unknown[]) => updateDocImpl(args[0] as DocRef, args[1] as Record<string, unknown>),
    deleteDoc: (...args: unknown[]) => deleteDocImpl(args[0] as DocRef),
    getDoc: (...args: unknown[]) => getDocImpl(args[0] as DocRef),
    getDocs: (...args: unknown[]) => getDocsImpl(args[0] as CollectionRef),
    onSnapshot: vi.fn(),
    writeBatch: () => writeBatchImpl(),
    increment: (amount: number) => incrementMarker(amount),
    query: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
}));

vi.mock('../../../config/firebase', () => ({
    db: {},
    functions: {},
}));

const mockCallableInvoke = vi.fn().mockResolvedValue({ data: { success: true } });
const mockHttpsCallable = vi.fn((functions: unknown, name: string) => {
    void functions;
    void name;
    return mockCallableInvoke;
});
vi.mock('firebase/functions', () => ({
    httpsCallable: (functions: unknown, name: string) => mockHttpsCallable(functions, name),
}));

vi.mock('../../utils/debug', () => ({
    trackRead: vi.fn(),
}));

vi.mock('idb', () => ({
    openDB: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { TrendService, parseChannelInput } from '../trendService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-1';
const SOURCE_CHAN = 'source-chan';
const TARGET_CHAN = 'target-chan';
const TREND_CHAN = 'UCtrend';
const API_KEY = 'test-api-key';

interface YoutubeChannelResponse {
    items?: Array<{
        id: string;
        snippet: {
            title: string;
            customUrl?: string;
            thumbnails: {
                default?: { url: string };
                medium?: { url: string };
                high?: { url: string };
            };
        };
        contentDetails: {
            relatedPlaylists: {
                uploads: string;
            };
        };
        statistics: {
            subscriberCount: string;
        };
    }>;
}

const buildYoutubeResponse = (): YoutubeChannelResponse => ({
    items: [{
        id: 'UCabc123',
        snippet: {
            title: 'Test Channel',
            customUrl: '@testchannel',
            thumbnails: {
                default: { url: 'http://img.default/1.jpg' },
                medium: { url: 'http://img.medium/1.jpg' },
                high: { url: 'http://img.high/1.jpg' },
            },
        },
        contentDetails: { relatedPlaylists: { uploads: 'UUabc123' } },
        statistics: { subscriberCount: '123456' },
    }],
});

const mockYoutubeFetch = (response: YoutubeChannelResponse) => {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

const resetAllMocks = () => {
    resetStore();
    batchCommitsLog.length = 0;
    vi.clearAllMocks();
    mockCallableInvoke.mockClear();
    mockCallableInvoke.mockResolvedValue({ data: { success: true } });
};

// ---------------------------------------------------------------------------
// parseChannelInput
// ---------------------------------------------------------------------------

describe('parseChannelInput', () => {
    it('extracts @handle from youtube.com/@MrBeast URL', () => {
        expect(parseChannelInput('https://youtube.com/@MrBeast')).toEqual({ channelId: '', handle: '@MrBeast' });
    });

    it('extracts @handle from handle path with /videos suffix', () => {
        expect(parseChannelInput('https://youtube.com/@MrBeast/videos')).toEqual({ channelId: '', handle: '@MrBeast' });
    });

    it('extracts UC-id from /channel/ URL', () => {
        expect(parseChannelInput('https://youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA')).toEqual({
            channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA',
            handle: '',
        });
    });

    it('treats /c/CustomName as a handle', () => {
        expect(parseChannelInput('https://youtube.com/c/CustomName')).toEqual({ channelId: '', handle: '@CustomName' });
    });

    it('treats /user/LegacyName as a handle', () => {
        expect(parseChannelInput('https://youtube.com/user/LegacyName')).toEqual({ channelId: '', handle: '@LegacyName' });
    });

    it('accepts bare @handle input', () => {
        expect(parseChannelInput('@MrBeast')).toEqual({ channelId: '', handle: '@MrBeast' });
    });

    it('accepts bare UC-id input', () => {
        expect(parseChannelInput('UCX6OQ3DkcsbYNE6H8uQQuVA')).toEqual({
            channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA',
            handle: '',
        });
    });

    it('prepends @ to bare handle without prefix', () => {
        expect(parseChannelInput('MrBeast')).toEqual({ channelId: '', handle: '@MrBeast' });
    });

    it('trims surrounding whitespace', () => {
        expect(parseChannelInput('   @MrBeast   ')).toEqual({ channelId: '', handle: '@MrBeast' });
    });
});

// ---------------------------------------------------------------------------
// addTrendChannel
// ---------------------------------------------------------------------------

describe('TrendService.addTrendChannel', () => {
    beforeEach(() => resetAllMocks());
    afterEach(() => vi.unstubAllGlobals());

    it('fetches metadata by handle when input is @handle', async () => {
        const fetchMock = mockYoutubeFetch(buildYoutubeResponse());
        await TrendService.addTrendChannel(USER_ID, SOURCE_CHAN, '@testchannel', API_KEY);

        const calledUrl = fetchMock.mock.calls[0][0] as string;
        expect(calledUrl).toContain('forHandle=%40testchannel');
        expect(calledUrl).toContain(`key=${API_KEY}`);
    });

    it('fetches metadata by id when input is UC-id', async () => {
        const fetchMock = mockYoutubeFetch(buildYoutubeResponse());
        await TrendService.addTrendChannel(USER_ID, SOURCE_CHAN, 'UCX6OQ3DkcsbYNE6H8uQQuVA', API_KEY);

        const calledUrl = fetchMock.mock.calls[0][0] as string;
        expect(calledUrl).toContain('id=UCX6OQ3DkcsbYNE6H8uQQuVA');
        expect(calledUrl).not.toContain('forHandle');
    });

    it('persists a minimal channel doc with lastUpdated=0 and isVisible=true', async () => {
        mockYoutubeFetch(buildYoutubeResponse());
        const { channel } = await TrendService.addTrendChannel(USER_ID, SOURCE_CHAN, '@testchannel', API_KEY);

        expect(channel.lastUpdated).toBe(0);
        expect(channel.isVisible).toBe(true);

        const persisted = getCollection(`users/${USER_ID}/channels/${SOURCE_CHAN}/trendChannels`).get('UCabc123');
        expect(persisted).toMatchObject({
            id: 'UCabc123',
            title: 'Test Channel',
            isVisible: true,
            lastUpdated: 0,
        });
    });

    it('throws "Channel not found" when YouTube returns no items', async () => {
        mockYoutubeFetch({ items: [] });
        await expect(
            TrendService.addTrendChannel(USER_ID, SOURCE_CHAN, '@ghost', API_KEY)
        ).rejects.toThrow('Channel not found');
        expect(getCollection(`users/${USER_ID}/channels/${SOURCE_CHAN}/trendChannels`).size).toBe(0);
    });

    it('does NOT call playlistItems or videos endpoints', async () => {
        const fetchMock = mockYoutubeFetch(buildYoutubeResponse());
        await TrendService.addTrendChannel(USER_ID, SOURCE_CHAN, '@testchannel', API_KEY);

        const allUrls = fetchMock.mock.calls.map(c => c[0] as string);
        expect(allUrls).toHaveLength(1);
        expect(allUrls[0]).toContain('/youtube/v3/channels');
        expect(allUrls.some(u => u.includes('playlistItems') || u.includes('/videos?'))).toBe(false);
    });

    it('does NOT dispatch manualTrendSync — caller is responsible', async () => {
        mockYoutubeFetch(buildYoutubeResponse());
        await TrendService.addTrendChannel(USER_ID, SOURCE_CHAN, '@testchannel', API_KEY);
        expect(mockHttpsCallable).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// syncChannelCloud
// ---------------------------------------------------------------------------

describe('TrendService.syncChannelCloud', () => {
    beforeEach(() => resetAllMocks());

    it('invokes manualTrendSync callable with channelId and optional targets', async () => {
        await TrendService.syncChannelCloud(SOURCE_CHAN, ['UCabc123'], true);

        expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'manualTrendSync');
        expect(mockCallableInvoke).toHaveBeenCalledWith({
            channelId: SOURCE_CHAN,
            targetTrendChannelIds: ['UCabc123'],
            forceAvatarRefresh: true,
        });
    });
});

// ---------------------------------------------------------------------------
// copyTrendChannel / deleteSourceTrendChannelData / moveTrendChannel
// ---------------------------------------------------------------------------

const seedSourceChannel = (videoCount: number = 3, snapshotCount: number = 5) => {
    const base = `users/${USER_ID}/channels/${SOURCE_CHAN}`;
    // Channel doc
    seedDoc(`${base}/trendChannels`, TREND_CHAN, {
        id: TREND_CHAN,
        title: 'Source Trend Channel',
        uploadsPlaylistId: 'UU123',
        isVisible: true,
        subscriberCount: 1000,
        lastUpdated: 1700000000000,
    });
    // Videos
    for (let i = 0; i < videoCount; i++) {
        seedDoc(`${base}/trendChannels/${TREND_CHAN}/videos`, `v${i}`, {
            id: `v${i}`,
            channelId: TREND_CHAN,
            viewCount: (i + 1) * 1000,
            title: `Video ${i}`,
        });
    }
    // Snapshots
    for (let i = 0; i < snapshotCount; i++) {
        const ts = 1700000000000 + i * 86400000;
        seedDoc(`${base}/trendChannels/${TREND_CHAN}/snapshots`, String(ts), {
            id: String(ts),
            timestamp: ts,
            videoViews: { v0: 100, v1: 200 },
            type: 'auto',
        });
    }
    // Niches
    seedDoc(`${base}/trendNiches`, 'niche-local', {
        id: 'niche-local',
        name: 'Gaming',
        color: '#ff0000',
        type: 'local',
        channelId: TREND_CHAN,
        viewCount: 3000,
        createdAt: 1700000000000,
    });
    seedDoc(`${base}/trendNiches`, 'niche-global', {
        id: 'niche-global',
        name: 'Shorts',
        color: '#00ff00',
        type: 'global',
        viewCount: 2000,
        createdAt: 1700000000000,
    });
    seedDoc(`${base}/trendNiches`, 'niche-unrelated', {
        id: 'niche-unrelated',
        name: 'Other',
        color: '#0000ff',
        type: 'local',
        channelId: 'UCotherChannel',
        viewCount: 500,
        createdAt: 1700000000000,
    });
    // Assignments for v0 and v1
    seedDoc(`${base}/videoNicheAssignments`, 'v0', {
        assignments: [{ nicheId: 'niche-local', addedAt: 1700000000000 }, { nicheId: 'niche-global', addedAt: 1700000000000 }],
    });
    seedDoc(`${base}/videoNicheAssignments`, 'v1', {
        assignments: [{ nicheId: 'niche-global', addedAt: 1700000000000 }],
    });
    // Hidden video from this channel + one from another channel
    seedDoc(`${base}/hiddenVideos`, 'v2', { id: 'v2', channelId: TREND_CHAN, hiddenAt: 1700000000000 });
    seedDoc(`${base}/hiddenVideos`, 'xOther', { id: 'xOther', channelId: 'UCotherChannel', hiddenAt: 1700000000000 });
};

describe('TrendService.copyTrendChannel — fresh copy', () => {
    beforeEach(() => resetAllMocks());

    it('copies channel doc, videos and snapshots to target', async () => {
        seedSourceChannel(3, 5);

        await TrendService.copyTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, TREND_CHAN, false);

        const targetChannelDoc = getCollection(`users/${USER_ID}/channels/${TARGET_CHAN}/trendChannels`).get(TREND_CHAN);
        expect(targetChannelDoc).toBeDefined();
        expect((targetChannelDoc as { lastUpdated: number }).lastUpdated).toBe(0);

        const targetVideos = getCollection(`users/${USER_ID}/channels/${TARGET_CHAN}/trendChannels/${TREND_CHAN}/videos`);
        expect(targetVideos.size).toBe(3);

        const targetSnapshots = getCollection(`users/${USER_ID}/channels/${TARGET_CHAN}/trendChannels/${TREND_CHAN}/snapshots`);
        expect(targetSnapshots.size).toBe(5);
    });

    it('copies hidden videos only for this channel', async () => {
        seedSourceChannel();
        await TrendService.copyTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, TREND_CHAN, false);

        const targetHidden = getCollection(`users/${USER_ID}/channels/${TARGET_CHAN}/hiddenVideos`);
        expect(targetHidden.size).toBe(1);
        expect(targetHidden.get('v2')).toBeDefined();
        expect(targetHidden.get('xOther')).toBeUndefined();
    });

    it('copies relevant niches (local to this channel + globals used by this channel)', async () => {
        seedSourceChannel();
        await TrendService.copyTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, TREND_CHAN, false);

        const targetNiches = Array.from(getCollection(`users/${USER_ID}/channels/${TARGET_CHAN}/trendNiches`).values()) as Array<{ name: string }>;
        const names = targetNiches.map(n => n.name).sort();
        expect(names).toEqual(['Gaming', 'Shorts']); // local + global, but NOT 'Other' (belongs to another channel)
    });

    it('dispatches syncChannelCloud for the target after copy', async () => {
        seedSourceChannel();
        await TrendService.copyTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, TREND_CHAN, false);

        // Fire-and-forget: let the microtask flush
        await new Promise(r => setTimeout(r, 0));

        expect(mockCallableInvoke).toHaveBeenCalledWith({
            channelId: TARGET_CHAN,
            targetTrendChannelIds: [TREND_CHAN],
            forceAvatarRefresh: false,
        });
    });

    it('handles many videos by chunking across multiple batch commits', async () => {
        seedSourceChannel(450, 2); // >400 videos — forces at least 2 commits

        await TrendService.copyTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, TREND_CHAN, false);

        expect(batchCommitsLog.length).toBeGreaterThan(1);
        batchCommitsLog.forEach(ops => expect(ops.length).toBeLessThanOrEqual(400));

        const targetVideos = getCollection(`users/${USER_ID}/channels/${TARGET_CHAN}/trendChannels/${TREND_CHAN}/videos`);
        expect(targetVideos.size).toBe(450);
    });

    it('throws when source channel does not exist', async () => {
        await expect(
            TrendService.copyTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, 'UCnotthere', false)
        ).rejects.toThrow('Source channel not found');
    });
});

describe('TrendService.copyTrendChannel — merge mode', () => {
    beforeEach(() => resetAllMocks());

    it('does NOT copy snapshots (target preserves its own history)', async () => {
        seedSourceChannel(3, 5);
        // Seed target with its own channel doc + one existing snapshot
        const base = `users/${USER_ID}/channels/${TARGET_CHAN}`;
        seedDoc(`${base}/trendChannels`, TREND_CHAN, {
            id: TREND_CHAN,
            title: 'Target Trend Channel',
            uploadsPlaylistId: 'UU123',
            isVisible: true,
            subscriberCount: 2000,
            lastUpdated: 1710000000000,
        });
        seedDoc(`${base}/trendChannels/${TREND_CHAN}/snapshots`, '1710000000000', {
            id: '1710000000000',
            timestamp: 1710000000000,
            videoViews: { v0: 500 },
            type: 'auto',
        });

        await TrendService.copyTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, TREND_CHAN, true);

        const targetSnapshots = getCollection(`${base}/trendChannels/${TREND_CHAN}/snapshots`);
        expect(targetSnapshots.size).toBe(1); // only target's own — source's 5 are NOT copied
        expect(Array.from(targetSnapshots.keys())).toEqual(['1710000000000']);
    });

    it('does NOT dispatch syncChannelCloud in merge mode', async () => {
        seedSourceChannel();
        const base = `users/${USER_ID}/channels/${TARGET_CHAN}`;
        seedDoc(`${base}/trendChannels`, TREND_CHAN, { id: TREND_CHAN, lastUpdated: 1710000000000 });

        await TrendService.copyTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, TREND_CHAN, true);
        await new Promise(r => setTimeout(r, 0));

        expect(mockCallableInvoke).not.toHaveBeenCalled();
    });

    it('reuses same-name niche in target when merging', async () => {
        seedSourceChannel();
        const base = `users/${USER_ID}/channels/${TARGET_CHAN}`;
        seedDoc(`${base}/trendChannels`, TREND_CHAN, { id: TREND_CHAN });
        seedDoc(`${base}/trendNiches`, 'target-gaming-niche', {
            id: 'target-gaming-niche',
            name: 'Gaming',
            type: 'local',
            channelId: TREND_CHAN,
            viewCount: 0,
            createdAt: 1710000000000,
        });

        await TrendService.copyTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, TREND_CHAN, true);

        const targetNiches = Array.from(getCollection(`${base}/trendNiches`).entries()) as [string, { name: string }][];
        const gamingEntries = targetNiches.filter(([, n]) => n.name === 'Gaming');
        expect(gamingEntries).toHaveLength(1);
        expect(gamingEntries[0][0]).toBe('target-gaming-niche'); // existing id reused
    });
});

describe('TrendService.deleteSourceTrendChannelData', () => {
    beforeEach(() => resetAllMocks());

    it('removes channel doc, videos, snapshots, scoped assignments, hidden, and local niches', async () => {
        seedSourceChannel(3, 5);
        const base = `users/${USER_ID}/channels/${SOURCE_CHAN}`;

        await TrendService.deleteSourceTrendChannelData(USER_ID, SOURCE_CHAN, TREND_CHAN);

        expect(getCollection(`${base}/trendChannels`).size).toBe(0);
        expect(getCollection(`${base}/trendChannels/${TREND_CHAN}/videos`).size).toBe(0);
        expect(getCollection(`${base}/trendChannels/${TREND_CHAN}/snapshots`).size).toBe(0);

        // Assignments for v0/v1 gone
        expect(getCollection(`${base}/videoNicheAssignments`).size).toBe(0);

        // Hidden: this channel's entry gone, other channel's kept
        const hidden = getCollection(`${base}/hiddenVideos`);
        expect(hidden.size).toBe(1);
        expect(hidden.has('xOther')).toBe(true);
    });

    it('preserves global niches (may still be used by other trend channels)', async () => {
        seedSourceChannel();
        const base = `users/${USER_ID}/channels/${SOURCE_CHAN}`;

        await TrendService.deleteSourceTrendChannelData(USER_ID, SOURCE_CHAN, TREND_CHAN);

        const remaining = Array.from(getCollection(`${base}/trendNiches`).values()) as Array<{ name: string; type: string }>;
        const names = remaining.map(n => n.name).sort();
        expect(names).toContain('Shorts'); // global, survives
        expect(names).not.toContain('Gaming'); // local to TREND_CHAN, removed
        expect(names).toContain('Other'); // local to a different channel, survives
    });

    it('is idempotent — second run is safe', async () => {
        seedSourceChannel();

        await TrendService.deleteSourceTrendChannelData(USER_ID, SOURCE_CHAN, TREND_CHAN);
        await expect(
            TrendService.deleteSourceTrendChannelData(USER_ID, SOURCE_CHAN, TREND_CHAN)
        ).resolves.not.toThrow();
    });
});

describe('TrendService.moveTrendChannel', () => {
    beforeEach(() => resetAllMocks());

    it('copies everything to target and clears source (fresh move)', async () => {
        seedSourceChannel(3, 5);

        await TrendService.moveTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, TREND_CHAN, false);

        // Target has everything
        expect(getCollection(`users/${USER_ID}/channels/${TARGET_CHAN}/trendChannels`).get(TREND_CHAN)).toBeDefined();
        expect(getCollection(`users/${USER_ID}/channels/${TARGET_CHAN}/trendChannels/${TREND_CHAN}/videos`).size).toBe(3);
        expect(getCollection(`users/${USER_ID}/channels/${TARGET_CHAN}/trendChannels/${TREND_CHAN}/snapshots`).size).toBe(5);

        // Source wiped
        expect(getCollection(`users/${USER_ID}/channels/${SOURCE_CHAN}/trendChannels`).size).toBe(0);
        expect(getCollection(`users/${USER_ID}/channels/${SOURCE_CHAN}/trendChannels/${TREND_CHAN}/videos`).size).toBe(0);
        expect(getCollection(`users/${USER_ID}/channels/${SOURCE_CHAN}/trendChannels/${TREND_CHAN}/snapshots`).size).toBe(0);
    });

    it('does not touch source when copy step fails', async () => {
        // No source data — copyTrendChannel should throw "Source channel not found"
        await expect(
            TrendService.moveTrendChannel(USER_ID, SOURCE_CHAN, TARGET_CHAN, TREND_CHAN, false)
        ).rejects.toThrow('Source channel not found');

        expect(getCollection(`users/${USER_ID}/channels/${TARGET_CHAN}/trendChannels`).size).toBe(0);
    });
});
