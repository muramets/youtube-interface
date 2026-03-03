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
//   9. Return structured JSON for Gemini to interpret
// =============================================================================

import { db, admin } from "../../../shared/db.js";
import { parseSuggestedTrafficCsv } from "../utils/csvParser.js";
import {
    buildVideoTimeline,
    getTransitions,
} from "../utils/delta.js";
import {
    analyzeContent,
} from "../utils/suggestedAnalysis.js";
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

    // --- Step 1: Firestore — read snapshot metadata + source video ----------

    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const trafficDocRef = db.doc(`${basePath}/videos/${videoId}/traffic/main`);
    const videoDocRef = db.doc(`${basePath}/videos/${videoId}`);

    const [trafficSnap, videoSnap] = await Promise.all([
        trafficDocRef.get(),
        videoDocRef.get(),
    ]);

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

    const videoData = videoSnap.exists ? videoSnap.data()! : {};
    const sourceVideo = {
        videoId,
        title: String(videoData.title ?? ""),
        description: String(videoData.description ?? ""),
        tags: Array.isArray(videoData.tags) ? (videoData.tags as string[]) : [],
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

    const timelineMap = buildVideoTimeline(snapshotEntries, snapshotDates);

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
    }));

    const tailSlice = allTimelines.slice(limit);
    const tail = {
        count: tailSlice.length,
        totalViews: tailSlice.reduce((sum, t) => sum + t.views, 0),
        totalImpressions: tailSlice.reduce((sum, t) => sum + t.impressions, 0),
    };

    // --- Step 6: Compute transitions ----------------------------------------

    const transitions = getTransitions(snapshotEntries, snapshotDates);

    // --- Step 7: Content analysis (conditional) -----------------------------

    let contentAnalysis: ReturnType<typeof analyzeContent> | undefined =
        undefined;

    if (includeContentAnalysis && topSources.length > 0) {
        ctx.reportProgress?.("Анализирую теги и ключевые слова...");

        const topVideoIds = topSources.slice(0, 30).map((s) => s.videoId);
        const cachedRefs = topVideoIds.map((id) =>
            db.doc(`${basePath}/cached_suggested_traffic_videos/${id}`),
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
    }

    // --- Build snapshotTimeline ---------------------------------------------

    const snapshotTimeline = snapshots.map((snap, i) => ({
        date: new Date(snap.timestamp).toISOString().split("T")[0],
        label: snap.label ?? snap.autoLabel ?? `v${i + 1}`,
        totalSources: parsedSnapshots[i].rows.length,
    }));

    // --- Build analysisGuidance ---------------------------------------------

    const analysisGuidance = `You have received pre-computed analytics from YouTube Suggested Traffic data.

CRITICAL RULES:
- All numbers are deterministic — calculated by code, never estimated.
- Each video in topSources has a "timeline" array: raw metric values at each snapshot where the video was present, plus pre-computed deltas vs the previous point. Use timelines for trajectory analysis (growth/decline/stability over time).
- "transitions" shows how the source pool changed between consecutive snapshots: newCount/droppedCount for scale, topNew/topDropped for notable examples.
- "avgViewDuration" = how long viewers from this source watched YOUR video on average (format "H:MM:SS"). Compare with the source video's total duration for engagement depth insight.
- "sharedTags" = exact tag match between your video and the suggested video.
- "topKeywordsInSuggestedTitles" = most frequent words from ALL suggested video titles — useful for niche/topic discovery.
- "channelDistribution" = which channels appear most in your suggested traffic.
- DO NOT recalculate any numbers. Interpret and explain what the findings mean strategically.
- If timelines have only 1 point (single snapshot), note that trend data requires at least 2 snapshots.
- If you need deeper content analysis for specific videos — call getMultipleVideoDetails with their IDs. Do this selectively for the most interesting movers.`;

    // --- Step 8: Return structured result -----------------------------------

    return {
        sourceVideo,
        snapshotTimeline,
        topSources,
        transitions,
        tail,
        ...(contentAnalysis ? { contentAnalysis } : {}),
        analysisGuidance,
    };
}
