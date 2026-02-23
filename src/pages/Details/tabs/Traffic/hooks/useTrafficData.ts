import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrafficService } from '../../../../../core/services/traffic';
import { useUIStore } from '../../../../../core/stores/uiStore';
import type { TrafficData, TrafficSource } from '../../../../../core/types/traffic';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';

interface UseTrafficDataProps {
    userId: string;
    channelId: string;
    video: VideoDetails;
}

// Export the hook state interface for use in other components/hooks
export interface TrafficHookState {
    trafficData: TrafficData | null;
    isLoading: boolean;
    isSaving: boolean;
    error: string | null;
    handleCsvUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<string | null>;
    handleDeleteSnapshot: (snapshotId: string) => Promise<void>;
    saveData: (newData: TrafficData) => Promise<void>;
    updateLocalData: (newData: TrafficData) => void;
    refetch: () => Promise<void>;
}

export const useTrafficData = ({ userId, channelId, video }: UseTrafficDataProps): TrafficHookState => {
    const [data, setData] = useState<TrafficData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useUIStore();

    // Expose refresh function
    const refetch = useCallback(async () => {
        if (!userId || !channelId || !video.id) return;
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
    }, [userId, channelId, video.id]);

    // Fetch on mount
    useEffect(() => {
        refetch();
    }, [refetch]);

    // ... (rest of actions)



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
            const effectiveVersion = video.activeVersion === 'draft' ? 1 : (video.activeVersion || 1);

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

            // 2. Refetch to get the updated sources and snapshots from Firestore
            // This is now clean as createVersionSnapshot handles updating the main sources
            const updatedData = await TrafficService.fetchTrafficData(userId, channelId, video.id);
            if (updatedData) {
                setData(updatedData);
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
    }, [userId, channelId, video.id, video.activeVersion, showToast]);

    // Action: Delete Snapshot
    const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
        if (!userId || !video.id) return;
        setIsSaving(true);
        try {
            const updated = await TrafficService.deleteSnapshot(userId, channelId, video.id, snapshotId);

            if (updated) {
                setData(updated);
            } else {
                // Fallback refetch if service didn't return data (shouldn't happen with updated service)
                await refetch();
            }

        } catch (err) {
            console.error('[useTrafficData] Snapshot deletion failed:', err);
            setError("Failed to delete snapshot");
        } finally {
            setIsSaving(false);
        }
    }, [userId, channelId, video.id, refetch]);

    // Action: Update Local Data (Optimistic / External)
    const updateLocalData = useCallback((newData: TrafficData) => {
        setData(newData);
    }, []);

    return useMemo(() => ({
        trafficData: data,
        isLoading,
        isSaving,
        error,
        handleCsvUpload,
        handleDeleteSnapshot,
        saveData,
        updateLocalData, // New exposed method
        refetch
    }), [data, isLoading, isSaving, error, handleCsvUpload, handleDeleteSnapshot, saveData, updateLocalData, refetch]);
};
