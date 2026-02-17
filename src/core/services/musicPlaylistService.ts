// =============================================================================
// MUSIC LIBRARY: Music Playlist Firestore Service
// =============================================================================
//
// Modeled after playlistService.ts but for music playlists (trackIds).
// Firestore path: users/{uid}/channels/{cid}/musicPlaylists/{playlistId}
// Settings path:  users/{uid}/channels/{cid}/settings/musicPlaylists
// =============================================================================

import {
    setDocument,
    deleteDocument,
    subscribeToCollection,
    updateDocument,
    fetchDoc,
} from './firestore';
import { orderBy, arrayRemove, doc, updateDoc, getDoc, setDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { MusicPlaylist, MusicPlaylistSettings } from '../types/musicPlaylist';

// ---------------------------------------------------------------------------
// Path Helpers
// ---------------------------------------------------------------------------

const getPlaylistsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/musicPlaylists`;

const getSettingsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/settings`;

const SETTINGS_DOC_ID = 'musicPlaylists';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const MusicPlaylistService = {

    // -----------------------------------------------------------------------
    // CRUD
    // -----------------------------------------------------------------------

    subscribeToPlaylists(
        userId: string,
        channelId: string,
        callback: (playlists: MusicPlaylist[]) => void,
    ) {
        return subscribeToCollection<MusicPlaylist>(
            getPlaylistsPath(userId, channelId),
            callback,
            [orderBy('createdAt')],
        );
    },

    async createPlaylist(
        userId: string,
        channelId: string,
        playlist: MusicPlaylist,
    ) {
        await setDocument(
            getPlaylistsPath(userId, channelId),
            playlist.id,
            playlist,
        );
    },

    async updatePlaylist(
        userId: string,
        channelId: string,
        playlistId: string,
        updates: Partial<MusicPlaylist>,
    ) {
        await updateDocument(
            getPlaylistsPath(userId, channelId),
            playlistId,
            updates,
        );
    },

    async deletePlaylist(
        userId: string,
        channelId: string,
        playlistId: string,
    ) {
        await deleteDocument(
            getPlaylistsPath(userId, channelId),
            playlistId,
        );
    },

    // -----------------------------------------------------------------------
    // Track Management
    // -----------------------------------------------------------------------

    async addTracksToPlaylist(
        userId: string,
        channelId: string,
        playlistId: string,
        trackIds: string[],
    ) {
        const playlistRef = doc(db, getPlaylistsPath(userId, channelId), playlistId);
        const snapshot = await getDoc(playlistRef);

        if (snapshot.exists()) {
            const playlist = snapshot.data() as MusicPlaylist;
            const currentTrackIds = playlist.trackIds || [];
            const newTrackIds = trackIds.filter(id => !currentTrackIds.includes(id));

            if (newTrackIds.length > 0) {
                const now = Date.now();
                const addedAt: Record<string, number> = { ...(playlist.trackAddedAt || {}) };
                for (const id of newTrackIds) {
                    addedAt[id] = now;
                }
                await updateDoc(playlistRef, {
                    trackIds: [...currentTrackIds, ...newTrackIds],
                    trackAddedAt: addedAt,
                    updatedAt: now,
                });
            }
        }
    },

    async removeTracksFromPlaylist(
        userId: string,
        channelId: string,
        playlistId: string,
        trackIds: string[],
    ) {
        const playlistRef = doc(db, getPlaylistsPath(userId, channelId), playlistId);
        const snapshot = await getDoc(playlistRef);
        if (!snapshot.exists()) return;

        const playlist = snapshot.data() as MusicPlaylist;
        const removeSet = new Set(trackIds);

        // Clean up trackAddedAt to avoid orphan keys
        const cleanedAddedAt = playlist.trackAddedAt
            ? Object.fromEntries(
                Object.entries(playlist.trackAddedAt).filter(([id]) => !removeSet.has(id))
            )
            : {};

        await updateDoc(playlistRef, {
            trackIds: arrayRemove(...trackIds),
            trackAddedAt: cleanedAddedAt,
            updatedAt: Date.now(),
        });
    },

    async reorderPlaylistTracks(
        userId: string,
        channelId: string,
        playlistId: string,
        orderedTrackIds: string[],
    ) {
        const playlistRef = doc(db, getPlaylistsPath(userId, channelId), playlistId);
        await updateDoc(playlistRef, {
            trackIds: orderedTrackIds,
            updatedAt: Date.now(),
        });
    },

    // -----------------------------------------------------------------------
    // Settings (Group Order)
    // -----------------------------------------------------------------------

    async fetchSettings(
        userId: string,
        channelId: string,
    ): Promise<MusicPlaylistSettings> {
        const data = await fetchDoc<MusicPlaylistSettings>(
            getSettingsPath(userId, channelId),
            SETTINGS_DOC_ID,
        );
        return data || { groupOrder: [] };
    },

    async updateSettings(
        userId: string,
        channelId: string,
        settings: Partial<MusicPlaylistSettings>,
    ) {
        const settingsRef = doc(db, getSettingsPath(userId, channelId), SETTINGS_DOC_ID);
        await updateDoc(settingsRef, settings).catch(async () => {
            await setDoc(settingsRef, { groupOrder: [], ...settings });
        });
    },

    // -----------------------------------------------------------------------
    // Group Management
    // -----------------------------------------------------------------------

    async reorderPlaylistsInGroup(
        userId: string,
        channelId: string,
        orderedIds: string[],
    ) {
        const batch = writeBatch(db);
        orderedIds.forEach((id, index) => {
            const ref = doc(db, getPlaylistsPath(userId, channelId), id);
            batch.update(ref, { order: index });
        });
        await batch.commit();
    },

    async movePlaylistToGroup(
        userId: string,
        channelId: string,
        playlistId: string,
        newGroup: string,
        orderedIds: string[],
    ) {
        const batch = writeBatch(db);
        const playlistRef = doc(db, getPlaylistsPath(userId, channelId), playlistId);
        batch.update(playlistRef, {
            group: newGroup === 'Ungrouped' ? null : newGroup,
        });
        orderedIds.forEach((id, index) => {
            const ref = doc(db, getPlaylistsPath(userId, channelId), id);
            batch.update(ref, { order: index });
        });
        await batch.commit();
    },

    async renameGroup(
        userId: string,
        channelId: string,
        oldName: string,
        newName: string,
    ) {
        const batch = writeBatch(db);
        const playlistsPath = getPlaylistsPath(userId, channelId);

        const q = query(collection(db, playlistsPath), where('group', '==', oldName));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((docSnap) => {
            batch.update(docSnap.ref, { group: newName });
        });

        const settingsRef = doc(db, getSettingsPath(userId, channelId), SETTINGS_DOC_ID);
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
            const settings = settingsSnap.data() as MusicPlaylistSettings;
            const newOrder = (settings.groupOrder || []).map(g => g === oldName ? newName : g);
            batch.update(settingsRef, { groupOrder: newOrder });
        }

        await batch.commit();
    },
};
