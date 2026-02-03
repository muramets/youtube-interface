import { useState, useRef, useEffect, useMemo } from 'react';
import { TrendService } from '../../../core/services/trendService';
import type { TrendVideo } from '../../../core/types/trends';
import { useTrendStore } from '../../../core/stores/trendStore';

interface UseTrendVideosProps {
    userUid?: string;
    currentChannelId?: string;
}

export const useTrendVideos = ({ userUid, currentChannelId }: UseTrendVideosProps) => {
    const { channels, selectedChannelId, setVideos, videos } = useTrendStore();
    const [isLoading, setIsLoading] = useState(true);

    // Reset state when channel switches is now handled by store (setSelectedChannelId clears videos)
    // Loading state is handled by the data fetching effect below

    // Computed visible channels
    const visibleChannels = useMemo(() => {
        if (selectedChannelId) {
            return channels.filter(c => c.id === selectedChannelId);
        }
        return channels.filter(c => c.isVisible);
    }, [channels, selectedChannelId]);

    // Load videos for visible channels
    const hasLoadedOnceRef = useRef(false);
    const prevSelectedChannelRef = useRef(selectedChannelId);

    useEffect(() => {
        const loadVideos = async () => {
            if (!userUid || !currentChannelId) return;

            const isChannelSwitch = prevSelectedChannelRef.current !== selectedChannelId;
            const isInitialLoad = !hasLoadedOnceRef.current;

            if (isInitialLoad || isChannelSwitch || videos.length === 0) {
                setIsLoading(true);
            }

            prevSelectedChannelRef.current = selectedChannelId;

            const allVideos: TrendVideo[] = [];

            for (const channel of visibleChannels) {
                // 1. Try local cache
                let channelVideos = await TrendService.getChannelVideosFromCache(channel.id);

                // Robust Staleness Check:
                // We track when WE last fetched fresh data for this channel via localStorage.
                // If the channel was updated on the server (by Cloud Sync) AFTER our last fetch,
                // our cache is stale regardless of how much time passed.
                const storageKey = `trend_last_fetch_${channel.id}`;
                const lastFetchTime = parseInt(localStorage.getItem(storageKey) || '0');
                const serverUpdatedTime = channel.lastUpdated || 0;

                const isStale = serverUpdatedTime > lastFetchTime;

                // 2. If empty OR Stale, try Firestore (sync layer)
                if (channelVideos.length === 0 || isStale) {
                    if (isStale) {
                        console.log(`[TrendsPage] Cache Stale for ${channel.title} (Server: ${new Date(serverUpdatedTime).toLocaleTimeString()} > Local: ${new Date(lastFetchTime).toLocaleTimeString()}). Fetching fresh data.`);
                    }
                    try {
                        channelVideos = await TrendService.getChannelVideosFromFirestore(userUid, currentChannelId, channel.id);
                        // On success, mark that we have the latest version
                        localStorage.setItem(storageKey, Date.now().toString());
                    } catch (err) {
                        console.error(`[TrendsPage] Error fetching Firestore for ${channel.title}:`, err);
                    }
                }

                allVideos.push(...channelVideos.map(v => ({
                    ...v,
                    channelTitle: channel.title
                })));
            }
            allVideos.sort((a, b) => a.publishedAtTimestamp - b.publishedAtTimestamp);

            setVideos(allVideos);
            setIsLoading(false);
            hasLoadedOnceRef.current = true;
        };
        loadVideos();
    }, [visibleChannels, selectedChannelId, userUid, currentChannelId, setVideos, videos.length]);

    // Detect when on main page but all channels are hidden
    const allChannelsHidden = !selectedChannelId && channels.length > 0 && visibleChannels.length === 0;

    return {
        isLoading,
        visibleChannels,
        allChannelsHidden
    };
};
