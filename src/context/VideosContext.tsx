import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useChannel } from './ChannelContext';
import { useSettings } from './SettingsContext';
import { VideoService } from '../services/videoService';
import { type VideoDetails } from '../utils/youtubeApi';

interface VideosContextType {
    videos: VideoDetails[];
    isLoading: boolean;
    uniqueChannels: string[];
}

const VideosContext = createContext<VideosContextType | undefined>(undefined);

export const useVideos = () => {
    const context = useContext(VideosContext);
    if (!context) {
        throw new Error('useVideos must be used within a VideosProvider');
    }
    return context;
};

export const VideosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannel();
    const { videoOrder } = useSettings();

    const [rawVideos, setRawVideos] = useState<VideoDetails[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Subscribe to Videos
    useEffect(() => {
        if (!user) {
            setRawVideos([]);
            setIsLoading(false);
            return;
        }

        if (!currentChannel) {
            // Wait for channel to be loaded
            return;
        }

        const unsubscribe = VideoService.subscribeToVideos(
            user.uid,
            currentChannel.id,
            (data) => {
                console.log('VideosContext: subscribe callback', data.length);
                setRawVideos(data);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user, currentChannel]);

    // Sort Videos based on Order
    const videos = React.useMemo(() => {
        if (rawVideos.length === 0) {
            return [];
        }

        const videoMap = new Map(rawVideos.map(v => [v.id, v]));
        const sortedVideos: VideoDetails[] = [];
        const processedIds = new Set<string>();

        // 1. Add videos from the order list
        videoOrder.forEach(id => {
            const video = videoMap.get(id);
            if (video) {
                sortedVideos.push(video);
                processedIds.add(id);
            }
        });

        // 2. Add remaining videos (newly added or not in order list)
        const remainingVideos = rawVideos
            .filter(v => !processedIds.has(v.id))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        return [...remainingVideos, ...sortedVideos];
    }, [rawVideos, videoOrder]);

    const uniqueChannels = React.useMemo(() => {
        const channels = new Set(videos.map(v => v.channelTitle).filter(Boolean));
        return Array.from(channels).sort();
    }, [videos]);

    return (
        <VideosContext.Provider value={{
            videos,
            isLoading,
            uniqueChannels
        }}>
            {children}
        </VideosContext.Provider>
    );
};
