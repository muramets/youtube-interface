import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchVideoDetails, extractVideoId } from '../utils/youtubeApi';
import type { VideoDetails } from '../utils/youtubeApi';

interface VideoContextType {
    videos: VideoDetails[];
    apiKey: string;
    setApiKey: (key: string) => void;
    addVideo: (url: string) => Promise<boolean>;
    removeVideo: (id: string) => void;
    updateVideo: (id: string, customUpdates?: Partial<VideoDetails>) => Promise<boolean>;
    moveVideo: (dragIndex: number, hoverIndex: number) => void;
    cardsPerRow: number;
    updateCardsPerRow: (count: number) => void;
    selectedChannel: string;
    setSelectedChannel: (channel: string) => void;
    uniqueChannels: string[];
    addCustomVideo: (video: Omit<VideoDetails, 'id'>) => void;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

export const VideoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [apiKey, setApiKeyState] = useState<string>(() => {
        return localStorage.getItem('youtube_api_key') || '';
    });

    const [videos, setVideos] = useState<VideoDetails[]>(() => {
        const savedVideos = localStorage.getItem('youtube_videos');
        return savedVideos ? JSON.parse(savedVideos) : [];
    });

    const [cardsPerRow, setCardsPerRow] = useState<number>(() => {
        const saved = localStorage.getItem('youtube_cards_per_row');
        return saved ? parseInt(saved, 10) : 3;
    });

    const [selectedChannel, setSelectedChannel] = useState<string>('All');

    const uniqueChannels = React.useMemo(() => {
        const channels = new Set(videos.map(v => v.channelTitle));
        return Array.from(channels).sort();
    }, [videos]);

    useEffect(() => {
        localStorage.setItem('youtube_api_key', apiKey);
    }, [apiKey]);

    useEffect(() => {
        try {
            localStorage.setItem('youtube_videos', JSON.stringify(videos));
        } catch (error) {
            console.error('Failed to save videos to localStorage:', error);
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                alert('Storage limit exceeded. Unable to save new video. Please remove some custom videos or use smaller images.');
            }
        }
    }, [videos]);

    useEffect(() => {
        localStorage.setItem('youtube_cards_per_row', cardsPerRow.toString());
    }, [cardsPerRow]);

    const setApiKey = (key: string) => {
        setApiKeyState(key);
    };

    const updateCardsPerRow = (count: number) => {
        if (count >= 3 && count <= 9) {
            setCardsPerRow(count);
        }
    };

    const addVideo = async (url: string): Promise<boolean> => {
        if (!apiKey) {
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

        const details = await fetchVideoDetails(videoId, apiKey);
        if (details) {
            setVideos(prev => [...prev, details]);
            return true;
        } else {
            alert('Failed to fetch video details. Check your API key or the URL.');
            return false;
        }
    };

    const removeVideo = (id: string) => {
        setVideos(prev => prev.filter(v => v.id !== id));
    };

    const addCustomVideo = (video: Omit<VideoDetails, 'id'>) => {
        const newVideo: VideoDetails = {
            ...video,
            id: `custom-${Date.now()}`,
            isCustom: true
        };
        setVideos(prev => [...prev, newVideo]);
    };

    const updateVideo = async (id: string, customUpdates?: Partial<VideoDetails>): Promise<boolean> => {
        if (id.startsWith('custom-')) {
            if (customUpdates) {
                setVideos(prev => prev.map(v => (v.id === id ? { ...v, ...customUpdates } : v)));
                return true;
            }
            return false;
        }

        if (!apiKey) return false;
        const details = await fetchVideoDetails(id, apiKey);
        if (details) {
            setVideos(prev => prev.map(v => (v.id === id ? details : v)));
            return true;
        }
        return false;
    };

    const moveVideo = (dragIndex: number, hoverIndex: number) => {
        const dragVideo = videos[dragIndex];
        const newVideos = [...videos];
        newVideos.splice(dragIndex, 1);
        newVideos.splice(hoverIndex, 0, dragVideo);
        setVideos(newVideos);
    };

    return (
        <VideoContext.Provider value={{
            videos,
            apiKey,
            setApiKey,
            addVideo,
            removeVideo,
            updateVideo,
            moveVideo,
            cardsPerRow,
            updateCardsPerRow,
            selectedChannel,
            setSelectedChannel,
            uniqueChannels,
            addCustomVideo
        }}>
            {children}
        </VideoContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useVideo = () => {
    const context = useContext(VideoContext);
    if (context === undefined) {
        throw new Error('useVideo must be used within a VideoProvider');
    }
    return context;
};
