// =============================================================================
// analyzeSuggestedTraffic handler — compute structured analytics from
// YouTube Suggested Traffic CSV snapshots stored in Cloud Storage.
//
// Steps:
//   1. Read snapshot metadata + source video from Firestore
//   2. Download all CSVs from Cloud Storage in parallel
//   3. Parse CSVs using the pure csvParser utility
//   4. Calculate deltas between the two most recent snapshots
//   5. Aggregate top sources with optional filters
//   6. Optionally enrich with cached Firestore video data for content analysis
//   7. Return structured JSON for Gemini to interpret
// =============================================================================

import { db, admin } from "../../../shared/db.js";
import { parseSuggestedTrafficCsv } from "../utils/csvParser.js";
import {
    calculateSnapshotDeltas,
    findNewEntries,
    findDroppedEntries,
} from "../utils/delta.js";
import {
    aggregateTopSources,
    findBiggestChanges,
    analyzeContent,
} from "../utils/suggestedAnalysis.js";
import type { ToolContext } from "../types.js";
import type { VideoSnapshotEntry } from "../utils/delta.js";
import type { EnrichedVideoData } from "../utils/suggestedAnalysis.js";

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

    const limit = Math.min(
        typeof args.limit === "number" ? args.limit : 20,
        500,
    );
    const minImpressions =
        typeof args.minImpressions === "number" ? args.minImpressions : undefined;
    const minViews =
        typeof args.minViews === "number" ? args.minViews : undefined;
    const sortBy = (
        ["views", "impressions", "deltaViews", "deltaImpressions"] as const
    ).includes(args.sortBy as never)
        ? (args.sortBy as "views" | "impressions" | "deltaViews" | "deltaImpressions")
        : "views";
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
                // Return an empty CSV so parsing produces an empty snapshot rather than crashing
                return "";
            }
        }),
    );

    // --- Step 3: Parse CSVs -------------------------------------------------

    const parsedSnapshots = csvContents.map((csv) =>
        parseSuggestedTrafficCsv(csv),
    );

    // Build VideoSnapshotEntry arrays
    const snapshotEntries: VideoSnapshotEntry[][] = parsedSnapshots.map(
        (snap) =>
            snap.rows.map(
                (row): VideoSnapshotEntry => ({
                    videoId: row.videoId,
                    sourceTitle: row.sourceTitle,
                    views: row.views,
                    impressions: row.impressions,
                    ctr: row.ctr,
                    watchTimeHours: row.watchTimeHours,
                }),
            ),
    );

    // --- Step 4: Calculate deltas -------------------------------------------

    ctx.reportProgress?.("Считаю дельту между снапшотами...");

    const latestEntries = snapshotEntries[snapshotEntries.length - 1];
    const previousEntries =
        snapshotEntries.length >= 2
            ? snapshotEntries[snapshotEntries.length - 2]
            : [];

    const deltas =
        snapshotEntries.length >= 2
            ? calculateSnapshotDeltas(latestEntries, previousEntries)
            : new Map();

    const newEntries =
        snapshotEntries.length >= 2
            ? findNewEntries(latestEntries, previousEntries)
            : [];
    const droppedEntries =
        snapshotEntries.length >= 2
            ? findDroppedEntries(latestEntries, previousEntries)
            : [];

    // --- Step 5: Aggregate --------------------------------------------------

    // When there is only one snapshot, delta-based sorts have no data — fall back to views
    const effectiveSortBy =
        (sortBy === "deltaViews" || sortBy === "deltaImpressions") &&
            snapshotEntries.length < 2
            ? "views"
            : sortBy;

    const { topSources, tail } = aggregateTopSources(
        parsedSnapshots[parsedSnapshots.length - 1].rows,
        deltas,
        { limit, sortBy: effectiveSortBy, minImpressions, minViews },
    );

    const biggestChanges = findBiggestChanges(deltas, 10);

    // --- Step 6: Content analysis (conditional) -----------------------------

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

        contentAnalysis = analyzeContent(
            sourceVideo.tags,
            sourceVideo.title,
            topSources,
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
- All numbers are deterministic — calculated by code, never estimated
- "deltaViews: +5000 (167%)" means +5000 more views in latest vs previous snapshot
- "biggestChanges" are sorted by |deltaViews| — includes both gainers and losers (biggest absolute movers)
- "sharedTags" = exact tag match between your video and the suggested video
- "topKeywordsInSuggestedTitles" = most frequent words from ALL suggested video titles (not just shared) — useful for niche/topic discovery
- "newEntries" = appeared in latest snapshot, absent in the previous one
- "droppedEntries" = were recommended before, gone from latest snapshot
- "channelDistribution" = which channels appear most in your suggested traffic
- DO NOT recalculate any numbers. Interpret and explain what the findings mean strategically.
- If deltas are absent (single snapshot), note that trend data requires at least 2 snapshots.
- If you need deeper content analysis (full description, detailed tags) for specific videos — call getMultipleVideoDetails with their IDs. Do this selectively for the most interesting movers, not for all videos.`;

    // --- Step 7: Return structured result -----------------------------------

    return {
        sourceVideo,
        snapshotTimeline,
        topSources,
        biggestChanges,
        newEntries: newEntries.slice(0, 20).map((e) => ({
            videoId: e.videoId,
            title: e.sourceTitle,
            views: e.views,
            impressions: e.impressions,
        })),
        droppedEntries: droppedEntries.slice(0, 20).map((e) => ({
            videoId: e.videoId,
            title: e.sourceTitle,
            lastViews: e.views,
        })),
        tail,
        ...(contentAnalysis ? { contentAnalysis } : {}),
        analysisGuidance,
    };
}
