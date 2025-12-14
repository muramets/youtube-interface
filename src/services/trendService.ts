import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import type { TrendChannel, TrendVideo } from '../types/trends';

// IndexedDB Schema
interface TrendsDB extends DBSchema {
    videos: {
        key: string;
        value: TrendVideo;
        indexes: { 'by-channel': string; 'by-published': number };
    };
}

let dbPromise: Promise<IDBPDatabase<TrendsDB>>;

const getDB = () => {
    if (!dbPromise) {
        dbPromise = openDB<TrendsDB>('trends-db', 1, {
            upgrade(db) {
                const store = db.createObjectStore('videos', { keyPath: 'id' });
                store.createIndex('by-channel', 'channelId');
                store.createIndex('by-published', 'publishedAtTimestamp');
            },
        });
    }
    return dbPromise;
};

export const TrendService = {
    // --- Channel Management (Firestore) ---

    subscribeToTrendChannels: (userId: string, callback: (channels: TrendChannel[]) => void) => {
        const ref = collection(db, `users/${userId}/trendChannels`);
        return onSnapshot(ref, (snapshot) => {
            const channels = snapshot.docs.map(doc => doc.data() as TrendChannel);
            callback(channels);
        });
    },

    addTrendChannel: async (userId: string, channelUrl: string, apiKey: string) => {
        // 1. Resolve Channel ID from URL (naive implementation, assumes channel ID or handle for now)

        let channelId = '';
        let handle = '';

        // Simple parser: check if it's a handle (@name) or ID (UC...)
        const urlParts = channelUrl.split('/').filter(p => p.length > 0);
        const lastPart = urlParts[urlParts.length - 1];

        if (lastPart.startsWith('@')) {
            handle = lastPart;
        } else if (lastPart.startsWith('UC')) {
            channelId = lastPart;
        } else {
            // Fallback or error - assume it's a handle without @ if not UC
            handle = '@' + lastPart;
        }

        // 2. Fetch Metadata from YouTube
        const params = new URLSearchParams({
            part: 'snippet,contentDetails,statistics',
            key: apiKey,
        });

        if (channelId) {
            params.append('id', channelId);
        } else {
            params.append('forHandle', handle);
        }

        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`);
        const data = await res.json();

        if (!data.items || data.items.length === 0) {
            throw new Error('Channel not found');
        }

        const item = data.items[0];
        const newChannel: TrendChannel = {
            id: item.id,
            title: item.snippet.title,
            handle: item.snippet.customUrl,
            avatarUrl: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
            uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
            isVisible: true,
            subscriberCount: parseInt(item.statistics.subscriberCount),
            lastUpdated: 0, // Never updated
        };

        // 3. Save to Firestore
        await setDoc(doc(db, `users/${userId}/trendChannels`, newChannel.id), newChannel);

        // 4. Initial Sync of Videos
        try {
            await TrendService.syncChannelVideos(userId, newChannel, apiKey);
        } catch (error) {
            console.error('Initial video sync failed:', error);
            // We still return the channel even if sync fails, it will just be empty initially
        }

        return newChannel;
    },

    removeTrendChannel: async (userId: string, channelId: string) => {
        await deleteDoc(doc(db, `users/${userId}/trendChannels`, channelId));
        // Cleanup IndexedDB videos for this channel
        const idb = await getDB();
        const tx = idb.transaction('videos', 'readwrite');
        const index = tx.store.index('by-channel');
        let cursor = await index.openCursor(IDBKeyRange.only(channelId));
        while (cursor) {
            await cursor.delete();
            cursor = await cursor.continue();
        }
        await tx.done;
    },

    toggleVisibility: async (userId: string, channelId: string, isVisible: boolean) => {
        await updateDoc(doc(db, `users/${userId}/trendChannels`, channelId), { isVisible });
    },

    // --- Video Fetching & Caching (IndexedDB) ---

    syncChannelVideos: async (userId: string, channel: TrendChannel, apiKey: string) => {
        // 1. Fetch from YouTube (Uploads Playlist)
        // Limit to last 50 videos for 'Explore' purpose usually, or pagination loop
        // For this generic impl, let's fetch 50.

        const params = new URLSearchParams({
            part: 'snippet,contentDetails',
            playlistId: channel.uploadsPlaylistId,
            maxResults: '50',
            key: apiKey,
        });

        const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`);
        const data = await res.json();

        console.log('[TrendService] PlaylistItems response:', data);

        if (!data.items) {
            console.warn('[TrendService] No items found in playlist response');
            return;
        }

        // Need to fetch statistics (viewCount) separately for these videos
        const videoIds = data.items.map((i: any) => i.contentDetails.videoId).join(',');
        const statsParams = new URLSearchParams({
            part: 'statistics,contentDetails,snippet',
            id: videoIds,
            key: apiKey,
        });

        const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${statsParams.toString()}`);
        const statsData = await statsRes.json();

        const videos: TrendVideo[] = statsData.items.map((item: any) => ({
            id: item.id,
            channelId: channel.id,
            publishedAt: item.snippet.publishedAt,
            publishedAtTimestamp: new Date(item.snippet.publishedAt).getTime(),
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
            viewCount: parseInt(item.statistics.viewCount),
            duration: item.contentDetails.duration,
            tags: item.snippet.tags,
            description: item.snippet.description,
        }));

        console.log(`[TrendService] Parsed ${videos.length} videos. Saving to DB...`, videos[0]);

        // 2. Update IndexedDB
        const idb = await getDB();
        const tx = idb.transaction('videos', 'readwrite');
        await Promise.all(videos.map(v => tx.store.put(v)));
        await tx.done;

        console.log('[TrendService] Videos saved to IndexedDB successfully');

        // 3. Update Channel 'lastUpdated' and 'averageViews'
        const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);
        const averageViews = videos.length > 0 ? totalViews / videos.length : 0;

        await updateDoc(doc(db, `users/${userId}/trendChannels`, channel.id), {
            lastUpdated: Date.now(),
            averageViews
        });
    },

    getChannelVideosFromCache: async (channelId: string) => {
        const idb = await getDB();
        return idb.getAllFromIndex('videos', 'by-channel', channelId);
    }
};
