// =============================================================================
// playlistSlice.test.ts
//
// Verifies the core invariant after the "data-carries-context" refactor:
// playlist mutations resolve owner from the playlist itself, not from UI
// state — so operations land in the right Firestore collection regardless
// of which channel the user is viewing from.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMusicStore } from '../musicStore';
import type { MusicPlaylist } from '../../../types/music/musicPlaylist';

// Mock the service so we can capture calls without hitting Firestore.
vi.mock('../../../services/music/musicPlaylistService', () => ({
    MusicPlaylistService: {
        createPlaylist: vi.fn().mockResolvedValue(undefined),
        updatePlaylist: vi.fn().mockResolvedValue(undefined),
        deletePlaylist: vi.fn().mockResolvedValue(undefined),
        addTracksToPlaylist: vi.fn().mockResolvedValue(undefined),
        removeTracksFromPlaylist: vi.fn().mockResolvedValue(undefined),
        reorderPlaylistTracks: vi.fn().mockResolvedValue(undefined),
        subscribeToPlaylists: vi.fn().mockReturnValue(() => undefined),
        fetchSettings: vi.fn().mockResolvedValue({ groupOrder: [] }),
    },
}));

import { MusicPlaylistService } from '../../../services/music/musicPlaylistService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWN_USER = 'user-a';
const OWN_CHANNEL = 'channel-alpha';
const OWNER_USER = 'user-b';
const OWNER_CHANNEL = 'channel-bangers';

function makePlaylist(id: string, overrides: Partial<MusicPlaylist> = {}): MusicPlaylist {
    return {
        id,
        ownerUserId: OWN_USER,
        ownerChannelId: OWN_CHANNEL,
        name: `Playlist ${id}`,
        trackIds: [],
        group: null,
        order: 0,
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
    };
}

const initialState = useMusicStore.getState();

beforeEach(() => {
    useMusicStore.setState(initialState, true);
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// updatePlaylist
// ---------------------------------------------------------------------------

describe('playlistSlice.updatePlaylist', () => {
    it('writes to OWN library path when playlist belongs to the user', async () => {
        const own = makePlaylist('p1');
        useMusicStore.setState({ musicPlaylists: [own] });

        await useMusicStore.getState().updatePlaylist('p1', { name: 'Renamed' });

        expect(MusicPlaylistService.updatePlaylist).toHaveBeenCalledWith(
            OWN_USER,
            OWN_CHANNEL,
            'p1',
            expect.objectContaining({ name: 'Renamed' }),
        );
    });

    it('writes to OWNER path when playlist lives in a shared library', async () => {
        const shared = makePlaylist('p2', {
            ownerUserId: OWNER_USER,
            ownerChannelId: OWNER_CHANNEL,
        });
        useMusicStore.setState({ sharedPlaylists: [shared] });

        await useMusicStore.getState().updatePlaylist('p2', { color: '#ff0000' });

        expect(MusicPlaylistService.updatePlaylist).toHaveBeenCalledWith(
            OWNER_USER,
            OWNER_CHANNEL,
            'p2',
            expect.objectContaining({ color: '#ff0000' }),
        );
    });

    it('updates the shared collection optimistically — NOT the own collection', async () => {
        const shared = makePlaylist('p3', {
            ownerUserId: OWNER_USER,
            ownerChannelId: OWNER_CHANNEL,
            name: 'Original',
        });
        useMusicStore.setState({ sharedPlaylists: [shared], musicPlaylists: [] });

        await useMusicStore.getState().updatePlaylist('p3', { name: 'New Name' });

        const state = useMusicStore.getState();
        expect(state.musicPlaylists).toHaveLength(0);
        expect(state.sharedPlaylists[0].name).toBe('New Name');
    });

    it('no-ops when playlist is not found in either collection', async () => {
        await useMusicStore.getState().updatePlaylist('unknown', { name: 'x' });
        expect(MusicPlaylistService.updatePlaylist).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// addTracksToPlaylist / removeTracksFromPlaylist
// ---------------------------------------------------------------------------

describe('playlistSlice.addTracksToPlaylist', () => {
    it('routes add to the playlist\'s owner regardless of where user is viewing from', async () => {
        const shared = makePlaylist('p1', {
            ownerUserId: OWNER_USER,
            ownerChannelId: OWNER_CHANNEL,
        });
        useMusicStore.setState({ sharedPlaylists: [shared] });

        await useMusicStore.getState().addTracksToPlaylist('p1', ['track-1']);

        expect(MusicPlaylistService.addTracksToPlaylist).toHaveBeenCalledWith(
            OWNER_USER,
            OWNER_CHANNEL,
            'p1',
            ['track-1'],
            undefined,
        );
    });

    it('skips duplicate tracks and stamps timestamp only for genuinely-new additions', async () => {
        const own = makePlaylist('p1', { trackIds: ['existing'] });
        useMusicStore.setState({ musicPlaylists: [own] });

        await useMusicStore.getState().addTracksToPlaylist('p1', ['existing', 'new-one']);

        const updated = useMusicStore.getState().musicPlaylists[0];
        expect(updated.trackIds).toEqual(['existing', 'new-one']);
        expect(Object.keys(updated.trackAddedAt || {})).toEqual(['new-one']);
        expect(MusicPlaylistService.addTracksToPlaylist).toHaveBeenCalledWith(
            OWN_USER, OWN_CHANNEL, 'p1', ['new-one'], undefined,
        );
    });

    it('no-ops if all tracks are already in the playlist', async () => {
        const own = makePlaylist('p1', { trackIds: ['t1', 't2'] });
        useMusicStore.setState({ musicPlaylists: [own] });

        await useMusicStore.getState().addTracksToPlaylist('p1', ['t1', 't2']);
        expect(MusicPlaylistService.addTracksToPlaylist).not.toHaveBeenCalled();
    });
});

describe('playlistSlice.removeTracksFromPlaylist', () => {
    it('removes from shared-playlist optimistically and writes to owner', async () => {
        const shared = makePlaylist('p1', {
            ownerUserId: OWNER_USER,
            ownerChannelId: OWNER_CHANNEL,
            trackIds: ['t1', 't2', 't3'],
        });
        useMusicStore.setState({ sharedPlaylists: [shared] });

        await useMusicStore.getState().removeTracksFromPlaylist('p1', ['t2']);

        expect(useMusicStore.getState().sharedPlaylists[0].trackIds).toEqual(['t1', 't3']);
        expect(MusicPlaylistService.removeTracksFromPlaylist).toHaveBeenCalledWith(
            OWNER_USER, OWNER_CHANNEL, 'p1', ['t2'],
        );
    });
});

// ---------------------------------------------------------------------------
// reorderPlaylistTracks
// ---------------------------------------------------------------------------

describe('playlistSlice.reorderPlaylistTracks', () => {
    it('reorders own playlist and writes to own path', async () => {
        const own = makePlaylist('p1', { trackIds: ['a', 'b', 'c'] });
        useMusicStore.setState({ musicPlaylists: [own] });

        await useMusicStore.getState().reorderPlaylistTracks('p1', ['c', 'a', 'b']);

        expect(useMusicStore.getState().musicPlaylists[0].trackIds).toEqual(['c', 'a', 'b']);
        expect(MusicPlaylistService.reorderPlaylistTracks).toHaveBeenCalledWith(
            OWN_USER, OWN_CHANNEL, 'p1', ['c', 'a', 'b'],
        );
    });

    it('reorders shared playlist and writes to owner path', async () => {
        const shared = makePlaylist('p1', {
            ownerUserId: OWNER_USER,
            ownerChannelId: OWNER_CHANNEL,
            trackIds: ['a', 'b', 'c'],
        });
        useMusicStore.setState({ sharedPlaylists: [shared] });

        await useMusicStore.getState().reorderPlaylistTracks('p1', ['b', 'c', 'a']);

        expect(useMusicStore.getState().sharedPlaylists[0].trackIds).toEqual(['b', 'c', 'a']);
        expect(MusicPlaylistService.reorderPlaylistTracks).toHaveBeenCalledWith(
            OWNER_USER, OWNER_CHANNEL, 'p1', ['b', 'c', 'a'],
        );
    });
});

// ---------------------------------------------------------------------------
// deletePlaylist
// ---------------------------------------------------------------------------

describe('playlistSlice.deletePlaylist', () => {
    it('removes from the correct collection and clears activePlaylistId if it matched', async () => {
        const own = makePlaylist('p1');
        useMusicStore.setState({ musicPlaylists: [own], activePlaylistId: 'p1' });

        await useMusicStore.getState().deletePlaylist('p1');

        const state = useMusicStore.getState();
        expect(state.musicPlaylists).toHaveLength(0);
        expect(state.activePlaylistId).toBeNull();
        expect(MusicPlaylistService.deletePlaylist).toHaveBeenCalledWith(
            OWN_USER, OWN_CHANNEL, 'p1',
        );
    });

    it('keeps activePlaylistId when deleting a different playlist', async () => {
        const p1 = makePlaylist('p1');
        const p2 = makePlaylist('p2');
        useMusicStore.setState({ musicPlaylists: [p1, p2], activePlaylistId: 'p2' });

        await useMusicStore.getState().deletePlaylist('p1');

        expect(useMusicStore.getState().activePlaylistId).toBe('p2');
    });
});
