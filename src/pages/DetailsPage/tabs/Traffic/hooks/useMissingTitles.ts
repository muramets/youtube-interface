import { useState, useMemo, useCallback } from 'react';
import type { TrafficSource, TrafficData, TrafficSnapshot } from '../../../../../core/types/traffic';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';
import { fetchVideosBatch } from '../../../../../core/utils/youtubeApi';
import { VideoService } from '../../../../../core/services/videoService';
import { TrafficSnapshotService } from '../../../../../core/services/traffic/TrafficSnapshotService';
import { generateTrafficCsv } from '../utils/csvGenerator';
import { assistantLogger } from '../../../../../core/utils/logger';

interface UseMissingTitlesProps {
    displayedSources: TrafficSource[];
    userId: string;
    channelId: string;
    trafficVideoId: string; // The ID of the video whose traffic we are viewing
    activeVersion: number;
    apiKey: string;
    currentSnapshotId?: string | null;
    cachedVideos?: VideoDetails[];
    onDataRestored?: (newSources: TrafficSource[], newSnapshotId: string) => void;
    trafficData?: TrafficData | null;
}

export const repairTrafficSources = async (
    sources: TrafficSource[],
    userId: string,
    channelId: string,
    apiKey: string,
    cachedVideos: VideoDetails[] = []
): Promise<TrafficSource[]> => {
    // 1. Identify missing (either title is missing OR channelId is missing)
    const missingSources = sources.filter(s => {
        if (!s.videoId) return false;
        const missingTitle = !s.sourceTitle || s.sourceTitle.trim() === '';
        const missingChannelId = !s.channelId;
        return missingTitle || missingChannelId;
    });

    if (missingSources.length === 0) {
        assistantLogger.debug('No sources need repair');
        return sources;
    }

    const uniqueVideoIds = Array.from(new Set(missingSources.map(s => s.videoId!)));
    assistantLogger.info('Identified videos to fetch/enrich', {
        missingCount: missingSources.length,
        uniqueCount: uniqueVideoIds.length
    });

    // 2. Filter out already cached videos (if we already have channelId in cache, we don't need to refetch)
    const cachedMap = new Map<string, VideoDetails>(cachedVideos.map(v => [v.id, v]));
    const videoIdsToFetch = uniqueVideoIds.filter((id: string) => {
        const cached = cachedMap.get(id);
        if (!cached) return true;
        // Even if in cache, if it's missing channelId there too, we should try to fetch (unlikely but safe)
        return !cached.channelId;
    });

    const fetchedMap = new Map<string, VideoDetails>();

    if (videoIdsToFetch.length > 0) {
        // 3. Batch Fetch from YouTube
        const chunks = [];
        for (let i = 0; i < videoIdsToFetch.length; i += 50) {
            chunks.push(videoIdsToFetch.slice(i, i + 50));
        }

        for (const chunk of chunks) {
            const batch = await fetchVideosBatch(chunk, apiKey);
            batch.forEach(v => fetchedMap.set(v.id, v));
        }

        // 4. Persist newly fetched to Firestore (Rich Metadata)
        const allFetchedVideos = Array.from(fetchedMap.values());
        const batchWrites = allFetchedVideos.map(video => {
            const cleanData = JSON.parse(JSON.stringify(video));
            return {
                videoId: video.id,
                data: {
                    ...cleanData,
                    lastUpdated: Date.now()
                }
            };
        });

        if (batchWrites.length > 0) {
            await VideoService.batchUpdateSuggestedVideos(userId, channelId, batchWrites);
        }
    }

    // 5. Update Sources (Merging results from YouTube and Cache)
    return sources.map(source => {
        if (source.videoId) {
            // Priority: newly fetched > cached
            const details = fetchedMap.get(source.videoId) || cachedMap.get(source.videoId);
            if (details) {
                // Merge available details back into source to make it "Smart"
                return {
                    ...source,
                    sourceTitle: details.title || source.sourceTitle,
                    channelId: details.channelId || source.channelId,
                    channelTitle: details.channelTitle || source.channelTitle,
                    thumbnail: details.thumbnail || source.thumbnail,
                    publishedAt: details.publishedAt || source.publishedAt
                };
            }
        }
        return source;
    });
};

export const useMissingTitles = ({
    displayedSources,
    userId,
    channelId,
    trafficVideoId,
    activeVersion,
    apiKey,
    currentSnapshotId,
    cachedVideos = [],
    onDataRestored,
    trafficData
}: UseMissingTitlesProps) => {
    const [isRestoring, setIsRestoring] = useState(false);

    // 1. Detect missing titles (Legacy Check for Dumb CSVs)
    const missingSources = useMemo(() => {
        return displayedSources.filter(s => s.videoId && (!s.sourceTitle || s.sourceTitle.trim() === ''));
    }, [displayedSources]);

    const missingCount = missingSources.length;

    // 2. Detect Unenriched Videos (Missing Channel Data for Smart Assistant)
    // Only counts videos that are NOT missing titles (since missing titles implies unenriched anyway)
    // and specifically lack channelId.
    const unenrichedSources = useMemo(() => {
        const cachedMap = new Map(cachedVideos.map(v => [v.id, v]));

        const results = displayedSources.filter(s => {
            if (!s.videoId) return false;
            // If title is missing, it's already caught by missingCount
            if (!s.sourceTitle || s.sourceTitle.trim() === '') return false;

            // It IS missing channelId?
            const hasSourceChannelId = !!s.channelId;
            // AND we don't have it in cache?
            const hasCachedChannelId = cachedMap.has(s.videoId) && !!cachedMap.get(s.videoId)?.channelId;

            // If we don't have it in source AND don't have it in cache = UNENRICHED
            return !hasSourceChannelId && !hasCachedChannelId;
        });

        assistantLogger.debug('Unenriched calculation', {
            displayedCount: displayedSources.length,
            unenrichedCount: results.length,
            firstUnenriched: results[0]
        });
        return results;
    }, [displayedSources, cachedVideos]);

    const unenrichedCount = unenrichedSources.length;


    // 3. Calculate Quota
    // Combined quota estimation if we ran repair on everything
    const estimatedQuota = Math.ceil((missingCount + unenrichedCount) / 50) * 7;

    // 4. Action: Fetch & Restore
    const fetchMissingTitles = useCallback(async () => {
        if ((missingCount === 0 && unenrichedCount === 0) || !apiKey) return;

        assistantLogger.debug('Starting repair process', {
            missingCount,
            unenrichedCount,
            currentSnapshotId
        });

        setIsRestoring(true);
        try {
            // CRITICAL FIX: Ensure we use the FULL dataset if a snapshot exists.
            let sourcesToRepair = displayedSources;

            if (currentSnapshotId && trafficData?.snapshots) {
                const snapshot = trafficData.snapshots.find((s: TrafficSnapshot) => s.id === currentSnapshotId);
                if (snapshot) {
                    const { loadSnapshotSources } = await import('../utils/snapshotLoader');
                    const { sources } = await loadSnapshotSources(snapshot);
                    if (sources.length > 0) {
                        sourcesToRepair = sources;
                        assistantLogger.info('Loaded full snapshot for repair', {
                            count: sources.length
                        });
                    }
                }
            }

            // Use the extracted logic - it handles both missing titles and enriching metadata
            // because `repairTrafficSources` fetches everything not in cache.
            const updatedSources = await repairTrafficSources(sourcesToRepair, userId, channelId, apiKey, cachedVideos);

            assistantLogger.info('Repaired sources successfully', {
                originalCount: sourcesToRepair.length,
                updatedCount: updatedSources.length,
                difference: updatedSources.length - sourcesToRepair.length
            });

            // D. Regenerate CSV & Update Snapshot
            const csvContent = generateTrafficCsv(updatedSources);
            const csvFile = new File([csvContent], "repaired_traffic_data.csv", { type: "text/csv" });

            let snapshotId = currentSnapshotId;

            if (currentSnapshotId) {
                // Update existing snapshot
                assistantLogger.info('Updating existing snapshot with repaired data', {
                    currentSnapshotId
                });
                await TrafficSnapshotService.update(
                    userId,
                    channelId,
                    trafficVideoId,
                    currentSnapshotId,
                    updatedSources,
                    undefined,
                    csvFile
                );
            } else {
                // Create new snapshot
                assistantLogger.info('Creating new snapshot with repaired data');
                snapshotId = await TrafficSnapshotService.create(
                    userId,
                    channelId,
                    trafficVideoId,
                    activeVersion,
                    updatedSources,
                    undefined,
                    csvFile
                );
            }

            if (onDataRestored && snapshotId) {
                onDataRestored(updatedSources, snapshotId);
            }

        } catch (error) {
            assistantLogger.error('Failed to restore/enrich traffic sources', {
                error
            });
        } finally {
            setIsRestoring(false);
        }

    }, [missingCount, unenrichedCount, apiKey, userId, channelId, trafficVideoId, activeVersion, displayedSources, onDataRestored, cachedVideos, currentSnapshotId]);

    return {
        missingCount,
        unenrichedCount,
        estimatedQuota,
        fetchMissingTitles,
        isRestoring
    };
};
