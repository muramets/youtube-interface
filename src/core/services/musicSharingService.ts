// =============================================================================
// MUSIC LIBRARY: Sharing Firestore Service
// =============================================================================
//
// Manages share grants (owner → grantee) and reverse index (grantee → owner).
// Uses atomic writeBatch to keep both sides in sync.
//
// Firestore paths:
//   Grant:   users/{uid}/channels/{cid}/settings/musicSharing
//   Reverse: users/{uid}/channels/{granteeChannelId}/settings/sharedLibraries
// =============================================================================

import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type {
    MusicShareGrant,
    MusicSharingSettings,
    SharedLibraryEntry,
    SharedLibrariesSettings,
} from '../types/musicSharing';

// ---------------------------------------------------------------------------
// Path Helpers
// ---------------------------------------------------------------------------

const getSettingsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/settings`;

const SHARING_DOC_ID = 'musicSharing';
const SHARED_LIBRARIES_DOC_ID = 'sharedLibraries';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const MusicSharingService = {

    // -----------------------------------------------------------------------
    // Read
    // -----------------------------------------------------------------------

    /** Fetch grants FROM the owner channel (who I've shared my library with). */
    async getShareGrants(
        userId: string,
        channelId: string,
    ): Promise<MusicShareGrant[]> {
        const ref = doc(db, getSettingsPath(userId, channelId), SHARING_DOC_ID);
        const snap = await getDoc(ref);
        if (!snap.exists()) return [];
        return (snap.data() as MusicSharingSettings).grants || [];
    },

    /** Fetch libraries shared TO this channel (reverse index). */
    async getSharedLibraries(
        userId: string,
        channelId: string,
    ): Promise<SharedLibraryEntry[]> {
        const ref = doc(db, getSettingsPath(userId, channelId), SHARED_LIBRARIES_DOC_ID);
        const snap = await getDoc(ref);
        if (!snap.exists()) return [];
        return (snap.data() as SharedLibrariesSettings).libraries || [];
    },

    // -----------------------------------------------------------------------
    // Grant Access (atomic: owner grant + grantee reverse index)
    // -----------------------------------------------------------------------

    async grantAccess(
        userId: string,
        ownerChannelId: string,
        ownerChannelName: string,
        granteeChannelId: string,
        granteeChannelName: string,
    ): Promise<void> {
        const batch = writeBatch(db);
        const now = Date.now();

        // 1. Add grant on owner side
        const ownerRef = doc(db, getSettingsPath(userId, ownerChannelId), SHARING_DOC_ID);
        const ownerSnap = await getDoc(ownerRef);
        const currentGrants: MusicShareGrant[] = ownerSnap.exists()
            ? (ownerSnap.data() as MusicSharingSettings).grants || []
            : [];

        // Prevent duplicate grants
        if (currentGrants.some(g => g.channelId === granteeChannelId)) return;

        const newGrant: MusicShareGrant = {
            channelId: granteeChannelId,
            channelName: granteeChannelName,
            grantedAt: now,
        };
        batch.set(ownerRef, { grants: [...currentGrants, newGrant] }, { merge: true });

        // 2. Add reverse index on grantee side
        const granteeRef = doc(db, getSettingsPath(userId, granteeChannelId), SHARED_LIBRARIES_DOC_ID);
        const granteeSnap = await getDoc(granteeRef);
        const currentLibraries: SharedLibraryEntry[] = granteeSnap.exists()
            ? (granteeSnap.data() as SharedLibrariesSettings).libraries || []
            : [];

        const newEntry: SharedLibraryEntry = {
            ownerUserId: userId,
            ownerChannelId,
            ownerChannelName,
            sharedAt: now,
        };
        batch.set(granteeRef, { libraries: [...currentLibraries, newEntry] }, { merge: true });

        await batch.commit();
    },

    // -----------------------------------------------------------------------
    // Revoke Access (atomic: remove from both sides)
    // -----------------------------------------------------------------------

    async revokeAccess(
        userId: string,
        ownerChannelId: string,
        granteeChannelId: string,
    ): Promise<void> {
        const batch = writeBatch(db);

        // 1. Remove grant from owner side
        const ownerRef = doc(db, getSettingsPath(userId, ownerChannelId), SHARING_DOC_ID);
        const ownerSnap = await getDoc(ownerRef);
        if (ownerSnap.exists()) {
            const data = ownerSnap.data() as MusicSharingSettings;
            const filtered = (data.grants || []).filter(g => g.channelId !== granteeChannelId);
            batch.set(ownerRef, { grants: filtered }, { merge: true });
        }

        // 2. Remove reverse index from grantee side
        const granteeRef = doc(db, getSettingsPath(userId, granteeChannelId), SHARED_LIBRARIES_DOC_ID);
        const granteeSnap = await getDoc(granteeRef);
        if (granteeSnap.exists()) {
            const data = granteeSnap.data() as SharedLibrariesSettings;
            const filtered = (data.libraries || []).filter(
                l => l.ownerChannelId !== ownerChannelId,
            );
            batch.set(granteeRef, { libraries: filtered }, { merge: true });
        }

        await batch.commit();
    },
};
