import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTrendStore } from '../stores/trendStore';
import { TimelineCanvas } from '../components/Trends/Timeline/TimelineCanvas';
import { TrendService } from '../services/trendService';
import { TrendsHeader } from '../components/Trends/Header/TrendsHeader';
import type { TrendVideo, TimelineStats } from '../types/trends';
import type { FilterOperator } from '../stores/filterStore';

// Helper function to apply numeric filter
const applyNumericFilter = (value: number, operator: FilterOperator, filterValue: any): boolean => {
    switch (operator) {
        case 'gte': return value >= filterValue;
        case 'lte': return value <= filterValue;
        case 'gt': return value > filterValue;
        case 'lt': return value < filterValue;
        case 'equals': return value === filterValue;
        case 'between': {
            const [min, max] = filterValue;
            return value >= min && value <= max;
        }
        default: return true;
    }
};

export const TrendsPage: React.FC = () => {
    const { channels, selectedChannelId, timelineConfig, setTimelineConfig, trendsFilters, filterMode, setVideos, videos, videoNicheAssignments } = useTrendStore();
    const [isLoading, setIsLoading] = useState(true);

    // === FROZEN STATS LOGIC ===
    // Stats are "frozen" and only update on explicit triggers:
    // - Initial page load
    // - Z key / revert (via onRequestStatsRefresh callback)
    // - Channel add/remove (not visibility toggle!)
    const frozenStatsRef = useRef<TimelineStats | undefined>(undefined);
    const [statsVersion, setStatsVersion] = useState(0);

    // Track channel IDs for detecting add/remove (not visibility changes)
    const channelIdsKey = useMemo(() => channels.map(c => c.id).sort().join(','), [channels]);
    const prevChannelIdsKeyRef = useRef(channelIdsKey);

    // Reset state immediately when channel switches (Derived State pattern)
    const [prevChannelForReset, setPrevChannelForReset] = useState(selectedChannelId);
    if (selectedChannelId !== prevChannelForReset) {
        setPrevChannelForReset(selectedChannelId);
        setVideos([]);
        setIsLoading(true);
        // Reset frozen stats on channel context switch
        frozenStatsRef.current = undefined;
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

    // Calculate current stats from visible videos (always fresh)
    const currentStats = useMemo((): TimelineStats | undefined => {
        if (videos.length === 0) return undefined;
        const viewCounts = videos.map(v => v.viewCount);
        const dates = videos.map(v => v.publishedAtTimestamp);
        const buffer = 1000 * 60 * 60 * 12; // 12h buffer
        return {
            minViews: Math.max(1, Math.min(...viewCounts)),
            maxViews: Math.max(1, Math.max(...viewCounts)),
            minDate: Math.min(...dates) - buffer,
            maxDate: Math.max(...dates) + buffer
        };
    }, [videos]);

    // Update frozen stats on:
    // 1. Initial load (frozenStatsRef is undefined)
    // 2. statsVersion change (Z key pressed)
    // 3. Channel list change (add/remove, not visibility)
    useEffect(() => {
        const channelListChanged = prevChannelIdsKeyRef.current !== channelIdsKey;
        prevChannelIdsKeyRef.current = channelIdsKey;

        // Strict Freeze: Only update if explicitly requested or context changes.
        // We do NOT update on visibility toggles (neither shrink nor expand).
        if (!frozenStatsRef.current || channelListChanged) {
            frozenStatsRef.current = currentStats;
        }
    }, [currentStats, statsVersion, channelIdsKey]);

    // Callback for TimelineCanvas to request stats refresh (on Z key)
    const handleStatsRefresh = useCallback(() => {
        frozenStatsRef.current = currentStats;
        setStatsVersion(v => v + 1);
    }, [currentStats]);

    // For global mode, use frozen stats. For filtered mode, use current stats.
    const effectiveStats = filterMode === 'global' ? frozenStatsRef.current : undefined;

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
        if (trendsFilters.length === 0) return videos;

        return videos.filter(video => {
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
                    const selectedNicheIds: string[] = filter.value;
                    const assignments = videoNicheAssignments[video.id] || [];
                    const assignedNicheIds = assignments.length > 0
                        ? assignments.map(a => a.nicheId)
                        : (video.nicheId ? [video.nicheId] : []);
                    return selectedNicheIds.some(id => assignedNicheIds.includes(id));
                }
                return true;
            });
        });
    }, [videos, trendsFilters, globalPercentileMap]);

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
                onRequestStatsRefresh={handleStatsRefresh}
            />
        </div>
    );
};
