import { db } from "../../../shared/db.js";

/**
 * Strip undefined values from an object — Firestore throws on undefined.
 */
export function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Get Firestore ref for the entity (video doc or channel doc) that owns discovery flags.
 *
 * NOTE: A parallel implementation exists on the frontend in
 * `src/core/services/knowledge/knowledgeService.ts` using the client SDK.
 * Keep both in sync when modifying entity resolution logic.
 */
export function getEntityRef(basePath: string, scope: "video" | "channel", videoId?: string) {
    return scope === "video" && videoId
        ? db.doc(`${basePath}/videos/${videoId}`)
        : db.doc(basePath);
}
