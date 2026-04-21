// =============================================================================
// Music Library — shared utilities for music tool handlers
//
// Resolves target channel path, reads/writes music settings, validates
// genre + tag ids against the channel's registry.
// =============================================================================

import { db } from "../../../../shared/db.js";
import type { ToolContext } from "../../types.js";

// ---------------------------------------------------------------------------
// Types (mirrors src/core/types/music/track.ts — SSOT lives in frontend)
// ---------------------------------------------------------------------------

export interface MusicGenre {
    id: string;
    name: string;
    color: string;
    order: number;
}

export interface MusicTag {
    id: string;
    name: string;
    category?: string;
}

export interface MusicSettings {
    genres: MusicGenre[];
    tags: MusicTag[];
}

// Mirrors DEFAULT_GENRES / DEFAULT_TAGS from frontend — used when settings doc is empty.
const DEFAULT_GENRES: MusicGenre[] = [
    { id: "hip-hop", name: "Hip-Hop", color: "#F59E0B", order: 0 },
    { id: "pop", name: "Pop", color: "#EC4899", order: 1 },
    { id: "rock", name: "Rock", color: "#EF4444", order: 2 },
    { id: "electronic", name: "Electronic", color: "#8B5CF6", order: 3 },
    { id: "rnb", name: "R&B", color: "#06B6D4", order: 4 },
    { id: "jazz", name: "Jazz", color: "#F97316", order: 5 },
    { id: "classical", name: "Classical", color: "#6366F1", order: 6 },
    { id: "lo-fi", name: "Lo-Fi", color: "#14B8A6", order: 7 },
    { id: "ambient", name: "Ambient", color: "#3B82F6", order: 8 },
    { id: "indie", name: "Indie", color: "#A855F7", order: 9 },
    { id: "folk", name: "Folk", color: "#84CC16", order: 10 },
    { id: "metal", name: "Metal", color: "#64748B", order: 11 },
    { id: "soundtrack", name: "Soundtrack", color: "#D946EF", order: 12 },
    { id: "other", name: "Other", color: "#9CA3AF", order: 13 },
];

const DEFAULT_TAGS: MusicTag[] = [
    { id: "mood-dark", name: "Dark", category: "Mood" },
    { id: "mood-uplifting", name: "Uplifting", category: "Mood" },
    { id: "mood-chill", name: "Chill", category: "Mood" },
    { id: "mood-aggressive", name: "Aggressive", category: "Mood" },
    { id: "mood-melancholic", name: "Melancholic", category: "Mood" },
    { id: "energy-high", name: "High Energy", category: "Energy" },
    { id: "energy-medium", name: "Medium Energy", category: "Energy" },
    { id: "energy-low", name: "Low Energy", category: "Energy" },
    { id: "use-intro", name: "Intro", category: "Use Case" },
    { id: "use-outro", name: "Outro", category: "Use Case" },
    { id: "use-background", name: "Background", category: "Use Case" },
    { id: "use-transition", name: "Transition", category: "Use Case" },
];

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve target channel for music operations.
 * Returns { userId, channelId, basePath, settingsDocPath }.
 */
export function resolveTargetChannel(
    ctx: ToolContext,
    targetChannelId: unknown,
): { userId: string; channelId: string; basePath: string; settingsDocPath: string } {
    const channelId = typeof targetChannelId === "string" && targetChannelId.trim()
        ? targetChannelId.trim()
        : ctx.channelId;
    const basePath = `users/${ctx.userId}/channels/${channelId}`;
    return {
        userId: ctx.userId,
        channelId,
        basePath,
        settingsDocPath: `${basePath}/settings/music`,
    };
}

// ---------------------------------------------------------------------------
// Settings I/O
// ---------------------------------------------------------------------------

/**
 * Read music settings from Firestore. Returns defaults if the doc does not exist.
 */
export async function readMusicSettings(settingsDocPath: string): Promise<MusicSettings> {
    const snap = await db.doc(settingsDocPath).get();
    if (!snap.exists) {
        return { genres: DEFAULT_GENRES, tags: DEFAULT_TAGS };
    }
    const data = snap.data() as Partial<MusicSettings>;
    return {
        genres: Array.isArray(data.genres) ? data.genres : DEFAULT_GENRES,
        tags: Array.isArray(data.tags) ? data.tags : DEFAULT_TAGS,
    };
}

/**
 * Validate genre + tags against the channel registry.
 * Returns an error string if invalid, or null if all ids exist.
 */
export function validateGenreAndTags(
    settings: MusicSettings,
    genreId: string,
    tagIds: string[],
): string | null {
    const genreExists = settings.genres.some((g) => g.id === genreId);
    if (!genreExists) {
        return `Unknown genre "${genreId}". Available: ${settings.genres.map((g) => g.id).join(", ")}`;
    }
    const unknownTags = tagIds.filter((t) => !settings.tags.some((tag) => tag.id === t));
    if (unknownTags.length > 0) {
        return `Unknown tags: ${unknownTags.join(", ")}. Available: ${settings.tags.map((t) => t.id).join(", ")}`;
    }
    return null;
}
