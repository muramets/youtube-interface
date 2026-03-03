// =============================================================================
// Suggested Traffic Analysis — aggregation and content analysis
//
// Pure functions: sort, filter, aggregate rows into the structured response
// that gets passed to Gemini for interpretation.
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
    'a','an','the','and','or','but','in','on','at','to','for','of','with',
    'by','from','is','it','its','i','my','me','you','your','be','as','are',
    'was','have','has','do','this','that','not','no','so','up','out','if',
    'get','all','can','just','they','we','she','he','her','his','them','our',
    'us','will','into','about','more','other','some','what','when','how',
    'their','were','been','had','would','could','should','let','than','new',
    'one','two','day','time','way','who','its','use','her','out','many','then',
    'them','these','want','look','also','back','come','over','think','know',
    'take','see','only','good','year','now','live','give','most','very','after',
    'things','well','even','find','here','those','tell','much','need','before',
    'same','while','last','long','great','little','own','right','big','too',
    'make','made','may','still','since','always','every','never','first',
    'any','work','such','being','each','between','few','ago','where', 'does',
    'got','goes','put','yet','try','part','keep','much','done',
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
            videoId:        r.videoId,
            sourceTitle:    r.sourceTitle,
            views:          r.views,
            impressions:    r.impressions,
            ctr:            r.ctr,
            avgViewDuration: r.avgViewDuration,
            watchTimeHours: r.watchTimeHours,
        };
        if (d) {
            base.deltaViews       = d.deltaViews;
            base.deltaImpressions = d.deltaImpressions;
            base.pctViews         = d.pctViews;
            base.pctImpressions   = d.pctImpressions;
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
        count:            tailCount,
        totalImpressions: tailImpressions,
        totalViews:       tailViews,
        avgCtr:           avgCtrRaw !== null ? `${Math.round(avgCtrRaw * 10) / 10}%` : '',
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
                videoId:          d.videoId,
                sourceTitle:      d.sourceTitle,
                deltaViews:       d.deltaViews,
                deltaImpressions: d.deltaImpressions,
                pctViews:         d.pctViews,
                pctImpressions:   d.pctImpressions,
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
            videoId:        source.videoId,
            sourceTitle:    source.sourceTitle,
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
    const kwFreq  = countFrequency(allKeywords);
    const chFreq  = countFrequency(allChannels);

    return {
        perVideoOverlap,
        aggregate: {
            mostFrequentSharedTags: tagFreq.slice(0, 10).map(f => ({ tag: f.item, count: f.count })),
            topKeywordsInSuggestedTitles: kwFreq.slice(0, 20).map(f => ({ keyword: f.item, count: f.count })),
            channelDistribution:    chFreq.slice(0, 20).map(f => ({ channelTitle: f.item, count: f.count })),
        },
    };
}
