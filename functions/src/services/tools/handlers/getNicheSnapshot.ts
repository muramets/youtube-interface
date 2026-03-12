// =============================================================================
// getNicheSnapshot handler — Layer 4: Competitive Context
//
// Returns a snapshot of competitor activity around a reference date.
// Primary input: date (zero extra reads). Fallback: videoId → resolve publishedAt.
//
// Groups videos by trend channel, computes per-channel percentiles on the FULL
// video set, then filters to the time window for the response.
// =============================================================================

import { db } from "../../../shared/db.js";
import { assignPercentileGroups } from "../../../shared/percentiles.js";
import { getViewDeltas } from "../../trendSnapshotService.js";
import { getHiddenVideoIds } from "../utils/getHiddenVideoIds.js";
import { normalizeLastUpdated } from "../utils/normalizeLastUpdated.js";
import { resolveThumbnailUrl } from "../utils/resolveThumbnailUrl.js";
import { resolveVideosByIds } from "../utils/resolveVideos.js";
import type { ToolContext } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetNicheSnapshot(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    try {
        // --- Parse args ---
        const dateArg = typeof args.date === "string" ? args.date.trim() : undefined;
        const videoIdArg = typeof args.videoId === "string" ? args.videoId.trim() : undefined;
        const channelIdArg = typeof args.channelId === "string" ? args.channelId.trim() : undefined;
        const windowDays = typeof args.windowDays === "number" && args.windowDays > 0
            ? args.windowDays
            : DEFAULT_WINDOW_DAYS;

        if (!dateArg && !videoIdArg) {
            return { error: "At least one of 'date' (ISO string) or 'videoId' must be provided." };
        }

        const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;

        // --- Determine reference date ---
        let referenceDate: string;
        let resolvedVideoId: string | undefined;
        let resolvedVideoTitle: string | undefined;

        // Cache trend channels snapshot to avoid duplicate Firestore reads (M2 fix).
        // Populated during videoId resolution and reused for the main logic below.
        let cachedTrendChannelsSnap: FirebaseFirestore.QuerySnapshot | undefined;

        if (dateArg) {
            // Primary path — zero extra reads
            referenceDate = dateArg;
        } else {
            // Fallback: resolve videoId to get publishedAt
            const vid = videoIdArg!;
            let publishedAt: string | undefined;

            // Layer 4 first: try trend channel videos
            if (channelIdArg) {
                // Single doc read if channelId hint provided
                const docSnap = await db
                    .doc(`${basePath}/trendChannels/${channelIdArg}/videos/${vid}`)
                    .get();
                if (docSnap.exists) {
                    const data = docSnap.data()!;
                    publishedAt = data.publishedAt as string;
                    resolvedVideoTitle = data.title as string;
                }
            }

            if (!publishedAt) {
                // Try each trend channel — cache the snapshot for reuse
                cachedTrendChannelsSnap = await db
                    .collection(`${basePath}/trendChannels`)
                    .get();
                const trendChannelIds = cachedTrendChannelsSnap.docs.map(d => d.id);

                if (trendChannelIds.length > 0) {
                    const refs = trendChannelIds.map(tcId =>
                        db.doc(`${basePath}/trendChannels/${tcId}/videos/${vid}`),
                    );
                    const snaps = await db.getAll(...refs);
                    for (const snap of snaps) {
                        if (snap.exists) {
                            const data = snap.data()!;
                            publishedAt = data.publishedAt as string;
                            resolvedVideoTitle = data.title as string;
                            break;
                        }
                    }
                }
            }

            if (!publishedAt) {
                // Fallback to user's own videos
                const { resolved } = await resolveVideosByIds(basePath, [vid]);
                const entry = resolved.get(vid);
                if (entry) {
                    publishedAt = entry.data.publishedAt as string;
                    resolvedVideoTitle = entry.data.title as string;
                }
            }

            if (!publishedAt) {
                return { error: `Video not found: ${vid}` };
            }

            referenceDate = publishedAt;
            resolvedVideoId = vid;
        }

        // --- Compute window ---
        const refMs = new Date(referenceDate).getTime();
        if (isNaN(refMs)) {
            return { error: `Invalid date: ${referenceDate}` };
        }
        const windowFrom = new Date(refMs - windowDays * 24 * 60 * 60 * 1000).toISOString();
        const windowTo = new Date(refMs + windowDays * 24 * 60 * 60 * 1000).toISOString();

        // --- Read all trend channels (reuse cached snapshot if available) ---
        const trendChannelsSnap = cachedTrendChannelsSnap
            ?? await db.collection(`${basePath}/trendChannels`).get();

        if (trendChannelsSnap.empty) {
            return {
                referencePoint: {
                    date: referenceDate.split("T")[0],
                    ...(resolvedVideoId && { videoId: resolvedVideoId }),
                    ...(resolvedVideoTitle && { videoTitle: resolvedVideoTitle }),
                },
                window: { from: windowFrom.split("T")[0], to: windowTo.split("T")[0] },
                competitorActivity: [],
                aggregates: {
                    totalVideosInWindow: 0,
                    commonTags: [],
                    avgViewsInWindow: 0,
                    topByViews: [],
                },
                dataFreshness: [],
            };
        }

        // --- Get hidden video IDs ---
        const hiddenIds = await getHiddenVideoIds(basePath);

        // --- For each trend channel: read ALL videos, filter by window ---
        const trendChannelIdHints = new Set<string>();

        interface VideoDoc {
            videoId: string;
            title: string;
            viewCount: number;
            publishedAt: string;
            tags: string[];
            thumbnail?: string;
            channelId: string;
            channelTitle: string;
        }

        interface ChannelResult {
            channelId: string;
            channelTitle: string;
            allVideos: { id: string; viewCount: number }[];
            windowVideos: VideoDoc[];
            lastUpdated: string | null;
        }

        // Parallel reads: all channel video collections at once (~200ms vs ~2s sequential)
        const channelResults: ChannelResult[] = await Promise.all(
            trendChannelsSnap.docs.map(async (channelDoc) => {
                const channelData = channelDoc.data();
                const tcId = channelDoc.id;
                const channelTitle = (channelData.title as string) || tcId;
                const lastUpdated = normalizeLastUpdated(channelData.lastUpdated);

                const videosSnap = await db
                    .collection(`${basePath}/trendChannels/${tcId}/videos`)
                    .get();

                const allVideos: { id: string; viewCount: number }[] = [];
                const windowVideos: VideoDoc[] = [];

                for (const vDoc of videosSnap.docs) {
                    const vData = vDoc.data();
                    const viewCount = (vData.viewCount as number) ?? 0;
                    const pubAt = (vData.publishedAt as string) ?? "";

                    // Include ALL videos for percentile calculation (even hidden)
                    allVideos.push({ id: vDoc.id, viewCount });

                    // Filter hidden for window results only
                    if (hiddenIds.has(vDoc.id)) continue;

                    // Filter by window using ISO string comparison
                    if (pubAt >= windowFrom && pubAt <= windowTo) {
                        windowVideos.push({
                            videoId: vDoc.id,
                            title: (vData.title as string) || "(untitled)",
                            viewCount,
                            publishedAt: pubAt,
                            tags: Array.isArray(vData.tags) ? (vData.tags as string[]) : [],
                            thumbnail: (vData.thumbnail as string) || undefined,
                            channelId: tcId,
                            channelTitle,
                        });
                    }
                }

                if (windowVideos.length > 0) {
                    trendChannelIdHints.add(tcId);
                }

                return {
                    channelId: tcId,
                    channelTitle,
                    allVideos,
                    windowVideos,
                    lastUpdated,
                };
            }),
        );

        // --- Per-channel percentiles on FULL video set ---
        const percentileMaps = new Map<string, Map<string, string>>();
        for (const cr of channelResults) {
            const pMap = assignPercentileGroups(cr.allVideos);
            percentileMaps.set(cr.channelId, pMap);
        }

        // --- Collect all window video IDs for delta enrichment ---
        const allWindowVideos: VideoDoc[] = [];
        for (const cr of channelResults) {
            allWindowVideos.push(...cr.windowVideos);
        }
        const allWindowVideoIds = allWindowVideos.map(v => v.videoId);

        // --- Enrich with view deltas ---
        const publishedDates = new Map<string, string>();
        for (const v of allWindowVideos) {
            if (v.publishedAt) publishedDates.set(v.videoId, v.publishedAt);
        }
        const deltaMap = allWindowVideoIds.length > 0
            ? await getViewDeltas(ctx.userId, ctx.channelId, allWindowVideoIds, trendChannelIdHints, publishedDates)
            : new Map();

        // --- Build competitorActivity ---
        const competitorActivity = channelResults
            .filter(cr => cr.windowVideos.length > 0)
            .map(cr => {
                const pMap = percentileMaps.get(cr.channelId)!;
                const videos = cr.windowVideos.map(v => {
                    const delta = deltaMap.get(v.videoId);
                    return {
                        videoId: v.videoId,
                        title: v.title,
                        viewCount: v.viewCount,
                        viewDelta24h: delta?.delta24h ?? null,
                        viewDelta7d: delta?.delta7d ?? null,
                        viewDelta30d: delta?.delta30d ?? null,
                        publishedAt: v.publishedAt,
                        tags: v.tags,
                        thumbnailUrl: resolveThumbnailUrl(v.videoId, v.thumbnail),
                        performanceTier: pMap.get(v.videoId) ?? "Unknown",
                    };
                });

                const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);
                const avgViews = videos.length > 0 ? Math.round(totalViews / videos.length) : 0;

                const topPerformerVideo = videos.reduce(
                    (best, v) => (v.viewCount > best.viewCount ? v : best),
                    videos[0],
                );

                return {
                    channelId: cr.channelId,
                    channelTitle: cr.channelTitle,
                    videosPublished: videos.length,
                    videos,
                    avgViews,
                    topPerformer: {
                        videoId: topPerformerVideo.videoId,
                        title: topPerformerVideo.title,
                        viewCount: topPerformerVideo.viewCount,
                    },
                };
            });

        // --- Compute aggregates ---
        const totalVideosInWindow = allWindowVideos.length;

        // Tag relevance: log-scaled view weighting.
        //
        // Each video contributes log(1 + viewCount) to every tag it uses.
        // Log scale balances two failure modes:
        //   - Raw frequency (count): spammy channels dominate (7 videos × same tags, 50 views each)
        //   - Raw views (sum): one 80K hit dominates all tags, making the list single-source
        //
        // With log scale: 80K views ≈ weight 11, 80 views ≈ weight 4.
        // A tag in 7 low-view videos (7 × 4 = 28) outranks a tag in 1 mega-hit (11).
        // A tag in 1 mega-hit (11) outranks a tag in 2 tiny videos (2 × 3 = 6).
        // Result: tags that are BOTH popular across videos AND in higher-performing content rank highest.
        const tagWeights = new Map<string, number>();
        for (const v of allWindowVideos) {
            const weight = Math.log1p(v.viewCount);
            for (const tag of v.tags) {
                tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + weight);
            }
        }
        const commonTags = [...tagWeights.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([tag, w]) => ({ tag, weight: Math.round(w * 10) / 10 }));

        const totalViewsAll = allWindowVideos.reduce((sum, v) => sum + v.viewCount, 0);
        const avgViewsInWindow = totalVideosInWindow > 0
            ? Math.round(totalViewsAll / totalVideosInWindow)
            : 0;

        const topByViews = [...allWindowVideos]
            .sort((a, b) => b.viewCount - a.viewCount)
            .slice(0, 5)
            .map(v => ({
                videoId: v.videoId,
                title: v.title,
                channelTitle: v.channelTitle,
                viewCount: v.viewCount,
            }));

        // --- Data freshness ---
        const dataFreshness = channelResults.map(cr => ({
            channelId: cr.channelId,
            channelTitle: cr.channelTitle,
            lastSynced: cr.lastUpdated,
        }));

        return {
            referencePoint: {
                date: referenceDate.split("T")[0],
                ...(resolvedVideoId && { videoId: resolvedVideoId }),
                ...(resolvedVideoTitle && { videoTitle: resolvedVideoTitle }),
            },
            window: {
                from: windowFrom.split("T")[0],
                to: windowTo.split("T")[0],
            },
            competitorActivity,
            aggregates: {
                totalVideosInWindow,
                commonTags,
                avgViewsInWindow,
                topByViews,
            },
            dataFreshness,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `getNicheSnapshot failed: ${msg}` };
    }
}
