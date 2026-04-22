// =============================================================================
// trendService — unit tests (addTrendChannel + parseChannelInput)
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn((_db: unknown, path: string, id?: string) => ({ path: id ? `${path}/${id}` : path }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, path: string) => ({ path })),
    doc: (...args: unknown[]) => mockDoc(args[0], args[1] as string, args[2] as string | undefined),
    setDoc: (...args: unknown[]) => mockSetDoc(...args),
    getDoc: vi.fn(),
    deleteDoc: vi.fn(),
    onSnapshot: vi.fn(),
    updateDoc: vi.fn(),
    writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
    getDocs: vi.fn(),
    increment: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
}));

vi.mock('../../../config/firebase', () => ({
    db: {},
    functions: {},
}));

const mockHttpsCallable = vi.fn();
vi.mock('firebase/functions', () => ({
    httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
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
const CHANNEL_ID = 'chan-1';
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

const buildYoutubeResponse = (overrides: Partial<NonNullable<YoutubeChannelResponse['items']>[number]> = {}): YoutubeChannelResponse => ({
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
        contentDetails: {
            relatedPlaylists: {
                uploads: 'UUabc123',
            },
        },
        statistics: {
            subscriberCount: '123456',
        },
        ...overrides,
    }],
});

const mockYoutubeFetch = (response: YoutubeChannelResponse, ok: boolean = true) => {
    const fetchMock = vi.fn().mockResolvedValue({
        ok,
        json: () => Promise.resolve(response),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseChannelInput', () => {
    it('extracts @handle from youtube.com/@MrBeast URL', () => {
        expect(parseChannelInput('https://youtube.com/@MrBeast')).toEqual({
            channelId: '',
            handle: '@MrBeast',
        });
    });

    it('extracts @handle from handle path with /videos suffix', () => {
        expect(parseChannelInput('https://youtube.com/@MrBeast/videos')).toEqual({
            channelId: '',
            handle: '@MrBeast',
        });
    });

    it('extracts UC-id from /channel/ URL', () => {
        expect(parseChannelInput('https://youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA')).toEqual({
            channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA',
            handle: '',
        });
    });

    it('treats /c/CustomName as a handle', () => {
        expect(parseChannelInput('https://youtube.com/c/CustomName')).toEqual({
            channelId: '',
            handle: '@CustomName',
        });
    });

    it('treats /user/LegacyName as a handle', () => {
        expect(parseChannelInput('https://youtube.com/user/LegacyName')).toEqual({
            channelId: '',
            handle: '@LegacyName',
        });
    });

    it('accepts bare @handle input', () => {
        expect(parseChannelInput('@MrBeast')).toEqual({
            channelId: '',
            handle: '@MrBeast',
        });
    });

    it('accepts bare UC-id input', () => {
        expect(parseChannelInput('UCX6OQ3DkcsbYNE6H8uQQuVA')).toEqual({
            channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA',
            handle: '',
        });
    });

    it('prepends @ to bare handle without prefix', () => {
        expect(parseChannelInput('MrBeast')).toEqual({
            channelId: '',
            handle: '@MrBeast',
        });
    });

    it('trims surrounding whitespace', () => {
        expect(parseChannelInput('   @MrBeast   ')).toEqual({
            channelId: '',
            handle: '@MrBeast',
        });
    });
});

describe('TrendService.addTrendChannel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches metadata by handle when input is @handle', async () => {
        const fetchMock = mockYoutubeFetch(buildYoutubeResponse());

        await TrendService.addTrendChannel(USER_ID, CHANNEL_ID, '@testchannel', API_KEY);

        const calledUrl = fetchMock.mock.calls[0][0] as string;
        expect(calledUrl).toContain('forHandle=%40testchannel');
        expect(calledUrl).toContain(`key=${API_KEY}`);
    });

    it('fetches metadata by id when input is UC-id', async () => {
        const fetchMock = mockYoutubeFetch(buildYoutubeResponse({ id: 'UCX6OQ3DkcsbYNE6H8uQQuVA' }));

        await TrendService.addTrendChannel(USER_ID, CHANNEL_ID, 'UCX6OQ3DkcsbYNE6H8uQQuVA', API_KEY);

        const calledUrl = fetchMock.mock.calls[0][0] as string;
        expect(calledUrl).toContain('id=UCX6OQ3DkcsbYNE6H8uQQuVA');
        expect(calledUrl).not.toContain('forHandle');
    });

    it('persists a minimal channel doc with lastUpdated=0 and isVisible=true', async () => {
        mockYoutubeFetch(buildYoutubeResponse());

        const { channel } = await TrendService.addTrendChannel(USER_ID, CHANNEL_ID, '@testchannel', API_KEY);

        expect(channel.lastUpdated).toBe(0);
        expect(channel.isVisible).toBe(true);
        expect(channel.uploadsPlaylistId).toBe('UUabc123');
        expect(channel.subscriberCount).toBe(123456);

        expect(mockSetDoc).toHaveBeenCalledTimes(1);
        const [ref, persisted] = mockSetDoc.mock.calls[0];
        expect((ref as { path: string }).path).toBe(`users/${USER_ID}/channels/${CHANNEL_ID}/trendChannels/UCabc123`);
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
            TrendService.addTrendChannel(USER_ID, CHANNEL_ID, '@ghost', API_KEY)
        ).rejects.toThrow('Channel not found');

        expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('does NOT call playlistItems or videos endpoints (no client-side sync)', async () => {
        const fetchMock = mockYoutubeFetch(buildYoutubeResponse());

        await TrendService.addTrendChannel(USER_ID, CHANNEL_ID, '@testchannel', API_KEY);

        const allCalls = fetchMock.mock.calls.map(call => call[0] as string);
        expect(allCalls).toHaveLength(1);
        expect(allCalls[0]).toContain('/youtube/v3/channels');
        expect(allCalls.some(url => url.includes('playlistItems'))).toBe(false);
        expect(allCalls.some(url => url.includes('/videos?'))).toBe(false);
    });

    it('does NOT call the manualTrendSync cloud function itself — dispatching is the caller\'s job', async () => {
        mockYoutubeFetch(buildYoutubeResponse());

        await TrendService.addTrendChannel(USER_ID, CHANNEL_ID, '@testchannel', API_KEY);

        expect(mockHttpsCallable).not.toHaveBeenCalled();
    });
});

describe('TrendService.syncChannelCloud', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('invokes manualTrendSync callable with channelId and optional targets', async () => {
        const callableSpy = vi.fn().mockResolvedValue({ data: { success: true } });
        mockHttpsCallable.mockReturnValue(callableSpy);

        await TrendService.syncChannelCloud(CHANNEL_ID, ['UCabc123'], true);

        expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'manualTrendSync');
        expect(callableSpy).toHaveBeenCalledWith({
            channelId: CHANNEL_ID,
            targetTrendChannelIds: ['UCabc123'],
            forceAvatarRefresh: true,
        });
    });
});
