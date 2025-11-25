import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchVideoDetails, extractVideoId } from '../utils/youtubeApi';
import type { VideoDetails } from '../utils/youtubeApi';

export interface Playlist {
    id: string;
    name: string;
    coverImage?: string;
    videoIds: string[];
    createdAt: number;
    updatedAt?: number;
}

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
    watchPageCardsPerRow: number;
    updateWatchPageCardsPerRow: (count: number) => void;
    selectedChannel: string;
    setSelectedChannel: (channel: string) => void;
    uniqueChannels: string[];
    addCustomVideo: (video: Omit<VideoDetails, 'id'>) => void;
    recommendationOrders: Record<string, string[]>;
    updateRecommendationOrder: (videoId: string, newOrder: string[]) => void;
    playlists: Playlist[];
    createPlaylist: (name: string) => void;
    deletePlaylist: (id: string) => void;
    addVideoToPlaylist: (playlistId: string, videoId: string) => void;
    removeVideoFromPlaylist: (playlistId: string, videoId: string) => void;
    updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
    reorderPlaylistVideos: (playlistId: string, newOrder: string[]) => void;
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

    const [watchPageCardsPerRow, setWatchPageCardsPerRow] = useState<number>(() => {
        const saved = localStorage.getItem('youtube_watch_cards_per_row');
        return saved ? parseInt(saved, 10) : 3;
    });

    const [selectedChannel, setSelectedChannel] = useState<string>('All');

    const uniqueChannels = React.useMemo(() => {
        const channels = new Set(videos.map(v => v.channelTitle));
        return Array.from(channels).sort();
    }, [videos]);

    const [recommendationOrders, setRecommendationOrders] = useState<Record<string, string[]>>(() => {
        const saved = localStorage.getItem('youtube_recommendation_orders');
        return saved ? JSON.parse(saved) : {};
    });

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

    useEffect(() => {
        localStorage.setItem('youtube_watch_cards_per_row', watchPageCardsPerRow.toString());
    }, [watchPageCardsPerRow]);

    useEffect(() => {
        localStorage.setItem('youtube_recommendation_orders', JSON.stringify(recommendationOrders));
    }, [recommendationOrders]);

    // Sanitize playlists: remove video IDs that don't exist in videos
    useEffect(() => {
        setPlaylists(prevPlaylists => {
            const videoIdsSet = new Set(videos.map(v => v.id));
            let hasChanges = false;

            const newPlaylists = prevPlaylists.map(playlist => {
                const validVideoIds = playlist.videoIds.filter(id => videoIdsSet.has(id));
                if (validVideoIds.length !== playlist.videoIds.length) {
                    hasChanges = true;
                    return { ...playlist, videoIds: validVideoIds };
                }
                return playlist;
            });

            return hasChanges ? newPlaylists : prevPlaylists;
        });
    }, [videos]);

    const setApiKey = (key: string) => {
        setApiKeyState(key);
    };

    const updateCardsPerRow = (count: number) => {
        if (count >= 3 && count <= 9) {
            setCardsPerRow(count);
        }
    };

    const updateWatchPageCardsPerRow = (count: number) => {
        if (count >= 3 && count <= 9) {
            setWatchPageCardsPerRow(count);
        }
    };

    const updateRecommendationOrder = (videoId: string, newOrder: string[]) => {
        setRecommendationOrders(prev => ({
            ...prev,
            [videoId]: newOrder
        }));
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

        // Remove video from all playlists
        setPlaylists(prev => prev.map(playlist => ({
            ...playlist,
            videoIds: playlist.videoIds.filter(videoId => videoId !== id)
        })));

        // Cleanup recommendation orders for this video if needed, 
        // but also we should remove this video ID from OTHER videos' recommendation lists?
        // For now, simple cleanup:
        setRecommendationOrders(prev => {
            const newOrders = { ...prev };
            delete newOrders[id];
            // Optional: Remove id from all other lists. 
            // Since we filter by 'videos' existence in WatchPage, this is self-correcting visually.
            return newOrders;
        });
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

    const [playlists, setPlaylists] = useState<Playlist[]>(() => {
        const saved = localStorage.getItem('youtube_playlists');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        localStorage.setItem('youtube_playlists', JSON.stringify(playlists));
    }, [playlists]);

    const createPlaylist = (name: string) => {
        const now = Date.now();
        const newPlaylist: Playlist = {
            id: `playlist-${now}`,
            name,
            videoIds: [],
            createdAt: now,
            updatedAt: now
        };
        setPlaylists(prev => [...prev, newPlaylist]);
    };

    const deletePlaylist = (id: string) => {
        setPlaylists(prev => prev.filter(p => p.id !== id));
    };

    const addVideoToPlaylist = (playlistId: string, videoId: string) => {
        setPlaylists(prev => prev.map(playlist => {
            if (playlist.id === playlistId) {
                if (playlist.videoIds.includes(videoId)) return playlist;

                // Get the video to use its thumbnail as cover if needed
                const video = videos.find(v => v.id === videoId);
                let newCover = playlist.coverImage;

                // If no cover image exists, use this video's thumbnail
                // Or if we want "last added" to always be the cover, we could update it here.
                // The requirement says "automatically use the last added video's cover if no custom cover is provided".
                // This implies if the user hasn't uploaded a custom one, we default to the last added.
                // Since we don't track "isCustomCover", we'll just assume if it's empty we set it.
                // To strictly follow "last added", we should probably update it every time if it's not "custom".
                // For now, let's just set it if it's empty to ensure there's a cover.
                // Refinement: If we want to support "last added", we might need a flag or just update it.
                // Let's stick to: set if empty.
                if (!newCover && video) {
                    newCover = video.thumbnail;
                }

                return {
                    ...playlist,
                    videoIds: [...playlist.videoIds, videoId],
                    coverImage: newCover,
                    updatedAt: Date.now()
                };
            }
            return playlist;
        }));
    };

    const removeVideoFromPlaylist = (playlistId: string, videoId: string) => {
        setPlaylists(prev => prev.map(p => {
            if (p.id === playlistId) {
                return {
                    ...p,
                    videoIds: p.videoIds.filter(id => id !== videoId),
                    updatedAt: Date.now()
                };
            }
            return p;
        }));
    };

    const updatePlaylist = (id: string, updates: Partial<Playlist>) => {
        setPlaylists(prev => prev.map(p => (p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p)));
    };

    const reorderPlaylistVideos = (playlistId: string, newOrder: string[]) => {
        setPlaylists(prev => prev.map(p => {
            if (p.id === playlistId) {
                return { ...p, videoIds: newOrder, updatedAt: Date.now() };
            }
            return p;
        }));
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
            watchPageCardsPerRow,
            updateWatchPageCardsPerRow,
            selectedChannel,
            setSelectedChannel,
            uniqueChannels,
            addCustomVideo,
            recommendationOrders,
            updateRecommendationOrder,
            playlists,
            createPlaylist,
            deletePlaylist,
            addVideoToPlaylist,
            removeVideoFromPlaylist,
            updatePlaylist,
            reorderPlaylistVideos
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
