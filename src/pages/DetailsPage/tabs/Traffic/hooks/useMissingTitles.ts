import { useState, useMemo, useCallback } from 'react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';
import { fetchVideosBatch } from '../../../../../core/utils/youtubeApi';
import { VideoService } from '../../../../../core/services/videoService';
import { TrafficSnapshotService } from '../../../../../core/services/traffic/TrafficSnapshotService';
import { generateTrafficCsv } from '../utils/csvGenerator';

interface UseMissingTitlesProps {
    displayedSources: TrafficSource[];
    userId: string;
    channelId: string;
    trafficVideoId: string; // The ID of the video whose traffic we are viewing
    activeVersion: number;
    apiKey: string;
    cachedVideos?: VideoDetails[];
    onDataRestored?: (newSources: TrafficSource[], newSnapshotId: string) => void;
}

/**
 * Standalone function to fetch and repair missing titles.
 * Useful for pre-upload checks or bulk repairs outside the hook context.
 */
export const repairTrafficSources = async (
    sources: TrafficSource[],
    userId: string,
    channelId: string,
    apiKey: string,
    cachedVideos: VideoDetails[] = []
): Promise<TrafficSource[]> => {
    // 1. Identify missing
    const missingSources = sources.filter(s => s.videoId && (!s.sourceTitle || s.sourceTitle.trim() === ''));
    if (missingSources.length === 0) return sources;

    const uniqueVideoIds = Array.from(new Set(missingSources.map(s => s.videoId!)));

    // 2. Filter out already cached videos
    const cachedMap = new Map<string, VideoDetails>(cachedVideos.map(v => [v.id, v]));
    const videoIdsToFetch = uniqueVideoIds.filter((id: string) => !cachedMap.has(id));

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
            if (details && details.title) {
                return {
                    ...source,
                    sourceTitle: details.title
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
    cachedVideos = [],
    onDataRestored
}: UseMissingTitlesProps) => {
    const [isRestoring, setIsRestoring] = useState(false);

    // 1. Detect missing titles
    const missingSources = useMemo(() => {
        return displayedSources.filter(s => s.videoId && (!s.sourceTitle || s.sourceTitle.trim() === ''));
    }, [displayedSources]);

    const missingCount = missingSources.length;

    // 2. Calculate Quota
    const estimatedQuota = Math.ceil(missingCount / 50) * 7;

    // 3. Action: Fetch & Restore
    const fetchMissingTitles = useCallback(async () => {
        if (missingCount === 0 || !apiKey) return;

        setIsRestoring(true);
        try {
            // Use the extracted logic
            const updatedSources = await repairTrafficSources(displayedSources, userId, channelId, apiKey, cachedVideos);

            // D. Regenerate CSV & Update Snapshot
            const csvContent = generateTrafficCsv(updatedSources);
            const csvFile = new File([csvContent], "repaired_traffic_data.csv", { type: "text/csv" });

            const newSnapshotId = await TrafficSnapshotService.create(
                userId,
                channelId,
                trafficVideoId,
                activeVersion,
                updatedSources,
                undefined,
                csvFile
            );

            if (onDataRestored) {
                onDataRestored(updatedSources, newSnapshotId);
            }

        } catch (error) {
            console.error("Failed to restore missing titles", error);
        } finally {
            setIsRestoring(false);
        }

    }, [missingCount, apiKey, userId, channelId, trafficVideoId, activeVersion, displayedSources, onDataRestored]);

    return {
        missingCount,
        estimatedQuota,
        fetchMissingTitles,
        isRestoring
    };
};
