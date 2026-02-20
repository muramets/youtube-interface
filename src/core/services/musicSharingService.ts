// =============================================================================
// MUSIC LIBRARY: Sharing Firestore Service
// =============================================================================
//
// Manages share grants (owner → grantee) and reverse index (grantee → owner).
// Uses Firestore transactions to prevent stale-read race conditions when
// multiple writes happen concurrently (e.g. rapid permission toggles).
//
// Firestore paths:
//   Grant:   users/{uid}/channels/{cid}/settings/musicSharing
//   Reverse: users/{uid}/channels/{granteeChannelId}/settings/sharedLibraries
// =============================================================================

import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type {
    MusicShareGrant,
    MusicSharingSettings,
    SharedLibraryEntry,
    SharedLibrariesSettings,
    SharePermissions,
} from '../types/musicSharing';
import { DEFAULT_SHARE_PERMISSIONS } from '../types/musicSharing';

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
    // Grant Access (transaction: owner grant + grantee reverse index)
    // -----------------------------------------------------------------------

    async grantAccess(
        userId: string,
        ownerChannelId: string,
        ownerChannelName: string,
        granteeChannelId: string,
        granteeChannelName: string,
    ): Promise<void> {
        const ownerRef = doc(db, getSettingsPath(userId, ownerChannelId), SHARING_DOC_ID);
        const granteeRef = doc(db, getSettingsPath(userId, granteeChannelId), SHARED_LIBRARIES_DOC_ID);

        await runTransaction(db, async (txn) => {
            const [ownerSnap, granteeSnap] = await Promise.all([
                txn.get(ownerRef),
                txn.get(granteeRef),
            ]);

            const currentGrants: MusicShareGrant[] = ownerSnap.exists()
                ? (ownerSnap.data() as MusicSharingSettings).grants || []
                : [];

            // Prevent duplicate grants
            if (currentGrants.some(g => g.channelId === granteeChannelId)) return;

            const now = Date.now();
            const newGrant: MusicShareGrant = {
                channelId: granteeChannelId,
                channelName: granteeChannelName,
                grantedAt: now,
                permissions: DEFAULT_SHARE_PERMISSIONS,
            };
            txn.set(ownerRef, { grants: [...currentGrants, newGrant] }, { merge: true });

            const currentLibraries: SharedLibraryEntry[] = granteeSnap.exists()
                ? (granteeSnap.data() as SharedLibrariesSettings).libraries || []
                : [];

            const newEntry: SharedLibraryEntry = {
                ownerUserId: userId,
                ownerChannelId,
                ownerChannelName,
                sharedAt: now,
                permissions: DEFAULT_SHARE_PERMISSIONS,
            };
            txn.set(granteeRef, { libraries: [...currentLibraries, newEntry] }, { merge: true });
        });
    },

    // -----------------------------------------------------------------------
    // Revoke Access (transaction: remove from both sides)
    // -----------------------------------------------------------------------

    async revokeAccess(
        userId: string,
        ownerChannelId: string,
        granteeChannelId: string,
    ): Promise<void> {
        const ownerRef = doc(db, getSettingsPath(userId, ownerChannelId), SHARING_DOC_ID);
        const granteeRef = doc(db, getSettingsPath(userId, granteeChannelId), SHARED_LIBRARIES_DOC_ID);

        await runTransaction(db, async (txn) => {
            const [ownerSnap, granteeSnap] = await Promise.all([
                txn.get(ownerRef),
                txn.get(granteeRef),
            ]);

            if (ownerSnap.exists()) {
                const data = ownerSnap.data() as MusicSharingSettings;
                const filtered = (data.grants || []).filter(g => g.channelId !== granteeChannelId);
                txn.set(ownerRef, { grants: filtered }, { merge: true });
            }

            if (granteeSnap.exists()) {
                const data = granteeSnap.data() as SharedLibrariesSettings;
                const filtered = (data.libraries || []).filter(
                    l => l.ownerChannelId !== ownerChannelId,
                );
                txn.set(granteeRef, { libraries: filtered }, { merge: true });
            }
        });
    },

    // -----------------------------------------------------------------------
    // Update Permissions (transaction: sync both sides)
    // -----------------------------------------------------------------------

    async updatePermissions(
        userId: string,
        ownerChannelId: string,
        granteeChannelId: string,
        permissions: SharePermissions,
    ): Promise<void> {
        const ownerRef = doc(db, getSettingsPath(userId, ownerChannelId), SHARING_DOC_ID);
        const granteeRef = doc(db, getSettingsPath(userId, granteeChannelId), SHARED_LIBRARIES_DOC_ID);

        await runTransaction(db, async (txn) => {
            const [ownerSnap, granteeSnap] = await Promise.all([
                txn.get(ownerRef),
                txn.get(granteeRef),
            ]);

            if (ownerSnap.exists()) {
                const data = ownerSnap.data() as MusicSharingSettings;
                const updated = (data.grants || []).map(g =>
                    g.channelId === granteeChannelId ? { ...g, permissions } : g
                );
                txn.set(ownerRef, { grants: updated }, { merge: true });
            }

            if (granteeSnap.exists()) {
                const data = granteeSnap.data() as SharedLibrariesSettings;
                const updated = (data.libraries || []).map(l =>
                    l.ownerChannelId === ownerChannelId ? { ...l, permissions } : l
                );
                txn.set(granteeRef, { libraries: updated }, { merge: true });
            }
        });
    },
};
