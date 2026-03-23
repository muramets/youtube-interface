import type { TrafficSource } from '../../../../../core/types/suggestedTraffic/traffic';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';
import { debug } from '../../../../../core/utils/debug';

export const YOUTUBE_API_BATCH_SIZE = 50;
/** YouTube API quota cost per batch: 1 for videos.list + 1 for channels.list */
export const QUOTA_UNITS_PER_BATCH = 2;

export interface SourceClassification {
    /** Sources with no title — can't even display properly */
    missing: TrafficSource[];
    /** Sources with title but no channelId (neither in CSV nor cache) */
    unenriched: TrafficSource[];
    /** Sources that are fully enriched (have channelId in CSV or cache) */
    enriched: TrafficSource[];
    /** Sources without videoId — can't be enriched (e.g. Total row) */
    unresolvable: TrafficSource[];
}

export interface EnrichmentStats {
    missingCount: number;
    unenrichedCount: number;
    needsEnrichment: boolean;
    /** Number of unique videoIds that require YouTube API fetch (cache misses only) */
    toFetchCount: number;
    estimatedQuota: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const isTitleMissing = (source: TrafficSource): boolean =>
    !source.sourceTitle || source.sourceTitle.trim() === '';

const buildCacheMap = (cachedVideos: VideoDetails[]): Map<string, VideoDetails> =>
    new Map(cachedVideos.map(v => [v.id, v]));

// ── Pure Functions ───────────────────────────────────────────────────────────

/**
 * Single source of truth for classifying traffic sources by enrichment status.
 */
export function classifySources(
    sources: TrafficSource[],
    cachedVideos: VideoDetails[],
): SourceClassification {
    const cachedMap = buildCacheMap(cachedVideos);

    const missing: TrafficSource[] = [];
    const unenriched: TrafficSource[] = [];
    const enriched: TrafficSource[] = [];
    const unresolvable: TrafficSource[] = [];

    for (const source of sources) {
        if (!source.videoId) {
            unresolvable.push(source);
            continue;
        }

        if (isTitleMissing(source)) {
            missing.push(source);
            continue;
        }

        const cached = cachedMap.get(source.videoId);
        const hasChannelId = !!source.channelId || !!cached?.channelId;
        const isUnfindable = source.notFoundInApi === true || cached?.notFoundInApi === true;

        if (hasChannelId || isUnfindable) {
            enriched.push(source);
        } else {
            unenriched.push(source);
        }
    }

    debug.enrichment('classifySources', {
        input: sources.length,
        cacheSize: cachedVideos.length,
        missing: missing.length,
        unenriched: unenriched.length,
        enriched: enriched.length,
        unresolvable: unresolvable.length,
        // First unenriched videoId for quick identification
        firstUnenriched: unenriched[0]?.videoId ?? null,
    });

    return { missing, unenriched, enriched, unresolvable };
}

/**
 * Computes enrichment stats including API quota estimation.
 * Uses classifySources + filterIdsToFetch internally — no duplicated logic.
 */
export function computeEnrichmentStats(
    sources: TrafficSource[],
    cachedVideos: VideoDetails[],
): EnrichmentStats {
    const classification = classifySources(sources, cachedVideos);

    const needsRepairSources = [...classification.missing, ...classification.unenriched];
    const uniqueVideoIds = [...new Set(needsRepairSources.map(s => s.videoId!))];
    const toFetch = filterIdsToFetch(uniqueVideoIds, cachedVideos);

    const estimatedQuota = Math.ceil(toFetch.length / YOUTUBE_API_BATCH_SIZE) * QUOTA_UNITS_PER_BATCH;

    const stats: EnrichmentStats = {
        missingCount: classification.missing.length,
        unenrichedCount: classification.unenriched.length,
        needsEnrichment: classification.missing.length > 0 || classification.unenriched.length > 0,
        toFetchCount: toFetch.length,
        estimatedQuota,
    };

    debug.enrichment('computeEnrichmentStats', stats);

    return stats;
}

/**
 * Merges enrichment data into traffic sources.
 * Priority: fetched (fresh API data) > cached > original source.
 */
export function mergeSources(
    sources: TrafficSource[],
    fetchedMap: Map<string, VideoDetails>,
    cachedVideos: VideoDetails[],
): TrafficSource[] {
    const cachedMap = buildCacheMap(cachedVideos);

    let mergedCount = 0;
    let unfindableMarked = 0;

    const result = sources.map(source => {
        if (!source.videoId) return source;

        const details = fetchedMap.get(source.videoId) ?? cachedMap.get(source.videoId);
        if (!details) return source;

        mergedCount++;
        if (details.notFoundInApi) unfindableMarked++;

        return {
            ...source,
            sourceTitle: details.title || source.sourceTitle,
            channelId: details.channelId || source.channelId,
            channelTitle: details.channelTitle || source.channelTitle,
            thumbnail: details.thumbnail || source.thumbnail,
            publishedAt: details.publishedAt || source.publishedAt,
            notFoundInApi: details.notFoundInApi || source.notFoundInApi,
        };
    });

    debug.enrichment('mergeSources', {
        input: sources.length,
        fetched: fetchedMap.size,
        cacheSize: cachedVideos.length,
        merged: mergedCount,
        unfindableMarked,
        unchanged: sources.length - mergedCount,
    });

    return result;
}

/**
 * Filters video IDs that actually need YouTube API fetch (cache misses).
 */
export function filterIdsToFetch(
    videoIds: string[],
    cachedVideos: VideoDetails[],
): string[] {
    const cachedMap = buildCacheMap(cachedVideos);

    let cacheHit = 0;
    let unfindableSkipped = 0;

    const result = videoIds.filter(id => {
        const cached = cachedMap.get(id);
        if (!cached) return true;
        if (cached.notFoundInApi) {
            unfindableSkipped++;
            return false;
        }
        if (cached.channelId) {
            cacheHit++;
            return false;
        }
        return true;
    });

    debug.enrichment('filterIdsToFetch', {
        input: videoIds.length,
        cacheHit,
        unfindableSkipped,
        toFetch: result.length,
    });

    return result;
}
