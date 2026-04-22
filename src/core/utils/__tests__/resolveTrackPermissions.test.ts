// =============================================================================
// resolveTrackPermissions.test.ts
//
// Central policy behind the "one library, many channels" UX: a user opening
// track settings from any of their own channels acts as owner, regardless of
// which channel they're currently viewing from. Cross-user grants fall back
// to the permissions explicitly granted — or to all-false for no grant.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { resolveTrackPermissions } from '../trackUtils';
import {
    DEFAULT_SHARE_PERMISSIONS,
    OWNER_PERMISSIONS,
    type SharedLibraryEntry,
} from '../../types/music/musicSharing';

const USER_A = 'user-a';
const USER_B = 'user-b';

function ownedBy(userId: string, channelId: string) {
    return { ownerUserId: userId, ownerChannelId: channelId };
}

function grantFrom(
    ownerUserId: string,
    ownerChannelId: string,
    permissions: SharedLibraryEntry['permissions'] = OWNER_PERMISSIONS,
): SharedLibraryEntry {
    return {
        ownerUserId,
        ownerChannelId,
        ownerChannelName: `${ownerChannelId}-name`,
        sharedAt: 0,
        permissions,
    };
}

describe('resolveTrackPermissions', () => {
    it('grants OWNER_PERMISSIONS when the track belongs to the current user (any channel)', () => {
        const track = ownedBy(USER_A, 'alpha');
        const result = resolveTrackPermissions(track, USER_A, []);
        expect(result).toEqual(OWNER_PERMISSIONS);
    });

    it('grants OWNER_PERMISSIONS across the user\'s OWN channels — the core multi-channel UX rule', () => {
        // User A's library lives in channel alpha. User A also owns channel beta.
        // Opening a track from alpha while currently on beta must feel like owning it.
        const track = ownedBy(USER_A, 'alpha');
        const viewingFromBeta = resolveTrackPermissions(track, USER_A, []);
        expect(viewingFromBeta).toEqual(OWNER_PERMISSIONS);
    });

    it('returns the grant\'s permissions for a different user with a share grant', () => {
        const track = ownedBy(USER_B, 'bangers');
        const grant = grantFrom(USER_B, 'bangers', {
            canEdit: true,
            canDelete: false,
            canReorder: true,
        });
        const result = resolveTrackPermissions(track, USER_A, [grant]);
        expect(result).toEqual({ canEdit: true, canDelete: false, canReorder: true });
    });

    it('returns DEFAULT_SHARE_PERMISSIONS when a different user\'s track has no grant', () => {
        const track = ownedBy(USER_B, 'bangers');
        const result = resolveTrackPermissions(track, USER_A, []);
        expect(result).toEqual(DEFAULT_SHARE_PERMISSIONS);
    });

    it('returns DEFAULT_SHARE_PERMISSIONS when a grant exists for a DIFFERENT channel of the same other user', () => {
        // Grant is for user-b's "bangers" library, but the track is from
        // user-b's "other-lib" — the grant doesn't apply.
        const track = ownedBy(USER_B, 'other-lib');
        const grant = grantFrom(USER_B, 'bangers');
        const result = resolveTrackPermissions(track, USER_A, [grant]);
        expect(result).toEqual(DEFAULT_SHARE_PERMISSIONS);
    });

    it('defaults to DEFAULT_SHARE_PERMISSIONS when grant has undefined permissions (legacy data)', () => {
        const track = ownedBy(USER_B, 'bangers');
        const grant: SharedLibraryEntry = {
            ownerUserId: USER_B,
            ownerChannelId: 'bangers',
            ownerChannelName: 'Bangers',
            sharedAt: 0,
            permissions: undefined,
        };
        const result = resolveTrackPermissions(track, USER_A, [grant]);
        expect(result).toEqual(DEFAULT_SHARE_PERMISSIONS);
    });

    it('picks the matching grant when multiple share grants exist', () => {
        const track = ownedBy(USER_B, 'bangers');
        const unrelatedGrant = grantFrom('user-c', 'other-lib', { canEdit: false, canDelete: false, canReorder: false });
        const matchingGrant = grantFrom(USER_B, 'bangers', { canEdit: true, canDelete: true, canReorder: false });
        const result = resolveTrackPermissions(track, USER_A, [unrelatedGrant, matchingGrant]);
        expect(result).toEqual({ canEdit: true, canDelete: true, canReorder: false });
    });
});
