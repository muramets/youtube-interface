/**
 * Unit tests for scheduledTrendSnapshot.
 *
 * Guards against regressions that broke the daily sync (e.g. switching
 * from db.collection("users") iteration to a collectionGroup query
 * that required a missing Firestore index).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

/* ---------- Firestore mock primitives ---------- */

interface MockDocSnapshot {
    id: string;
    ref: { path: string };
    data: () => Record<string, unknown>;
}
interface MockQuerySnapshot {
    docs: MockDocSnapshot[];
}

const mockDoc = (id: string, data: Record<string, unknown>, path?: string): MockDocSnapshot => ({
    id,
    ref: { path: path ?? id },
    data: () => data,
});

const mockSnap = (docs: MockDocSnapshot[]): MockQuerySnapshot => ({ docs });

/* ---------- Test context — encapsulated mutable state ---------- */

const ctx = {
    firestoreGets: [] as string[],
    syncChannelCalls: [] as Array<{
        userId: string;
        channelId: string;
        trendChannel: Record<string, unknown>;
    }>,
    notificationsAdded: [] as Array<{ path: string; data: Record<string, unknown> }>,
    firestoreData: {} as Record<string, MockQuerySnapshot | MockDocSnapshot>,

    reset() {
        this.firestoreGets = [];
        this.syncChannelCalls = [];
        this.notificationsAdded = [];
        this.firestoreData = {};
    },
};

/* ---------- Mock: Firestore (../shared/db) ---------- */

const mockCollectionGroup = vi.fn(function collectionGroup(groupId: string) {
    ctx.firestoreGets.push(`collectionGroup:${groupId}`);
    return {
        where: () => ({
            get: () => Promise.reject(new Error('FAILED_PRECONDITION: collectionGroup requires index')),
        }),
    };
});

vi.mock('../shared/db', () => ({
    db: {
        collection: vi.fn(function collection(path: string) {
            ctx.firestoreGets.push(`collection:${path}`);
            return {
                get: () => Promise.resolve(ctx.firestoreData[path] ?? mockSnap([])),
                add: (data: Record<string, unknown>) => {
                    ctx.notificationsAdded.push({ path, data });
                    return Promise.resolve({ id: 'notif-1' });
                },
            };
        }),
        doc: vi.fn(function doc(path: string) {
            ctx.firestoreGets.push(`doc:${path}`);
            return {
                get: () => Promise.resolve(ctx.firestoreData[path] ?? mockDoc('missing', {})),
            };
        }),
        collectionGroup: mockCollectionGroup,
    },
    admin: {
        firestore: {
            FieldValue: { serverTimestamp: () => 'SERVER_TS' },
        },
    },
}));

/* ---------- Mock: SyncService ---------- */

const mockSyncChannel = vi.fn(function syncChannel() {
    return Promise.resolve({ videosProcessed: 5, quotaList: 100, quotaDetails: 500 });
});

class MockSyncService {
    syncChannel = mockSyncChannel;
}

vi.mock('../services/sync', () => ({
    SyncService: MockSyncService,
}));

/* ---------- Import after mocks ---------- */

const { scheduledTrendSnapshot } = await import('./scheduledSync');

/* ---------- Extract handler with defensive check ---------- */

const wrapped = scheduledTrendSnapshot as unknown as Record<string, unknown>;
const handler = wrapped.run as (() => Promise<void>) | undefined;

if (typeof handler !== 'function') {
    throw new Error(
        'Firebase SDK internal structure changed: scheduledTrendSnapshot.run is not a function. ' +
        'The onSchedule wrapper may have been updated — check firebase-functions changelog.'
    );
}

/* ---------- Helpers ---------- */

function resetAll() {
    ctx.reset();
    mockSyncChannel.mockClear();
    mockSyncChannel.mockImplementation(
        function syncChannel(...args: unknown[]) {
            const [userId, channelId, trendChannel] = args as [string, string, Record<string, unknown>];
            ctx.syncChannelCalls.push({ userId, channelId, trendChannel });
            return Promise.resolve({ videosProcessed: 5, quotaList: 100, quotaDetails: 500 });
        },
    );
    mockCollectionGroup.mockClear();
}

/**
 * Populate Firestore mock with a standard single-user, single-channel setup.
 */
function seedStandardData(opts?: {
    trendSyncEnabled?: boolean;
    apiKey?: string | null;
    trendChannels?: Array<{ id: string; name: string; uploadsPlaylistId: string }>;
}) {
    const {
        trendSyncEnabled = true,
        apiKey = 'test-api-key',
        trendChannels = [{ id: 'UC123', name: 'Test Channel', uploadsPlaylistId: 'UU123' }],
    } = opts ?? {};

    ctx.firestoreData['users'] = mockSnap([mockDoc('user-1', {})]);
    ctx.firestoreData['users/user-1/channels'] = mockSnap([mockDoc('ch-1', {})]);
    ctx.firestoreData['users/user-1/channels/ch-1/settings/general'] = mockDoc(
        'general', apiKey ? { apiKey } : {}
    );
    ctx.firestoreData['users/user-1/channels/ch-1/settings/sync'] = mockDoc('sync', {
        trendSync: { enabled: trendSyncEnabled },
    });
    ctx.firestoreData['users/user-1/channels/ch-1/trendChannels'] = mockSnap(
        trendChannels.map(tc => mockDoc(tc.id, tc))
    );
}

/* ---------- Tests ---------- */

describe('scheduledTrendSnapshot', () => {
    beforeEach(() => {
        resetAll();
    });

    // ─── Critical regression guard ─────────────────────────────────────
    test('uses db.collection("users"), NOT collectionGroup', async () => {
        seedStandardData();
        await handler();

        expect(ctx.firestoreGets[0]).toBe('collection:users');
        expect(mockCollectionGroup).not.toHaveBeenCalled();
        expect(ctx.firestoreGets.every(p => !p.startsWith('collectionGroup:'))).toBe(true);
    });

    // ─── Settings gate: trendSync.enabled ──────────────────────────────
    test('skips channels with trendSync disabled', async () => {
        seedStandardData({ trendSyncEnabled: false });
        await handler();

        expect(mockSyncChannel).not.toHaveBeenCalled();
        expect(ctx.notificationsAdded).toHaveLength(0);
    });

    // ─── Settings gate: API key ────────────────────────────────────────
    test('skips channels with no API key', async () => {
        seedStandardData({ apiKey: null });
        await handler();

        expect(mockSyncChannel).not.toHaveBeenCalled();
    });

    // ─── Happy path ────────────────────────────────────────────────────
    test('calls syncChannel for each trend channel and sends notification', async () => {
        seedStandardData({
            trendChannels: [
                { id: 'UC-aaa', name: 'Channel A', uploadsPlaylistId: 'UU-aaa' },
                { id: 'UC-bbb', name: 'Channel B', uploadsPlaylistId: 'UU-bbb' },
            ],
        });
        await handler();

        expect(ctx.syncChannelCalls).toHaveLength(2);
        expect(ctx.syncChannelCalls[0].userId).toBe('user-1');
        expect(ctx.syncChannelCalls[0].channelId).toBe('ch-1');
        expect(ctx.syncChannelCalls[0].trendChannel).toMatchObject({ id: 'UC-aaa' });
        expect(ctx.syncChannelCalls[1].trendChannel).toMatchObject({ id: 'UC-bbb' });

        expect(ctx.notificationsAdded).toHaveLength(1);
        expect(ctx.notificationsAdded[0].path).toContain('notifications');
        expect(ctx.notificationsAdded[0].data).toMatchObject({
            title: 'Daily Trend Sync',
            type: 'success',
        });
    });

    // ─── Error isolation ───────────────────────────────────────────────
    test('continues processing if a single syncChannel call fails', async () => {
        seedStandardData({
            trendChannels: [
                { id: 'UC-fail', name: 'Failing', uploadsPlaylistId: 'UU-fail' },
                { id: 'UC-ok', name: 'Working', uploadsPlaylistId: 'UU-ok' },
            ],
        });

        mockSyncChannel
            .mockRejectedValueOnce(new Error('YouTube quota exceeded'))
            .mockImplementationOnce(
                function syncChannel(...args: unknown[]) {
                    const [userId, channelId, trendChannel] = args as [string, string, Record<string, unknown>];
                    ctx.syncChannelCalls.push({ userId, channelId, trendChannel });
                    return Promise.resolve({ videosProcessed: 3, quotaList: 50, quotaDetails: 250 });
                },
            );

        await expect(handler()).resolves.toBeUndefined();
        expect(ctx.syncChannelCalls).toHaveLength(1);
    });

    // ─── Reads correct settings paths ──────────────────────────────────
    test('reads settings from correct Firestore paths', async () => {
        seedStandardData();
        await handler();

        expect(ctx.firestoreGets).toContain('doc:users/user-1/channels/ch-1/settings/general');
        expect(ctx.firestoreGets).toContain('doc:users/user-1/channels/ch-1/settings/sync');
    });
});
