// =============================================================================
// addMusicTag handler — Add new tag to channel's music registry
// =============================================================================

import { db } from "../../../../shared/db.js";
import type { ToolContext } from "../../types.js";
import { resolveTargetChannel, readMusicSettings } from "./musicLibrary.js";

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function handleAddMusicTag(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    try {
        const id = typeof args.id === "string" ? args.id.trim() : "";
        const name = typeof args.name === "string" ? args.name.trim() : "";
        const category = typeof args.category === "string" ? args.category.trim() : undefined;

        if (!id || !KEBAB_CASE.test(id)) {
            return { error: "id must be kebab-case (lowercase letters, digits, hyphens)." };
        }
        if (!name) return { error: "name is required." };

        const { settingsDocPath } = resolveTargetChannel(ctx, args.targetChannelId);
        const settings = await readMusicSettings(settingsDocPath);

        if (settings.tags.some((t) => t.id === id)) {
            return { error: `Tag "${id}" already exists.` };
        }

        const newTag = category ? { id, name, category } : { id, name };
        const nextTags = [...settings.tags, newTag];

        await db.doc(settingsDocPath).set({ tags: nextTags }, { merge: true });

        return {
            success: true,
            tag: newTag,
            totalTags: nextTags.length,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Failed to add tag: ${message}` };
    }
}
