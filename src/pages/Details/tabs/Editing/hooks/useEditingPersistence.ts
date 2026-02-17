import { useEffect, useRef } from 'react';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useMusicStore, selectAllTracks } from '../../../../../core/stores/musicStore';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import { EditingService } from '../../../../../core/services/editingService';
import { serializeTrack } from '../../../../../core/types/editingSession';

const DEBOUNCE_MS = 1500;

/**
 * Auto-save & auto-load editing session for a given videoId.
 *
 * - On mount: loads session from Firestore, hydrates tracks from musicStore.
 * - On state change: debounced save to Firestore (skips playback-only changes).
 * - On videoId change: resets store and loads new session.
 * - On unmount: flushes pending save, unsubscribes.
 */
export function useEditingPersistence(videoId: string) {
    const { user } = useAuth();
    const currentChannel = useChannelStore((s) => s.currentChannel);
    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const isLoadingRef = useRef(false);
    const lastSavedJsonRef = useRef('');
    const musicSubRef = useRef<(() => void) | undefined>(undefined);
    const abortRef = useRef<AbortController | null>(null);

    // ── Load session on videoId change ──────────────────────────────────
    useEffect(() => {
        if (!userId || !channelId || !videoId) return;

        const store = useEditingStore.getState();

        // Abort previous load cycle
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const { signal } = controller;

        // If switching videos, reset first
        if (store.videoId && store.videoId !== videoId) {
            store.reset();
        }
        store.setVideoId(videoId);

        isLoadingRef.current = true;

        EditingService.loadSession(userId, channelId, videoId)
            .then((session) => {
                if (signal.aborted) return;
                if (useEditingStore.getState().videoId !== videoId) return; // stale

                if (session) {
                    // Wait for music tracks (own + shared) to be available
                    const musicTracks = selectAllTracks(useMusicStore.getState());
                    if (musicTracks.length > 0) {
                        useEditingStore.getState().loadFromSession(session, musicTracks);
                    } else {
                        // Music tracks not loaded yet — subscribe and hydrate once available
                        const musicTimeout = setTimeout(() => {
                            if (musicSubRef.current) {
                                musicSubRef.current();
                                musicSubRef.current = undefined;
                                isLoadingRef.current = false;
                                console.warn('[useEditingPersistence] Music tracks timeout — saving enabled without hydration');
                            }
                        }, 10_000);

                        musicSubRef.current = useMusicStore.subscribe((state) => {
                            const mergedTracks = selectAllTracks(state);
                            if (mergedTracks.length > 0) {
                                clearTimeout(musicTimeout);
                                musicSubRef.current?.();
                                musicSubRef.current = undefined;
                                if (!signal.aborted && useEditingStore.getState().videoId === videoId) {
                                    useEditingStore.getState().loadFromSession(session, mergedTracks);
                                }
                                isLoadingRef.current = false;
                            }
                        });
                        return; // don't set isLoadingRef false yet
                    }
                }
                isLoadingRef.current = false;
            })
            .catch((err) => {
                console.error('[useEditingPersistence] Failed to load session:', err);
                isLoadingRef.current = false;
            });

        return () => {
            controller.abort();
            // Clean up music-tracks subscription if still pending
            if (musicSubRef.current) {
                musicSubRef.current();
                musicSubRef.current = undefined;
                isLoadingRef.current = false;
            }
            // Flush pending save on unmount
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
                debounceTimer.current = undefined;
                flushSave(userId, channelId, videoId);
            }
        };
    }, [userId, channelId, videoId]);

    // ── Debounced auto-save on state changes ───────────────────────────
    useEffect(() => {
        if (!userId || !channelId || !videoId) return;

        const unsub = useEditingStore.subscribe((state, prevState) => {
            // Skip if loading from Firestore
            if (isLoadingRef.current) return;
            // Skip if video mismatch
            if (state.videoId !== videoId) return;
            // Skip playback-only changes (position, isPlaying, render status)
            if (
                state.tracks === prevState.tracks &&
                state.imageUrl === prevState.imageUrl &&
                state.imageStoragePath === prevState.imageStoragePath &&
                state.imageWidth === prevState.imageWidth &&
                state.imageHeight === prevState.imageHeight &&
                state.resolution === prevState.resolution &&
                state.loopCount === prevState.loopCount &&
                state.volume === prevState.volume &&
                state.isLocked === prevState.isLocked
            ) {
                return;
            }

            // Debounce
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            debounceTimer.current = setTimeout(() => {
                if (abortRef.current?.signal.aborted) return;
                const s = useEditingStore.getState();
                if (s.videoId !== videoId) return;

                const payload = {
                    tracks: s.tracks.map(serializeTrack),
                    imageUrl: s.imageUrl,
                    imageStoragePath: s.imageStoragePath,
                    imageWidth: s.imageWidth,
                    imageHeight: s.imageHeight,
                    resolution: s.resolution,
                    loopCount: s.loopCount,
                    volume: s.volume,
                    isLocked: s.isLocked,
                };

                const json = JSON.stringify(payload);
                if (json === lastSavedJsonRef.current) return; // no actual change
                lastSavedJsonRef.current = json;

                EditingService.saveSession(userId, channelId, videoId, payload).catch((err) => {
                    console.error('[useEditingPersistence] Failed to save session:', err);
                });
            }, DEBOUNCE_MS);
        });

        return unsub;
    }, [userId, channelId, videoId]);

    // ── Cleanup ────────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);
}

// ── Flush helper (sync-fire, best-effort) ──────────────────────────────
function flushSave(userId: string, channelId: string, videoId: string) {
    const s = useEditingStore.getState();
    if (s.videoId !== videoId) return;
    if (s.tracks.length === 0 && !s.imageUrl) return; // nothing to save

    const payload = {
        tracks: s.tracks.map(serializeTrack),
        imageUrl: s.imageUrl,
        imageStoragePath: s.imageStoragePath,
        imageWidth: s.imageWidth,
        imageHeight: s.imageHeight,
        resolution: s.resolution,
        loopCount: s.loopCount,
        volume: s.volume,
        isLocked: s.isLocked,
    };

    EditingService.saveSession(userId, channelId, videoId, payload).catch((err) => {
        console.error('[useEditingPersistence] Flush save failed:', err);
    });
}
