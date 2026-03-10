/**
 * Unit tests for manualTrendSync callable Cloud Function.
 *
 * Covers: auth/input validation, happy path, channel filtering,
 * avatar refresh flag, error isolation, and edge cases.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ---------- Firestore mock primitives ---------- */

interface MockDocSnapshot {
    id: string;
    ref: { path: string };
    data: () => Record<string, unknown>;
    exists: boolean;
}
interface MockQuerySnapshot {
    docs: MockDocSnapshot[];
}

const mockDoc = (id: string, data: Record<string, unknown>, path?: string): MockDocSnapshot => ({
    id,
    ref: { path: path ?? id },
    data: () => data,
    exists: Object.keys(data).length > 0,
});

const mockSnap = (docs: MockDocSnapshot[]): MockQuerySnapshot => ({ docs });

/* ---------- Test context — encapsulated mutable state ---------- */

const ctx = {
    syncChannelCalls: [] as Array<{
        userId: string;
        channelId: string;
        trendChannel: Record<string, unknown>;
        apiKey: string;
        refreshAvatar: boolean;
        snapshotType: string;
    }>,
    refreshSubCountsCalls: [] as Array<{
        userId: string;
        channelId: string;
        trendChannelIds: string[];
        apiKey: string;
    }>,
    sendNotificationCalls: [] as Array<{
        userId: string;
        channelId: string;
        title: string;
        message: string;
        meta: Record<string, unknown>;
    }>,
    firestoreData: {} as Record<string, MockQuerySnapshot | MockDocSnapshot>,

    reset() {
        this.syncChannelCalls = [];
        this.refreshSubCountsCalls = [];
        this.sendNotificationCalls = [];
        this.firestoreData = {};
    },
};

/* ---------- Mock: Firestore (../shared/db) ---------- */

vi.mock('../../shared/db', () => ({
    db: {
        collection: vi.fn(function collection(path: string) {
            return {
                get: () => Promise.resolve(ctx.firestoreData[path] ?? mockSnap([])),
            };
        }),
        doc: vi.fn(function doc(path: string) {
            return {
                get: () => {
                    const stored = ctx.firestoreData[path];
                    return Promise.resolve(stored ?? mockDoc('missing', {}));
                },
            };
        }),
    },
}));

/* ---------- Mock: SyncService ---------- */

const mockSyncChannel = vi.fn();
const mockRefreshSubscriberCounts = vi.fn();
const mockSendNotification = vi.fn();

class MockSyncService {
    syncChannel = mockSyncChannel;
    refreshSubscriberCounts = mockRefreshSubscriberCounts;
    sendNotification = mockSendNotification;
}

vi.mock('../../services/sync', () => ({
    SyncService: MockSyncService,
}));

/* ---------- Import after mocks ---------- */

const { manualTrendSync } = await import('../manualSync');

/* ---------- Extract handler with defensive check ---------- */

const wrapped = manualTrendSync as unknown as Record<string, unknown>;
const handler = wrapped.run as (
    (request: { auth?: { uid: string }; data: Record<string, unknown> }) => Promise<unknown>
) | undefined;

if (typeof handler !== 'function') {
    throw new Error(
        'Firebase SDK internal structure changed: manualTrendSync.run is not a function. ' +
        'The onCall wrapper may have been updated — check firebase-functions changelog.'
    );
}

/* ---------- Helpers ---------- */

function resetAll() {
    ctx.reset();
    mockSyncChannel.mockClear();
    mockRefreshSubscriberCounts.mockClear();
    mockSendNotification.mockClear();

    // Default: syncChannel returns stats and records call
    mockSyncChannel.mockImplementation(
        function syncChannel(...args: unknown[]) {
            const [userId, channelId, trendChannel, apiKey, refreshAvatar, snapshotType] =
                args as [string, string, Record<string, unknown>, string, boolean, string];
            ctx.syncChannelCalls.push({ userId, channelId, trendChannel, apiKey, refreshAvatar, snapshotType });
            return Promise.resolve({ videosProcessed: 5, quotaList: 100, quotaDetails: 500 });
        },
    );

    // Default: refreshSubscriberCounts returns quota and records call
    mockRefreshSubscriberCounts.mockImplementation(
        function refreshSubscriberCounts(...args: unknown[]) {
            const [userId, channelId, trendChannelIds, apiKey] =
                args as [string, string, string[], string];
            ctx.refreshSubCountsCalls.push({ userId, channelId, trendChannelIds, apiKey });
            return Promise.resolve(50);
        },
    );

    // Default: sendNotification records call
    mockSendNotification.mockImplementation(
        function sendNotification(...args: unknown[]) {
            const [userId, channelId, title, message, meta] =
                args as [string, string, string, string, Record<string, unknown>];
            ctx.sendNotificationCalls.push({ userId, channelId, title, message, meta });
            return Promise.resolve();
        },
    );
}

/**
 * Populate Firestore mock with data for manualTrendSync tests.
 */
function seedFirestoreData(opts?: {
    userId?: string;
    channelId?: string;
    apiKey?: string | null;
    trendChannels?: Array<{ id: string; name: string; uploadsPlaylistId: string }>;
}) {
    const {
        userId = 'user-1',
        channelId = 'ch-1',
        apiKey = 'test-api-key',
        trendChannels = [{ id: 'UC123', name: 'Test Channel', uploadsPlaylistId: 'UU123' }],
    } = opts ?? {};

    ctx.firestoreData[`users/${userId}/channels/${channelId}/settings/general`] = mockDoc(
        'general', apiKey ? { apiKey } : {}
    );
    ctx.firestoreData[`users/${userId}/channels/${channelId}/trendChannels`] = mockSnap(
        trendChannels.map(tc => mockDoc(tc.id, tc))
    );
}

/** Standard request builder. */
function makeRequest(overrides?: {
    auth?: { uid: string } | null;
    data?: Record<string, unknown>;
}) {
    return {
        auth: overrides && 'auth' in overrides
            ? (overrides.auth ?? undefined)
            : { uid: 'user-1' },
        data: overrides?.data ?? { channelId: 'ch-1' },
    };
}

/* ---------- Tests ---------- */

describe('manualTrendSync', () => {
    beforeEach(() => {
        resetAll();
    });

    // ─── Auth & Input Validation ────────────────────────────────────────

    describe('auth & input validation', () => {
        it('throws unauthenticated when request.auth is missing', async () => {
            const promise = handler(makeRequest({ auth: null, data: { channelId: 'ch-1' } }));

            await expect(promise).rejects.toThrow('The function must be called while authenticated.');
            await expect(promise).rejects.toMatchObject({ code: 'unauthenticated' });
        });

        it('throws invalid-argument when channelId is missing from data', async () => {
            const promise = handler(makeRequest({ data: {} }));

            await expect(promise).rejects.toThrow('The function must be called with a "channelId" argument.');
            await expect(promise).rejects.toMatchObject({ code: 'invalid-argument' });
        });

        it('throws failed-precondition when API key is not configured', async () => {
            seedFirestoreData({ apiKey: null });

            const promise = handler(makeRequest());

            await expect(promise).rejects.toThrow('API Key is not configured for this channel.');
            await expect(promise).rejects.toMatchObject({ code: 'failed-precondition' });
        });
    });

    // ─── Happy Path ─────────────────────────────────────────────────────

    describe('happy path', () => {
        it('syncs all trend channels and returns correct stats', async () => {
            seedFirestoreData({
                trendChannels: [
                    { id: 'UC-aaa', name: 'Channel A', uploadsPlaylistId: 'UU-aaa' },
                    { id: 'UC-bbb', name: 'Channel B', uploadsPlaylistId: 'UU-bbb' },
                ],
            });

            const result = await handler(makeRequest());

            expect(ctx.syncChannelCalls).toHaveLength(2);
            expect(result).toEqual({
                success: true,
                processedChannels: 2,
                processedVideos: 10,        // 5 + 5
                quotaUsed: 200 + 1000 + 50, // (100+100) list + (500+500) details + 50 refreshSub
            });
        });

        it('sends notification with correct title and message after successful sync', async () => {
            seedFirestoreData({
                trendChannels: [
                    { id: 'UC-aaa', name: 'Channel A', uploadsPlaylistId: 'UU-aaa' },
                    { id: 'UC-bbb', name: 'Channel B', uploadsPlaylistId: 'UU-bbb' },
                ],
            });

            await handler(makeRequest());

            expect(ctx.sendNotificationCalls).toHaveLength(1);
            const notif = ctx.sendNotificationCalls[0];
            expect(notif.userId).toBe('user-1');
            expect(notif.channelId).toBe('ch-1');
            expect(notif.title).toBe('Trends Sync: 10 videos across 2 channels');
            expect(notif.message).toBe('Successfully updated 10 videos across 2 channels.');
            expect(notif.meta).toMatchObject({
                processedVideos: 10,
                processedChannels: 2,
                quotaList: 200,
                quotaDetails: 1050, // 500+500 sync + 50 refreshSub
            });
        });

        it('calls refreshSubscriberCounts with all trend channel IDs after sync', async () => {
            seedFirestoreData({
                trendChannels: [
                    { id: 'UC-aaa', name: 'Channel A', uploadsPlaylistId: 'UU-aaa' },
                    { id: 'UC-bbb', name: 'Channel B', uploadsPlaylistId: 'UU-bbb' },
                ],
            });

            await handler(makeRequest());

            expect(ctx.refreshSubCountsCalls).toHaveLength(1);
            expect(ctx.refreshSubCountsCalls[0]).toMatchObject({
                userId: 'user-1',
                channelId: 'ch-1',
                trendChannelIds: ['UC-aaa', 'UC-bbb'],
                apiKey: 'test-api-key',
            });
        });
    });

    // ─── Filtering ──────────────────────────────────────────────────────

    describe('filtering by targetTrendChannelIds', () => {
        it('syncs only matching channels when targetTrendChannelIds is provided', async () => {
            seedFirestoreData({
                trendChannels: [
                    { id: 'UC-aaa', name: 'Channel A', uploadsPlaylistId: 'UU-aaa' },
                    { id: 'UC-bbb', name: 'Channel B', uploadsPlaylistId: 'UU-bbb' },
                    { id: 'UC-ccc', name: 'Channel C', uploadsPlaylistId: 'UU-ccc' },
                ],
            });

            const result = await handler(makeRequest({
                data: { channelId: 'ch-1', targetTrendChannelIds: ['UC-aaa', 'UC-ccc'] },
            }));

            expect(ctx.syncChannelCalls).toHaveLength(2);
            expect(ctx.syncChannelCalls[0].trendChannel).toMatchObject({ id: 'UC-aaa' });
            expect(ctx.syncChannelCalls[1].trendChannel).toMatchObject({ id: 'UC-ccc' });
            expect(result).toMatchObject({ processedChannels: 2, processedVideos: 10 });
        });

        it('syncs all channels when targetTrendChannelIds is undefined', async () => {
            seedFirestoreData({
                trendChannels: [
                    { id: 'UC-aaa', name: 'A', uploadsPlaylistId: 'UU-aaa' },
                    { id: 'UC-bbb', name: 'B', uploadsPlaylistId: 'UU-bbb' },
                ],
            });

            await handler(makeRequest({ data: { channelId: 'ch-1' } }));

            expect(ctx.syncChannelCalls).toHaveLength(2);
        });

        it('syncs all channels when targetTrendChannelIds is an empty array', async () => {
            seedFirestoreData({
                trendChannels: [
                    { id: 'UC-aaa', name: 'A', uploadsPlaylistId: 'UU-aaa' },
                    { id: 'UC-bbb', name: 'B', uploadsPlaylistId: 'UU-bbb' },
                ],
            });

            await handler(makeRequest({ data: { channelId: 'ch-1', targetTrendChannelIds: [] } }));

            expect(ctx.syncChannelCalls).toHaveLength(2);
        });
    });

    // ─── Avatar Refresh ─────────────────────────────────────────────────

    describe('avatar refresh flag', () => {
        it('passes refreshAvatar=true to syncChannel when forceAvatarRefresh is set', async () => {
            seedFirestoreData();

            await handler(makeRequest({
                data: { channelId: 'ch-1', forceAvatarRefresh: true },
            }));

            expect(ctx.syncChannelCalls).toHaveLength(1);
            expect(ctx.syncChannelCalls[0].refreshAvatar).toBe(true);
        });

        it('passes refreshAvatar=false when forceAvatarRefresh is not set', async () => {
            seedFirestoreData();

            await handler(makeRequest({ data: { channelId: 'ch-1' } }));

            expect(ctx.syncChannelCalls).toHaveLength(1);
            expect(ctx.syncChannelCalls[0].refreshAvatar).toBe(false);
        });

        it('passes refreshAvatar=false when forceAvatarRefresh is explicitly false', async () => {
            seedFirestoreData();

            await handler(makeRequest({
                data: { channelId: 'ch-1', forceAvatarRefresh: false },
            }));

            expect(ctx.syncChannelCalls).toHaveLength(1);
            expect(ctx.syncChannelCalls[0].refreshAvatar).toBe(false);
        });
    });

    // ─── Error Isolation ────────────────────────────────────────────────

    describe('error isolation', () => {
        it('continues processing remaining channels if one syncChannel fails', async () => {
            seedFirestoreData({
                trendChannels: [
                    { id: 'UC-fail', name: 'Failing', uploadsPlaylistId: 'UU-fail' },
                    { id: 'UC-ok', name: 'Working', uploadsPlaylistId: 'UU-ok' },
                ],
            });

            mockSyncChannel
                .mockRejectedValueOnce(new Error('YouTube quota exceeded'))
                .mockImplementationOnce(
                    function syncChannel(...args: unknown[]) {
                        const [userId, channelId, trendChannel, apiKey, refreshAvatar, snapshotType] =
                            args as [string, string, Record<string, unknown>, string, boolean, string];
                        ctx.syncChannelCalls.push({ userId, channelId, trendChannel, apiKey, refreshAvatar, snapshotType });
                        return Promise.resolve({ videosProcessed: 3, quotaList: 50, quotaDetails: 250 });
                    },
                );

            const result = await handler(makeRequest());

            // Only the second channel succeeded
            expect(ctx.syncChannelCalls).toHaveLength(1);
            expect(ctx.syncChannelCalls[0].trendChannel).toMatchObject({ id: 'UC-ok' });
            expect(result).toMatchObject({
                success: true,
                processedChannels: 1,
                processedVideos: 3,
            });
        });

        it('still sends notification for successfully processed channels even if some failed', async () => {
            seedFirestoreData({
                trendChannels: [
                    { id: 'UC-fail', name: 'Failing', uploadsPlaylistId: 'UU-fail' },
                    { id: 'UC-ok', name: 'Working', uploadsPlaylistId: 'UU-ok' },
                ],
            });

            mockSyncChannel
                .mockRejectedValueOnce(new Error('API error'))
                .mockImplementationOnce(
                    function syncChannel(...args: unknown[]) {
                        const [userId, channelId, trendChannel, apiKey, refreshAvatar, snapshotType] =
                            args as [string, string, Record<string, unknown>, string, boolean, string];
                        ctx.syncChannelCalls.push({ userId, channelId, trendChannel, apiKey, refreshAvatar, snapshotType });
                        return Promise.resolve({ videosProcessed: 7, quotaList: 80, quotaDetails: 400 });
                    },
                );

            await handler(makeRequest());

            expect(ctx.sendNotificationCalls).toHaveLength(1);
            expect(ctx.sendNotificationCalls[0].title).toContain('7 videos across 1 channels');
        });

        it('handles refreshSubscriberCounts failure gracefully without throwing', async () => {
            seedFirestoreData();

            mockRefreshSubscriberCounts.mockRejectedValueOnce(new Error('Subscriber count API failed'));

            const result = await handler(makeRequest());

            // Should still return success — refreshSubscriberCounts error is swallowed
            expect(result).toMatchObject({
                success: true,
                processedChannels: 1,
                processedVideos: 5,
            });
            // Notification should still be sent (sendNotification is called after the catch)
            expect(ctx.sendNotificationCalls).toHaveLength(1);
        });
    });

    // ─── Edge Cases ─────────────────────────────────────────────────────

    describe('edge cases', () => {
        it('returns success with 0 counts and no notification when no trend channels exist', async () => {
            seedFirestoreData({ trendChannels: [] });

            const result = await handler(makeRequest());

            expect(result).toEqual({
                success: true,
                processedChannels: 0,
                processedVideos: 0,
                quotaUsed: 0,
            });
            expect(ctx.syncChannelCalls).toHaveLength(0);
            expect(ctx.refreshSubCountsCalls).toHaveLength(0);
            expect(ctx.sendNotificationCalls).toHaveLength(0);
        });

        it('returns success with 0 counts and no notification when all syncChannel calls fail', async () => {
            seedFirestoreData({
                trendChannels: [
                    { id: 'UC-fail1', name: 'Fail 1', uploadsPlaylistId: 'UU-fail1' },
                    { id: 'UC-fail2', name: 'Fail 2', uploadsPlaylistId: 'UU-fail2' },
                ],
            });

            mockSyncChannel.mockRejectedValue(new Error('All channels broken'));

            const result = await handler(makeRequest());

            expect(result).toEqual({
                success: true,
                processedChannels: 0,
                processedVideos: 0,
                quotaUsed: 0,
            });
            expect(ctx.refreshSubCountsCalls).toHaveLength(0);
            expect(ctx.sendNotificationCalls).toHaveLength(0);
        });

        it('passes snapshotType "manual" to syncChannel', async () => {
            seedFirestoreData();

            await handler(makeRequest());

            expect(ctx.syncChannelCalls).toHaveLength(1);
            expect(ctx.syncChannelCalls[0].snapshotType).toBe('manual');
        });

        it('reads settings from the correct Firestore path', async () => {
            seedFirestoreData({ userId: 'u-42', channelId: 'ch-99', apiKey: 'key-42' });

            await handler(makeRequest({
                auth: { uid: 'u-42' },
                data: { channelId: 'ch-99' },
            }));

            expect(ctx.syncChannelCalls).toHaveLength(1);
            expect(ctx.syncChannelCalls[0].userId).toBe('u-42');
            expect(ctx.syncChannelCalls[0].channelId).toBe('ch-99');
            expect(ctx.syncChannelCalls[0].apiKey).toBe('key-42');
        });
    });
});
