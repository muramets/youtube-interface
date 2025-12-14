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

    syncChannelVideos: async (userId: string, userChannelId: string, channel: TrendChannel, apiKey: string) => {
        console.log(`[TrendService] Starting full sync for channel: ${channel.title}`);

        let nextPageToken: string | undefined = undefined;
        let totalNewVideos = 0;
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

            // Optimization: Filter out videos we already have in DB
            // For now, we'll check against IDB for each batch.
            const newVideoIds: string[] = [];

            for (const item of data.items) {
                const videoId = item.contentDetails.videoId;
                // Check if video exists in IDB. 
                // idb.get returns undefined if not found.
                const existing = await idb.get('videos', videoId);

                if (!existing) {
                    newVideoIds.push(videoId);
                }
            }

            if (newVideoIds.length > 0) {
                // Fetch details ONLY for new videos
                const videoIdsChunk = newVideoIds.join(',');
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

                    totalNewVideos += videos.length;
                }
            } else {
                console.log('[TrendService] All videos in this page already exist. Skipping details fetch.');
            }

            nextPageToken = data.nextPageToken;
            nextPageToken = data.nextPageToken;


        } while (nextPageToken);

        console.log(`[TrendService] Sync complete. Added ${totalNewVideos} new videos. Quota used: ${totalQuotaUsed}`);

        // Update stats
        const allVideos = await idb.getAllFromIndex('videos', 'by-channel', channel.id);
        const totalViews = allVideos.reduce((sum, v) => sum + v.viewCount, 0);
        const averageViews = allVideos.length > 0 ? totalViews / allVideos.length : 0;

        await updateDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, channel.id), {
            lastUpdated: Date.now(),
            averageViews
        });

        return { totalNewVideos, totalQuotaUsed };
    },

    getChannelVideosFromCache: async (channelId: string) => {
        const idb = await getDB();
        return idb.getAllFromIndex('videos', 'by-channel', channelId);
    }
};
