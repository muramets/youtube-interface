import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTrendStore } from '../../stores/trendStore';
import { TimelineCanvas } from './Timeline/TimelineCanvas';
import { TrendService } from '../../services/trendService';
import { TrendsHeader } from './Header/TrendsHeader';
import type { TrendVideo } from '../../types/trends';
import { useFilteredVideos } from './hooks/useFilteredVideos';
import { useFrozenStats } from './Timeline/hooks/useFrozenStats';

import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { useApiKey } from '../../hooks/useApiKey';

export const TrendsPage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { apiKey } = useApiKey();
    const { channels, selectedChannelId, timelineConfig, setTimelineConfig, trendsFilters, filterMode, setVideos, videos, hiddenVideos } = useTrendStore();
    const [isLoading, setIsLoading] = useState(true);

    // Reset state when channel switches
    const prevChannelForReset = useRef(selectedChannelId);
    useEffect(() => {
        if (selectedChannelId !== prevChannelForReset.current) {
            prevChannelForReset.current = selectedChannelId;
            setVideos([]);
            setIsLoading(true);
        }
    }, [selectedChannelId, setVideos]);

    // Computed visible channels
    const visibleChannels = useMemo(() => {
        if (selectedChannelId) {
            return channels.filter(c => c.id === selectedChannelId);
        }
        return channels.filter(c => c.isVisible);
    }, [channels, selectedChannelId]);

    // Detect when on main page but all channels are hidden
    const allChannelsHidden = !selectedChannelId && channels.length > 0 && visibleChannels.length === 0;

    // Load videos for visible channels
    const hasLoadedOnceRef = useRef(false);
    const prevSelectedChannelRef = useRef(selectedChannelId);

    useEffect(() => {
        const loadVideos = async () => {
            if (!user?.uid || !currentChannel?.id) return;

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

                // 2. If empty, try Firestore (sync layer)
                if (channelVideos.length === 0) {
                    console.log(`[TrendsPage] Local cache empty for ${channel.title}, loading from Firestore...`);
                    channelVideos = await TrendService.getChannelVideosFromFirestore(user.uid, currentChannel.id, channel.id);
                }

                allVideos.push(...channelVideos.map(v => ({
                    ...v,
                    channelTitle: channel.title
                })));

                // 3. Check for staleness/completeness and background sync if needed
                const isStale = Date.now() - (channel.lastUpdated || 0) > 12 * 60 * 60 * 1000; // 12 hours
                const needsInitialSync = channel.lastUpdated === 0 || channelVideos.length === 0;

                if ((isStale || needsInitialSync) && apiKey) {
                    console.log(`[TrendsPage] Triggering background sync for ${channel.title}...`);
                    // We don't await this as it's background
                    TrendService.syncChannelVideos(user.uid, currentChannel.id, channel, apiKey).catch(console.error);
                }
            }
            allVideos.sort((a, b) => a.publishedAtTimestamp - b.publishedAtTimestamp);

            setVideos(allVideos);
            setIsLoading(false);
            hasLoadedOnceRef.current = true;
        };
        loadVideos();
    }, [visibleChannels, selectedChannelId, user?.uid, currentChannel?.id, apiKey]);


    // Calculate Global Percentile Map
    const globalPercentileMap = useMemo(() => {
        if (videos.length === 0) return new Map<string, string>();
        const sortedByViews = [...videos].sort((a, b) => b.viewCount - a.viewCount);
        const map = new Map<string, string>();
        sortedByViews.forEach((v, i) => {
            const percentile = (i / videos.length) * 100;
            let group: string;
            if (percentile <= 1) group = 'Top 1%';
            else if (percentile <= 5) group = 'Top 5%';
            else if (percentile <= 20) group = 'Top 20%';
            else if (percentile <= 80) group = 'Middle 60%';
            else group = 'Bottom 20%';
            map.set(v.id, group);
        });
        return map;
    }, [videos]);

    // Apply Filters using extracted hook
    const filteredVideos = useFilteredVideos({
        videos,
        trendsFilters,
        hiddenVideos,
        selectedChannelId,
        globalPercentileMap
    });

    // All videos without hidden (global context for the current channel/view)
    const allVideos = useMemo(() => {
        const hiddenIds = new Set(hiddenVideos.map(hv => hv.id));
        return videos.filter(v => {
            if (hiddenIds.has(v.id)) return false;
            // Crucial: Limit context to the currently selected channel!
            if (selectedChannelId && v.channelId !== selectedChannelId) return false;
            return true;
        });
    }, [videos, hiddenVideos, selectedChannelId]);

    // List of active niche IDs (excluding TRASH and UNASSIGNED)
    const { activeNicheIds, hasUnassignedFilter } = useMemo(() => {
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        if (!nicheFilter) return { activeNicheIds: [], hasUnassignedFilter: false };
        const nicheIds = (nicheFilter.value as string[]) || [];
        // TRASH and UNASSIGNED are special modes, not real niche filters
        return {
            activeNicheIds: nicheIds.filter(id => id !== 'TRASH' && id !== 'UNASSIGNED'),
            hasUnassignedFilter: nicheIds.includes('UNASSIGNED')
        };
    }, [trendsFilters]);

    // Generate Filter Hash for Smart Auto-Updates
    // This allows us to distinguish between "Filter/Niche Switch" (Auto-Update) 
    // and "Global Visibility Toggle" (Manual Update)
    // Generate Filter Hash for Smart Auto-Updates
    // This allows us to distinguish between "Filter/Niche Switch" (Auto-Update) 
    // and "Global Visibility Toggle" (Manual Update)
    const filterHash = useMemo(() => {
        const nicheKey = activeNicheIds.sort().join(',');
        const otherFiltersKey = trendsFilters
            .filter(f => f.type !== 'niche')
            .map(f => `${f.type}:${f.operator}:${f.value}`)
            .sort()
            .join('|');

        // Include selectedChannelId so switching channels triggers auto-fit
        // AND include hasUnassignedFilter so toggling it triggers a hash change (and thus auto-fit)
        return `${selectedChannelId || 'global'}:${nicheKey}:${hasUnassignedFilter ? 'unassigned' : ''}:${otherFiltersKey}`;
    }, [activeNicheIds, trendsFilters, selectedChannelId, hasUnassignedFilter]);

    // Managed Stats Logic
    const { currentStats, frozenStats, shouldAutoFit, refreshStats, skipAutoFitRef } = useFrozenStats({
        allVideos,
        filteredVideos,
        channels,
        selectedChannelId,
        filterMode,
        hasUnassignedFilter,
        filterHash
    });

    return (
        <div className="flex flex-col h-full bg-bg-primary">
            <TrendsHeader
                title={selectedChannelId ? channels.find(c => c.id === selectedChannelId)?.title || 'Unknown Channel' : 'All Channels'}
                videoCount={filteredVideos.length}
                channelCount={selectedChannelId ? 1 : channels.length}
                showChannelCount={!selectedChannelId}
                timelineConfig={timelineConfig}
                setTimelineConfig={setTimelineConfig}
                isLoading={isLoading || channels.length === 0}
                availableMinDate={currentStats?.minDate}
                availableMaxDate={currentStats?.maxDate}
            />

            <TimelineCanvas
                key={selectedChannelId || 'all'}
                videos={filteredVideos}
                allVideos={allVideos}
                isLoading={isLoading || channels.length === 0}
                percentileMap={globalPercentileMap}
                frozenStats={frozenStats}
                currentStats={currentStats}
                shouldAutoFit={shouldAutoFit}
                onRequestStatsRefresh={refreshStats}
                skipAutoFitRef={skipAutoFitRef}
                filterHash={filterHash}
                allChannelsHidden={allChannelsHidden}
            />
        </div>
    );
};
