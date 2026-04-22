// =============================================================================
// librarySlice.test.ts
//
// Targeted checks for the invariants introduced by the seamless-multi-channel
// refactor — specifically the "don't pollute own state with shared writes"
// contract in `saveSettings`.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMusicStore } from '../musicStore';

vi.mock('../../../services/music/trackService', () => ({
    TrackService: {
        subscribeToTracks: vi.fn().mockReturnValue(() => undefined),
        subscribeToMusicSettings: vi.fn().mockReturnValue(() => undefined),
        getMusicSettings: vi.fn().mockResolvedValue({ genres: [], tags: [] }),
        saveMusicSettings: vi.fn().mockResolvedValue(undefined),
    },
}));

import { TrackService } from '../../../services/music/trackService';

const OWN_USER = 'user-a';
const OWN_CHANNEL = 'channel-alpha';
const OWNER_USER = 'user-b';
const OWNER_CHANNEL = 'channel-bangers';

const baselineGenres = [{ id: 'pop', name: 'Pop', color: '#ff00ff', order: 0 }];
const baselineTags = [{ id: 'chill', name: 'Chill' }];

function setOwnIdentity() {
    // subscribe() is how the slice learns the user's own identity.
    // Call it once in each test so saveSettings can tell own from shared.
    useMusicStore.getState().subscribe(OWN_USER, OWN_CHANNEL);
}

const initialState = useMusicStore.getState();

beforeEach(() => {
    useMusicStore.setState(initialState, true);
    vi.clearAllMocks();
    setOwnIdentity();
    useMusicStore.setState({
        genres: baselineGenres,
        tags: baselineTags,
    });
});

describe('librarySlice.saveSettings', () => {
    it('applies optimistic update on OWN state when saving to own library', async () => {
        const nextGenres = [{ id: 'rock', name: 'Rock', color: '#ff0000', order: 0 }];
        const nextTags = [{ id: 'aggressive', name: 'Aggressive' }];

        await useMusicStore.getState().saveSettings(OWN_USER, OWN_CHANNEL, {
            genres: nextGenres,
            tags: nextTags,
        });

        const state = useMusicStore.getState();
        expect(state.genres).toEqual(nextGenres);
        expect(state.tags).toEqual(nextTags);
        expect(TrackService.saveMusicSettings).toHaveBeenCalledWith(
            OWN_USER, OWN_CHANNEL, expect.anything(),
        );
    });

    it('does NOT touch own state when saving to a shared library', async () => {
        const nextGenres = [{ id: 'edm', name: 'EDM', color: '#00ffff', order: 0 }];
        const nextTags = [{ id: 'dance', name: 'Dance' }];

        await useMusicStore.getState().saveSettings(OWNER_USER, OWNER_CHANNEL, {
            genres: nextGenres,
            tags: nextTags,
        });

        const state = useMusicStore.getState();
        // Own state stays exactly as it was — no flicker.
        expect(state.genres).toEqual(baselineGenres);
        expect(state.tags).toEqual(baselineTags);
        expect(TrackService.saveMusicSettings).toHaveBeenCalledWith(
            OWNER_USER, OWNER_CHANNEL, expect.anything(),
        );
    });

    it('rolls back own state when Firestore save to own library fails', async () => {
        (TrackService.saveMusicSettings as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));

        const nextGenres = [{ id: 'rock', name: 'Rock', color: '#ff0000', order: 0 }];

        await expect(
            useMusicStore.getState().saveSettings(OWN_USER, OWN_CHANNEL, {
                genres: nextGenres,
                tags: [],
            }),
        ).rejects.toThrow('boom');

        const state = useMusicStore.getState();
        expect(state.genres).toEqual(baselineGenres);
        expect(state.tags).toEqual(baselineTags);
    });
});
