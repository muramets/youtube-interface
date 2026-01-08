import { useState, useEffect, useCallback } from 'react';
import { TrafficService } from '../../../../../core/services/TrafficService';
import { useUIStore } from '../../../../../core/stores/uiStore';
import type { TrafficData, TrafficSource } from '../../../../../core/types/traffic';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';

interface UseTrafficDataProps {
    userId: string;
    channelId: string;
    video: VideoDetails;
}

export const useTrafficData = ({ userId, channelId, video }: UseTrafficDataProps) => {
    const [data, setData] = useState<TrafficData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useUIStore();

    // Fetch on mount
    useEffect(() => {
        if (!userId || !channelId || !video.id) return;

        const load = async () => {
            setIsLoading(true);
            try {
                const fetched = await TrafficService.fetchTrafficData(userId, channelId, video.id);
                setData(fetched);
            } catch (err) {
                console.error("Failed to load traffic data", err);
                setError("Failed to load traffic data");
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [userId, channelId, video.id]);

    // Action: Save Data (General)
    const saveData = useCallback(async (newData: TrafficData) => {
        setIsSaving(true);
        try {
            await TrafficService.saveTrafficData(userId, channelId, video.id, newData);
            setData(newData);
        } catch (err) {
            console.error(err);
            setError("Failed to save changes");
        } finally {
            setIsSaving(false);
        }
    }, [userId, channelId, video.id]);

    // Action: Handle New CSV Upload
    const handleCsvUpload = useCallback(async (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => {
        if (!userId || !video.id) return null;
        setIsSaving(true);
        try {
            const effectiveVersion = video.activeVersion === 'draft' ? 0 : (video.activeVersion || 1);

            // 1. Create the snapshot (Hybrid Approach)
            // This will also update the main traffic document's snapshots array
            const newSnapshotId = await TrafficService.createVersionSnapshot(
                userId,
                channelId,
                video.id,
                effectiveVersion as number,
                sources,
                totalRow,
                file
            );

            // 2. Update the main traffic sources and total row
            // We do this separately to ensure the current view updates immediately
            const currentData = await TrafficService.fetchTrafficData(userId, channelId, video.id);
            if (currentData) {
                const merged = TrafficService.mergeTrafficData(currentData, sources, totalRow);
                await TrafficService.saveTrafficData(userId, channelId, video.id, merged);
                setData(merged);
            }

            return newSnapshotId;
        } catch (err) {
            console.error('[useTrafficData] CSV upload failed:', err);
            setError("Failed to process CSV");

            // Premium UX: Show clear error message
            showToast("Failed to process CSV file. Ensure the format is correct.", "error");
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [userId, channelId, video.id, video.activeVersion]);

    // Action: Delete Snapshot
    const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
        if (!userId || !video.id) return;
        setIsSaving(true);
        try {
            await TrafficService.deleteSnapshot(userId, channelId, video.id, snapshotId);

            // Optimistically update local state
            const updated = await TrafficService.fetchTrafficData(userId, channelId, video.id);
            setData(updated);
        } catch (err) {
            console.error('[useTrafficData] Snapshot deletion failed:', err);
            setError("Failed to delete snapshot");
        } finally {
            setIsSaving(false);
        }
    }, [userId, channelId, video.id]);

    return {
        trafficData: data,
        isLoading,
        isSaving,
        error,
        handleCsvUpload,
        handleDeleteSnapshot,
        saveData
    };
};
