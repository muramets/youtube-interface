// =============================================================================
// findSimilarVideos handler — Layer 4: Competition (Этапы 2-3)
//
// Finds competitor videos similar to a given video by:
//   packaging — text embedding similarity (title, tags, description)
//   visual   — image embedding similarity (thumbnail)
//   both     — Reciprocal Rank Fusion merge of packaging + visual
//
// Enriches results with view deltas, performance tiers, shared tags.
// =============================================================================

import { db } from "../../../../shared/db.js";
import { assignPercentileGroups } from "../../../../shared/percentiles.js";
import type { PercentileGroup } from "../../../../shared/percentiles.js";
import { getViewDeltas } from "../../../trendSnapshotService.js";
import { getHiddenVideoIds } from "../../utils/getHiddenVideoIds.js";
import { normalizeLastUpdated } from "../../utils/normalizeLastUpdated.js";
import { resolveThumbnailUrl } from "../../utils/resolveThumbnailUrl.js";
import { findNearestVideos } from "../../../../embedding/vectorSearch.js";
import type { VectorSearchResult } from "../../../../embedding/vectorSearch.js";
import { generatePackagingEmbedding } from "../../../../embedding/packagingEmbedding.js";
import { generateVisualEmbedding } from "../../../../embedding/visualEmbedding.js";
import { downloadThumbnail, downloadThumbnailFromUrl } from "../../../../embedding/thumbnailDownload.js";
import { rrfMerge } from "../../../../embedding/rrfMerge.js";
import type { EmbeddingDoc, EmbeddingStats } from "../../../../embedding/types.js";
import type { ToolContext } from "../../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const RRF_K = 60;
const LIMIT_PER_SEARCH = 100;

type Mode = "packaging" | "visual" | "both";
const VALID_MODES: Mode[] = ["packaging", "visual", "both"];

// ---------------------------------------------------------------------------
// Firestore VectorValue normalization
// ---------------------------------------------------------------------------

/**
 * Firestore stores vectors written via FieldValue.vector() and returns them
 * as VectorValue objects on read — NOT plain number[]. VectorValue has
 * .toArray() but no .length, which breaks Array.isArray and .length checks.
 * Normalize at the read boundary so all downstream code gets plain number[].
 */
function vectorToArray(v: unknown): number[] | null {
    if (Array.isArray(v)) return v;
    if (v && typeof (v as Record<string, unknown>).toArray === "function") {
        return (v as { toArray(): number[] }).toArray();
    }
    return null;
}

// ---------------------------------------------------------------------------
// Video lookup (shared across modes)
// ---------------------------------------------------------------------------

interface VideoLookupResult {
    referenceVideo: { videoId: string; title: string; tags: string[] };
    embeddingDoc?: EmbeddingDoc;
    source: "embedding" | "own" | "trend";
    ownVideoMeta?: { title: string; tags: string[]; description: string; thumbnailUrl?: string };
    /** YouTube video ID for thumbnail download (differs from videoId for custom-* videos) */
    youtubeVideoId?: string;
}

/**
 * Lookup video across all data sources.
 * Returns metadata + optional embedding doc for vector extraction.
 */
async function lookupVideo(
    videoId: string,
    basePath: string,
): Promise<VideoLookupResult | { error: string }> {
    // 1. Check globalVideoEmbeddings (fast path for competitor videos)
    const embDoc = await db.doc(`globalVideoEmbeddings/${videoId}`).get();
    if (embDoc.exists) {
        const data = embDoc.data() as EmbeddingDoc;
        // Normalize VectorValue → number[] at the Firestore read boundary
        data.packagingEmbedding = vectorToArray(data.packagingEmbedding);
        data.visualEmbedding = vectorToArray(data.visualEmbedding);
        return {
            referenceVideo: { videoId, title: data.title, tags: data.tags ?? [] },
            embeddingDoc: data,
            source: "embedding",
        };
    }

    // 2. Check own videos
    const ownDoc = await db.doc(`${basePath}/videos/${videoId}`).get();
    if (ownDoc.exists) {
        const data = ownDoc.data()!;
        const title = (data.title as string) ?? "";
        const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
        const description = (data.description as string) ?? "";
        const publishedVideoId = typeof data.publishedVideoId === "string"
            ? data.publishedVideoId
            : undefined;
        const thumbnailUrl = typeof data.thumbnail === "string" ? data.thumbnail : undefined;
        return {
            referenceVideo: { videoId, title, tags },
            source: "own",
            ownVideoMeta: { title, tags, description, thumbnailUrl },
            youtubeVideoId: publishedVideoId ?? (videoId.startsWith("custom-") ? undefined : videoId),
        };
    }

    // 3. Check trend channel videos (single getAll across all channels)
    const trendSnap = await db.collection(`${basePath}/trendChannels`).get();
    if (!trendSnap.empty) {
        const refs = trendSnap.docs.map((ch) =>
            db.doc(`${basePath}/trendChannels/${ch.id}/videos/${videoId}`),
        );
        const checks = await db.getAll(...refs);
        const found = checks.find((d) => d.exists);
        if (found) {
            const data = found.data()!;
            const title = (data.title as string) ?? "";
            const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
            const description = (data.description as string) ?? "";
            return {
                referenceVideo: { videoId, title, tags },
                source: "trend",
                ownVideoMeta: { title, tags, description },
            };
        }
    }

    return { error: `Video not found: ${videoId}` };
}

// ---------------------------------------------------------------------------
// Vector resolution helpers
// ---------------------------------------------------------------------------

async function getPackagingVector(
    lookup: VideoLookupResult,
    ctx: ToolContext,
): Promise<number[] | { error: string }> {
    // Competitor — use stored embedding
    if (lookup.embeddingDoc?.packagingEmbedding?.length) {
        return lookup.embeddingDoc.packagingEmbedding;
    }

    // Own/trend — generate on-the-fly
    if (lookup.ownVideoMeta) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { error: "Gemini API key not configured. Cannot generate embedding." };
        }
        ctx.reportProgress?.("Generating packaging embedding for your video...");
        const vec = await generatePackagingEmbedding(
            lookup.ownVideoMeta.title,
            lookup.ownVideoMeta.tags,
            lookup.ownVideoMeta.description,
            apiKey,
        );
        if (!vec) return { error: "Failed to generate packaging embedding. Try again later." };
        return vec;
    }

    return { error: "Packaging embedding not available for this video." };
}

async function getVisualVector(
    lookup: VideoLookupResult,
    ctx: ToolContext,
): Promise<number[] | { error: string }> {
    // Competitor — use stored embedding or error (don't generate on-the-fly for budget)
    if (lookup.source === "embedding") {
        if (lookup.embeddingDoc?.visualEmbedding?.length) {
            return lookup.embeddingDoc.visualEmbedding;
        }
        return {
            error: "Visual embedding not available for this video. It may not have been processed yet.",
        };
    }

    // Own/trend — generate on-the-fly via thumbnail download → Vertex AI
    ctx.reportProgress?.("Generating visual embedding...");
    const videoId = lookup.referenceVideo.videoId;

    let thumbnail: { buffer: Buffer; mimeType: string } | null = null;

    if (!lookup.youtubeVideoId && videoId.startsWith("custom-")) {
        // Custom video without publishedVideoId — use uploaded cover from Firebase Storage
        if (!lookup.ownVideoMeta?.thumbnailUrl) {
            return { error: "No thumbnail available for this video. Upload a cover image or publish the video first." };
        }
        thumbnail = await downloadThumbnailFromUrl(lookup.ownVideoMeta.thumbnailUrl);
        if (!thumbnail) return { error: "Failed to download thumbnail from storage." };
    } else {
        const ytVideoId = lookup.youtubeVideoId ?? videoId;
        thumbnail = await downloadThumbnail(ytVideoId);
        if (!thumbnail) return { error: "Failed to download thumbnail. The video may be unavailable." };
    }

    const embeddingId = lookup.youtubeVideoId ?? videoId;
    const vec = await generateVisualEmbedding(embeddingId, thumbnail);
    if (!vec) return { error: "Failed to generate visual embedding." };
    return vec;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleFindSimilarVideos(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    try {
        // --- Parse & validate args ---
        const videoId = typeof args.videoId === "string" ? args.videoId.trim() : "";
        if (!videoId) return { error: "videoId is required" };

        const mode = (typeof args.mode === "string" ? args.mode : "packaging") as Mode;
        if (!VALID_MODES.includes(mode)) {
            return { error: `Unknown mode "${mode}". Available: packaging, visual, both` };
        }

        const rawLimit = typeof args.limit === "number" ? args.limit : DEFAULT_LIMIT;
        const limit = Math.min(Math.max(1, Math.round(rawLimit)), MAX_LIMIT);

        const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;

        // Optional: search in a different channel's trend DB
        const searchChannelId = typeof args.searchChannelId === "string"
            ? args.searchChannelId.trim()
            : undefined;
        const searchBasePath = searchChannelId
            ? `users/${ctx.userId}/channels/${searchChannelId}`
            : basePath;

        // --- Step 1: Lookup video (shared for all modes) ---
        ctx.reportProgress?.("Resolving query video...");
        let lookup = await lookupVideo(videoId, basePath);
        // If not found in current channel and searchChannelId is set, try the other channel
        if ("error" in lookup && searchChannelId) {
            lookup = await lookupVideo(videoId, searchBasePath);
        }
        if ("error" in lookup) return lookup;

        // --- Step 2: Get trend channel IDs (from search channel if specified) ---
        const trendChannelsSnap = await db.collection(`${searchBasePath}/trendChannels`).get();
        if (trendChannelsSnap.empty) {
            return { error: "No trend channels tracked. Add channels in Trends first." };
        }

        const trendChannelIds = trendChannelsSnap.docs.map((doc) => doc.id);
        const channelMeta = new Map<string, { title: string; lastUpdated: string | null }>();
        for (const doc of trendChannelsSnap.docs) {
            const data = doc.data();
            channelMeta.set(doc.id, {
                title: (data.title as string) ?? doc.id,
                lastUpdated: normalizeLastUpdated(data.lastUpdated),
            });
        }

        // --- Step 3: Resolve vectors & search (mode-dependent) ---
        ctx.reportProgress?.("Searching for similar videos...");

        let searchResults: Array<VectorSearchResult & { rrfScore?: number }>;
        let effectiveMode: Mode = mode;
        let modeNote: string | undefined;

        if (mode === "packaging") {
            const vec = await getPackagingVector(lookup, ctx);
            if (!Array.isArray(vec)) return vec;

            searchResults = await findNearestVideos({
                queryVector: vec,
                field: "packagingEmbedding",
                youtubeChannelIds: trendChannelIds,
                limit: limit + 10,
            });
        } else if (mode === "visual") {
            const vec = await getVisualVector(lookup, ctx);
            if (!Array.isArray(vec)) return vec;

            searchResults = await findNearestVideos({
                queryVector: vec,
                field: "visualEmbedding",
                youtubeChannelIds: trendChannelIds,
                limit: limit + 10,
            });
        } else {
            // mode === "both" — parallel resolve + parallel search + RRF merge
            const [packVec, visVec] = await Promise.all([
                getPackagingVector(lookup, ctx),
                getVisualVector(lookup, ctx),
            ]);

            const hasPackaging = Array.isArray(packVec);
            const hasVisual = Array.isArray(visVec);

            if (!hasPackaging && !hasVisual) {
                return packVec as { error: string };
            }

            if (hasPackaging && hasVisual) {
                const [packResults, visResults] = await Promise.all([
                    findNearestVideos({
                        queryVector: packVec,
                        field: "packagingEmbedding",
                        youtubeChannelIds: trendChannelIds,
                        limit: LIMIT_PER_SEARCH,
                    }),
                    findNearestVideos({
                        queryVector: visVec,
                        field: "visualEmbedding",
                        youtubeChannelIds: trendChannelIds,
                        limit: LIMIT_PER_SEARCH,
                    }),
                ]);

                searchResults = rrfMerge([packResults, visResults], RRF_K, limit + 10);
            } else if (hasPackaging) {
                effectiveMode = "packaging";
                modeNote = "Visual embedding unavailable for this video. Falling back to packaging-only search.";
                searchResults = await findNearestVideos({
                    queryVector: packVec,
                    field: "packagingEmbedding",
                    youtubeChannelIds: trendChannelIds,
                    limit: limit + 10,
                });
            } else {
                effectiveMode = "visual";
                modeNote = "Packaging embedding unavailable for this video. Falling back to visual-only search.";
                searchResults = await findNearestVideos({
                    queryVector: visVec as number[],
                    field: "visualEmbedding",
                    youtubeChannelIds: trendChannelIds,
                    limit: limit + 10,
                });
            }
        }

        // --- Step 4: Filter out query video + hidden videos ---
        // Exclude both internal ID (custom-*) and YouTube ID (publishedVideoId)
        // to prevent the reference video from appearing in its own results.
        const excludeIds = new Set([videoId]);
        if (lookup.youtubeVideoId) excludeIds.add(lookup.youtubeVideoId);

        const hiddenIds = await getHiddenVideoIds(searchBasePath);
        const filtered = searchResults.filter(
            (r) => !excludeIds.has(r.videoId) && !hiddenIds.has(r.videoId),
        );

        const totalFound = filtered.length;
        const truncated = filtered.slice(0, limit);

        // --- Step 5: Enrich with view deltas ---
        ctx.reportProgress?.("Computing view deltas...");

        const channelIdHints = new Set(trendChannelIds);
        const resultVideoIds = truncated.map((r) => r.videoId);
        const deltasMap = await getViewDeltas(
            ctx.userId,
            searchChannelId ?? ctx.channelId,
            resultVideoIds,
            channelIdHints,
        );

        // --- Step 6: Compute coverage ---
        const coverage = await computeCoverage(trendChannelIds, effectiveMode);

        // --- Step 7: Assign per-channel performance tiers ---
        const resultChannelIds = new Set(truncated.map((r) => r.data.youtubeChannelId));
        const percentileMaps = new Map<string, Map<string, PercentileGroup>>();

        await Promise.all(
            [...resultChannelIds].map(async (channelId) => {
                const videosSnap = await db
                    .collection(`${basePath}/trendChannels/${channelId}/videos`)
                    .get();
                if (videosSnap.empty) return;

                const videosForPercentile = videosSnap.docs.map((doc) => ({
                    id: doc.id,
                    viewCount: typeof doc.data().viewCount === "number" ? doc.data().viewCount : 0,
                }));

                percentileMaps.set(channelId, assignPercentileGroups(videosForPercentile));
            }),
        );

        // --- Step 8: Build response ---
        const includeVisualInfo = effectiveMode === "visual" || effectiveMode === "both";

        const similar = truncated.map((r) => {
            const deltas = deltasMap.get(r.videoId);
            const channelId = r.data.youtubeChannelId;
            const channelPercentiles = percentileMaps.get(channelId);
            const performanceTier = channelPercentiles?.get(r.videoId) ?? "Bottom 20%";

            const sharedTags = lookup.referenceVideo.tags.filter(
                (tag) => r.data.tags?.includes(tag),
            );

            // RRF results have rrfScore; single-mode results have distance → similarityScore
            const hasRRF = "rrfScore" in r && r.rrfScore !== undefined;
            const similarityScore = hasRRF
                ? undefined
                : Math.round(Math.max(0, 1 - r.distance) * 1000) / 1000;

            return {
                videoId: r.videoId,
                title: r.data.title,
                thumbnailUrl: resolveThumbnailUrl(r.videoId, r.data.thumbnailUrl),
                channelId,
                channelTitle: channelMeta.get(channelId)?.title ?? r.data.channelTitle ?? channelId,
                ...(hasRRF ? { rrfScore: r.rrfScore } : { similarityScore }),
                publishedAt: r.data.publishedAt,
                viewCount: r.data.viewCount,
                viewDelta24h: deltas?.delta24h ?? null,
                viewDelta7d: deltas?.delta7d ?? null,
                viewDelta30d: deltas?.delta30d ?? null,
                performanceTier,
                sharedTags,
                ...(includeVisualInfo
                    ? { thumbnailDescription: r.data.thumbnailDescription ?? null }
                    : {}),
            };
        });

        // dataFreshness — all searched channels (so LLM knows search scope)
        const dataFreshness = [...channelMeta.entries()]
            .map(([channelId, meta]) => ({
                channelId,
                channelTitle: meta.title,
                lastSynced: meta.lastUpdated,
            }));

        return {
            referenceVideo: lookup.referenceVideo,
            mode,
            ...(modeNote ? { _note: modeNote } : {}),
            similar,
            totalFound,
            coverage,
            dataFreshness,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Failed to find similar videos: ${msg}` };
    }
}

// ---------------------------------------------------------------------------
// Coverage computation
// ---------------------------------------------------------------------------

async function computeCoverage(
    trendChannelIds: string[],
    mode: Mode,
): Promise<Record<string, unknown> | null> {
    try {
        const statsDoc = await db.doc("system/embeddingStats").get();
        if (!statsDoc.exists) return null;

        const stats = statsDoc.data() as EmbeddingStats;

        if (mode === "both") {
            let packagingIndexed = 0;
            let visualIndexed = 0;
            let totalVideos = 0;

            for (const channelId of trendChannelIds) {
                const cs = stats.byChannel?.[channelId];
                if (cs) {
                    packagingIndexed += cs.packaging ?? 0;
                    visualIndexed += cs.visual ?? 0;
                    totalVideos += cs.total ?? 0;
                }
            }

            return {
                packaging: { indexed: packagingIndexed, total: totalVideos },
                visual: { indexed: visualIndexed, total: totalVideos },
            };
        }

        // Single mode — packaging or visual
        let totalIndexed = 0;
        let totalVideos = 0;
        const countField = mode === "visual" ? "visual" : "packaging";

        for (const channelId of trendChannelIds) {
            const cs = stats.byChannel?.[channelId];
            if (cs) {
                totalIndexed += cs[countField] ?? 0;
                totalVideos += cs.total ?? 0;
            }
        }

        return { indexed: totalIndexed, total: totalVideos };
    } catch {
        return null;
    }
}
