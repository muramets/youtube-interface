import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTrendStore } from '../stores/trendStore';
import { TimelineCanvas } from '../components/Trends/Timeline/TimelineCanvas';
import { TrendService } from '../services/trendService';
import { TrendsHeader } from '../components/Trends/Header/TrendsHeader';
import type { TrendVideo } from '../types/trends';
import { applyNumericFilter } from '../utils/filterUtils';
import { useFrozenStats } from '../components/Trends/Timeline/hooks/useFrozenStats';

export const TrendsPage: React.FC = () => {
    const { channels, selectedChannelId, timelineConfig, setTimelineConfig, trendsFilters, filterMode, setVideos, videos, videoNicheAssignments, hiddenVideos } = useTrendStore();
    const [isLoading, setIsLoading] = useState(true);

    // Reset state immediately when channel switches (Derived State pattern)
    // This handles video data/loading resets. The hook handles stats resets.
    const [prevChannelForReset, setPrevChannelForReset] = useState(selectedChannelId);
    if (selectedChannelId !== prevChannelForReset) {
        setPrevChannelForReset(selectedChannelId);
        setVideos([]);
        setIsLoading(true);
    }

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
            const isChannelSwitch = prevSelectedChannelRef.current !== selectedChannelId;
            const isInitialLoad = !hasLoadedOnceRef.current;

            if (isInitialLoad || isChannelSwitch || videos.length === 0) {
                setIsLoading(true);
            }

            prevSelectedChannelRef.current = selectedChannelId;

            const allVideos: TrendVideo[] = [];
            const minLoadTime = (isInitialLoad || isChannelSwitch) && visibleChannels.length > 0 ? 500 : 0;
            const startStr = Date.now();

            for (const channel of visibleChannels) {
                const channelVideos = await TrendService.getChannelVideosFromCache(channel.id);
                allVideos.push(...channelVideos.map(v => ({
                    ...v,
                    channelTitle: channel.title
                })));
            }
            allVideos.sort((a, b) => a.publishedAtTimestamp - b.publishedAtTimestamp);

            const elapsed = Date.now() - startStr;
            if (elapsed < minLoadTime) {
                await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
            }

            setVideos(allVideos);
            setIsLoading(false);
            hasLoadedOnceRef.current = true;
        };
        loadVideos();
    }, [visibleChannels, selectedChannelId]);

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

    // Apply Filters
    const filteredVideos = useMemo(() => {
        // First check if we are in "Trash Mode"
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        const selectedNicheIds = (nicheFilter?.value as string[]) || [];
        const isTrashMode = selectedNicheIds.includes('TRASH');

        // Create Set of hidden IDs for fast lookup
        const hiddenIds = new Set(hiddenVideos.map(hv => hv.id));

        // Base pool of videos: Either Hidden videos OR Visible videos
        let candidateVideos = isTrashMode
            ? videos.filter(v => hiddenIds.has(v.id))
            : videos.filter(v => !hiddenIds.has(v.id));

        if (trendsFilters.length === 0 && !isTrashMode) return candidateVideos;

        return candidateVideos.filter(video => {
            return trendsFilters.every(filter => {
                if (filter.type === 'date') {
                    const [start, end] = filter.value;
                    return video.publishedAtTimestamp >= start && video.publishedAtTimestamp <= end;
                }
                if (filter.type === 'views') {
                    return applyNumericFilter(video.viewCount, filter.operator, filter.value);
                }
                if (filter.type === 'percentile') {
                    const videoGroup = globalPercentileMap.get(video.id);
                    const excludedGroups: string[] = filter.value;
                    return !excludedGroups.includes(videoGroup || '');
                }
                if (filter.type === 'niche') {
                    const selectedIds = filter.value as string[];

                    if (isTrashMode) return true; // Already filtered by candidateVideos

                    const assignments = videoNicheAssignments[video.id] || [];
                    const assignedNicheIds = assignments.length > 0
                        ? assignments.map(a => a.nicheId)
                        : (video.nicheId ? [video.nicheId] : []);
                    return selectedIds.some(id => assignedNicheIds.includes(id));
                }
                return true;
            });
        });
    }, [videos, trendsFilters, globalPercentileMap, hiddenVideos, videoNicheAssignments]);

    // Managed Stats Logic (Frozen/Effective Stats)
    const { currentStats, effectiveStats, refreshStats } = useFrozenStats({
        videos: filteredVideos, // Use filtered videos so stats reflect reality (Trash vs Normal)
        channels,
        selectedChannelId,
        filterMode
    });

    // Auto-refresh stats ONLY when hiddenVideos changes (to unfreeze layout immediately)
    // We use a ref to prevent running this when refreshStats identity changes (which happens on every video update)
    const prevHiddenVideosRef = useRef(hiddenVideos);
    useEffect(() => {
        if (prevHiddenVideosRef.current !== hiddenVideos) {
            prevHiddenVideosRef.current = hiddenVideos;
            refreshStats();
        }
    }, [hiddenVideos, refreshStats]);

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
                isLoading={isLoading || channels.length === 0}
                percentileMap={globalPercentileMap}
                forcedStats={effectiveStats}
                onRequestStatsRefresh={refreshStats}
            />
        </div>
    );
};
