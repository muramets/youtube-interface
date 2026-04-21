// =============================================================================
// updateTrack handler — Patch text metadata of an existing track
//
// Partial update: only fields explicitly passed are changed, others stay as is.
// Validates genre + tags against the channel registry.
// Cannot change audio files, peaks, duration, storage paths, or grouping —
// those require re-upload / trim / UI-level operations.
// =============================================================================

import { admin, db } from "../../../../shared/db.js";
import type { ToolContext } from "../../types.js";
import { resolveTargetChannel, readMusicSettings, validateGenreAndTags } from "./musicLibrary.js";

// Text-metadata fields this handler can update
const EDITABLE_STRING_FIELDS = ["title", "artist", "lyrics", "prompt", "genre"] as const;

export async function handleUpdateTrack(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    try {
        // --- Parse ---
        const trackId = typeof args.trackId === "string" ? args.trackId.trim() : "";
        if (!trackId) return { error: "trackId is required." };

        const { basePath, settingsDocPath } = resolveTargetChannel(ctx, args.targetChannelId);

        // Collect patch
        const patch: Record<string, unknown> = {};

        for (const field of EDITABLE_STRING_FIELDS) {
            if (field in args) {
                const value = args[field];
                if (value === null || value === "") {
                    // Empty string / null → clear the field
                    patch[field] = admin.firestore.FieldValue.delete();
                } else if (typeof value === "string") {
                    patch[field] = value.trim();
                } else {
                    return { error: `${field} must be a string or null.` };
                }
            }
        }

        if ("bpm" in args) {
            const bpm = args.bpm;
            if (bpm === null) {
                patch.bpm = admin.firestore.FieldValue.delete();
            } else if (typeof bpm === "number" && bpm > 0 && bpm < 1000) {
                patch.bpm = bpm;
            } else {
                return { error: "bpm must be a positive number (< 1000) or null." };
            }
        }

        if ("liked" in args) {
            if (typeof args.liked !== "boolean") {
                return { error: "liked must be a boolean." };
            }
            patch.liked = args.liked;
        }

        let tagsToApply: string[] | undefined;
        if ("tags" in args) {
            if (!Array.isArray(args.tags)) {
                return { error: "tags must be an array of strings." };
            }
            tagsToApply = (args.tags as unknown[]).filter((t) => typeof t === "string") as string[];
            patch.tags = tagsToApply;
        }

        let genreToApply: string | undefined;
        if (typeof patch.genre === "string") {
            genreToApply = patch.genre as string;
        }

        // --- Validate at least one field changed (trackId alone is not a patch) ---
        if (Object.keys(patch).length === 0) {
            return { error: "No editable fields provided. Pass at least one of: title, artist, bpm, lyrics, prompt, genre, tags, liked." };
        }

        // --- Validate genre + tags against registry (only if they're in patch) ---
        if (genreToApply !== undefined || tagsToApply !== undefined) {
            const settings = await readMusicSettings(settingsDocPath);

            if (genreToApply !== undefined) {
                const genreExists = settings.genres.some((g) => g.id === genreToApply);
                if (!genreExists) {
                    return { error: `Unknown genre "${genreToApply}". Available: ${settings.genres.map((g) => g.id).join(", ")}` };
                }
            }

            if (tagsToApply !== undefined && tagsToApply.length > 0) {
                // Reuse shared validator — needs a genre arg, so pass a dummy if not updating genre
                const genreForValidator = genreToApply ?? settings.genres[0]?.id ?? "";
                const validationError = validateGenreAndTags(settings, genreForValidator, tagsToApply);
                // validateGenreAndTags errors start with "Unknown genre" or "Unknown tags" —
                // we only care about the tags half here since genre is already validated above.
                if (validationError && validationError.startsWith("Unknown tags")) {
                    return { error: validationError };
                }
            }
        }

        // --- Ensure track exists before writing ---
        const trackRef = db.doc(`${basePath}/tracks/${trackId}`);
        const trackSnap = await trackRef.get();
        if (!trackSnap.exists) {
            return { error: `Track not found: ${trackId}` };
        }

        // --- Write ---
        patch.updatedAt = Date.now();
        await trackRef.update(patch);

        // Read back the updated doc so we can return a clean summary
        const updated = (await trackRef.get()).data()!;

        return {
            success: true,
            trackId,
            changed: Object.keys(patch).filter((k) => k !== "updatedAt"),
            track: {
                id: trackId,
                title: updated.title,
                artist: updated.artist ?? null,
                genre: updated.genre,
                tags: updated.tags ?? [],
                bpm: updated.bpm ?? null,
                lyrics: updated.lyrics ?? null,
                prompt: updated.prompt ?? null,
                liked: updated.liked ?? false,
                duration: updated.duration,
            },
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Failed to update track: ${message}` };
    }
}
