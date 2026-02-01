import React, { useState, useEffect, useMemo } from 'react';
import { useTrendStore } from '../../core/stores/trendStore';
import { TimelineCanvas } from './Timeline/TimelineCanvas';
import { TrendsTable } from './Table/TrendsTable';
import { TrendsHeader } from './Header/TrendsHeader';
import { useFilteredVideos } from './hooks/useFilteredVideos';
import { useFrozenStats } from './Timeline/hooks/useFrozenStats';
import { useTrendVideos } from './hooks/useTrendVideos';

import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';

export const TrendsPage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { channels, selectedChannelId, timelineConfig, setTimelineConfig, trendsFilters, filterMode, videos, hiddenVideos, isLoadingChannels } = useTrendStore();
    const [isLoadingLocal, setIsLoadingLocal] = useState(true);
    const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');

    // Use extracted hook for video loading
    const { isLoading: isVideosLoading, allChannelsHidden } = useTrendVideos({
        userUid: user?.uid,
        currentChannelId: currentChannel?.id
    });

    // Unified loading state
    useEffect(() => {
        setIsLoadingLocal(isVideosLoading);
    }, [isVideosLoading]);

    // Derived loading state for UI
    const isLoading = isLoadingLocal;


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
                isLoading={isLoading || isLoadingChannels}
                availableMinDate={currentStats?.minDate}
                availableMaxDate={currentStats?.maxDate}
                currentViewMode={viewMode}
                onViewModeChange={setViewMode}
            />

            {viewMode === 'timeline' ? (
                <TimelineCanvas
                    key={selectedChannelId || 'all'}
                    videos={filteredVideos}
                    allVideos={allVideos}
                    isLoading={isLoading || isLoadingChannels}
                    percentileMap={globalPercentileMap}
                    frozenStats={frozenStats}
                    currentStats={currentStats}
                    shouldAutoFit={shouldAutoFit}
                    onRequestStatsRefresh={refreshStats}
                    skipAutoFitRef={skipAutoFitRef}
                    filterHash={filterHash}
                    allChannelsHidden={allChannelsHidden}
                />
            ) : (
                <TrendsTable
                    videos={filteredVideos}
                    channels={channels}
                    channelId={selectedChannelId || ''}
                    mode={selectedChannelId ? 'videos' : 'channels'}
                />
            )}
        </div>
    );
};
