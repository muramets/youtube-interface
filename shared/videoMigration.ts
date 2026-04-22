// =============================================================================
// shared/videoMigration.ts — Pure planner for moving a video between channels
//
// Zero dependencies. Zero I/O. Zero framework imports.
// Shared between frontend (future UI hook) and backend (Cloud Function + CLI).
//
// Rewrites every storage path reference inside the main video doc and its
// subcollection docs so they point to the destination channel folder.
// The orchestrator (Cloud Function or CLI) handles the actual Firestore writes
// and Storage file copies.
// =============================================================================

export type DocData = Record<string, unknown>;

/** Map of subcollection name → docId → doc data. */
export interface SubcollectionDocs {
    [subcollectionName: string]: { [docId: string]: DocData };
}

export interface VideoMigrationInput {
    sourceChannelId: string;
    destChannelId: string;
    mainDoc: DocData;
    subcollections: SubcollectionDocs;
}

export interface VideoMigrationPlan {
    mainDoc: DocData;
    subcollections: SubcollectionDocs;
}

/**
 * Replace the channelId segment in a Storage path or Firebase download URL.
 *
 * Matches both raw paths ("/{srcId}/") and url-encoded download URLs
 * ("%2F{srcId}%2F"). Requires path separators on both sides — never a
 * bare substring match — to prevent false positives on fields like
 * youtubeChannelId where a Firestore ID could theoretically appear inside
 * a longer string.
 */
export function replaceChannelInPath(
    value: string,
    sourceChannelId: string,
    destChannelId: string,
): string {
    return value
        .split(`/${sourceChannelId}/`).join(`/${destChannelId}/`)
        .split(`%2F${sourceChannelId}%2F`).join(`%2F${destChannelId}%2F`);
}

/**
 * Recursively rewrite all strings in a value that contain the source channelId
 * as a path segment. Object/array shape preserved; primitives untouched.
 *
 * Walking recursively (instead of cherry-picking known fields like customImage)
 * means new URL-bearing fields added to the video schema later are migrated
 * automatically — no silent data leaks pointing back to the old channel.
 */
function rewriteRecursively(
    value: unknown,
    sourceChannelId: string,
    destChannelId: string,
): unknown {
    if (typeof value === 'string') {
        return replaceChannelInPath(value, sourceChannelId, destChannelId);
    }
    if (Array.isArray(value)) {
        return value.map(v => rewriteRecursively(v, sourceChannelId, destChannelId));
    }
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = rewriteRecursively(v, sourceChannelId, destChannelId);
        }
        return out;
    }
    return value;
}

/**
 * Plan a video migration. Validates input and returns rewritten docs ready to
 * be written to the destination channel.
 */
export function planVideoMigration(input: VideoMigrationInput): VideoMigrationPlan {
    if (!input.sourceChannelId || !input.destChannelId) {
        throw new Error('sourceChannelId and destChannelId are required');
    }
    if (input.sourceChannelId === input.destChannelId) {
        throw new Error('sourceChannelId and destChannelId must differ');
    }

    const mainDoc = rewriteRecursively(
        input.mainDoc,
        input.sourceChannelId,
        input.destChannelId,
    ) as DocData;

    const subcollections: SubcollectionDocs = {};
    for (const [subName, docs] of Object.entries(input.subcollections)) {
        const rewritten: { [docId: string]: DocData } = {};
        for (const [docId, doc] of Object.entries(docs)) {
            rewritten[docId] = rewriteRecursively(
                doc,
                input.sourceChannelId,
                input.destChannelId,
            ) as DocData;
        }
        subcollections[subName] = rewritten;
    }

    return { mainDoc, subcollections };
}
