// =============================================================================
// analyzeTrafficSources handler — Traffic Source breakdown + timeline
//
// Steps:
//   1. Read snapshot metadata from Firestore (trafficSource/main, NOT traffic/main)
//   2. Download CSVs from Cloud Storage in parallel
//   3. Parse CSVs with trafficSourceCsvParser
//   4. Build per-source timeline with pre-computed deltas
//   5. Return structured JSON for LLM interpretation
//
// CRITICAL: uses trafficSource/main (aggregate source breakdown)
//           NOT traffic/main (suggested traffic per-video)
// =============================================================================

import { db, admin } from "../../../shared/db.js";
import { resolveVideosByIds } from "../utils/resolveVideos.js";
import { parseTrafficSourceCsv } from "../utils/trafficSourceCsvParser.js";
import { buildSourceTimeline } from "../utils/trafficSourceTimeline.js";
import type { ToolContext } from "../types.js";
import type { TrafficSourceMetric } from "../utils/trafficSourceCsvParser.js";

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

export async function handleAnalyzeTrafficSources(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    // --- Args validation ---
    if (typeof args.videoId !== "string" || !args.videoId) return { error: "videoId is required" };
    const videoId = args.videoId;
    if (!/^[\w-]{1,64}$/.test(videoId)) return { error: "Invalid videoId format" };

    // --- Step 1: Resolve video document + read snapshot metadata ---
    // Uses resolver to handle custom videos (custom-XXXX → publishedVideoId lookup).
    // skipExternal: traffic source data only exists on own videos.
    const basePath = `users/${ctx.userId}/channels/${ctx.channelId}`;
    const { resolved } = await resolveVideosByIds(basePath, [videoId], { skipExternal: true });
    const entry = resolved.get(videoId);

    // Use resolved docId for subcollection access (may differ from YouTube videoId)
    const docId = entry?.docId ?? videoId;
    const trafficSourceSnap = await db.doc(`${basePath}/videos/${docId}/trafficSource/main`).get();

    if (!trafficSourceSnap.exists) {
        return { error: "No traffic source data found for this video. The user needs to import Traffic Source CSV data first." };
    }

    const trafficSourceData = trafficSourceSnap.data()!;
    const snapshots: SnapshotMeta[] = trafficSourceData.snapshots ?? [];
    if (snapshots.length === 0) {
        return { error: "No CSV snapshots found for this video" };
    }

    // Sort ascending by timestamp (oldest first)
    snapshots.sort((a, b) => a.timestamp - b.timestamp);

    const videoData = entry?.data ?? {};
    const sourceVideo = {
        videoId,
        title: String(videoData.title ?? ""),
    };

    // --- Step 2: Download CSVs from Cloud Storage in parallel ---
    ctx.reportProgress?.("Downloading traffic source snapshots...");

    const bucket = admin.storage().bucket();
    const csvContents = await Promise.all(
        snapshots.map(async (snap) => {
            try {
                const [buffer] = await bucket.file(snap.storagePath).download();
                return buffer.toString("utf-8");
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[analyzeTrafficSources] Failed to download ${snap.storagePath}: ${msg}`);
                return "";
            }
        }),
    );

    // --- Step 3: Parse CSVs ---
    const parsedSnapshots = csvContents.map((csv) => parseTrafficSourceCsv(csv));

    // Extract metrics arrays and totals
    const snapshotMetrics: TrafficSourceMetric[][] = parsedSnapshots.map(s => s.metrics);
    const snapshotTotals = parsedSnapshots.map(s => s.totalRow);

    const snapshotDates = snapshots.map(
        (snap) => new Date(snap.timestamp).toISOString().split("T")[0],
    );
    const snapshotLabels = snapshots.map(
        (snap, i) => snap.label ?? snap.autoLabel ?? `v${i + 1}`,
    );

    // --- Step 4: Build per-source timelines with deltas ---
    ctx.reportProgress?.("Building source timelines...");

    const { sources, totalTimeline } = buildSourceTimeline(
        snapshotMetrics,
        snapshotTotals,
        snapshotDates,
        snapshotLabels,
    );

    // Sort sources by latest views descending
    sources.sort((a, b) => b.views - a.views);

    // --- Step 5: Build snapshot overview ---
    const snapshotTimeline = snapshots.map((snap, i) => ({
        date: snapshotDates[i],
        label: snapshotLabels[i],
        totalSources: parsedSnapshots[i].metrics.length,
    }));

    // --- Return structured result ---
    return {
        sourceVideo,
        snapshotTimeline,
        sources,
        ...(totalTimeline.length > 0 ? { totalTimeline } : {}),
    };
}
