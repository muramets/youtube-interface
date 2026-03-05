// =============================================================================
// MUSIC LIBRARY: Sharing Types
// =============================================================================

/**
 * Granular permissions for shared library access.
 * Stored on both owner (MusicShareGrant) and grantee (SharedLibraryEntry) sides.
 * Missing field → `false` (safe default for legacy grants).
 */
export interface SharePermissions {
    canEdit: boolean;
    canDelete: boolean;
    canReorder: boolean;
}

/** Default permissions for new grants and legacy data. */
export const DEFAULT_SHARE_PERMISSIONS: SharePermissions = {
    canEdit: false,
    canDelete: false,
    canReorder: false,
};

/** Full permissions for the library owner (or when viewing own library). */
export const OWNER_PERMISSIONS: SharePermissions = {
    canEdit: true,
    canDelete: true,
    canReorder: true,
};

/**
 * A grant giving a channel access to another channel's music library.
 * Stored at: users/{uid}/channels/{cid}/settings/musicSharing
 */
export interface MusicShareGrant {
    channelId: string;       // grantee channel ID
    channelName: string;     // cached display name
    grantedAt: number;       // timestamp
    permissions?: SharePermissions;  // undefined = legacy grant, treat as all-false
}

export interface MusicSharingSettings {
    grants: MusicShareGrant[];
}

/**
 * A reverse-index entry so a channel knows which libraries are shared TO it.
 * Stored at: users/{uid}/channels/{granteeChannelId}/settings/sharedLibraries
 */
export interface SharedLibraryEntry {
    ownerUserId: string;
    ownerChannelId: string;
    ownerChannelName: string; // cached for display
    sharedAt: number;
    permissions?: SharePermissions;
}

export interface SharedLibrariesSettings {
    libraries: SharedLibraryEntry[];
}
