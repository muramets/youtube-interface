import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../../config/firebase';
import type { TrafficSource, TrafficData, TrafficSnapshot } from '../../../../../core/types/suggestedTraffic/traffic';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';
import { fetchVideosBatch } from '../../../../../core/utils/youtubeApi';
import { VideoService, getExternalVideosPath } from '../../../../../core/services/videoService';
import { TrafficSnapshotService } from '../../../../../core/services/traffic/TrafficSnapshotService';
import { generateTrafficCsv } from '../utils/csvGenerator';
import { logger } from '../../../../../core/utils/logger';
import { debug } from '../../../../../core/utils/debug';
import { externalVideoQueryPrefix } from './useExternalVideoLookup';
import { classifySources, computeEnrichmentStats, filterIdsToFetch, mergeSources, YOUTUBE_API_BATCH_SIZE } from '../utils/enrichment';

// ── Batch cache lookup (pre-upload accuracy) ─────────────────────────────────

const CACHE_LOOKUP_CHUNK_SIZE = 100;

/**
 * Batch-reads cached_external_videos docs from Firestore for video IDs
 * not yet in local cache. Returns VideoDetails[] for found docs.
 * Used before showing enrichment modal to get accurate "to fetch" count.
 */
export async function batchLookupCachedVideos(
    videoIds: string[],
    userId: string,
    channelId: string,
): Promise<VideoDetails[]> {
    if (videoIds.length === 0) return [];

    const basePath = getExternalVideosPath(userId, channelId);
    const results: VideoDetails[] = [];

    for (let i = 0; i < videoIds.length; i += CACHE_LOOKUP_CHUNK_SIZE) {
        const chunk = videoIds.slice(i, i + CACHE_LOOKUP_CHUNK_SIZE);
        const snapshots = await Promise.all(
            chunk.map(id => getDoc(doc(db, basePath, id))),
        );
        for (const snap of snapshots) {
            if (snap.exists()) {
                results.push(snap.data() as VideoDetails);
            }
        }
    }

    debug.enrichment('batchLookupCachedVideos', {
        requested: videoIds.length,
        found: results.length,
        notInCache: videoIds.length - results.length,
    });

    return results;
}

/**
 * Fetches missing video data from YouTube API, persists to Firestore cache,
 * and returns merged sources.
 */
export async function enrichSources(
    sources: TrafficSource[],
    userId: string,
    channelId: string,
    apiKey: string,
    cachedVideos: VideoDetails[] = [],
): Promise<TrafficSource[]> {
    const { missing, unenriched } = classifySources(sources, cachedVideos);
    const needsRepair = [...missing, ...unenriched];

    if (needsRepair.length === 0) {
        debug.enrichment('enrichSources: nothing to do');
        return sources;
    }

    const uniqueVideoIds = [...new Set(needsRepair.map(s => s.videoId!))];
    const videoIdsToFetch = filterIdsToFetch(uniqueVideoIds, cachedVideos);

    debug.enrichment('enrichSources: starting', {
        needsRepair: needsRepair.length,
        uniqueIds: uniqueVideoIds.length,
        toFetch: videoIdsToFetch.length,
        cacheSkipped: uniqueVideoIds.length - videoIdsToFetch.length,
    });

    const fetchedMap = new Map<string, VideoDetails>();

    if (videoIdsToFetch.length > 0) {
        // Batch fetch from YouTube API
        const chunks: string[][] = [];
        for (let i = 0; i < videoIdsToFetch.length; i += YOUTUBE_API_BATCH_SIZE) {
            chunks.push(videoIdsToFetch.slice(i, i + YOUTUBE_API_BATCH_SIZE));
        }

        for (const chunk of chunks) {
            debug.enrichment(`enrichSources: fetching batch (${chunk.length} videos)`);
            const batch = await fetchVideosBatch(chunk, apiKey);
            for (const video of batch) {
                fetchedMap.set(video.id, video);
            }
            debug.enrichment(`enrichSources: batch result — ${batch.length} found, ${chunk.length - batch.length} missing`);
        }

        // Persist to Firestore cache
        const unfindableIds = videoIdsToFetch.filter(id => !fetchedMap.has(id));
        await persistEnrichmentToCache(userId, channelId, fetchedMap, unfindableIds);

        // Add unfindable stubs to fetchedMap so mergeSources can mark them.
        // cachedVideos was captured before persist — stubs aren't there yet.
        for (const id of unfindableIds) {
            fetchedMap.set(id, {
                id, title: '', thumbnail: '', channelId: '', channelTitle: '',
                channelAvatar: '', publishedAt: '', notFoundInApi: true,
            });
        }
    }

    const result = mergeSources(sources, fetchedMap, cachedVideos);

    debug.enrichment('enrichSources: complete', {
        inputSources: sources.length,
        outputSources: result.length,
        fetched: fetchedMap.size,
    });

    return result;
}

// ── Firestore persistence ────────────────────────────────────────────────────

async function persistEnrichmentToCache(
    userId: string,
    channelId: string,
    fetchedMap: Map<string, VideoDetails>,
    unfindableIds: string[],
): Promise<void> {
    const batchWrites: Array<{ videoId: string; data: Record<string, unknown> }> = [];

    for (const video of fetchedMap.values()) {
        // Firestore rejects undefined values — JSON round-trip strips them
        const cleanData = JSON.parse(JSON.stringify(video)) as Record<string, unknown>;
        batchWrites.push({
            videoId: video.id,
            data: {
                ...cleanData,
                source: 'suggested_traffic',
                lastUpdated: Date.now(),
            },
        });
    }

    for (const id of unfindableIds) {
        batchWrites.push({
            videoId: id,
            data: {
                id,
                title: '',
                thumbnail: '',
                channelId: '',
                channelTitle: '',
                channelAvatar: '',
                publishedAt: '',
                source: 'suggested_traffic',
                notFoundInApi: true,
                lastUpdated: Date.now(),
            },
        });
    }

    if (unfindableIds.length > 0) {
        logger.warn('Enrichment: saving stubs for unfindable videos', {
            component: 'TrafficEnrichment',
            unfindableIds,
        });
    }

    debug.enrichment('persistEnrichmentToCache', {
        enriched: fetchedMap.size,
        unfindable: unfindableIds.length,
        totalWrites: batchWrites.length,
    });

    if (batchWrites.length > 0) {
        await VideoService.batchUpdateExternalVideos(userId, channelId, batchWrites);
    }
}

// ── useEnrichmentGate hook ───────────────────────────────────────────────────

interface UseEnrichmentGateProps {
    displayedSources: TrafficSource[];
    userId: string;
    channelId: string;
    trafficVideoId: string;
    activeVersion: number;
    apiKey: string;
    currentSnapshotId?: string | null;
    cachedVideos?: VideoDetails[];
    onDataRestored?: (newSources: TrafficSource[], newSnapshotId: string) => void;
    trafficData?: TrafficData | null;
}

export const useEnrichmentGate = ({
    displayedSources,
    userId,
    channelId,
    trafficVideoId,
    activeVersion,
    apiKey,
    currentSnapshotId,
    cachedVideos = [],
    onDataRestored,
    trafficData,
}: UseEnrichmentGateProps) => {
    const [isEnriching, setIsEnriching] = useState(false);
    const queryClient = useQueryClient();

    // Single source of truth — all detection via computeEnrichmentStats
    const stats = useMemo(
        () => computeEnrichmentStats(displayedSources, cachedVideos),
        [displayedSources, cachedVideos],
    );

    // Action: enrich + persist + update snapshot
    const runEnrichment = useCallback(async () => {
        if (!stats.needsEnrichment || !apiKey) return false;

        debug.enrichment('runEnrichment: triggered', {
            missing: stats.missingCount,
            unenriched: stats.unenrichedCount,
            snapshotId: currentSnapshotId,
        });

        setIsEnriching(true);
        try {
            // Load full snapshot data if available
            let sourcesToEnrich = displayedSources;
            let existingTotalRow: TrafficSource | undefined;

            if (currentSnapshotId && trafficData?.snapshots) {
                const snapshot = trafficData.snapshots.find((s: TrafficSnapshot) => s.id === currentSnapshotId);
                if (snapshot) {
                    const { loadSnapshotSources } = await import('../utils/snapshotLoader');
                    const { sources, totalRow } = await loadSnapshotSources(snapshot);
                    if (sources.length > 0) {
                        sourcesToEnrich = sources;
                        existingTotalRow = totalRow;
                        debug.enrichment('runEnrichment: loaded full snapshot', {
                            sources: sources.length,
                            hasTotalRow: !!totalRow,
                        });
                    }
                }
            }

            const updatedSources = await enrichSources(sourcesToEnrich, userId, channelId, apiKey, cachedVideos);

            // Invalidate external video cache so useExternalVideoLookup picks up enriched data
            queryClient.invalidateQueries({ queryKey: externalVideoQueryPrefix(userId, channelId) });

            // Regenerate CSV and update/create snapshot
            const csvContent = generateTrafficCsv(updatedSources, existingTotalRow);
            const csvFile = new File([csvContent], 'enriched_traffic_data.csv', { type: 'text/csv' });

            let snapshotId = currentSnapshotId;

            if (currentSnapshotId) {
                await TrafficSnapshotService.update(
                    userId, channelId, trafficVideoId, currentSnapshotId,
                    updatedSources, existingTotalRow, csvFile,
                );
                debug.enrichment('runEnrichment: snapshot updated', { snapshotId: currentSnapshotId });
            } else {
                snapshotId = await TrafficSnapshotService.create(
                    userId, channelId, trafficVideoId, activeVersion,
                    updatedSources, existingTotalRow, csvFile,
                );
                debug.enrichment('runEnrichment: snapshot created', { snapshotId });
            }

            if (onDataRestored && snapshotId) {
                onDataRestored(updatedSources, snapshotId);
            }
            return true;
        } catch (error: unknown) {
            logger.error('Enrichment failed', { component: 'TrafficEnrichment', error });
            return false;
        } finally {
            setIsEnriching(false);
        }
    }, [stats.needsEnrichment, stats.missingCount, stats.unenrichedCount, apiKey, userId, channelId, trafficVideoId, activeVersion, displayedSources, onDataRestored, cachedVideos, currentSnapshotId, trafficData, queryClient]);

    return {
        ...stats,
        runEnrichment,
        isEnriching,
    };
};
