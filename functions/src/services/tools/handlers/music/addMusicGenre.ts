// =============================================================================
// addMusicGenre handler — Add new genre to channel's music registry
// =============================================================================

import { db } from "../../../../shared/db.js";
import type { ToolContext } from "../../types.js";
import { resolveTargetChannel, readMusicSettings } from "./musicLibrary.js";

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function handleAddMusicGenre(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    try {
        const id = typeof args.id === "string" ? args.id.trim() : "";
        const name = typeof args.name === "string" ? args.name.trim() : "";
        const color = typeof args.color === "string" ? args.color.trim() : "";

        if (!id || !KEBAB_CASE.test(id)) {
            return { error: "id must be kebab-case (lowercase letters, digits, hyphens)." };
        }
        if (!name) return { error: "name is required." };
        if (!HEX_COLOR.test(color)) {
            return { error: "color must be a 6-digit hex string (e.g. '#A855F7')." };
        }

        const { settingsDocPath } = resolveTargetChannel(ctx, args.targetChannelId);
        const settings = await readMusicSettings(settingsDocPath);

        if (settings.genres.some((g) => g.id === id)) {
            return { error: `Genre "${id}" already exists.` };
        }

        const maxOrder = settings.genres.reduce((m, g) => Math.max(m, g.order), -1);
        const newGenre = { id, name, color, order: maxOrder + 1 };
        const nextGenres = [...settings.genres, newGenre];

        await db.doc(settingsDocPath).set({ genres: nextGenres }, { merge: true });

        return {
            success: true,
            genre: newGenre,
            totalGenres: nextGenres.length,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Failed to add genre: ${message}` };
    }
}
