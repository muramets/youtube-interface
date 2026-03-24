// =============================================================================
// editKnowledge handler — LLM updates an existing Knowledge Item
//
// Supports partial updates: content, title, summary, videoId, category.
// Content changes create version snapshots. Scope/videoId changes update
// discovery flags atomically. All operations in a single Firestore batch.
// =============================================================================

import { db } from "../../../../shared/db.js";
import { SLUG_PATTERN } from "../../../../shared/knowledge.js";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { ToolContext } from "../../types.js";
import { stripUndefined, getEntityRef } from "../../utils/firestoreHelpers.js";
import { resolveContentVideoRefs } from "../../utils/resolveContentVideoRefs.js";
import { resolveVideosByIds } from "../../utils/resolveVideos.js";

interface EditKnowledgeArgs {
    kiId: string;
    content?: string;
    title?: string;
    summary?: string;
    videoId?: string | null;
    category?: string;
}

export async function handleEditKnowledge(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    const { kiId, content, title, summary, category } = args as unknown as EditKnowledgeArgs;
    // videoId needs special handling: undefined = omitted, null = unlink
    const videoIdProvided = "videoId" in args;
    const rawVideoId = videoIdProvided ? (args.videoId as string | null) : undefined;

    // --- Validation ---

    if (!kiId) {
        logger.warn("[editKnowledge] Validation failed: missing kiId");
        return { error: "Required field: kiId" };
    }

    const hasUpdates = content !== undefined || title !== undefined
        || summary !== undefined || videoIdProvided || category !== undefined;
    if (!hasUpdates) {
        logger.warn("[editKnowledge] Validation failed: no fields to update");
        return { error: "At least one field to update is required (content, title, summary, videoId, category)" };
    }

    if (category !== undefined && !SLUG_PATTERN.test(category)) {
        logger.warn("[editKnowledge] Validation failed: invalid category slug", { category });
        return { error: `Invalid category slug: "${category}". Must be lowercase kebab-case (e.g. 'packaging-audit')` };
    }

    if (!ctx.userId || !ctx.channelId) {
        logger.warn("[editKnowledge] Validation failed: missing userId or channelId");
        return { error: "userId and channelId are required in tool context" };
    }

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const kiRef = db.doc(`${basePath}/knowledgeItems/${kiId}`);

    // --- Read existing KI ---

    const kiSnap = await kiRef.get();

    if (!kiSnap.exists) {
        logger.warn("[editKnowledge] Not found", { kiId });
        return { error: `Knowledge Item not found: ${kiId}` };
    }

    const kiData = kiSnap.data() as Record<string, unknown>;
    const oldContent = (kiData.content as string) || "";
    const oldTitle = (kiData.title as string) || "";
    const oldSummary = (kiData.summary as string) || "";
    const oldCategory = (kiData.category as string) || "";
    const oldScope = ((kiData.scope as string) || "channel") as "video" | "channel";
    const oldVideoId = (kiData.videoId as string) || undefined;
    // Origin provenance: who created this KI (always present, defaults to chat-tool)
    const oldOriginSource = (kiData.source as string) || "chat-tool";
    const oldOriginModel = (kiData.model as string) || "";
    // Edit provenance: who last edited (may be absent if never edited)
    const oldEditSource = (kiData.lastEditSource as string) || undefined;
    const oldEditModel = (kiData.lastEditedBy as string) || undefined;

    // --- Detect what changed ---

    const contentChanged = content !== undefined && content.trim() !== oldContent.trim();
    const titleChanged = title !== undefined && title !== oldTitle;
    const summaryChanged = summary !== undefined && summary !== oldSummary;
    const categoryChanged = category !== undefined && category !== oldCategory;

    // videoId resolution: normalize YouTube ID → Firestore doc ID
    let resolvedVideoId: string | undefined;
    let newScope: "video" | "channel" | undefined;
    let scopeChanged = false;

    if (videoIdProvided) {
        if (rawVideoId === null) {
            // Unlink: convert to channel-level
            resolvedVideoId = undefined;
            newScope = "channel";
            scopeChanged = oldScope !== "channel" || oldVideoId !== undefined;
        } else if (typeof rawVideoId === "string" && rawVideoId.length > 0) {
            // Link to a video: normalize ID
            const { resolved } = await resolveVideosByIds(basePath, [rawVideoId], { skipExternal: true });
            const match = resolved.get(rawVideoId);
            if (match) {
                resolvedVideoId = match.docId;
            } else {
                logger.warn("[editKnowledge] Video not found", { videoId: rawVideoId });
                return { error: `Video not found: ${rawVideoId}. Cannot change video association.` };
            }
            newScope = "video";
            scopeChanged = oldScope !== "video" || oldVideoId !== resolvedVideoId;
        }
    }

    // Check if anything actually changed
    const nothingChanged = !contentChanged && !titleChanged && !summaryChanged
        && !categoryChanged && !scopeChanged;

    if (nothingChanged) {
        logger.info("[editKnowledge] Nothing changed, skipping update", { kiId });
        return {
            content: `Knowledge Item unchanged: ${oldTitle} [id: ${kiId}]`,
            id: kiId,
            title: oldTitle,
            summary: oldSummary,
            category: oldCategory,
            scope: oldScope,
            videoId: oldVideoId,
            contentLength: oldContent.length,
        };
    }

    // --- Compute effective values (current state after update) ---

    const effectiveTitle = titleChanged ? title : oldTitle;
    const effectiveCategory = categoryChanged ? category : oldCategory;
    const effectiveScope: "video" | "channel" = newScope ?? oldScope;
    const effectiveVideoId = videoIdProvided ? resolvedVideoId : oldVideoId;
    const effectiveContent = contentChanged ? content : oldContent;

    // --- Atomic batch ---

    const batch = db.batch();

    // 1. Version snapshot (only when content changes)
    if (contentChanged) {
        const versionRef = db.collection(`${basePath}/knowledgeItems/${kiId}/versions`).doc();
        const updatedAtTs = kiData.updatedAt as { toMillis?: () => number } | undefined;
        const createdAtTs = kiData.createdAt as { toMillis?: () => number } | undefined;
        const contentTimeMs = (updatedAtTs ?? createdAtTs)?.toMillis?.() ?? Date.now();
        const versionData = stripUndefined({
            content: oldContent,
            title: oldTitle || undefined,
            createdAt: contentTimeMs,
            source: oldOriginSource,
            model: oldOriginModel || undefined,
            lastEditSource: oldEditSource,
            lastEditedBy: oldEditModel,
        });
        batch.set(versionRef, versionData);
    }

    // 2. Main doc update — only changed fields
    const source = ctx.isConclude ? "conclude" : "chat-edit";
    const mainUpdate: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        lastEditedBy: ctx.model || "unknown",
        lastEditSource: source,
    };
    if (contentChanged) mainUpdate.content = content;
    if (titleChanged) mainUpdate.title = title;
    if (summaryChanged) mainUpdate.summary = summary;
    if (categoryChanged) mainUpdate.category = category;
    if (scopeChanged) {
        mainUpdate.scope = newScope;
        if (newScope === "channel") {
            mainUpdate.videoId = FieldValue.delete();
        } else {
            mainUpdate.videoId = resolvedVideoId;
        }
    }
    batch.update(kiRef, mainUpdate);

    // 3. Discovery flag updates (when scope/videoId changes)
    if (scopeChanged) {
        const oldEntityRef = getEntityRef(basePath, oldScope, oldVideoId);
        const newEntityRef = getEntityRef(basePath, effectiveScope, effectiveVideoId);

        if (oldEntityRef.path !== newEntityRef.path) {
            // Guard: old entity doc may not exist (e.g., video was deleted).
            // Decrement on a missing doc would fail the entire batch.
            const oldEntitySnap = await oldEntityRef.get();
            if (oldEntitySnap.exists) {
                batch.update(oldEntityRef, {
                    knowledgeItemCount: FieldValue.increment(-1),
                });
            } else {
                logger.warn("[editKnowledge] Old entity doc missing, skipping decrement", {
                    kiId, path: oldEntityRef.path,
                });
            }
            batch.update(newEntityRef, {
                knowledgeItemCount: FieldValue.increment(1),
                knowledgeCategories: FieldValue.arrayUnion(effectiveCategory),
                lastAnalyzedAt: FieldValue.serverTimestamp(),
            });
        }
    }

    // 4. Category flag update on current entity (when category changes but scope doesn't)
    if (categoryChanged && !scopeChanged) {
        const entityRef = getEntityRef(basePath, effectiveScope, effectiveVideoId);
        batch.update(entityRef, {
            knowledgeCategories: FieldValue.arrayUnion(category),
        });
    }

    await batch.commit();

    logger.info("[editKnowledge] Updated", {
        kiId,
        title: effectiveTitle.slice(0, 60),
        source,
        model: ctx.model || "unknown",
        contentLen: effectiveContent.length,
        changes: [
            contentChanged && "content",
            titleChanged && "title",
            summaryChanged && "summary",
            scopeChanged && `scope:${effectiveScope}`,
            categoryChanged && `category:${effectiveCategory}`,
        ].filter(Boolean).join(","),
    });

    // --- Non-blocking post-batch operations ---

    // Re-resolve video references when content changes
    if (contentChanged) {
        try {
            await resolveContentVideoRefs(content!, basePath, kiRef, "editKnowledge");
        } catch (err) {
            logger.warn("[editKnowledge] Video ref resolution failed", { kiId, error: String(err) });
        }
    }

    // Update category registry when category changes
    if (categoryChanged) {
        try {
            const registryRef = db.doc(`${basePath}/knowledgeCategories/registry`);
            const categoryLabel = category!.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            await registryRef.set({
                [`categories.${category}`]: {
                    label: categoryLabel,
                    level: effectiveScope === "video" ? "video" : "channel",
                },
            }, { merge: true });
        } catch (err) {
            logger.warn("[editKnowledge] Registry update failed", { kiId, category, error: String(err) });
        }
    }

    return {
        content: `Knowledge Item updated: ${effectiveTitle} [id: ${kiId}]`,
        id: kiId,
        title: effectiveTitle,
        summary: summaryChanged ? summary : oldSummary,
        category: effectiveCategory,
        scope: effectiveScope,
        videoId: effectiveVideoId,
        contentLength: effectiveContent.length,
    };
}
