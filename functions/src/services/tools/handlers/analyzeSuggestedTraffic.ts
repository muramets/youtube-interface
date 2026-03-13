// =============================================================================
// analyzeSuggestedTraffic handler v2 — per-video timeline + transitions
//
// Steps:
//   1. Parse depth → concrete limit via DEPTH_LIMITS map
//   2. Read snapshot metadata + source video from Firestore
//   3. Download all CSVs from Cloud Storage in parallel
//   4. Parse CSVs into VideoSnapshotEntry arrays
//   5. buildVideoTimeline() — per-video trajectory across ALL snapshots
//   6. Sort by impressions (last snapshot), take top N → attach timeline
//   7. getTransitions() — new/dropped counts + top examples per period
//   8. Optionally enrich with cached Firestore video data for content analysis
//   9. Return structured JSON for LLM to interpret
// =============================================================================

import { db, admin } from "../../../shared/db.js";
import { resolveVideosByIds } from "../utils/resolveVideos.js";
import { parseSuggestedTrafficCsv } from "../utils/csvParser.js";
import {
    buildVideoTimeline,
    getTransitions,
} from "../utils/delta.js";
import {
    analyzeContent,
    computeSelfChannelStats,
    computeContentTrajectory,
} from "../utils/suggestedAnalysis.js";
import { getViewDeltas } from "../../trendSnapshotService.js";
import type { ToolContext } from "../types.js";
import type { VideoSnapshotEntry } from "../utils/delta.js";
import type { EnrichedVideoData } from "../utils/suggestedAnalysis.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEPTH_LIMITS: Record<string, number> = {
    quick: 20,
    standard: 50,
    detailed: 100,
    deep: 500,
} as const;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface SnapshotMeta {
    id: string;
    timestamp: number;
    storagePath: string;
    label?: string;
    autoLabel?: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAnalyzeSuggestedTraffic(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    // --- Args parsing -------------------------------------------------------

    if (typeof args.videoId !== "string" || !args.videoId) return { error: "videoId is required" };
    const videoId = args.videoId;
    if (!/^[\w-]{1,64}$/.test(videoId)) return { error: "Invalid videoId format" };

    const depth = typeof args.depth === "string" && args.depth in DEPTH_LIMITS
        ? args.depth
        : "standard";
    const limit = DEPTH_LIMITS[depth];

    const minImpressions =
        typeof args.minImpressions === "number" ? args.minImpressions : undefined;
    const minViews =
        typeof args.minViews === "number" ? args.minViews : undefined;
    const includeContentAnalysis = args.includeContentAnalysis !== false; // default true

    // --- Step 1: Resolve video document + read snapshot metadata --------
    // Uses resolver to handle custom videos (custom-XXXX → publishedVideoId).
    // skipExternal: traffic data only exists on own videos.

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const { resolved } = await resolveVideosByIds(basePath, [videoId], { skipExternal: true });
    const entry = resolved.get(videoId);

    // Use resolved docId for subcollection access (may differ from YouTube videoId)
    const docId = entry?.docId ?? videoId;
    const trafficSnap = await db.doc(`${basePath}/videos/${docId}/traffic/main`).get();

    if (!trafficSnap.exists) {
        return { error: "No traffic data found for this video" };
    }
    const trafficData = trafficSnap.data()!;
    const snapshots: SnapshotMeta[] = trafficData.snapshots ?? [];
    if (snapshots.length === 0) {
        return { error: "No CSV snapshots found for this video" };
    }

    // Sort ascending by timestamp so index 0 = oldest
    snapshots.sort((a, b) => a.timestamp - b.timestamp);

    const videoData = entry?.data ?? {};
    const sourceVideo = {
        videoId,
        title: String(videoData.title ?? ""),
        description: String(videoData.description ?? ""),
        tags: Array.isArray(videoData.tags) ? (videoData.tags as string[]) : [],
        channelTitle: String(videoData.channelTitle ?? ""),
    };

    // --- Step 2: Download all CSVs from Cloud Storage in parallel -----------

    ctx.reportProgress?.("Загружаю CSV снапшоты...");

    const bucket = admin.storage().bucket();

    const csvContents = await Promise.all(
        snapshots.map(async (snap) => {
            try {
                const [buffer] = await bucket.file(snap.storagePath).download();
                return buffer.toString("utf-8");
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(
                    `[analyzeSuggestedTraffic] Failed to download ${snap.storagePath}: ${msg}`,
                );
                return "";
            }
        }),
    );

    // --- Step 3: Parse CSVs -------------------------------------------------

    const parsedSnapshots = csvContents.map((csv) =>
        parseSuggestedTrafficCsv(csv),
    );

    const snapshotEntries: VideoSnapshotEntry[][] = parsedSnapshots.map(
        (snap) =>
            snap.rows.map(
                (row): VideoSnapshotEntry => ({
                    videoId: row.videoId,
                    sourceTitle: row.sourceTitle,
                    views: row.views,
                    impressions: row.impressions,
                    ctr: row.ctr,
                    avgViewDuration: row.avgViewDuration,
                    watchTimeHours: row.watchTimeHours,
                }),
            ),
    );

    // --- Step 4: Build per-video timelines ----------------------------------

    ctx.reportProgress?.("Строю timeline по всем снапшотам...");

    const snapshotDates = snapshots.map(
        (snap) => new Date(snap.timestamp).toISOString().split("T")[0],
    );
    const snapshotLabels = snapshots.map(
        (snap, i) => snap.label ?? snap.autoLabel ?? `v${i + 1}`,
    );

    const timelineMap = buildVideoTimeline(snapshotEntries, snapshotDates, snapshotLabels);

    // --- Step 5: Sort by impressions, apply filters, take top N -------------

    let allTimelines = [...timelineMap.values()];

    // Apply filters
    if (minImpressions !== undefined && minImpressions > 0) {
        allTimelines = allTimelines.filter(t => t.impressions >= minImpressions);
    }
    if (minViews !== undefined && minViews > 0) {
        allTimelines = allTimelines.filter(t => t.views >= minViews);
    }

    // Sort by impressions in latest snapshot (descending)
    allTimelines.sort((a, b) => b.impressions - a.impressions);

    const topSources = allTimelines.slice(0, limit).map(t => ({
        videoId: t.videoId,
        sourceTitle: t.sourceTitle,
        views: t.views,
        impressions: t.impressions,
        ctr: t.ctr,
        avgViewDuration: t.avgViewDuration,
        watchTimeHours: t.watchTimeHours,
        timeline: t.timeline,
        viewDelta24h: null as number | null,
        viewDelta7d: null as number | null,
        viewDelta30d: null as number | null,
    }));

    // --- Step 5b: Enrich topSources with YouTube-wide view deltas ---
    try {
        const topVideoIds = topSources.map(s => s.videoId);
        const cacheRefs = topVideoIds.map(id =>
            db.doc(`${basePath}/cached_external_videos/${id}`),
        );
        const cacheSnaps = await db.getAll(...cacheRefs);

        const channelIdHints = new Set<string>();
        for (const snap of cacheSnaps) {
            if (snap.exists) {
                const chId = snap.data()?.channelId;
                if (typeof chId === "string" && chId) {
                    channelIdHints.add(chId);
                }
            }
        }

        const deltaMap = await getViewDeltas(
            ctx.userId, ctx.channelId, topVideoIds,
            channelIdHints.size > 0 ? channelIdHints : undefined,
        );

        for (const source of topSources) {
            const stats = deltaMap.get(source.videoId);
            if (stats) {
                source.viewDelta24h = stats.delta24h;
                source.viewDelta7d = stats.delta7d;
                source.viewDelta30d = stats.delta30d;
            }
        }
    } catch (err) {
        console.warn("[analyzeSuggestedTraffic] View deltas enrichment failed:", err);
    }

    const tailSlice = allTimelines.slice(limit);
    const tail = {
        count: tailSlice.length,
        totalViews: tailSlice.reduce((sum, t) => sum + t.views, 0),
        totalImpressions: tailSlice.reduce((sum, t) => sum + t.impressions, 0),
    };

    // --- Step 6: Compute transitions ----------------------------------------

    const transitions = getTransitions(snapshotEntries, snapshotDates, snapshotLabels);

    // --- Step 7: Content analysis + self-channel stats (conditional) ---------

    let contentAnalysis: ReturnType<typeof analyzeContent> | undefined =
        undefined;
    let selfChannelStats: ReturnType<typeof computeSelfChannelStats> | undefined =
        undefined;
    let contentTrajectory: ReturnType<typeof computeContentTrajectory> | undefined =
        undefined;

    if (includeContentAnalysis && topSources.length > 0) {
        ctx.reportProgress?.("Анализирую теги и ключевые слова...");

        const topVideoIds = topSources.slice(0, 30).map((s) => s.videoId);
        const cachedRefs = topVideoIds.map((id) =>
            db.doc(`${basePath}/cached_external_videos/${id}`),
        );
        const cachedSnaps = await db.getAll(...cachedRefs);

        const enrichedData = new Map<string, EnrichedVideoData>();
        for (let i = 0; i < topVideoIds.length; i++) {
            const snap = cachedSnaps[i];
            if (snap.exists) {
                const d = snap.data()!;
                enrichedData.set(topVideoIds[i], {
                    videoId: topVideoIds[i],
                    tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
                    channelTitle: String(d.channelTitle ?? ""),
                });
            }
        }

        // Adapt topSources to TopSource interface expected by analyzeContent
        const topSourcesForAnalysis = topSources.map(s => ({
            videoId: s.videoId,
            sourceTitle: s.sourceTitle,
            views: s.views,
            impressions: s.impressions,
            ctr: s.ctr,
            avgViewDuration: s.avgViewDuration,
            watchTimeHours: s.watchTimeHours,
        }));

        contentAnalysis = analyzeContent(
            sourceVideo.tags,
            sourceVideo.title,
            topSourcesForAnalysis,
            enrichedData,
        );

        // Enrich ALL unique videoIds across ALL snapshots (for timeline + trajectory)
        const allVideoIds = new Set<string>();
        for (const snap of parsedSnapshots) {
            for (const row of snap.rows) {
                allVideoIds.add(row.videoId);
            }
        }

        // Merge with already-enriched data (top-30 from content analysis)
        const missingIds = [...allVideoIds].filter(id => !enrichedData.has(id));

        // Batch-read missing videoIds from cache (500 per Firestore getAll)
        if (missingIds.length > 0) {
            const BATCH_SIZE = 500;
            for (let b = 0; b < missingIds.length; b += BATCH_SIZE) {
                const batch = missingIds.slice(b, b + BATCH_SIZE);
                const refs = batch.map(id =>
                    db.doc(`${basePath}/cached_external_videos/${id}`),
                );
                const snaps = await db.getAll(...refs);
                for (let j = 0; j < batch.length; j++) {
                    const snap = snaps[j];
                    if (snap.exists) {
                        const d = snap.data()!;
                        enrichedData.set(batch[j], {
                            videoId: batch[j],
                            tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
                            channelTitle: String(d.channelTitle ?? ""),
                        });
                    }
                }
            }
        }

        const allSnapshotRows = parsedSnapshots.map(s => s.rows);

        // Self-channel stats (only when channel identity is known)
        if (sourceVideo.channelTitle) {
            selfChannelStats = computeSelfChannelStats(
                sourceVideo.channelTitle,
                topSourcesForAnalysis,
                enrichedData,
                allSnapshotRows,
                snapshotDates,
                snapshotLabels,
            );
        }

        // Content trajectory: per-snapshot keywords + channels + shared tags
        contentTrajectory = computeContentTrajectory(
            sourceVideo.tags,
            allSnapshotRows,
            snapshotDates,
            enrichedData,
            snapshotLabels,
        );
    }

    // --- Build snapshotTimeline ---------------------------------------------

    const snapshotTimeline = snapshots.map((snap, i) => ({
        date: new Date(snap.timestamp).toISOString().split("T")[0],
        label: snap.label ?? snap.autoLabel ?? `v${i + 1}`,
        totalSources: parsedSnapshots[i].rows.length,
    }));

    // --- Build analysisGuidance ---------------------------------------------

    const analysisGuidance = `You have received pre-computed analytics from YouTube Suggested Traffic data.

DIRECTION (read carefully): These source videos are the "shelves" — YouTube shows the user's video as a suggestion when viewers watch these source videos. Viewers come FROM source videos TO the user's video. When you describe a source video, say "YouTube shows your video alongside [source]" or "your video appears as a suggestion next to [source]" — NEVER "YouTube shows [source] next to yours" (that reverses the direction).

CRITICAL RULES:
- All numbers are deterministic — calculated by code, never estimated.
- Each video in topSources has a "timeline" array: raw metric values at each snapshot where the video was present, plus pre-computed deltas vs the previous point. Use timelines for trajectory analysis (growth/decline/stability over time).
- "transitions" shows how the source pool changed between consecutive snapshots: newCount/droppedCount for scale, topNew/topDropped for notable examples. IMPORTANT: check snapshotTimeline.totalSources across ALL snapshots — if the pool size spikes, retracts, then spikes again, these are SEPARATE algorithmic test waves. Describe each wave individually; do NOT collapse multiple expansions into one narrative.
- "avgViewDuration" = how long viewers from this source watched YOUR video on average (format "H:MM:SS"). Compare with the source video's total duration for engagement depth insight.
- "sharedTags" = exact tag match between your video and the suggested video.
- "topKeywordsInSuggestedTitles" = most frequent words from ALL suggested video titles — useful for niche/topic discovery.
- "channelDistribution" = which channels appear most in your suggested traffic.
- "contentTrajectory" (when present) = per-snapshot content evolution. Shows how keywords, channels, and shared tags shifted across ALL snapshots. Each snapshot (except the latest) includes topVideos (top 10 by impressions with pre-computed deltaImpressions) and tailImpressions. Use this to reconstruct the algorithm's journey:
  1. Identify PHASES: which keywords/channels dominated in early vs late snapshots?
  2. Compare topVideos across snapshots: which videos appeared, grew, or disappeared? deltaImpressions shows growth vs previous snapshot; null = video was not in the previous snapshot (new arrival). This reveals which specific videos the algorithm tested and settled on.
  3. Correlate with selfChannelStats.timeline: when did self-channel % start growing?
  4. Identify CATALYSTS: which video first appeared in topVideos (deltaImpressions=null) and triggered a phase shift?
  5. If you see a dramatic keyword or channel shift between two snapshots — call getMultipleVideoDetails on key videos from that transition period to investigate their tags and content deeper.
  6. topSharedTags shows tags that overlap with the source video per snapshot — if high overlap appears only in later snapshots, the algorithm found the topical match late.
  7. tailImpressions shows how much traffic is in the long tail. High tailImpressions vs low topVideos sum = highly fragmented pool.
  8. The latest snapshot has isLatest=true and empty topVideos — use topSources for the latest snapshot's per-video breakdown (it has more detail including full cross-snapshot timelines).
- "selfChannelStats" (when present) = CRITICAL strategic signal. Shows how much of the suggested traffic comes from the user's OWN channel ("${sourceVideo.channelTitle}"). Interpret selfPercentage as follows:
  • >60% = "Channel Ecosystem Boost" — YouTube's algorithm promotes this video primarily within the user's own channel ecosystem, showing it alongside their other hits. This means: (a) strong channel authority, (b) YouTube trusts this channel to retain viewers across videos, (c) growth was driven by existing audience, not new discovery. The video is a "catalog driver" — it pulls viewers deeper into the channel.
  • 30-60% = "Hybrid reach" — balanced between self-channel ecosystem and external discovery.
  • <30% = "External Discovery" — the video broke into external suggested pools, reaching new audiences beyond the subscriber base. This is a sign of broader algorithmic reach and topic authority.
  selfChannelStats.timeline shows self-channel percentage PER SNAPSHOT — use it to identify the inflection point where self-channel traffic started growing. For example, if timeline shows [0%, 10%, 40%, 73%], explain WHEN the shift happened and correlate with topSources timelines to identify which specific video triggered the ecosystem boost.
  Always call out selfPercentage explicitly when present. This is one of the most strategically important metrics in the analysis.
- "viewDelta24h/7d/30d" on each topSource = YouTube-wide view growth of that source video over the last 24 hours / 7 days / 30 days. A source video that is itself growing rapidly (high viewDelta24h) means more viewers watch it → more viewers see the user's video as a suggestion next to it → higher potential for impressions. A stagnating source (viewDelta ≈ 0) means the placement is stable but not growing. Null = no trend data available for that video's channel.
- DO NOT recalculate any numbers. Interpret and explain what the findings mean strategically.
- If timelines have only 1 point (single snapshot), note that trend data requires at least 2 snapshots.
- If you need deeper content analysis for specific videos — call getMultipleVideoDetails with their IDs. Do this selectively for the most interesting movers.
- When referencing specific videos from topSources, ALWAYS call the mentionVideo tool with the real videoId from the data. Then write [Video Title](mention://videoId) in your response text. NEVER invent video IDs — use exactly the videoId field from topSources.
- When your analysis leads to thumbnail/CTR recommendations, ALWAYS call viewThumbnails with the relevant videoIds (both the user's video AND top source videos) to perform a side-by-side visual comparison yourself. Never recommend thumbnail changes without first seeing what the competitors' thumbnails look like.`;

    // --- Step 8: Return structured result -----------------------------------

    return {
        sourceVideo,
        snapshotTimeline,
        topSources,
        transitions,
        tail,
        ...(contentAnalysis ? { contentAnalysis } : {}),
        ...(selfChannelStats ? { selfChannelStats } : {}),
        ...(contentTrajectory && contentTrajectory.length > 0 ? { contentTrajectory } : {}),
        analysisGuidance,
    };
}
