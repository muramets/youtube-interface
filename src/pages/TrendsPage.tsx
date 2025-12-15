import React, { useState, useEffect, useMemo } from 'react';
import { useTrendStore } from '../stores/trendStore';
import { TimelineCanvas } from '../components/Trends/Timeline/TimelineCanvas';
import { TrendService } from '../services/trendService';
import { TrendsHeader } from '../components/Trends/Header/TrendsHeader';
import type { TrendVideo } from '../types/trends';

export const TrendsPage: React.FC = () => {
    const { channels, selectedChannelId, timelineConfig, setTimelineConfig } = useTrendStore();
    const activeChannel = selectedChannelId ? channels.find(c => c.id === selectedChannelId) : null;
    const [videos, setVideos] = useState<TrendVideo[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Reset state immediately when channel switches (Derived State pattern)
    // This prevents stale data from being passed to new TimelineCanvas instance
    const [prevChannelForReset, setPrevChannelForReset] = useState(selectedChannelId);
    if (selectedChannelId !== prevChannelForReset) {
        setPrevChannelForReset(selectedChannelId);
        setVideos([]);
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
    const hasLoadedOnceRef = React.useRef(false);
    const prevSelectedChannelRef = React.useRef(selectedChannelId);

    useEffect(() => {
        const loadVideos = async () => {
            // Only show skeleton on initial load or when switching between channels
            // Don't show skeleton when just toggling visibility on "All Channels" view
            const isChannelSwitch = prevSelectedChannelRef.current !== selectedChannelId;
            const isInitialLoad = !hasLoadedOnceRef.current;

            if (isInitialLoad || isChannelSwitch) {
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

    return (
        <div className="flex flex-col h-full bg-bg-primary">
            <TrendsHeader
                title={activeChannel ? activeChannel.title : 'All Channels'}
                videoCount={videos.length}
                channelCount={channels.length}
                showChannelCount={!selectedChannelId}
                timelineConfig={timelineConfig}
                setTimelineConfig={setTimelineConfig}
            />

            {/* Timeline Area (pass loaded videos) */}
            <TimelineCanvas
                key={selectedChannelId || 'global'}
                videos={videos}
                isLoading={isLoading || channels.length === 0}
            />
        </div>
    );
};
