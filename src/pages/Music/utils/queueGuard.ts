// =============================================================================
// queueGuard — Pure decision logic for whether to rebuild the playback queue
// =============================================================================
//
// Called on every displayItems change (filter / sort / data mutation). The
// queue should stay stable across view changes so that Skip and auto-advance
// keep working even when the playing track no longer matches the current view.
// =============================================================================

interface QueueRebuildInput {
    /** Freshly computed queue from the current displayItems */
    newQueue: string[];
    /** Context id of the current view (e.g. 'library', 'playlist:liked') */
    newContextId: string;
    /** Track currently playing, if any */
    playingTrackId: string | null;
    /** Context id that was active when the existing queue was built */
    storedContextId: string | null;
}

/**
 * Returns true if the queue should be overwritten with `newQueue`.
 *
 * Preserve existing queue when:
 *   1. Context changed while a track is playing (user navigated to another
 *      view — keep playback context stable).
 *   2. New queue would drop the currently playing track (e.g. user unliked
 *      a track while it plays from "Liked" — without this check, Skip and
 *      auto-advance silently fail because indexOf returns -1).
 */
export function shouldRebuildQueue({
    newQueue,
    newContextId,
    playingTrackId,
    storedContextId,
}: QueueRebuildInput): boolean {
    if (!playingTrackId) return true;

    if (storedContextId && storedContextId !== newContextId) return false;

    if (!newQueue.includes(playingTrackId)) return false;

    return true;
}
