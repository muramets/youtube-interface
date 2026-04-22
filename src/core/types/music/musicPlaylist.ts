// =============================================================================
// MUSIC LIBRARY: Music Playlist Types
// =============================================================================

/** Identifies which library a track came from when added to a playlist. */
export interface TrackSource {
    ownerUserId: string;
    ownerChannelId: string;
}

export interface MusicPlaylist {
    id: string;
    /** User ID that owns the library this playlist belongs to. Stamped at
     *  subscription time from the Firestore path — same pattern as Track.
     *  All mutations on this playlist target this owner's Firestore path,
     *  regardless of which grantee channel triggered them. */
    ownerUserId: string;
    /** Channel ID that owns the library this playlist belongs to. */
    ownerChannelId: string;
    name: string;
    trackIds: string[];
    trackAddedAt?: Record<string, number>;   // trackId → timestamp of addition
    trackSources?: Record<string, TrackSource>; // trackId → origin library (absent = own)
    group?: string | null;       // group name (null/undefined = ungrouped)
    order?: number;       // order within group
    color?: string;       // accent color for sidebar item
    createdAt: number;
    updatedAt: number;
}

export interface MusicPlaylistSettings {
    groupOrder: string[];
}
