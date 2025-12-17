import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTrendStore } from '../stores/trendStore';
import { TimelineCanvas } from '../components/Trends/Timeline/TimelineCanvas';
import { TrendService } from '../services/trendService';
import { TrendsHeader } from '../components/Trends/Header/TrendsHeader';
import type { TrendVideo } from '../types/trends';
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
    const { channels, selectedChannelId, timelineConfig, setTimelineConfig, trendsFilters, filterMode, setVideos, videos } = useTrendStore();
    const [isLoading, setIsLoading] = useState(true);

    // Reset state immediately when channel switches (Derived State pattern)
    // This prevents stale data from being passed to new TimelineCanvas instance
    const [prevChannelForReset, setPrevChannelForReset] = useState(selectedChannelId);
    if (selectedChannelId !== prevChannelForReset) {
        setPrevChannelForReset(selectedChannelId);
        setVideos([]); // Reset store videos
        setIsLoading(true);
    }

    // Computed visible channels (lifted from TimelineCanvas)
    const visibleChannels = useMemo(() => {
        if (selectedChannelId) {
            return channels.filter(c => c.id === selectedChannelId);
        }
        return channels.filter(c => c.isVisible);
    }, [channels, selectedChannelId]);

    // Load videos (lifted from TimelineCanvas)
    // Track if this is initial load vs channel visibility toggle
    const hasLoadedOnceRef = useRef(false);
    const prevSelectedChannelRef = useRef(selectedChannelId);

    useEffect(() => {
        const loadVideos = async () => {
            // Only show skeleton on initial load or when switching between channels
            // Don't show skeleton when just toggling visibility on "All Channels" view
            const isChannelSwitch = prevSelectedChannelRef.current !== selectedChannelId;
            const isInitialLoad = !hasLoadedOnceRef.current;

            // Show loading if:
            // 1. First load
            // 2. Switching channels
            // 3. We have 0 videos currently (prevents 0 -> N flicker during updates)
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

    // 1. Calculate Global Percentile Map (always based on full dataset)
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

    // 2. Calculate Global Stats (for 'Global' environment mode)
    const globalStats = useMemo(() => {
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

    // 3. Apply Filters
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
                    // Return true if video's group is NOT in the excluded list
                    return !excludedGroups.includes(videoGroup || '');
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
                availableMinDate={globalStats?.minDate}
                availableMaxDate={globalStats?.maxDate}
            />

            {/* Timeline Area (pass filtered videos) */}
            <TimelineCanvas
                key={selectedChannelId || 'all'}
                videos={filteredVideos}
                isLoading={isLoading || channels.length === 0}
                percentileMap={globalPercentileMap}
                forcedStats={filterMode === 'global' ? globalStats : undefined}
            />
        </div>
    );
};
