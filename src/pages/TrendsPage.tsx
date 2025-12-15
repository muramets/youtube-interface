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

    // Computed visible channels (lifted from TimelineCanvas)
    const visibleChannels = useMemo(() => {
        if (selectedChannelId) {
            return channels.filter(c => c.id === selectedChannelId);
        }
        return channels.filter(c => c.isVisible);
    }, [channels, selectedChannelId]);

    // Load videos (lifted from TimelineCanvas)
    useEffect(() => {
        const loadVideos = async () => {
            setIsLoading(true);
            const allVideos: TrendVideo[] = [];
            // Artificial delay for better UX (prevent flicker) + ensures skeleton shows
            // Only if we actually have channels to load
            const minLoadTime = visibleChannels.length > 0 ? 500 : 0;
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
        };
        loadVideos();
    }, [visibleChannels]);

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
