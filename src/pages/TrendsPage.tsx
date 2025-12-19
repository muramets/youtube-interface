import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTrendStore } from '../stores/trendStore';
import { TimelineCanvas } from '../components/Trends/Timeline/TimelineCanvas';
import { TrendService } from '../services/trendService';
import { TrendsHeader } from '../components/Trends/Header/TrendsHeader';
import type { TrendVideo } from '../types/trends';
import { applyNumericFilter } from '../utils/filterUtils';
import { useFrozenStats } from '../components/Trends/Timeline/hooks/useFrozenStats';

import { useAuth } from '../hooks/useAuth';
import { useChannelStore } from '../stores/channelStore';
import { useApiKey } from '../hooks/useApiKey';

export const TrendsPage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { apiKey } = useApiKey();
    const { channels, selectedChannelId, timelineConfig, setTimelineConfig, trendsFilters, filterMode, setVideos, videos, videoNicheAssignments, hiddenVideos } = useTrendStore();
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

        // Filter by Channel if selected
        if (selectedChannelId) {
            candidateVideos = candidateVideos.filter(v => v.channelId === selectedChannelId);
        }

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

                    // Handle UNASSIGNED special case
                    const hasUnassignedFilter = selectedIds.includes('UNASSIGNED');
                    const isUnassigned = assignedNicheIds.length === 0;

                    if (hasUnassignedFilter && isUnassigned) return true;

                    // Regular niche matching
                    const regularNicheIds = selectedIds.filter(id => id !== 'UNASSIGNED');
                    return regularNicheIds.some(id => assignedNicheIds.includes(id));
                }
                return true;
            });
        });
    }, [videos, trendsFilters, globalPercentileMap, hiddenVideos, videoNicheAssignments, selectedChannelId]);

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
    const activeNicheIds = useMemo(() => {
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        if (!nicheFilter) return [];
        const nicheIds = (nicheFilter.value as string[]) || [];
        // TRASH and UNASSIGNED are special modes, not real niche filters
        return nicheIds.filter(id => id !== 'TRASH' && id !== 'UNASSIGNED');
    }, [trendsFilters]);

    // Managed Stats Logic
    const { currentStats, frozenStats, shouldAutoFit, refreshStats, skipAutoFitRef } = useFrozenStats({
        allVideos,
        filteredVideos,
        channels,
        selectedChannelId,
        filterMode,
        activeNicheIds
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
                shouldAutoFit={shouldAutoFit}
                onRequestStatsRefresh={refreshStats}
                skipAutoFitRef={skipAutoFitRef}
            />
        </div>
    );
};
