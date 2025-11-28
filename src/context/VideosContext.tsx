import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useChannel } from './ChannelContext';
import { useSettings } from './SettingsContext';
import { VideoService } from '../services/videoService';
import { type VideoDetails, fetchVideoDetails, extractVideoId, type HistoryItem, type CoverVersion } from '../utils/youtubeApi';

interface VideosContextType {
    videos: VideoDetails[];
    isLoading: boolean;
    addVideo: (url: string) => Promise<boolean>;
    addCustomVideo: (video: Omit<VideoDetails, 'id'>) => Promise<string | undefined>;
    updateVideo: (id: string, updates?: Partial<VideoDetails>) => Promise<boolean>;
    removeVideo: (id: string) => Promise<void>;
    moveVideo: (dragIndex: number, hoverIndex: number) => Promise<void>;
    fetchVideoHistory: (videoId: string) => Promise<CoverVersion[]>;
    saveVideoHistory: (videoId: string, historyItem: HistoryItem) => Promise<void>;
    deleteVideoHistoryItem: (videoId: string, historyId: string) => Promise<void>;
    cloneVideo: (originalVideo: VideoDetails, coverVersion: CoverVersion) => Promise<void>;
    isSyncing: boolean;
    manualSync: () => Promise<void>;
    syncVideo: (videoId: string) => Promise<void>;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    selectedChannel: string;
    setSelectedChannel: (channel: string) => void;
    homeSortBy: 'default' | 'views' | 'date';
    setHomeSortBy: (sort: 'default' | 'views' | 'date') => void;
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
    const {
        generalSettings,
        videoOrder,
        updateVideoOrder,
        cloneSettings,
        syncSettings
    } = useSettings();

    const [rawVideos, setRawVideos] = useState<VideoDetails[]>([]);
    const [videos, setVideos] = useState<VideoDetails[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedChannel, setSelectedChannel] = useState('All');
    const [homeSortBy, setHomeSortBy] = useState<'default' | 'views' | 'date'>('default');

    // Subscribe to Videos
    useEffect(() => {
        if (!user || !currentChannel) {
            setRawVideos([]);
            setIsLoading(false);
            return;
        }

        const unsubscribe = VideoService.subscribeToVideos(
            user.uid,
            currentChannel.id,
            (data) => {
                setRawVideos(data);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user, currentChannel]);

    // Sort Videos based on Order
    useEffect(() => {
        if (rawVideos.length === 0) {
            setVideos([]);
            return;
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

        setVideos([...remainingVideos, ...sortedVideos]);
    }, [rawVideos, videoOrder]);

    const uniqueChannels = React.useMemo(() => {
        const channels = new Set(videos.map(v => v.channelTitle).filter(Boolean));
        return Array.from(channels).sort();
    }, [videos]);

    // Actions
    const addVideo = async (url: string): Promise<boolean> => {
        if (!user || !currentChannel) return false;
        if (!generalSettings.apiKey) {
            alert('Please set your YouTube API Key in settings first.');
            return false;
        }

        const videoId = extractVideoId(url);
        if (!videoId) {
            alert('Invalid YouTube URL');
            return false;
        }

        if (videos.some(v => v.id === videoId)) {
            alert('Video already exists');
            return false;
        }

        const details = await fetchVideoDetails(videoId, generalSettings.apiKey);
        if (details) {
            const videoWithTimestamp: VideoDetails = {
                ...details,
                createdAt: Date.now()
            };

            await VideoService.addVideo(user.uid, currentChannel.id, videoWithTimestamp);

            // Prepend to order
            const newOrder = [details.id, ...videoOrder];
            await updateVideoOrder(newOrder);

            return true;
        } else {
            alert('Failed to fetch video details.');
            return false;
        }
    };

    const addCustomVideo = async (video: Omit<VideoDetails, 'id'>) => {
        if (!user || !currentChannel) return;
        const id = `custom-${Date.now()}`;
        const newVideo: VideoDetails = {
            ...video,
            id,
            isCustom: true,
            createdAt: Date.now()
        };

        await VideoService.addVideo(user.uid, currentChannel.id, newVideo);

        // Prepend to order
        const newOrder = [id, ...videoOrder];
        await updateVideoOrder(newOrder);

        return id;
    };

    const updateVideo = async (id: string, updates?: Partial<VideoDetails>): Promise<boolean> => {
        if (!user || !currentChannel) return false;

        // If it's a real video update requiring API fetch
        if (!id.startsWith('custom-') && !updates && generalSettings.apiKey) {
            const details = await fetchVideoDetails(id, generalSettings.apiKey);
            if (details) {
                await VideoService.updateVideo(user.uid, currentChannel.id, id, details);
                return true;
            }
            return false;
        }

        if (updates) {
            await VideoService.updateVideo(user.uid, currentChannel.id, id, updates);
            return true;
        }
        return false;
    };

    const removeVideo = async (id: string) => {
        if (!user || !currentChannel) return;
        await VideoService.deleteVideo(user.uid, currentChannel.id, id);

        // Update Order
        const newOrder = videoOrder.filter(vid => vid !== id);
        await updateVideoOrder(newOrder);
    };

    const moveVideo = async (dragIndex: number, hoverIndex: number) => {
        const dragVideo = videos[dragIndex];
        const newVideos = [...videos];
        newVideos.splice(dragIndex, 1);
        newVideos.splice(hoverIndex, 0, dragVideo);

        // Optimistic update handled by parent usually, but here we update order
        const newOrder = newVideos.map(v => v.id);
        await updateVideoOrder(newOrder);
    };

    const cloneVideo = async (originalVideo: VideoDetails, coverVersion: CoverVersion) => {
        if (!user || !currentChannel) return;
        try {
            const now = Date.now();
            const id = `clone-${now}-${Math.random().toString(36).substr(2, 9)}`;
            const expiresAt = now + (cloneSettings.cloneDurationSeconds * 1000);

            const newVideo: VideoDetails = {
                ...originalVideo,
                id,
                isCustom: true,
                isCloned: true,
                clonedFromId: originalVideo.id,
                createdAt: now,
                expiresAt,
                customImage: coverVersion?.url || originalVideo.customImage,
                customImageName: coverVersion?.originalName || originalVideo.customImageName,
                customImageVersion: coverVersion?.version || originalVideo.customImageVersion,
                coverHistory: originalVideo.coverHistory || []
            };

            await VideoService.addVideo(user.uid, currentChannel.id, newVideo);

            const newOrder = [id, ...videoOrder];
            await updateVideoOrder(newOrder);

        } catch (error) {
            console.error("Error cloning video:", error);
            alert("Failed to clone video.");
        }
    };

    // History wrappers
    const fetchVideoHistory = (videoId: string) => {
        if (!user || !currentChannel) return Promise.resolve([]);
        return VideoService.fetchVideoHistory(user.uid, currentChannel.id, videoId);
    };

    const saveVideoHistory = (videoId: string, historyItem: HistoryItem) => {
        if (!user || !currentChannel) return Promise.resolve();
        return VideoService.saveVideoHistory(user.uid, currentChannel.id, videoId, historyItem);
    };

    const deleteVideoHistoryItem = (videoId: string, historyId: string) => {
        if (!user || !currentChannel) return Promise.resolve();
        return VideoService.deleteVideoHistoryItem(user.uid, currentChannel.id, videoId, historyId);
    };

    // Sync Logic
    const syncVideoData = async (force: boolean = false) => {
        if (!user || !currentChannel || !generalSettings.apiKey || isSyncing) return;

        setIsSyncing(true);
        try {
            const now = Date.now();
            const videosToUpdate = videos.filter(v => {
                if (v.isCustom || v.isCloned) return false;
                if (force) return true;

                const lastUpdated = v.lastUpdated || 0;
                const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);
                return hoursSinceUpdate >= syncSettings.frequencyHours;
            });

            for (const video of videosToUpdate) {
                const details = await fetchVideoDetails(video.id, generalSettings.apiKey);
                if (details) {
                    await VideoService.updateVideo(user.uid, currentChannel.id, video.id, {
                        ...details,
                        lastUpdated: now
                    });
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            console.error("Sync failed:", error);
        } finally {
            setIsSyncing(false);
        }
    };

    const manualSync = () => syncVideoData(true);

    const syncVideo = async (videoId: string) => {
        if (!user || !currentChannel || !generalSettings.apiKey) return;
        const details = await fetchVideoDetails(videoId, generalSettings.apiKey);
        if (details) {
            await VideoService.updateVideo(user.uid, currentChannel.id, videoId, {
                ...details,
                lastUpdated: Date.now()
            });
        }
    };

    // Auto-Sync Effect
    useEffect(() => {
        if (syncSettings.autoSync) {
            const checkSync = () => syncVideoData(false);
            const timeoutId = setTimeout(checkSync, 5000);
            const intervalId = setInterval(checkSync, 60 * 60 * 1000);
            return () => {
                clearTimeout(timeoutId);
                clearInterval(intervalId);
            };
        }
    }, [syncSettings.autoSync, syncSettings.frequencyHours, videos.length]);

    // Auto-delete expired clones
    useEffect(() => {
        const checkExpiration = async () => {
            const now = Date.now();
            const expiredVideos = videos.filter(v => v.isCloned && v.expiresAt && v.expiresAt <= now);

            if (expiredVideos.length > 0) {
                for (const video of expiredVideos) {
                    await removeVideo(video.id);
                }
            }
        };

        const intervalId = setInterval(checkExpiration, 1000);
        return () => clearInterval(intervalId);
    }, [videos]);

    return (
        <VideosContext.Provider value={{
            videos,
            isLoading,
            addVideo,
            addCustomVideo,
            updateVideo,
            removeVideo,
            moveVideo,
            fetchVideoHistory,
            saveVideoHistory,
            deleteVideoHistoryItem,
            cloneVideo,
            isSyncing,
            manualSync,
            syncVideo,
            searchQuery,
            setSearchQuery,
            selectedChannel,
            setSelectedChannel,
            homeSortBy,
            setHomeSortBy,
            uniqueChannels
        }}>
            {children}
        </VideosContext.Provider>
    );
};
