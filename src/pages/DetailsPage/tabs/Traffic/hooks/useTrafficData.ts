import { useState, useEffect, useCallback } from 'react';
import { TrafficService } from '../../../../../core/services/TrafficService';
import type { TrafficData, TrafficSource, TrafficGroup, TrafficSnapshot } from '../../../../../core/types/traffic';
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
    const handleCsvUpload = useCallback(async (sources: TrafficSource[], totalRow?: TrafficSource) => {
        if (!userId) return;
        setIsSaving(true);
        try {
            const merged = TrafficService.mergeTrafficData(data, sources, totalRow);
            await TrafficService.saveTrafficData(userId, channelId, video.id, merged);
            setData(merged);
        } catch (err) {
            setError("Failed to process CSV");
        } finally {
            setIsSaving(false);
        }
    }, [data, userId, channelId, video.id]);

    return {
        trafficData: data,
        isLoading,
        isSaving,
        error,
        handleCsvUpload,
        saveData
    };
};
