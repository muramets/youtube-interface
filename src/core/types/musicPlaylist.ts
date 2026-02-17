// =============================================================================
// MUSIC LIBRARY: Music Playlist Types
// =============================================================================

export interface MusicPlaylist {
    id: string;
    name: string;
    trackIds: string[];
    trackAddedAt?: Record<string, number>;  // trackId → timestamp of addition
    group?: string | null;       // group name (null/undefined = ungrouped)
    order?: number;       // order within group
    color?: string;       // accent color for sidebar item
    createdAt: number;
    updatedAt: number;
}

export interface MusicPlaylistSettings {
    groupOrder: string[];
}
