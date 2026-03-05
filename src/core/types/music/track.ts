// =============================================================================
// MUSIC LIBRARY: Track Type Definitions
// =============================================================================

/**
 * Represents a single music track in the library.
 * A track can have two variants: vocal and instrumental.
 */
export interface Track {
    id: string;
    title: string;
    artist?: string;
    groupId?: string;              // Tracks with same groupId are versions of each other
    groupOrder?: number;           // Display order within a version group (0-based)
    genre: string;                 // Primary genre from managed genre list
    tags: string[];                // Free-form user tags from managed tag list
    bpm?: number;
    lyrics?: string;                // Song lyrics / text
    prompt?: string;                // AI generation prompt
    duration: number;              // Duration in seconds

    // Two versions of the same track
    vocalUrl?: string;             // Firebase Storage download URL
    vocalStoragePath?: string;     // Firebase Storage path for deletion
    vocalFileName?: string;        // Original uploaded filename
    instrumentalUrl?: string;
    instrumentalStoragePath?: string;
    instrumentalFileName?: string; // Original uploaded filename

    // Pre-computed waveform peaks for fast canvas rendering
    vocalPeaks?: number[];
    instrumentalPeaks?: number[];

    // Optional cover art
    coverUrl?: string;
    coverStoragePath?: string;

    liked?: boolean;               // User liked this track

    // Future: video linkage (Phase 3)
    linkedVideoIds?: string[];

    createdAt: number;             // Unix timestamp
    updatedAt: number;
}

export type TrackVariant = 'vocal' | 'instrumental';

/**
 * Data required to create a new track (before IDs and timestamps are assigned).
 */
export type TrackCreateData = Omit<Track, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Managed genre definition (stored in Firestore settings).
 */
export interface MusicGenre {
    id: string;
    name: string;
    color: string;                 // Hex color for UI chips
    order: number;                 // Display order
}

/**
 * Managed tag definition (stored in Firestore settings).
 */
export interface MusicTag {
    id: string;
    name: string;
    category?: string;             // Optional category grouping (e.g., "mood", "energy")
}

/**
 * Music library settings stored per channel.
 */
export interface MusicSettings {
    genres: MusicGenre[];
    tags: MusicTag[];
    categoryOrder?: string[];
    featuredCategories?: string[];
    sortableCategories?: string[];
}

// Default genres with curated colors
export const DEFAULT_GENRES: MusicGenre[] = [
    { id: 'hip-hop', name: 'Hip-Hop', color: '#F59E0B', order: 0 },
    { id: 'pop', name: 'Pop', color: '#EC4899', order: 1 },
    { id: 'rock', name: 'Rock', color: '#EF4444', order: 2 },
    { id: 'electronic', name: 'Electronic', color: '#8B5CF6', order: 3 },
    { id: 'rnb', name: 'R&B', color: '#06B6D4', order: 4 },
    { id: 'jazz', name: 'Jazz', color: '#F97316', order: 5 },
    { id: 'classical', name: 'Classical', color: '#6366F1', order: 6 },
    { id: 'lo-fi', name: 'Lo-Fi', color: '#14B8A6', order: 7 },
    { id: 'ambient', name: 'Ambient', color: '#3B82F6', order: 8 },
    { id: 'indie', name: 'Indie', color: '#A855F7', order: 9 },
    { id: 'folk', name: 'Folk', color: '#84CC16', order: 10 },
    { id: 'metal', name: 'Metal', color: '#64748B', order: 11 },
    { id: 'soundtrack', name: 'Soundtrack', color: '#D946EF', order: 12 },
    { id: 'other', name: 'Other', color: '#9CA3AF', order: 13 },
];

export const DEFAULT_TAGS: MusicTag[] = [
    { id: 'mood-dark', name: 'Dark', category: 'Mood' },
    { id: 'mood-uplifting', name: 'Uplifting', category: 'Mood' },
    { id: 'mood-chill', name: 'Chill', category: 'Mood' },
    { id: 'mood-aggressive', name: 'Aggressive', category: 'Mood' },
    { id: 'mood-melancholic', name: 'Melancholic', category: 'Mood' },
    { id: 'energy-high', name: 'High Energy', category: 'Energy' },
    { id: 'energy-medium', name: 'Medium Energy', category: 'Energy' },
    { id: 'energy-low', name: 'Low Energy', category: 'Energy' },
    { id: 'use-intro', name: 'Intro', category: 'Use Case' },
    { id: 'use-outro', name: 'Outro', category: 'Use Case' },
    { id: 'use-background', name: 'Background', category: 'Use Case' },
    { id: 'use-transition', name: 'Transition', category: 'Use Case' },
];
