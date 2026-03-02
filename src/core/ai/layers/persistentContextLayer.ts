// =============================================================================
// Memory Layer 1: Persistent Context
//
// Attached videos, traffic sources, and canvas nodes persisted for the
// conversation lifetime. Gemini sees these in every message of the conversation.
//
// Format helpers (formatVideoContext, formatCanvasContext, etc.) are private
// to this layer — they produce the Markdown that Gemini reads.
// =============================================================================

import type { AppContextItem, VideoCardContext, SuggestedTrafficContext, CanvasSelectionContext, VideoContextNode, TrafficSourceContextNode, StickyNoteContextNode, ImageContextNode, SnapshotFrameContextNode, TrafficDiscrepancy } from '../../types/appContext';
import { getVideoCards, getTrafficContexts, getCanvasContexts } from '../../types/appContext';
import { OWNERSHIP_CONFIG } from '../../config/referencePatterns';

import {
    VIDEO_CONTEXT_PREAMBLE,
    VIDEO_SECTION_DRAFT,
    VIDEO_SECTION_PUBLISHED,
    VIDEO_SECTION_COMPETITOR,
    TRAFFIC_CONTEXT_HEADER,
    TRAFFIC_SOURCE_HEADER,
    TRAFFIC_SUGGESTED_HEADER,
    TRAFFIC_SNAPSHOT_CONTEXT,
    CANVAS_CONTEXT_HEADER,
    CANVAS_CONTEXT_PREAMBLE,
} from '../../config/prompts';

// =============================================================================
// Layer entry point
// =============================================================================

/**
 * Memory Layer 1: Persistent Context
 * Builds system prompt sections from attached videos, traffic, and canvas data.
 */
export function buildPersistentContextLayer(appContext?: AppContextItem[]): string[] {
    if (!appContext || appContext.length === 0) return [];

    const sections: string[] = [];


    const videoCards = getVideoCards(appContext);
    if (videoCards.length > 0) {
        sections.push(formatVideoContext(videoCards));
    }
    const trafficContexts = getTrafficContexts(appContext);
    if (trafficContexts.length > 0) {
        trafficContexts.forEach(tc => sections.push(formatSuggestedTrafficContext(tc)));
    }
    const canvasContexts = getCanvasContexts(appContext);
    if (canvasContexts.length > 0) {
        canvasContexts.forEach(cc => {
            sections.push(formatCanvasContext(cc));
        });
    }

    return sections;
}

// =============================================================================
// Format helpers (private to this layer)
// =============================================================================

/** Format video card context items as Markdown, grouped by ownership. */
function formatVideoContext(items: VideoCardContext[]): string {
    const lines: string[] = [];

    // Preamble — explain field semantics
    lines.push(VIDEO_CONTEXT_PREAMBLE);
    lines.push('');

    // Group by ownership
    const drafts = items.filter(v => v.ownership === 'own-draft');
    const published = items.filter(v => v.ownership === 'own-published');
    const competitors = items.filter(v => v.ownership === 'competitor');

    if (drafts.length > 0) {
        lines.push(VIDEO_SECTION_DRAFT);
        lines.push('');
        drafts.forEach(v => formatSingleVideo(lines, v));
    }

    if (published.length > 0) {
        lines.push(VIDEO_SECTION_PUBLISHED);
        lines.push('');
        published.forEach(v => formatSingleVideo(lines, v));
    }

    if (competitors.length > 0) {
        lines.push(VIDEO_SECTION_COMPETITOR);
        lines.push('');
        competitors.forEach(v => formatSingleVideo(lines, v));
    }

    return lines.join('\n');
}

/** Format a single video's metadata into compact prompt lines (no description/tags). */
function formatSingleVideo(lines: string[], v: VideoCardContext): void {
    const prefix = OWNERSHIP_CONFIG[v.ownership ?? '']?.label || 'Video';
    const channel = v.channelTitle ? ` (Channel: ${v.channelTitle})` : '';
    const metrics: string[] = [];
    if (v.viewCount) metrics.push(`Views: ${v.viewCount}`);
    // Delta views from trend snapshots (enriched by middleware)
    const deltas: string[] = [];
    if (v.delta24h != null) deltas.push(`24h: ${formatDeltaCompact(v.delta24h)}`);
    if (v.delta7d != null) deltas.push(`7d: ${formatDeltaCompact(v.delta7d)}`);
    if (v.delta30d != null) deltas.push(`30d: ${formatDeltaCompact(v.delta30d)}`);
    if (deltas.length > 0) metrics.push(deltas.join(' / '));
    if (v.publishedAt) metrics.push(`Published: ${v.publishedAt}`);
    if (v.duration) metrics.push(`Duration: ${v.duration}`);
    const metricsStr = metrics.length > 0 ? ` — ${metrics.join(' | ')}` : '';
    lines.push(`- ${prefix}: "${v.title}" [id: ${v.videoId}]${channel}${metricsStr}`);
    // Traffic Sources summary (enriched by middleware, per-video toggle)
    if (v.trafficSourcesSummary) {
        // Indent each line under the video entry
        v.trafficSourcesSummary.split('\n').forEach(line => {
            lines.push(`  ${line}`);
        });
    }
}

/** Compact delta formatting: +1200 → "+1.2K", -300 → "-300" */
function formatDeltaCompact(value: number): string {
    const abs = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${abs}`;
}

/** Format suggested traffic context — source video + selected suggested videos. */
function formatSuggestedTrafficContext(ctx: SuggestedTrafficContext): string {
    const lines = [TRAFFIC_CONTEXT_HEADER, ''];

    // Snapshot context — explain what this data is
    lines.push(TRAFFIC_SNAPSHOT_CONTEXT);
    if (ctx.snapshotDate) {
        lines.push(`**Data exported:** ${ctx.snapshotDate}`);
    }
    if (ctx.snapshotLabel) {
        lines.push(`**User's label for this export:** "${ctx.snapshotLabel}" (subjective name given by the user to this CSV export)`);
    }
    lines.push('');

    // Source video (user's video) — compact format
    const sv = ctx.sourceVideo;
    lines.push(TRAFFIC_SOURCE_HEADER);
    const svMetrics: string[] = [];
    if (sv.viewCount) svMetrics.push(`Views: ${sv.viewCount}`);
    if (sv.publishedAt) svMetrics.push(`Published: ${sv.publishedAt}`);
    if (sv.duration) svMetrics.push(`Duration: ${sv.duration}`);
    const svStr = svMetrics.length > 0 ? ` — ${svMetrics.join(' | ')}` : '';
    lines.push(`- "${sv.title}" [id: ${sv.videoId}]${svStr}`);

    lines.push('');

    // Selected suggested videos
    lines.push(TRAFFIC_SUGGESTED_HEADER);
    lines.push('');
    ctx.suggestedVideos.forEach((v) => {
        // Traffic metrics (always available from CSV) — compact format
        const metrics = `Imp: ${v.impressions.toLocaleString()} | CTR: ${(v.ctr * 100).toFixed(1)}% | Views: ${v.views.toLocaleString()} | AvgDur: ${v.avgViewDuration} | WatchTime: ${v.watchTimeHours.toFixed(1)}h`;
        const channel = v.channelTitle ? ` (${v.channelTitle})` : '';
        lines.push(`- Suggested: "${v.title}" [id: ${v.videoId}]${channel} — ${metrics}`);
    });

    // Discrepancy block (only if cumulative Long Tail data is present)
    if (ctx.discrepancy) {
        lines.push(...formatDiscrepancyBlock(ctx.discrepancy));
    }

    return lines.join('\n');
}

// =============================================================================
// Discrepancy helper (shared between traffic and canvas formatters)
// =============================================================================

/** Format a compact number: 1200 → "1.2K" */
function compact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

/** Render the discrepancy block as Markdown lines — adapts prompt text based on mode. */
function formatDiscrepancyBlock(d: TrafficDiscrepancy): string[] {
    const impPct = d.reportTotal.impressions > 0
        ? Math.round((d.longTail.impressions / d.reportTotal.impressions) * 100)
        : 0;
    const viewsPct = d.reportTotal.views > 0
        ? Math.round((d.longTail.views / d.reportTotal.views) * 100)
        : 0;

    const isDelta = d.mode === 'delta';
    const header = isDelta
        ? '### ⚠️ Traffic Discrepancy — Delta (vs Previous Snapshot)'
        : '### ⚠️ Traffic Discrepancy (Long Tail)';

    const explanation = isDelta
        ? 'The *change* in YouTube\'s reported totals between snapshots is larger than the sum of individual source changes. This means some traffic sources appeared, disappeared, or changed outside the visible list.'
        : 'YouTube reports higher totals than the sum of individual sources in the table. The Long Tail represents aggregated traffic from minor sources and privacy-protected views hidden by YouTube. A large percentage often signals the algorithm is in exploration phase.';

    const totalLabel = isDelta ? 'Delta Total' : 'Report Total';
    const sumLabel = isDelta ? 'Visible Changes Sum' : 'Top Videos Sum';
    const tailLabel = isDelta ? 'Hidden Changes' : 'Long Tail (hidden)';

    return [
        header,
        '',
        explanation,
        `- **${totalLabel}:** ${compact(d.reportTotal.impressions)} impressions / ${compact(d.reportTotal.views)} views`,
        `- **${sumLabel}:** ${compact(d.tableSum.impressions)} impressions / ${compact(d.tableSum.views)} views`,
        `- **${tailLabel}:** +${compact(d.longTail.impressions)} (${impPct}%) / +${compact(d.longTail.views)} (${viewsPct}%)`,
        '',
    ];
}

/** Format canvas selection context — grouped nodes from the visual canvas board. */
function formatCanvasContext(ctx: CanvasSelectionContext): string {
    const lines = [CANVAS_CONTEXT_HEADER, '', CANVAS_CONTEXT_PREAMBLE, ''];

    const videos = ctx.nodes.filter((n): n is VideoContextNode => n.nodeType === 'video');
    const trafficSources = ctx.nodes.filter((n): n is TrafficSourceContextNode => n.nodeType === 'traffic-source');
    const notes = ctx.nodes.filter((n): n is StickyNoteContextNode => n.nodeType === 'sticky-note');
    const images = ctx.nodes.filter((n): n is ImageContextNode => n.nodeType === 'image');

    // Videos — use ownership-based labels consistent with standalone cards
    if (videos.length > 0) {
        lines.push('### Videos');
        lines.push('');
        videos.forEach(v => {
            const prefix = OWNERSHIP_CONFIG[v.ownership ?? '']?.label || 'Video';
            const channel = v.channelTitle ? ` (Channel: ${v.channelTitle})` : '';
            const metrics: string[] = [];
            if (v.viewCount) metrics.push(`Views: ${v.viewCount}`);
            if (v.publishedAt) metrics.push(`Published: ${v.publishedAt}`);
            if (v.duration) metrics.push(`Duration: ${v.duration}`);
            const metricsStr = metrics.length > 0 ? ` — ${metrics.join(' | ')}` : '';
            lines.push(`- ${prefix}: "${v.title || '(untitled)'}" [id: ${v.videoId}]${channel}${metricsStr}`);
        });
    }

    // Traffic sources
    if (trafficSources.length > 0) {
        lines.push('### Traffic Source Cards');
        lines.push('');
        trafficSources.forEach((t, i) => {
            lines.push(`#### Traffic Source ${i + 1}: "${t.title || '(untitled)'}"`);
            if (t.impressions != null) lines.push(`- **Impressions:** ${t.impressions.toLocaleString()}`);
            if (t.ctr != null) lines.push(`- **CTR:** ${(t.ctr * 100).toFixed(1)}%`);
            if (t.views != null) lines.push(`- **Views:** ${t.views.toLocaleString()}`);
            if (t.avgViewDuration) lines.push(`- **Avg View Duration:** ${t.avgViewDuration}`);
            if (t.watchTimeHours != null) lines.push(`- **Watch Time:** ${t.watchTimeHours.toFixed(1)}h`);
            if (t.channelTitle) lines.push(`- **Channel:** ${t.channelTitle}`);
            if (t.trafficType) lines.push(`- **Traffic Type:** ${t.trafficType}`);
            if (t.viewerType) lines.push(`- **Viewer Type:** ${t.viewerType}`);
            if (t.niche) lines.push(`- **Niche:** ${t.niche}`);
            if (t.sourceVideoTitle) lines.push(`- **Source Video:** ${t.sourceVideoTitle}`);
            if (t.description) lines.push(`- **Description:** ${t.description}`);
            if (t.tags && t.tags.length > 0) lines.push(`- **Tags:** ${t.tags.join(', ')}`);
            lines.push('');
        });
    }

    // Sticky notes
    if (notes.length > 0) {
        lines.push("### User's Notes");
        lines.push('');
        notes.forEach((n, i) => {
            lines.push(`#### Note ${i + 1}`);
            lines.push(n.content || '');
            lines.push('');
        });
    }

    // Snapshot frame context (frame-level metadata with discrepancy)
    const frames = ctx.nodes.filter((n): n is SnapshotFrameContextNode => n.nodeType === 'snapshot-frame');
    if (frames.length > 0) {
        for (const frame of frames) {
            lines.push(`### Snapshot: "${frame.sourceVideoTitle}" \u2014 "${frame.snapshotLabel}"`);
            lines.push('');
            if (frame.discrepancy) {
                lines.push(...formatDiscrepancyBlock(frame.discrepancy));
            }
            lines.push(`- **Selected:** ${frame.nodeCount} traffic sources from this snapshot`);
            lines.push('');
        }
    }

    // Images (just mention they're attached visually — actual images go via thumbnailUrls)
    if (images.length > 0) {
        lines.push('### Attached Images');
        lines.push('');
        images.forEach((img, i) => {
            lines.push(`- Image ${i + 1}${img.alt ? `: ${img.alt}` : ''} (attached as visual input)`);
        });
        lines.push('');
    }

    return lines.join('\n');
}
