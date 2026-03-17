// =============================================================================
// browseTrendVideos handler — Layer 4: Competition
//
// Fetches trend videos from Firestore (zero YouTube API calls).
// Computes per-channel percentile tiers, applies filters, enriches with
// view deltas from trend snapshots.
// =============================================================================

import { db } from "../../../../shared/db.js";
import { assignPercentileGroups } from "../../../../shared/percentiles.js";
import type { PercentileGroup } from "../../../../shared/percentiles.js";
import { getViewDeltas } from "../../../trendSnapshotService.js";
import { fetchThumbnailDescriptions } from "../../utils/fetchThumbnailDescriptions.js";
import { getHiddenVideoIds } from "../../utils/getHiddenVideoIds.js";
import { normalizeLastUpdated } from "../../utils/normalizeLastUpdated.js";
import { resolveThumbnailUrl } from "../../utils/resolveThumbnailUrl.js";
import type { ToolContext } from "../../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const VALID_PERFORMANCE_TIERS: Set<string> = new Set([
    "Top 1%",
    "Top 5%",
    "Top 20%",
    "Middle 60%",
    "Bottom 20%",
]);

const VALID_SORT_FIELDS: Set<string> = new Set([
    "date",
    "views",
    "delta24h",
    "delta7d",
    "delta30d",
]);

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface TrendVideo {
    videoId: string;
    title: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    viewCount: number;
    tags: string[];
    thumbnailUrl: string;
    performanceTier: PercentileGroup;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleBrowseTrendVideos(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    try {
        // --- Parse & validate args ---
        const channelIds = Array.isArray(args.channelIds)
            ? (args.channelIds as string[]).filter((id) => typeof id === "string" && id.trim())
            : undefined;

        const dateRange = args.dateRange as { from?: string; to?: string } | undefined;
        const dateFrom = typeof dateRange?.from === "string" ? dateRange.from : undefined;
        const dateTo = typeof dateRange?.to === "string" ? dateRange.to : undefined;

        const performanceTier = typeof args.performanceTier === "string"
            ? args.performanceTier
            : undefined;
        if (performanceTier && !VALID_PERFORMANCE_TIERS.has(performanceTier)) {
            return {
                error: `Invalid performanceTier "${performanceTier}". Must be one of: ${[...VALID_PERFORMANCE_TIERS].join(", ")}`,
            };
        }

        const sort = typeof args.sort === "string" ? args.sort : "date";
        if (!VALID_SORT_FIELDS.has(sort)) {
            return {
                error: `Invalid sort "${sort}". Must be one of: ${[...VALID_SORT_FIELDS].join(", ")}`,
            };
        }

        const rawLimit = typeof args.limit === "number" ? args.limit : DEFAULT_LIMIT;
        const limit = Math.min(Math.max(1, Math.round(rawLimit)), MAX_LIMIT);

        // --- Build base path ---
        const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;

        // --- Read trend channels ---
        const trendChannelsRef = db.collection(`${basePath}/trendChannels`);
        const trendChannelsSnap = channelIds && channelIds.length > 0
            ? (await db.getAll(
                ...channelIds.map((id) => trendChannelsRef.doc(id)),
            )).filter((d) => d.exists)
            : (await trendChannelsRef.get()).docs;

        const trendChannelDocs = trendChannelsSnap;

        if (trendChannelDocs.length === 0) {
            return {
                error: "No trend channels found. Add channels to track in Trends first.",
            };
        }

        // --- Read videos per channel + assign percentiles per channel ---
        ctx.reportProgress?.("Reading trend videos...");

        const channelMeta: Map<string, { title: string; lastUpdated: string | null }> = new Map();

        // Parallel reads: all channel video collections at once (~200ms vs ~2s sequential)
        const channelVideoResults = await Promise.all(
            trendChannelDocs.map(async (channelDoc) => {
                const channelData = channelDoc.data?.() ?? {};
                const trendChannelId = channelDoc.id;
                const channelTitle = (channelData.title as string) ?? trendChannelId;
                const lastUpdated = normalizeLastUpdated(channelData.lastUpdated);

                channelMeta.set(trendChannelId, { title: channelTitle, lastUpdated });

                const videosSnap = await db
                    .collection(`${basePath}/trendChannels/${trendChannelId}/videos`)
                    .get();

                if (videosSnap.empty) return [];

                // Build video list for percentile computation
                const videosForPercentile: { id: string; viewCount: number }[] = [];
                const videoDataMap = new Map<string, FirebaseFirestore.DocumentData>();

                for (const videoDoc of videosSnap.docs) {
                    const data = videoDoc.data();
                    const viewCount = typeof data.viewCount === "number" ? data.viewCount : 0;
                    videosForPercentile.push({ id: videoDoc.id, viewCount });
                    videoDataMap.set(videoDoc.id, data);
                }

                // Assign percentiles per-channel (CRITICAL: not cross-channel)
                const percentileMap = assignPercentileGroups(videosForPercentile);

                // Build TrendVideo objects
                const videos: TrendVideo[] = [];
                for (const [videoId, data] of videoDataMap) {
                    const tier = percentileMap.get(videoId) ?? "Bottom 20%";
                    videos.push({
                        videoId,
                        title: (data.title as string) ?? "(untitled)",
                        channelId: trendChannelId,
                        channelTitle,
                        publishedAt: (data.publishedAt as string) ?? "",
                        viewCount: typeof data.viewCount === "number" ? data.viewCount : 0,
                        tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
                        thumbnailUrl: resolveThumbnailUrl(videoId, data.thumbnail as string | undefined) ?? "",
                        performanceTier: tier,
                    });
                }
                return videos;
            }),
        );

        const allVideos = channelVideoResults.flat();

        // --- Apply date range filter ---
        let filtered = allVideos;

        if (dateFrom) {
            filtered = filtered.filter((v) => v.publishedAt >= dateFrom);
        }
        if (dateTo) {
            filtered = filtered.filter((v) => v.publishedAt <= dateTo);
        }

        // --- Apply performanceTier filter ---
        if (performanceTier) {
            filtered = filtered.filter((v) => v.performanceTier === performanceTier);
        }

        // --- Filter out hidden videos ---
        const hiddenIds = await getHiddenVideoIds(basePath);
        if (hiddenIds.size > 0) {
            filtered = filtered.filter((v) => !hiddenIds.has(v.videoId));
        }

        // --- Sort ---
        let note: string | undefined;

        const sortVideos = (videos: TrendVideo[]): void => {
            switch (sort) {
                case "date":
                    videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
                    break;
                case "views":
                    videos.sort((a, b) => b.viewCount - a.viewCount);
                    break;
                case "delta24h":
                case "delta7d":
                case "delta30d":
                    // Delta sort will be applied after enrichment.
                    // For now, sort by views as initial order; re-sort after deltas.
                    videos.sort((a, b) => b.viewCount - a.viewCount);
                    break;
            }
        };

        const isDeltaSort = sort === "delta24h" || sort === "delta7d" || sort === "delta30d";

        if (!isDeltaSort) {
            sortVideos(filtered);
        }

        // --- Compute totalMatched BEFORE limit ---
        const totalMatched = filtered.length;

        // --- Apply limit ---
        // For delta sorts, we need to enrich first then sort, so take all for now
        const truncated = isDeltaSort ? filtered : filtered.slice(0, limit);

        // --- Enrich with view deltas ---
        // TRADE-OFF: delta sorts (delta24h/delta7d/delta30d) enrich ALL filtered
        // videos before sorting, because we need growth data for every video to
        // determine the true top-N by growth. Non-delta sorts enrich only the
        // limit-truncated set. For 350 filtered videos with limit 50, this means
        // 350 vs 50 delta lookups (~7x cost). This is intentional — truncating
        // before enrichment would give incorrect top-N results.
        ctx.reportProgress?.("Computing view deltas...");

        const channelIdHints = new Set(
            trendChannelDocs.map((doc) => doc.id),
        );

        const videosToEnrich = isDeltaSort ? filtered : truncated;
        const videoIdsToEnrich = videosToEnrich.map((v) => v.videoId);

        // Parallel enrichment: for non-delta sorts, fetch descriptions alongside deltas.
        // For delta sorts, descriptions must wait for finalVideos (post-sort).
        const [deltasMap, earlyDescriptions] = await Promise.all([
            getViewDeltas(ctx.userId, ctx.channelId, videoIdsToEnrich, channelIdHints),
            !isDeltaSort
                ? fetchThumbnailDescriptions(videoIdsToEnrich).catch(() => new Map<string, string>())
                : Promise.resolve(new Map<string, string>()),
        ]);

        // --- Build enriched video list ---
        type EnrichedVideo = TrendVideo & {
            viewDelta24h: number | null;
            viewDelta7d: number | null;
            viewDelta30d: number | null;
        };

        const enriched: EnrichedVideo[] = videosToEnrich.map((v) => {
            const deltas = deltasMap.get(v.videoId);
            return {
                ...v,
                viewDelta24h: deltas?.delta24h ?? null,
                viewDelta7d: deltas?.delta7d ?? null,
                viewDelta30d: deltas?.delta30d ?? null,
            };
        });

        // --- Handle delta sort (post-enrichment) ---
        let finalVideos: EnrichedVideo[];

        if (isDeltaSort) {
            const deltaKey = sort === "delta24h"
                ? "viewDelta24h"
                : sort === "delta7d"
                    ? "viewDelta7d"
                    : "viewDelta30d";

            const allDeltasNull = enriched.every((v) => v[deltaKey] === null);

            if (allDeltasNull) {
                // Fallback: sort by viewCount desc
                enriched.sort((a, b) => b.viewCount - a.viewCount);
                note = "Delta data unavailable — sorted by views instead";
            } else {
                enriched.sort((a, b) => {
                    const da = a[deltaKey];
                    const db = b[deltaKey];
                    // nulls go to the end
                    if (da === null && db === null) return b.viewCount - a.viewCount;
                    if (da === null) return 1;
                    if (db === null) return -1;
                    return db - da;
                });
            }

            // Apply limit after delta sort
            finalVideos = enriched.slice(0, limit);
        } else {
            finalVideos = enriched;
        }

        // --- Thumbnail descriptions: use pre-fetched or fetch post-sort ---
        let descriptionsMap = earlyDescriptions;
        if (isDeltaSort) {
            try {
                descriptionsMap = await fetchThumbnailDescriptions(
                    finalVideos.map(v => v.videoId),
                );
            } catch {
                // Non-critical: descriptionsMap stays empty
            }
        }

        // --- Build channel summary ---
        const channelMatchCounts = new Map<string, number>();
        for (const v of filtered) {
            channelMatchCounts.set(v.channelId, (channelMatchCounts.get(v.channelId) ?? 0) + 1);
        }

        const channels = [...channelMeta.entries()]
            .filter(([id]) => channelMatchCounts.has(id))
            .map(([channelId, meta]) => ({
                channelId,
                title: meta.title,
                matchedCount: channelMatchCounts.get(channelId) ?? 0,
            }));

        // --- Build dataFreshness ---
        const dataFreshness = [...channelMeta.entries()].map(([channelId, meta]) => ({
            channelId,
            channelTitle: meta.title,
            lastSynced: meta.lastUpdated,
        }));

        // --- Build response ---
        const videos = finalVideos.map((v) => ({
            videoId: v.videoId,
            title: v.title,
            channelId: v.channelId,
            channelTitle: v.channelTitle,
            publishedAt: v.publishedAt,
            viewCount: v.viewCount,
            viewDelta24h: v.viewDelta24h,
            viewDelta7d: v.viewDelta7d,
            viewDelta30d: v.viewDelta30d,
            tags: v.tags,
            thumbnailUrl: v.thumbnailUrl,
            thumbnailDescription: descriptionsMap.get(v.videoId) ?? null,
            performanceTier: v.performanceTier,
        }));

        return {
            videos,
            totalMatched,
            channels,
            dataFreshness,
            ...(note ? { _note: note } : {}),
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Failed to browse trend videos: ${msg}` };
    }
}
