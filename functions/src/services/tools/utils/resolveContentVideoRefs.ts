// =============================================================================
// resolveContentVideoRefs — Extract and resolve video references from KI content
//
// Shared by saveKnowledge and editKnowledge handlers.
// Extracts video IDs from vid:// links and raw ID patterns, resolves them via
// 3-step resolver, and writes resolvedVideoRefs snapshot to the KI document.
// =============================================================================

import type { DocumentReference } from "firebase-admin/firestore";
import { resolveVideosByIds } from "./resolveVideos.js";
import { hasRealVideoData, type MemoryVideoRef } from "../../../shared/memory.js";

/**
 * Extract video IDs from content, resolve via 3-step resolver,
 * and write `resolvedVideoRefs` snapshot to the KI document.
 *
 * Non-blocking: callers should wrap in try/catch — failure does not affect KI data.
 *
 * @param content  - Raw markdown content to scan for video references
 * @param basePath - Firestore base path: `users/{uid}/channels/{chId}`
 * @param docRef   - Reference to the KI document (for `.update()`)
 * @param logTag   - Prefix for log messages (e.g. "saveKnowledge", "editKnowledge")
 */
export async function resolveContentVideoRefs(
    content: string,
    basePath: string,
    docRef: DocumentReference,
    logTag: string,
): Promise<void> {
    // Extract video IDs from two sources:
    // 1. vid:// links: [title](vid://VIDEO_ID) — LLM-generated references
    const vidLinkPattern = /vid:\/\/([A-Za-z0-9_-]+)/g;
    const vidLinkIds = Array.from(content.matchAll(vidLinkPattern), m => m[1]);
    // 2. Raw video-ID-like strings: YouTube IDs (11 chars) and custom IDs (custom-\d+)
    const idPattern = /\b([A-Za-z0-9_-]{11}|custom-\d+)\b/g;
    const rawIds = Array.from(content.matchAll(idPattern), m => m[1]);
    // Merge both candidate sets
    const candidateIds = [...new Set([...vidLinkIds, ...rawIds])];

    if (candidateIds.length === 0) return;

    const { resolved } = await resolveVideosByIds(basePath, candidateIds);

    if (resolved.size === 0) return;

    const resolvedVideoRefs: MemoryVideoRef[] = [];
    for (const [requestedId, rv] of resolved) {
        const d = rv.data;
        const ref: MemoryVideoRef = {
            videoId: requestedId,
            title: (d.title as string) || requestedId,
            thumbnailUrl: (d.thumbnail as string) || (d.thumbnailUrl as string) || '',
            ownership: rv.source === 'video_grid'
                ? (d.isDraft ? 'own-draft' : 'own-published')
                : 'competitor',
        };
        const hasRealData = hasRealVideoData(d);
        if (hasRealData) {
            const vc = d.viewCount as string | number | undefined;
            if (vc !== undefined) ref.viewCount = typeof vc === 'string' ? Number(vc) : vc;
            if (d.publishedAt) ref.publishedAt = d.publishedAt as string;
        }
        resolvedVideoRefs.push(ref);
    }

    await docRef.update({ resolvedVideoRefs });
    console.info(`[${logTag}] ── VideoRefs ── ${resolvedVideoRefs.length} resolved from ${candidateIds.length} candidates`);
}
