// =============================================================================
// MUSIC LIBRARY: Track Firestore Service
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import {
    subscribeToCollection,
    setDocument,
    updateDocument,
    deleteDocument,
    fetchDoc
} from './firestore';
import type { Track, TrackCreateData, MusicSettings } from '../types/track';
import { DEFAULT_GENRES, DEFAULT_TAGS } from '../types/track';
import type { UpdateData, DocumentData } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Path Helpers
// ---------------------------------------------------------------------------

const getTracksPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/tracks`;

const getMusicSettingsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/settings`;

const MUSIC_SETTINGS_DOC_ID = 'music';

// ---------------------------------------------------------------------------
// Track CRUD
// ---------------------------------------------------------------------------

export const TrackService = {
    /**
     * Subscribe to all tracks for a channel (real-time).
     */
    subscribeToTracks(
        userId: string,
        channelId: string,
        callback: (tracks: Track[]) => void
    ) {
        const path = getTracksPath(userId, channelId);
        return subscribeToCollection<Track>(path, (docs) => {
            callback(docs as Track[]);
        });
    },

    /**
     * Create a new track.
     */
    async createTrack(
        userId: string,
        channelId: string,
        data: TrackCreateData,
        trackId?: string
    ): Promise<Track> {
        const path = getTracksPath(userId, channelId);
        const id = trackId || uuidv4();
        const now = Date.now();

        const track: Track = {
            ...data,
            id,
            createdAt: now,
            updatedAt: now,
        };

        // Strip undefined fields for Firestore compatibility
        const cleanTrack = JSON.parse(JSON.stringify(track));
        await setDocument(path, id, cleanTrack);

        return track;
    },

    /**
     * Update an existing track.
     */
    async updateTrack(
        userId: string,
        channelId: string,
        trackId: string,
        updates: Partial<Track>
    ): Promise<void> {
        const path = getTracksPath(userId, channelId);
        await updateDocument(path, trackId, {
            ...updates,
            updatedAt: Date.now(),
        } as UpdateData<DocumentData>);
    },

    /**
     * Delete a track document from Firestore.
     * Note: Storage cleanup (audio files, cover) is handled separately.
     */
    async deleteTrack(
        userId: string,
        channelId: string,
        trackId: string
    ): Promise<void> {
        const path = getTracksPath(userId, channelId);
        await deleteDocument(path, trackId);
    },

    // -----------------------------------------------------------------------
    // Music Settings (Genres & Tags Management)
    // -----------------------------------------------------------------------

    /**
     * Fetch music settings (genres + tags) for a channel.
     * Returns defaults if no settings doc exists yet.
     */
    async getMusicSettings(
        userId: string,
        channelId: string
    ): Promise<MusicSettings> {
        const path = getMusicSettingsPath(userId, channelId);
        const data = await fetchDoc<MusicSettings>(path, MUSIC_SETTINGS_DOC_ID);

        if (!data) {
            return {
                genres: DEFAULT_GENRES,
                tags: DEFAULT_TAGS,
            };
        }

        return data;
    },

    /**
     * Save music settings (genres + tags).
     */
    async saveMusicSettings(
        userId: string,
        channelId: string,
        settings: MusicSettings
    ): Promise<void> {
        const path = getMusicSettingsPath(userId, channelId);
        await setDocument(path, MUSIC_SETTINGS_DOC_ID, settings as unknown as DocumentData, true);
    },
};
