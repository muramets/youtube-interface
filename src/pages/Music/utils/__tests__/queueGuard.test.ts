// =============================================================================
// queueGuard.test.ts — Queue rebuild decision logic
// =============================================================================

import { describe, it, expect } from 'vitest';
import { shouldRebuildQueue } from '../queueGuard';

describe('shouldRebuildQueue', () => {
    it('rebuilds when nothing is playing', () => {
        expect(
            shouldRebuildQueue({
                newQueue: ['a', 'b', 'c'],
                newContextId: 'library',
                playingTrackId: null,
                storedContextId: null,
            }),
        ).toBe(true);
    });

    it('rebuilds when playing track is in the new queue and context matches', () => {
        expect(
            shouldRebuildQueue({
                newQueue: ['a', 'b', 'c'],
                newContextId: 'library',
                playingTrackId: 'b',
                storedContextId: 'library',
            }),
        ).toBe(true);
    });

    it('preserves queue when stored context differs from new context', () => {
        // User navigated from "Liked" to "Rock" while a track plays — keep
        // the Liked queue so Skip continues to work within original context.
        expect(
            shouldRebuildQueue({
                newQueue: ['x', 'y', 'z'],
                newContextId: 'playlist:rock',
                playingTrackId: 'a',
                storedContextId: 'playlist:liked',
            }),
        ).toBe(false);
    });

    it('preserves queue when new queue would drop the playing track', () => {
        // User unliked a track while it plays from "Liked" playlist — new
        // displayItems no longer include it, but we must preserve the queue
        // so Skip/auto-advance keep working.
        expect(
            shouldRebuildQueue({
                newQueue: ['b', 'c'],
                newContextId: 'playlist:liked',
                playingTrackId: 'a',
                storedContextId: 'playlist:liked',
            }),
        ).toBe(false);
    });

    it('rebuilds on first build (no stored context) when playing track present', () => {
        expect(
            shouldRebuildQueue({
                newQueue: ['a', 'b'],
                newContextId: 'library',
                playingTrackId: 'a',
                storedContextId: null,
            }),
        ).toBe(true);
    });
});
