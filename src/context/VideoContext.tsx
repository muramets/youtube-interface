import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchVideoDetails, extractVideoId } from '../utils/youtubeApi';
import type { VideoDetails } from '../utils/youtubeApi';
import { useAuth } from './AuthContext';
import { useChannel } from './ChannelContext';
import { db } from '../firebase';
import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    updateDoc,
    onSnapshot,
    query,
    orderBy
} from 'firebase/firestore';

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
    selectedChannel: string;
    setSelectedChannel: (channel: string) => void;
    uniqueChannels: string[];
    addCustomVideo: (video: Omit<VideoDetails, 'id'>) => Promise<string | undefined>;
    recommendationOrders: Record<string, string[]>;
    updateRecommendationOrder: (videoId: string, newOrder: string[]) => void;
    playlists: Playlist[];
    createPlaylist: (name: string) => void;
    deletePlaylist: (id: string) => void;
    addVideoToPlaylist: (playlistId: string, videoId: string) => void;
    removeVideoFromPlaylist: (playlistId: string, videoId: string) => void;
    updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
    reorderPlaylistVideos: (playlistId: string, newOrder: string[]) => void;
    reorderPlaylists: (newPlaylists: Playlist[]) => void;
    hiddenPlaylistIds: string[];
    togglePlaylistVisibility: (playlistId: string) => void;
    clearHiddenPlaylists: () => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    homeSortBy: 'default' | 'views' | 'date';
    setHomeSortBy: (sort: 'default' | 'views' | 'date') => void;
    syncSettings: { autoSync: boolean; frequencyHours: number };
    updateSyncSettings: (settings: { autoSync: boolean; frequencyHours: number }) => void;
    isSyncing: boolean;
    manualSync: () => Promise<void>;
    syncSingleVideo: (videoId: string) => Promise<void>;
    cloneSettings: { cloneDurationSeconds: number };
    updateCloneSettings: (settings: { cloneDurationSeconds: number }) => void;
    cloneVideo: (originalVideo: VideoDetails, coverVersion: any) => Promise<void>;
    fetchVideoHistory: (videoId: string) => Promise<any[]>;
    saveVideoHistory: (videoId: string, historyItem: any) => Promise<void>;
    deleteVideoHistoryItem: (videoId: string, historyId: string) => Promise<void>;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

export const VideoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannel();

    // API Key (Local Storage - Global)
    const [apiKey, setApiKeyState] = useState<string>(() => {
        return localStorage.getItem('youtube_api_key') || '';
    });

    useEffect(() => {
        localStorage.setItem('youtube_api_key', apiKey);
    }, [apiKey]);

    const setApiKey = (key: string) => {
        setApiKeyState(key);
    };

    // Videos (Firestore)
    const [videos, setVideos] = useState<VideoDetails[]>([]);
    const [rawVideos, setRawVideos] = useState<VideoDetails[]>([]);
    const [videoOrder, setVideoOrder] = useState<string[]>([]);

    // Fetch Raw Videos
    useEffect(() => {
        if (!user || !currentChannel) {
            setRawVideos([]);
            return;
        }

        const videosRef = collection(db, `users/${user.uid}/channels/${currentChannel.id}/videos`);
        const unsubscribe = onSnapshot(videosRef, (snapshot) => {
            const loadedVideos: VideoDetails[] = [];
            snapshot.forEach((doc) => {
                loadedVideos.push(doc.data() as VideoDetails);
            });
            setRawVideos(loadedVideos);
        });

        return () => unsubscribe();
    }, [user, currentChannel]);

    // Fetch Video Order
    useEffect(() => {
        if (!user || !currentChannel) {
            setVideoOrder([]);
            return;
        }

        const orderRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/videoOrder`);
        const unsubscribe = onSnapshot(orderRef, (doc) => {
            if (doc.exists()) {
                setVideoOrder(doc.data().order || []);
            } else {
                setVideoOrder([]);
            }
        });

        return () => unsubscribe();
    }, [user, currentChannel]);

    // Combine and Sort Videos
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
        // Sort them by createdAt desc (newest first)
        const remainingVideos = rawVideos
            .filter(v => !processedIds.has(v.id))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Prepend remaining videos (so new ones appear at top)
        setVideos([...remainingVideos, ...sortedVideos]);

    }, [rawVideos, videoOrder]);

    // Playlists (Firestore)
    const [playlists, setPlaylists] = useState<Playlist[]>([]);

    useEffect(() => {
        if (!user || !currentChannel) {
            setPlaylists([]);
            return;
        }

        const playlistsRef = collection(db, `users/${user.uid}/channels/${currentChannel.id}/playlists`);
        const q = query(playlistsRef, orderBy('createdAt'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedPlaylists: Playlist[] = [];
            snapshot.forEach((doc) => {
                loadedPlaylists.push(doc.data() as Playlist);
            });
            setPlaylists(loadedPlaylists);
        });

        return () => unsubscribe();
    }, [user, currentChannel]);

    // Cards Per Row (Local Storage - Per Channel?)
    // Let's keep it global for simplicity, or per channel if we want.
    // User said "settings... preferences: { cardsPerRow }" in plan.
    // Let's try to use Firestore if we can, but fallback to local.
    const [cardsPerRow, setCardsPerRow] = useState<number>(3);

    // Load settings from Firestore
    useEffect(() => {
        if (!user || !currentChannel) return;
        const settingsRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/general`);
        const unsubscribe = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                if (data.cardsPerRow) setCardsPerRow(data.cardsPerRow);
                if (data.hiddenPlaylistIds) setHiddenPlaylistIds(data.hiddenPlaylistIds);
            } else {
                setCardsPerRow(3);
                setHiddenPlaylistIds([]);
            }
        });
        return () => unsubscribe();
    }, [user, currentChannel]);

    const updateCardsPerRow = async (count: number) => {
        if (count >= 3 && count <= 9) {
            setCardsPerRow(count); // Optimistic
            if (user && currentChannel) {
                const settingsRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/general`);
                await setDoc(settingsRef, { cardsPerRow: count }, { merge: true });
            }
        }
    };

    // Hidden Playlists
    const [hiddenPlaylistIds, setHiddenPlaylistIds] = useState<string[]>([]);

    const togglePlaylistVisibility = async (playlistId: string) => {
        const newHidden = hiddenPlaylistIds.includes(playlistId)
            ? hiddenPlaylistIds.filter(id => id !== playlistId)
            : [...hiddenPlaylistIds, playlistId];

        setHiddenPlaylistIds(newHidden); // Optimistic

        if (user && currentChannel) {
            const settingsRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/general`);
            await setDoc(settingsRef, { hiddenPlaylistIds: newHidden }, { merge: true });
        }
    };

    const clearHiddenPlaylists = async () => {
        setHiddenPlaylistIds([]); // Optimistic

        if (user && currentChannel) {
            const settingsRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/general`);
            await setDoc(settingsRef, { hiddenPlaylistIds: [] }, { merge: true });
        }
    };

    // Selected Channel (Filter for Sidebar) - This is purely UI state, not the "Current Channel" context.
    // This is for filtering videos by channel name in the grid.
    const [selectedChannel, setSelectedChannel] = useState<string>('All');

    const uniqueChannels = React.useMemo(() => {
        const channels = new Set(videos.map(v => {
            if (v.isCustom && currentChannel) {
                return currentChannel.name;
            }
            return v.channelTitle;
        }));
        return Array.from(channels).sort();
    }, [videos, currentChannel]);

    // Recommendation Orders (Local Storage - Per Channel Key)
    const [recommendationOrders, setRecommendationOrders] = useState<Record<string, string[]>>({});

    useEffect(() => {
        if (currentChannel) {
            const saved = localStorage.getItem(`youtube_recommendation_orders_${currentChannel.id}`);
            setRecommendationOrders(saved ? JSON.parse(saved) : {});
        } else {
            setRecommendationOrders({});
        }
    }, [currentChannel]);

    const updateRecommendationOrder = (videoId: string, newOrder: string[]) => {
        setRecommendationOrders(prev => {
            const next = { ...prev, [videoId]: newOrder };
            if (currentChannel) {
                localStorage.setItem(`youtube_recommendation_orders_${currentChannel.id}`, JSON.stringify(next));
            }
            return next;
        });
    };

    // Actions

    const addVideo = async (url: string): Promise<boolean> => {
        if (!apiKey) {
            alert('Please set your YouTube API Key in settings first.');
            return false;
        }
        if (!user || !currentChannel) {
            alert('Please sign in and select a channel.');
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
            const videoWithTimestamp: VideoDetails = {
                ...details,
                createdAt: Date.now()
            };

            // 1. Save Video
            const videoRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/videos/${details.id}`);
            await setDoc(videoRef, videoWithTimestamp);

            // 2. Update Order (Prepend)
            const orderRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/videoOrder`);
            // We need to get current order first to be safe, but we have it in state 'videoOrder'.
            // However, state might be slightly stale vs DB. Best to use arrayUnion if we could prepend, 
            // but Firestore arrayUnion appends.
            // So we just write the new list based on state + new ID.
            // Actually, we should put it at the BEGINNING.
            // If we have 'remainingVideos' logic, they appear at top anyway.
            // But let's explicitly add it to the order list at index 0 to persist that position.
            const newOrder = [details.id, ...videoOrder];
            await setDoc(orderRef, { order: newOrder }, { merge: true });

            return true;
        } else {
            alert('Failed to fetch video details. Check your API key or the URL.');
            return false;
        }
    };

    const removeVideo = async (id: string) => {
        if (!user || !currentChannel) return;

        // 1. Delete History Subcollection
        const historyRef = collection(db, `users/${user.uid}/channels/${currentChannel.id}/videos/${id}/history`);
        const historySnapshot = await import('firebase/firestore').then(mod => mod.getDocs(historyRef));
        const deleteHistoryPromises = historySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deleteHistoryPromises);

        // 2. Delete from videos collection
        await deleteDoc(doc(db, `users/${user.uid}/channels/${currentChannel.id}/videos/${id}`));

        // Update Order
        const orderRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/videoOrder`);
        const newOrder = videoOrder.filter(videoId => videoId !== id);
        await setDoc(orderRef, { order: newOrder }, { merge: true });

        // Remove from all playlists
        // We need to iterate playlists and update them.
        // This is a bit heavy, but fine for now.
        playlists.forEach(async (playlist) => {
            if (playlist.videoIds.includes(id)) {
                const newVideoIds = playlist.videoIds.filter(vid => vid !== id);
                const playlistRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/playlists/${playlist.id}`);
                await updateDoc(playlistRef, { videoIds: newVideoIds, updatedAt: Date.now() });
            }
        });
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

        // 1. Save Video
        const videoRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/videos/${id}`);
        await setDoc(videoRef, newVideo);

        // 2. Update Order (Prepend)
        const orderRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/videoOrder`);
        const newOrder = [id, ...videoOrder];
        await setDoc(orderRef, { order: newOrder }, { merge: true });

        return id;
    };

    const updateVideo = async (id: string, customUpdates?: Partial<VideoDetails>): Promise<boolean> => {
        if (!user || !currentChannel) return false;

        if (id.startsWith('custom-')) {
            if (customUpdates) {
                const videoRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/videos/${id}`);
                await updateDoc(videoRef, customUpdates);
                return true;
            }
            return false;
        }

        if (!apiKey) return false;

        if (customUpdates) {
            const videoRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/videos/${id}`);
            await setDoc(videoRef, customUpdates, { merge: true });
            return true;
        }

        const details = await fetchVideoDetails(id, apiKey);
        if (details) {
            const videoRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/videos/${id}`);
            await setDoc(videoRef, details, { merge: true }); // Use merge here too just in case
            return true;
        }
        return false;
    };

    const moveVideo = async (dragIndex: number, hoverIndex: number) => {
        // Optimistic update
        const dragVideo = videos[dragIndex];
        const newVideos = [...videos];
        newVideos.splice(dragIndex, 1);
        newVideos.splice(hoverIndex, 0, dragVideo);
        setVideos(newVideos);

        // Persist order
        if (user && currentChannel) {
            const newOrder = newVideos.map(v => v.id);
            setVideoOrder(newOrder); // Update local order state immediately
            const orderRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/videoOrder`);
            await setDoc(orderRef, { order: newOrder }, { merge: true });
        }
    };

    const createPlaylist = async (name: string) => {
        if (!user || !currentChannel) return;
        const now = Date.now();
        const id = `playlist-${now}`;
        const newPlaylist: Playlist = {
            id,
            name,
            videoIds: [],
            createdAt: now,
            updatedAt: now
        };
        const playlistRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/playlists/${id}`);
        await setDoc(playlistRef, newPlaylist);
    };

    const deletePlaylist = async (id: string) => {
        if (!user || !currentChannel) return;
        await deleteDoc(doc(db, `users/${user.uid}/channels/${currentChannel.id}/playlists/${id}`));
    };

    const addVideoToPlaylist = async (playlistId: string, videoId: string) => {
        if (!user || !currentChannel) return;
        const playlist = playlists.find(p => p.id === playlistId);
        if (!playlist) return;
        if (playlist.videoIds.includes(videoId)) return;

        const video = videos.find(v => v.id === videoId);
        let newCover = playlist.coverImage;
        if (!newCover && video) {
            newCover = video.thumbnail;
        }

        const playlistRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/playlists/${playlistId}`);
        await updateDoc(playlistRef, {
            videoIds: [...playlist.videoIds, videoId],
            coverImage: newCover,
            updatedAt: Date.now()
        });
    };

    const removeVideoFromPlaylist = async (playlistId: string, videoId: string) => {
        if (!user || !currentChannel) return;
        const playlist = playlists.find(p => p.id === playlistId);
        if (!playlist) return;

        const playlistRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/playlists/${playlistId}`);
        await updateDoc(playlistRef, {
            videoIds: playlist.videoIds.filter(id => id !== videoId),
            updatedAt: Date.now()
        });
    };

    const updatePlaylist = async (id: string, updates: Partial<Playlist>) => {
        if (!user || !currentChannel) return;
        const playlistRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/playlists/${id}`);
        await updateDoc(playlistRef, { ...updates, updatedAt: Date.now() });
    };

    const reorderPlaylistVideos = async (playlistId: string, newOrder: string[]) => {
        if (!user || !currentChannel) return;
        const playlistRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/playlists/${playlistId}`);
        await updateDoc(playlistRef, { videoIds: newOrder, updatedAt: Date.now() });
    };

    const reorderPlaylists = (newPlaylists: Playlist[]) => {
        // Reordering playlists themselves is also not persisted unless we add an order field.
        setPlaylists(newPlaylists);
    };

    // Search Query
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Home Sort
    const [homeSortBy, setHomeSortBy] = useState<'default' | 'views' | 'date'>('default');

    // Sync Settings
    const [syncSettings, setSyncSettings] = useState<{ autoSync: boolean; frequencyHours: number }>({
        autoSync: true,
        frequencyHours: 24
    });
    const [isSyncing, setIsSyncing] = useState(false);

    // Load Sync Settings
    useEffect(() => {
        if (!user || !currentChannel) return;
        const settingsRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/sync`);
        const unsubscribe = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) {
                setSyncSettings(doc.data() as any);
            } else {
                setSyncSettings({ autoSync: true, frequencyHours: 24 });
            }
        });
        return () => unsubscribe();
    }, [user, currentChannel]);

    const updateSyncSettings = async (settings: { autoSync: boolean; frequencyHours: number }) => {
        setSyncSettings(settings); // Optimistic
        if (user && currentChannel) {
            const settingsRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/sync`);
            await setDoc(settingsRef, settings, { merge: true });
        }
    };

    // Clone Settings
    const [cloneSettings, setCloneSettings] = useState<{ cloneDurationSeconds: number }>({
        cloneDurationSeconds: 60
    });

    // Load Clone Settings
    useEffect(() => {
        if (!user || !currentChannel) return;
        const settingsRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/clone`);
        const unsubscribe = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) {
                setCloneSettings(doc.data() as any);
            } else {
                setCloneSettings({ cloneDurationSeconds: 60 });
            }
        });
        return () => unsubscribe();
    }, [user, currentChannel]);

    const updateCloneSettings = async (settings: { cloneDurationSeconds: number }) => {
        setCloneSettings(settings); // Optimistic
        if (user && currentChannel) {
            const settingsRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/clone`);
            await setDoc(settingsRef, settings, { merge: true });
        }
    };

    const cloneVideo = async (originalVideo: VideoDetails, coverVersion: any) => {
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
                // Ensure no undefined values are passed to Firestore
                coverHistory: originalVideo.coverHistory || []
            };

            // 1. Save Video
            const videoRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/videos/${id}`);
            await setDoc(videoRef, newVideo);

            // 2. Update Order
            const orderRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/settings/videoOrder`);
            const newOrder = [id, ...videoOrder];
            await setDoc(orderRef, { order: newOrder }, { merge: true });

            // Optional: Copy history subcollection here if needed in future
        } catch (error) {
            console.error("Error cloning video:", error);
            alert("Failed to clone video. See console for details.");
        }
    };

    // History Subcollection Logic
    const fetchVideoHistory = async (videoId: string) => {
        if (!user || !currentChannel) return [];
        const historyRef = collection(db, `users/${user.uid}/channels/${currentChannel.id}/videos/${videoId}/history`);
        const q = query(historyRef, orderBy('timestamp', 'desc'));
        const snapshot = await import('firebase/firestore').then(mod => mod.getDocs(q));
        return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    };

    const saveVideoHistory = async (videoId: string, historyItem: any) => {
        if (!user || !currentChannel) return;
        // Use timestamp as ID for easy sorting/deduping, or auto-id
        const historyId = historyItem.timestamp.toString();
        const historyRef = doc(db, `users/${user.uid}/channels/${currentChannel.id}/videos/${videoId}/history/${historyId}`);
        await setDoc(historyRef, historyItem);
    };

    const deleteVideoHistoryItem = async (videoId: string, historyId: string) => {
        if (!user || !currentChannel) return;
        const historyDocRef = doc(db, `users / ${user.uid} /channels/${currentChannel.id} /videos/${videoId} /history/${historyId} `);
        await deleteDoc(historyDocRef);
    };

    // Auto-delete expired clones
    useEffect(() => {
        const checkExpiration = async () => {
            const now = Date.now();
            const expiredVideos = videos.filter(v => v.isCloned && v.expiresAt && v.expiresAt <= now);

            if (expiredVideos.length > 0) {
                console.log(`Deleting ${expiredVideos.length} expired clones...`);
                for (const video of expiredVideos) {
                    await removeVideo(video.id);
                }
            }
        };

        const intervalId = setInterval(checkExpiration, 1000); // Check every second
        return () => clearInterval(intervalId);
    }, [videos, removeVideo]);

    const syncVideoData = async (force: boolean = false) => {
        if (!user || !currentChannel || !apiKey || isSyncing) return;

        setIsSyncing(true);
        try {
            const now = Date.now();
            const videosToUpdate = videos.filter(v => {
                if (v.isCustom || v.isCloned) return false; // Don't sync custom or cloned videos
                if (force) return true;

                const lastUpdated = v.lastUpdated || 0;
                const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);
                return hoursSinceUpdate >= syncSettings.frequencyHours;
            });

            console.log(`Syncing ${videosToUpdate.length} videos...`);

            for (const video of videosToUpdate) {
                const details = await fetchVideoDetails(video.id, apiKey);
                if (details) {
                    const updatedVideo: VideoDetails = {
                        ...video, // Keep existing local fields like createdAt
                        ...details, // Overwrite with fresh API data
                        lastUpdated: now
                    };
                    const videoRef = doc(db, `users / ${user.uid} /channels/${currentChannel.id} /videos/${video.id} `);
                    await updateDoc(videoRef, updatedVideo as any);
                }
                // Add a small delay to avoid hitting rate limits too hard if many videos
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            console.error("Sync failed:", error);
        } finally {
            setIsSyncing(false);
        }
    };

    const syncSingleVideo = async (videoId: string) => {
        if (!user || !currentChannel || !apiKey) return;

        try {
            const details = await fetchVideoDetails(videoId, apiKey);
            if (details) {
                const video = videos.find(v => v.id === videoId);
                const updatedVideo: VideoDetails = {
                    ...video, // Keep existing local fields like createdAt
                    ...details, // Overwrite with fresh API data
                    lastUpdated: Date.now()
                };
                const videoRef = doc(db, `users / ${user.uid} /channels/${currentChannel.id} /videos/${videoId} `);
                await updateDoc(videoRef, updatedVideo as any);
            }
        } catch (error) {
            console.error("Single video sync failed:", error);
        }
    };

    const manualSync = () => syncVideoData(true);

    // Auto-Sync Effect
    useEffect(() => {
        if (syncSettings.autoSync) {
            const checkSync = () => syncVideoData(false);

            // Initial check on load (with a small delay to ensure data is loaded)
            const timeoutId = setTimeout(checkSync, 5000);

            // Periodic check (every hour)
            const intervalId = setInterval(checkSync, 60 * 60 * 1000);

            return () => {
                clearTimeout(timeoutId);
                clearInterval(intervalId);
            };
        }
    }, [syncSettings.autoSync, syncSettings.frequencyHours, videos, apiKey, user, currentChannel]); // Dependencies ensure it runs when data changes

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
            addCustomVideo,
            recommendationOrders,
            updateRecommendationOrder,
            playlists,
            createPlaylist,
            deletePlaylist,
            addVideoToPlaylist,
            removeVideoFromPlaylist,
            updatePlaylist,
            reorderPlaylistVideos,
            reorderPlaylists,
            hiddenPlaylistIds,
            togglePlaylistVisibility,
            clearHiddenPlaylists,
            searchQuery,
            setSearchQuery,
            homeSortBy,
            setHomeSortBy,
            syncSettings,
            updateSyncSettings,
            isSyncing,
            manualSync,
            syncSingleVideo,
            cloneSettings,
            updateCloneSettings,
            cloneVideo,
            fetchVideoHistory,
            saveVideoHistory,
            deleteVideoHistoryItem
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
