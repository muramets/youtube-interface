// =============================================================================
// useTrafficSourceData
//
// Firestore data hook for Traffic Source snapshots.
// Mirrors useTrafficData pattern: fetch on mount, expose upload/delete/refetch.
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrafficSourceService } from '../../../../../core/services/TrafficSourceService';
import { useUIStore } from '../../../../../core/stores/uiStore';
import type { TrafficSourceData, TrafficSourceMetric } from '../../../../../core/types/trafficSource';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';

interface UseTrafficSourceDataProps {
    userId: string;
    channelId: string;
    video: VideoDetails;
}

export interface TrafficSourceHookState {
    trafficSourceData: TrafficSourceData | null;
    isLoading: boolean;
    isSaving: boolean;
    error: string | null;
    handleCsvUpload: (
        metrics: TrafficSourceMetric[],
        totalRow: TrafficSourceMetric | undefined,
        file: File
    ) => Promise<string | null>;
    handleDeleteSnapshot: (snapshotId: string) => Promise<void>;
    updateLocalData: (newData: TrafficSourceData) => void;
    refetch: () => Promise<void>;
}

export const useTrafficSourceData = ({
    userId,
    channelId,
    video,
}: UseTrafficSourceDataProps): TrafficSourceHookState => {
    const [data, setData] = useState<TrafficSourceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useUIStore();

    // Fetch from Firestore
    const refetch = useCallback(async () => {
        if (!userId || !channelId || !video.id) return;
        setIsLoading(true);
        try {
            const fetched = await TrafficSourceService.fetch(userId, channelId, video.id);
            setData(fetched);
        } catch (err) {
            console.error('[useTrafficSourceData] Failed to load:', err);
            setError('Failed to load traffic source data');
        } finally {
            setIsLoading(false);
        }
    }, [userId, channelId, video.id]);

    // Fetch on mount
    useEffect(() => {
        refetch();
    }, [refetch]);

    // Upload new CSV
    const handleCsvUpload = useCallback(async (
        metrics: TrafficSourceMetric[],
        totalRow: TrafficSourceMetric | undefined,
        file: File
    ): Promise<string | null> => {
        if (!userId || !video.id) return null;
        setIsSaving(true);
        try {
            const snapshotId = await TrafficSourceService.createSnapshot(
                userId,
                channelId,
                video.id,
                metrics,
                totalRow,
                file,
                video.publishedAt
            );

            // Refetch to get updated data
            const updatedData = await TrafficSourceService.fetch(userId, channelId, video.id);
            if (updatedData) setData(updatedData);

            showToast('Traffic source snapshot uploaded', 'success');
            return snapshotId;
        } catch (err) {
            console.error('[useTrafficSourceData] CSV upload failed:', err);
            setError('Failed to process CSV');
            showToast('Failed to upload traffic source CSV', 'error');
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [userId, channelId, video.id, video.publishedAt, showToast]);

    // Delete snapshot
    const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
        if (!userId || !video.id) return;
        setIsSaving(true);
        try {
            const updated = await TrafficSourceService.deleteSnapshot(
                userId, channelId, video.id, snapshotId
            );
            if (updated) {
                setData(updated);
            } else {
                await refetch();
            }
        } catch (err) {
            console.error('[useTrafficSourceData] Delete failed:', err);
            setError('Failed to delete snapshot');
        } finally {
            setIsSaving(false);
        }
    }, [userId, channelId, video.id, refetch]);

    // Optimistic local update
    const updateLocalData = useCallback((newData: TrafficSourceData) => {
        setData(newData);
    }, []);

    return useMemo(() => ({
        trafficSourceData: data,
        isLoading,
        isSaving,
        error,
        handleCsvUpload,
        handleDeleteSnapshot,
        updateLocalData,
        refetch,
    }), [data, isLoading, isSaving, error, handleCsvUpload, handleDeleteSnapshot, updateLocalData, refetch]);
};
