// =============================================================================
// Suggested Traffic Analysis — aggregation and content analysis
//
// Pure functions: sort, filter, aggregate rows into the structured response
// that gets passed to the LLM for interpretation.
//
// No Firebase, no async, no side effects — fully unit-testable.
// =============================================================================

import type { SuggestedVideoRow } from './csvParser.js';
import type { VideoDelta } from './delta.js';

// --- Output types ---

export interface TopSource {
    videoId: string;
    sourceTitle: string;
    views: number;
    impressions: number;
    ctr: number | null;
    avgViewDuration: string;
    watchTimeHours: number;
    deltaViews?: number;
    deltaImpressions?: number;
    pctViews?: number | null;
    pctImpressions?: number | null;
}

export interface TailSummary {
    count: number;
    totalImpressions: number;
    totalViews: number;
    avgCtr: string;  // e.g. "2.4%" — empty string if no CTR data
}

export interface BiggestChanger {
    videoId: string;
    sourceTitle: string;
    deltaViews: number;
    deltaImpressions: number;
    pctViews: number | null;
    pctImpressions: number | null;
}

export interface EnrichedVideoData {
    videoId: string;
    tags: string[];
    channelTitle: string;
}

export interface PerVideoOverlap {
    videoId: string;
    sourceTitle: string;
    sharedTags: string[];
    sharedKeywords: string[];
}

export interface ContentAnalysis {
    perVideoOverlap: PerVideoOverlap[];
    aggregate: {
        mostFrequentSharedTags: Array<{ tag: string; count: number }>;
        /** Most frequent words across all top source video TITLES (not shared with source video — use for niche/topic discovery) */
        topKeywordsInSuggestedTitles: Array<{ keyword: string; count: number }>;
        channelDistribution: Array<{ channelTitle: string; count: number }>;
    };
}

export interface SelfChannelStats {
    channelTitle: string;
    /** Number of source videos from the user's own channel (latest snapshot) */
    selfCount: number;
    /** Total number of enriched videos with known channel (latest snapshot) */
    totalEnriched: number;
    /** Self-channel percentage among top-N returned sources (0–100, latest snapshot) */
    selfPercentageTop: number;
    /** Total impressions from self-channel videos (latest snapshot) */
    selfImpressions: number;
    /** Total views from self-channel videos (latest snapshot) */
    selfViews: number;
    /** Top self-channel videos by impressions (latest snapshot) */
    selfTopVideos: Array<{
        videoId: string;
        sourceTitle: string;
        impressions: number;
        views: number;
    }>;
    /** Per-snapshot self-channel trajectory (code = math, full timeline preserved) */
    timeline: SelfChannelTimelinePoint[];
}

export interface SelfChannelTimelinePoint {
    date: string;
    label: string;
    selfCount: number;
    totalEnriched: number;
    /** Self-channel percentage among ALL enriched sources in this snapshot (0–100) */
    selfPercentageAll: number;
    selfImpressions: number;
}

export interface ContentTrajectoryPoint {
    date: string;
    label: string;
    totalSources: number;
    totalImpressions: number;
    topKeywords: Array<{ keyword: string; count: number }>;
    topSharedTags: Array<{ tag: string; count: number }>;
    channelDistribution: Array<{ channelTitle: string; count: number }>;
    /** Top 10 videos by impressions in this specific snapshot (empty for latest — covered by topSources) */
    topVideos: Array<{ videoId: string; sourceTitle: string; impressions: number; views: number; ctr: number | null; avgViewDuration: string; deltaImpressions: number | null }>;
    /** Impressions from remaining videos not in topVideos */
    tailImpressions: number;
    /** True if this is the latest snapshot (topVideos skipped — use topSources instead) */
    isLatest: boolean;
}

export interface AggregateOpts {
    limit: number;
    sortBy: 'views' | 'impressions' | 'deltaViews' | 'deltaImpressions';
    minImpressions?: number;
    minViews?: number;
}

export interface AggregateResult {
    topSources: TopSource[];
    tail: TailSummary;
}

// --- Stop words for keyword tokenization ---

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'is', 'it', 'its', 'i', 'my', 'me', 'you', 'your', 'be', 'as', 'are',
    'was', 'have', 'has', 'do', 'this', 'that', 'not', 'no', 'so', 'up', 'out', 'if',
    'get', 'all', 'can', 'just', 'they', 'we', 'she', 'he', 'her', 'his', 'them', 'our',
    'us', 'will', 'into', 'about', 'more', 'other', 'some', 'what', 'when', 'how',
    'their', 'were', 'been', 'had', 'would', 'could', 'should', 'let', 'than', 'new',
    'one', 'two', 'day', 'time', 'way', 'who', 'its', 'use', 'her', 'out', 'many', 'then',
    'them', 'these', 'want', 'look', 'also', 'back', 'come', 'over', 'think', 'know',
    'take', 'see', 'only', 'good', 'year', 'now', 'live', 'give', 'most', 'very', 'after',
    'things', 'well', 'even', 'find', 'here', 'those', 'tell', 'much', 'need', 'before',
    'same', 'while', 'last', 'long', 'great', 'little', 'own', 'right', 'big', 'too',
    'make', 'made', 'may', 'still', 'since', 'always', 'every', 'never', 'first',
    'any', 'work', 'such', 'being', 'each', 'between', 'few', 'ago', 'where', 'does',
    'got', 'goes', 'put', 'yet', 'try', 'part', 'keep', 'much', 'done',
]);

/**
 * Tokenize a title into meaningful keywords.
 * Unicode-aware: removes emoji/punctuation, preserves CJK/Cyrillic/Latin.
 * Filters stop words and tokens shorter than 3 characters.
 */
export function tokenizeTitle(title: string): string[] {
    return title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Find shared tags between source video and a suggested video.
 * Case-insensitive, whitespace-trimmed comparison.
 */
export function findSharedTags(sourceTags: string[], suggestedTags: string[]): string[] {
    const sourceSet = new Set(sourceTags.map(t => t.toLowerCase().trim()));
    return suggestedTags
        .map(t => t.toLowerCase().trim())
        .filter(t => t.length > 0 && sourceSet.has(t));
}

/**
 * Count frequency of items in an array, return sorted desc by count.
 */
function countFrequency<T extends string>(items: T[]): Array<{ item: T; count: number }> {
    const map = new Map<T, number>();
    for (const item of items) {
        map.set(item, (map.get(item) ?? 0) + 1);
    }
    return Array.from(map.entries())
        .map(([item, count]) => ({ item, count }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Aggregate rows into topSources + tail.
 *
 * Sorting rules for delta-based sorts:
 *   - Videos with no delta (only one snapshot) are ranked LAST.
 *   - Among videos with deltas, sort by absolute delta value desc.
 */
export function aggregateTopSources(
    rows: SuggestedVideoRow[],
    deltas: Map<string, VideoDelta>,
    opts: AggregateOpts,
): AggregateResult {
    const { limit, sortBy, minImpressions, minViews } = opts;

    // Apply filters
    let filtered = rows;
    if (minImpressions !== undefined && minImpressions > 0) {
        filtered = filtered.filter(r => r.impressions >= minImpressions);
    }
    if (minViews !== undefined && minViews > 0) {
        filtered = filtered.filter(r => r.views >= minViews);
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
        if (sortBy === 'views') return b.views - a.views;
        if (sortBy === 'impressions') return b.impressions - a.impressions;

        // Delta sorts: videos without delta go to the end
        const da = deltas.get(a.videoId);
        const db_ = deltas.get(b.videoId);
        if (!da && !db_) return 0;
        if (!da) return 1;
        if (!db_) return -1;

        if (sortBy === 'deltaViews') return Math.abs(db_.deltaViews) - Math.abs(da.deltaViews);
        if (sortBy === 'deltaImpressions') return Math.abs(db_.deltaImpressions) - Math.abs(da.deltaImpressions);
        return 0;
    });

    const topSlice = sorted.slice(0, limit);
    const tailSlice = sorted.slice(limit);

    // Build topSources with delta info
    const topSources: TopSource[] = topSlice.map(r => {
        const d = deltas.get(r.videoId);
        const base: TopSource = {
            videoId: r.videoId,
            sourceTitle: r.sourceTitle,
            views: r.views,
            impressions: r.impressions,
            ctr: r.ctr,
            avgViewDuration: r.avgViewDuration,
            watchTimeHours: r.watchTimeHours,
        };
        if (d) {
            base.deltaViews = d.deltaViews;
            base.deltaImpressions = d.deltaImpressions;
            base.pctViews = d.pctViews;
            base.pctImpressions = d.pctImpressions;
        }
        return base;
    });

    // Build tail summary
    const tailCount = tailSlice.length;
    const tailImpressions = tailSlice.reduce((sum, r) => sum + r.impressions, 0);
    const tailViews = tailSlice.reduce((sum, r) => sum + r.views, 0);
    const ctrValues = tailSlice.map(r => r.ctr).filter((c): c is number => c !== null);
    const avgCtrRaw = ctrValues.length > 0
        ? ctrValues.reduce((s, c) => s + c, 0) / ctrValues.length
        : null;

    const tail: TailSummary = {
        count: tailCount,
        totalImpressions: tailImpressions,
        totalViews: tailViews,
        avgCtr: avgCtrRaw !== null ? `${Math.round(avgCtrRaw * 10) / 10}%` : '',
    };

    return { topSources, tail };
}

/**
 * Find the biggest movers by absolute delta.
 * Takes top N by |deltaViews| and top N by |deltaImpressions|, deduplicates,
 * and returns a unified list sorted by |deltaViews| desc.
 */
export function findBiggestChanges(
    deltas: Map<string, VideoDelta>,
    limit = 10,
): BiggestChanger[] {
    const all = Array.from(deltas.values());
    const perSide = Math.ceil(limit / 2);

    const byViews = [...all]
        .sort((a, b) => Math.abs(b.deltaViews) - Math.abs(a.deltaViews))
        .slice(0, perSide);

    const byImpressions = [...all]
        .sort((a, b) => Math.abs(b.deltaImpressions) - Math.abs(a.deltaImpressions))
        .slice(0, perSide);

    // Deduplicate
    const seen = new Set<string>();
    const merged: BiggestChanger[] = [];
    for (const d of [...byViews, ...byImpressions]) {
        if (!seen.has(d.videoId)) {
            seen.add(d.videoId);
            merged.push({
                videoId: d.videoId,
                sourceTitle: d.sourceTitle,
                deltaViews: d.deltaViews,
                deltaImpressions: d.deltaImpressions,
                pctViews: d.pctViews,
                pctImpressions: d.pctImpressions,
            });
        }
    }

    // Final sort by |deltaViews| desc
    return merged
        .sort((a, b) => Math.abs(b.deltaViews) - Math.abs(a.deltaViews))
        .slice(0, limit);
}

/**
 * Analyze content overlap between source video and top suggested videos.
 *
 * - Uses CSV titles directly for keyword analysis (no Firestore needed)
 * - Uses enrichedData for shared tags and channelTitle
 * - Gracefully skips videos absent from enrichedData
 */
export function analyzeContent(
    sourceVideoTags: string[],
    sourceVideoTitle: string,
    topSources: TopSource[],
    enrichedData: Map<string, EnrichedVideoData>,
): ContentAnalysis {
    const sourceKeywords = new Set(tokenizeTitle(sourceVideoTitle));

    const perVideoOverlap: PerVideoOverlap[] = [];
    const allSharedTags: string[] = [];
    const allKeywords: string[] = [];
    const allChannels: string[] = [];

    for (const source of topSources) {
        const enriched = enrichedData.get(source.videoId);

        // Shared tags: only possible when enriched data is available
        const sharedTags = enriched
            ? findSharedTags(sourceVideoTags, enriched.tags)
            : [];

        // Shared keywords: purely from CSV titles (no enrichment needed)
        const titleTokens = tokenizeTitle(source.sourceTitle);
        const sharedKeywords = titleTokens.filter(w => sourceKeywords.has(w));

        perVideoOverlap.push({
            videoId: source.videoId,
            sourceTitle: source.sourceTitle,
            sharedTags,
            sharedKeywords,
        });

        allSharedTags.push(...sharedTags);
        allKeywords.push(...titleTokens);

        if (enriched?.channelTitle) {
            allChannels.push(enriched.channelTitle);
        }
    }

    const tagFreq = countFrequency(allSharedTags);
    const kwFreq = countFrequency(allKeywords);
    const chFreq = countFrequency(allChannels);

    return {
        perVideoOverlap,
        aggregate: {
            mostFrequentSharedTags: tagFreq.slice(0, 10).map(f => ({ tag: f.item, count: f.count })),
            topKeywordsInSuggestedTitles: kwFreq.slice(0, 20).map(f => ({ keyword: f.item, count: f.count })),
            channelDistribution: chFreq.slice(0, 20).map(f => ({ channelTitle: f.item, count: f.count })),
        },
    };
}

/**
 * Compute self-channel traffic statistics with per-snapshot timeline.
 *
 * Identifies which suggested traffic videos belong to the user's own channel
 * and pre-computes strategic metrics: count, percentage, impressions, views.
 * Also builds a timeline across all snapshots for trajectory analysis.
 *
 * Returns null if sourceChannelTitle is empty (= channel identity unknown).
 */
export function computeSelfChannelStats(
    sourceChannelTitle: string,
    topSources: TopSource[],
    enrichedData: Map<string, EnrichedVideoData>,
    snapshotRows?: SuggestedVideoRow[][],
    snapshotDates?: string[],
    snapshotLabels?: string[],
): SelfChannelStats | null {
    if (!sourceChannelTitle.trim()) return null;

    const normalizedOwn = sourceChannelTitle.toLowerCase().trim();

    // --- Latest snapshot stats (from topSources) ---

    const selfVideos: Array<{
        videoId: string;
        sourceTitle: string;
        impressions: number;
        views: number;
    }> = [];

    let totalEnriched = 0;

    for (const source of topSources) {
        const enriched = enrichedData.get(source.videoId);
        if (!enriched?.channelTitle) continue;

        totalEnriched++;

        if (enriched.channelTitle.toLowerCase().trim() === normalizedOwn) {
            selfVideos.push({
                videoId: source.videoId,
                sourceTitle: source.sourceTitle,
                impressions: source.impressions,
                views: source.views,
            });
        }
    }

    const selfCount = selfVideos.length;
    const selfPercentageTop = totalEnriched > 0
        ? Math.round((selfCount / totalEnriched) * 100)
        : 0;

    const selfImpressions = selfVideos.reduce((sum, v) => sum + v.impressions, 0);
    const selfViews = selfVideos.reduce((sum, v) => sum + v.views, 0);

    const selfTopVideos = [...selfVideos]
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 5);

    // --- Per-snapshot timeline ---

    const timeline: SelfChannelTimelinePoint[] = [];

    if (snapshotRows && snapshotDates && snapshotRows.length === snapshotDates.length) {
        for (let s = 0; s < snapshotRows.length; s++) {
            let snapSelf = 0;
            let snapEnriched = 0;
            let snapSelfImpressions = 0;

            for (const row of snapshotRows[s]) {
                const enriched = enrichedData.get(row.videoId);
                if (!enriched?.channelTitle) continue;

                snapEnriched++;

                if (enriched.channelTitle.toLowerCase().trim() === normalizedOwn) {
                    snapSelf++;
                    snapSelfImpressions += row.impressions;
                }
            }

            timeline.push({
                date: snapshotDates[s],
                label: snapshotLabels?.[s] ?? `v${s + 1}`,
                selfCount: snapSelf,
                totalEnriched: snapEnriched,
                selfPercentageAll: snapEnriched > 0
                    ? Math.round((snapSelf / snapEnriched) * 100)
                    : 0,
                selfImpressions: snapSelfImpressions,
            });
        }
    }

    return {
        channelTitle: sourceChannelTitle,
        selfCount,
        totalEnriched,
        selfPercentageTop,
        selfImpressions,
        selfViews,
        selfTopVideos,
        timeline,
    };
}

/**
 * Compute per-snapshot content trajectory.
 *
 * For each snapshot, aggregates:
 * - topKeywords: from CSV sourceTitle (free, no enrichment)
 * - topSharedTags: tags that overlap with source video (from enrichedData)
 * - channelDistribution: channel frequency (from enrichedData)
 *
 * Pure function — no async, no side effects.
 */
export function computeContentTrajectory(
    sourceVideoTags: string[],
    snapshotRows: SuggestedVideoRow[][],
    snapshotDates: string[],
    enrichedData: Map<string, EnrichedVideoData>,
    snapshotLabels?: string[],
): ContentTrajectoryPoint[] {
    const trajectory: ContentTrajectoryPoint[] = [];

    for (let s = 0; s < snapshotRows.length; s++) {
        const rows = snapshotRows[s];
        const allKeywords: string[] = [];
        const allSharedTags: string[] = [];
        const allChannels: string[] = [];
        let totalImpressions = 0;

        for (const row of rows) {
            totalImpressions += row.impressions;

            // Keywords from CSV title (always available)
            const tokens = tokenizeTitle(row.sourceTitle);
            allKeywords.push(...tokens);

            // Enriched data: tags + channel (only for cached videos)
            const enriched = enrichedData.get(row.videoId);
            if (enriched) {
                if (enriched.channelTitle) {
                    allChannels.push(enriched.channelTitle);
                }
                const shared = findSharedTags(sourceVideoTags, enriched.tags);
                allSharedTags.push(...shared);
            }
        }

        const kwFreq = countFrequency(allKeywords);
        const tagFreq = countFrequency(allSharedTags);
        const chFreq = countFrequency(allChannels);

        // Top 10 videos by impressions for this snapshot
        // Skip for last snapshot — topSources already covers it with greater detail
        const isLatest = s === snapshotRows.length - 1;

        let topVideos: ContentTrajectoryPoint['topVideos'] = [];
        let tailImpressions = 0;

        if (!isLatest) {
            const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
            const top = sorted.slice(0, 10);
            const tailSlice = sorted.slice(10);

            // Build lookup from previous snapshot for delta computation
            const prevImprMap = new Map<string, number>();
            if (s > 0) {
                for (const row of snapshotRows[s - 1]) {
                    prevImprMap.set(row.videoId, row.impressions);
                }
            }

            topVideos = top.map(r => {
                const prev = prevImprMap.get(r.videoId);
                return {
                    videoId: r.videoId,
                    sourceTitle: r.sourceTitle,
                    impressions: r.impressions,
                    views: r.views,
                    ctr: r.ctr,
                    avgViewDuration: r.avgViewDuration,
                    deltaImpressions: prev !== undefined ? r.impressions - prev : null,
                };
            });
            tailImpressions = tailSlice.reduce((sum, r) => sum + r.impressions, 0);
        }

        trajectory.push({
            date: snapshotDates[s],
            label: snapshotLabels?.[s] ?? `v${s + 1}`,
            totalSources: rows.length,
            totalImpressions,
            topKeywords: kwFreq.slice(0, 10).map(f => ({ keyword: f.item, count: f.count })),
            topSharedTags: tagFreq.slice(0, 10).map(f => ({ tag: f.item, count: f.count })),
            channelDistribution: chFreq.slice(0, 10).map(f => ({ channelTitle: f.item, count: f.count })),
            topVideos,
            tailImpressions,
            isLatest,
        });
    }

    return trajectory;
}
