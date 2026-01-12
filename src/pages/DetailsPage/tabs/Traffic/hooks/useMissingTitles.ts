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
    apiKey: string
): Promise<TrafficSource[]> => {
    // 1. Identify missing
    const missingSources = sources.filter(s => s.videoId && (!s.sourceTitle || s.sourceTitle.trim() === ''));
    if (missingSources.length === 0) return sources;

    const videoIds = missingSources.map(s => s.videoId!);

    // 2. Batch Fetch
    const chunks = [];
    for (let i = 0; i < videoIds.length; i += 50) {
        chunks.push(videoIds.slice(i, i + 50));
    }

    let allFetchedVideos: VideoDetails[] = [];
    for (const chunk of chunks) {
        const batch = await fetchVideosBatch(chunk, apiKey);
        allFetchedVideos = [...allFetchedVideos, ...batch];
    }

    // 3. Persist to Firestore (Rich Metadata)
    const batchWrites = allFetchedVideos.map(video => {
        // Firestore determines undefined as invalid. We must strip them or convert to null.
        // JSON stringify/parse is a robust way to strip undefined fields from the object.
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

    // 4. Update Sources
    const videoMap = new Map(allFetchedVideos.map(v => [v.id, v]));

    return sources.map(source => {
        if (source.videoId && videoMap.has(source.videoId)) {
            const details = videoMap.get(source.videoId)!;
            return {
                ...source,
                sourceTitle: details.title
            };
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
            const updatedSources = await repairTrafficSources(displayedSources, userId, channelId, apiKey);

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
