// =============================================================================
// searchDatabase handler — Layer 4: Competition
//
// Free-text semantic search across the competitor video database.
// Converts a search query into a 768d embedding (taskType: RETRIEVAL_QUERY),
// then performs cosine vector search against globalVideoEmbeddings.
//
// Enriches results with view deltas, performance tiers, and coverage stats.
// =============================================================================

import { db } from "../../../shared/db.js";
import { assignPercentileGroups } from "../../../shared/percentiles.js";
import type { PercentileGroup } from "../../../shared/percentiles.js";
import { getViewDeltas } from "../../trendSnapshotService.js";
import { getHiddenVideoIds } from "../utils/getHiddenVideoIds.js";
import { normalizeLastUpdated } from "../utils/normalizeLastUpdated.js";
import { resolveThumbnailUrl } from "../utils/resolveThumbnailUrl.js";
import { findNearestVideos } from "../../../embedding/vectorSearch.js";
import { generateQueryEmbedding } from "../../../embedding/queryEmbedding.js";
import type { EmbeddingStats } from "../../../embedding/types.js";
import type { ToolContext } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_QUERY_LENGTH = 3;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleSearchDatabase(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    try {
        // --- Parse & validate args ---
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (query.length < MIN_QUERY_LENGTH) {
            return { error: "Query too short. Please provide at least 3 characters." };
        }

        const rawLimit = typeof args.limit === "number" ? args.limit : DEFAULT_LIMIT;
        const limit = Math.min(Math.max(1, Math.round(rawLimit)), MAX_LIMIT);

        const channelIdsArg = Array.isArray(args.channelIds)
            ? (args.channelIds as string[]).filter((id) => typeof id === "string")
            : undefined;

        const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;

        // --- Get trend channels ---
        const trendChannelsSnap = await db.collection(`${basePath}/trendChannels`).get();
        if (trendChannelsSnap.empty) {
            return { error: "No trend channels tracked. Add channels in Trends first." };
        }

        // Build channel metadata + filter by channelIds arg if provided
        const channelMeta = new Map<string, { title: string; lastUpdated: string | null }>();
        const youtubeChannelIds: string[] = [];

        for (const doc of trendChannelsSnap.docs) {
            if (channelIdsArg && !channelIdsArg.includes(doc.id)) continue;

            channelMeta.set(doc.id, {
                title: (doc.data().title as string) ?? doc.id,
                lastUpdated: normalizeLastUpdated(doc.data().lastUpdated),
            });
            youtubeChannelIds.push(doc.id);
        }

        if (youtubeChannelIds.length === 0) {
            return { results: [], totalFound: 0, query };
        }

        // --- Generate query embedding ---
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { error: "Gemini API key not configured." };
        }

        ctx.reportProgress?.("Generating query embedding...");
        const queryVector = await generateQueryEmbedding(query, apiKey);
        if (!queryVector) {
            return { error: "Failed to generate query embedding. Try again later." };
        }

        // --- Vector search ---
        ctx.reportProgress?.("Searching database...");
        const searchResults = await findNearestVideos({
            queryVector,
            field: "packagingEmbedding",
            youtubeChannelIds,
            limit: limit + 10,
        });

        // --- Filter hidden videos ---
        const hiddenIds = await getHiddenVideoIds(basePath);
        const filtered = searchResults.filter((r) => !hiddenIds.has(r.videoId));

        const totalFound = filtered.length;
        const truncated = filtered.slice(0, limit);

        // --- Enrich with view deltas ---
        ctx.reportProgress?.("Computing view deltas...");
        const channelIdHints = new Set(youtubeChannelIds);
        const resultVideoIds = truncated.map((r) => r.videoId);
        const deltasMap = await getViewDeltas(
            ctx.userId,
            ctx.channelId,
            resultVideoIds,
            channelIdHints,
        );

        // --- Compute per-channel performance tiers ---
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

        // --- Compute coverage (packaging only) ---
        const coverage = await computePackagingCoverage(youtubeChannelIds);

        // --- Build response ---
        const results = truncated.map((r) => {
            const deltas = deltasMap.get(r.videoId);
            const channelId = r.data.youtubeChannelId;
            const channelPercentiles = percentileMaps.get(channelId);
            const performanceTier = channelPercentiles?.get(r.videoId) ?? "Bottom 20%";
            const relevanceScore = Math.round(Math.max(0, 1 - r.distance) * 1000) / 1000;

            return {
                videoId: r.videoId,
                title: r.data.title,
                thumbnailUrl: resolveThumbnailUrl(r.videoId, r.data.thumbnailUrl),
                channelId,
                channelTitle: r.data.channelTitle ?? channelMeta.get(channelId)?.title ?? channelId,
                relevanceScore,
                publishedAt: r.data.publishedAt,
                viewCount: r.data.viewCount,
                viewDelta24h: deltas?.delta24h ?? null,
                viewDelta7d: deltas?.delta7d ?? null,
                viewDelta30d: deltas?.delta30d ?? null,
                performanceTier,
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
            query,
            results,
            totalFound,
            coverage,
            dataFreshness,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Failed to search database: ${msg}` };
    }
}

// ---------------------------------------------------------------------------
// Coverage computation (packaging only)
// ---------------------------------------------------------------------------

async function computePackagingCoverage(
    trendChannelIds: string[],
): Promise<{ indexed: number; total: number } | null> {
    try {
        const statsDoc = await db.doc("system/embeddingStats").get();
        if (!statsDoc.exists) return null;

        const stats = statsDoc.data() as EmbeddingStats;
        let indexed = 0;
        let total = 0;

        for (const channelId of trendChannelIds) {
            const cs = stats.byChannel?.[channelId];
            if (cs) {
                indexed += cs.packaging ?? 0;
                total += cs.total ?? 0;
            }
        }

        return { indexed, total };
    } catch {
        return null;
    }
}
