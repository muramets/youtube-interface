// =============================================================================
// MUSIC LIBRARY: Sharing Types
// =============================================================================

/**
 * A grant giving a channel read-only access to another channel's music library.
 * Stored at: users/{uid}/channels/{cid}/settings/musicSharing
 */
export interface MusicShareGrant {
    channelId: string;       // grantee channel ID
    channelName: string;     // cached display name
    grantedAt: number;       // timestamp
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
}

export interface SharedLibrariesSettings {
    libraries: SharedLibraryEntry[];
}
