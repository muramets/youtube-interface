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

    subscribeToTrendChannels: (userId: string, userChannelId: string, callback: (channels: TrendChannel[]) => void) => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/trendChannels`);
        return onSnapshot(ref, (snapshot) => {
            const channels = snapshot.docs.map(doc => doc.data() as TrendChannel);
            callback(channels);
        });
    },

    addTrendChannel: async (userId: string, userChannelId: string, channelUrl: string, apiKey: string) => {
        // Smart Channel URL/Handle/ID Parser
        let channelId = '';
        let handle = '';

        const input = channelUrl.trim();

        // Try to parse as URL first
        try {
            const url = new URL(input.startsWith('http') ? input : `https://${input}`);
            const pathname = url.pathname;

            // Handle format: youtube.com/@handle or youtube.com/@handle/videos
            const handleMatch = pathname.match(/\/@([^/]+)/);
            if (handleMatch) {
                handle = '@' + handleMatch[1];
            }
            // Channel ID format: youtube.com/channel/UC...
            else if (pathname.includes('/channel/')) {
                const idMatch = pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
                if (idMatch) channelId = idMatch[1];
            }
            // Custom URL format: youtube.com/c/ChannelName
            else if (pathname.includes('/c/')) {
                const customMatch = pathname.match(/\/c\/([^/]+)/);
                if (customMatch) handle = '@' + customMatch[1];
            }
            // User format: youtube.com/user/Username
            else if (pathname.includes('/user/')) {
                const userMatch = pathname.match(/\/user\/([^/]+)/);
                if (userMatch) handle = '@' + userMatch[1];
            }
        } catch {
            // Not a valid URL, try direct parsing
        }

        // If URL parsing didn't yield results, try direct input
        if (!channelId && !handle) {
            if (input.startsWith('@')) {
                handle = input;
            } else if (input.startsWith('UC') && input.length >= 20) {
                channelId = input;
            } else {
                // Assume it's a handle without @
                handle = '@' + input;
            }
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
        await setDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, newChannel.id), newChannel);

        // 4. Initial Sync of Videos
        let initialSyncStats = { totalQuotaUsed: 0 };
        try {
            initialSyncStats = await TrendService.syncChannelVideos(userId, userChannelId, newChannel, apiKey);
        } catch (error) {
            console.error('Initial video sync failed:', error);
            // We still return the channel even if sync fails, it will just be empty initially
        }

        return { channel: newChannel, quotaCost: 1 + initialSyncStats.totalQuotaUsed }; // 1 (channel search) + sync cost
    },

    removeTrendChannel: async (userId: string, userChannelId: string, channelId: string) => {
        await deleteDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, channelId));
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

    toggleVisibility: async (userId: string, userChannelId: string, channelId: string, isVisible: boolean) => {
        await updateDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, channelId), { isVisible });
    },

    // --- Video Fetching & Caching (IndexedDB) ---

    syncChannelVideos: async (userId: string, userChannelId: string, channel: TrendChannel, apiKey: string, forceFullSync: boolean = false) => {
        console.log(`[TrendService] Starting sync for channel: ${channel.title} (Full Sync: ${forceFullSync})`);

        let nextPageToken: string | undefined = undefined;
        let totalProcessedVideos = 0;
        let totalQuotaUsed = 0;

        const idb = await getDB();

        // Recursively fetch all pages from playlistItems
        do {
            const params = new URLSearchParams({
                part: 'snippet,contentDetails',
                playlistId: channel.uploadsPlaylistId,
                maxResults: '50',
                key: apiKey,
            });

            if (nextPageToken) {
                params.append('pageToken', nextPageToken);
            }

            const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`);
            const data = await res.json();
            totalQuotaUsed += 1; // playlistItems cost

            if (!data.items || data.items.length === 0) {
                break;
            }

            // Determine which videos to fetch details for
            const videosToFetch: string[] = [];

            for (const item of data.items) {
                const videoId = item.contentDetails.videoId;

                if (forceFullSync) {
                    // In full sync, we update everything encountered
                    videosToFetch.push(videoId);
                } else {
                    // In incremental sync, check against DB
                    const existing = await idb.get('videos', videoId);
                    if (!existing) {
                        videosToFetch.push(videoId);
                    }
                }
            }

            if (videosToFetch.length > 0) {
                // Fetch details for the chunk
                const videoIdsChunk = videosToFetch.join(',');
                const statsParams = new URLSearchParams({
                    part: 'statistics,contentDetails,snippet',
                    id: videoIdsChunk,
                    key: apiKey,
                });

                const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${statsParams.toString()}`);
                const statsData = await statsRes.json();
                totalQuotaUsed += 1; // videos list cost

                if (statsData.items) {
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

                    const tx = idb.transaction('videos', 'readwrite');
                    await Promise.all(videos.map(v => tx.store.put(v)));
                    await tx.done;

                    totalProcessedVideos += videos.length;
                }
            } else {
                console.log('[TrendService] All videos in this page already exist. Skipping details fetch.');
            }

            nextPageToken = data.nextPageToken;

        } while (nextPageToken);

        console.log(`[TrendService] Sync complete. Processed ${totalProcessedVideos} videos. Quota used: ${totalQuotaUsed}`);

        // Update stats
        const allVideos = await idb.getAllFromIndex('videos', 'by-channel', channel.id);
        const totalViews = allVideos.reduce((sum, v) => sum + v.viewCount, 0);
        const averageViews = allVideos.length > 0 ? totalViews / allVideos.length : 0;

        await updateDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, channel.id), {
            lastUpdated: Date.now(),
            averageViews
        });

        return { totalNewVideos: totalProcessedVideos, totalQuotaUsed };
    },

    getChannelVideosFromCache: async (channelId: string) => {
        const idb = await getDB();
        return idb.getAllFromIndex('videos', 'by-channel', channelId);
    }
};
