import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    onSnapshot,
    updateDoc,
    writeBatch,
    getDocs,
    increment,
    query,
    orderBy,
    limit
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { TrendChannel, TrendVideo, TrendNiche, HiddenVideo, TrendSnapshot } from '../types/trends';

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

// Minimal interface for YouTube API Video Resource
interface YouTubeVideoResource {
    id: string;
    snippet: {
        publishedAt: string;
        title: string;
        thumbnails: {
            medium?: { url: string };
            default?: { url: string };
        };
        tags?: string[];
        description?: string;
    };
    contentDetails: {
        duration: string;
    };
    statistics: {
        viewCount: string;
    };
}

export const TrendService = {
    // --- Channel Management (Firestore) ---

    subscribeToTrendChannels: (userId: string, userChannelId: string, callback: (channels: TrendChannel[]) => void) => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/trendChannels`);
        return onSnapshot(ref, (snapshot) => {
            const channels = snapshot.docs.map(doc => doc.data() as TrendChannel);
            callback(channels);
        });
    },

    // --- Niche Management (Firestore) ---

    subscribeToNiches: (userId: string, userChannelId: string, callback: (niches: TrendNiche[]) => void) => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/trendNiches`);
        return onSnapshot(ref, (snapshot) => {
            const niches = snapshot.docs.map(doc => doc.data() as TrendNiche);
            callback(niches);
        });
    },

    addNiche: async (userId: string, userChannelId: string, niche: Omit<TrendNiche, 'createdAt' | 'viewCount'>) => {
        const id = niche.id || crypto.randomUUID();
        const fullNiche: TrendNiche = {
            ...niche,
            id,
            viewCount: 0,
            createdAt: Date.now()
        };
        await setDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, id), fullNiche);
        return fullNiche;
    },

    updateNiche: async (userId: string, userChannelId: string, nicheId: string, updates: Partial<TrendNiche>) => {
        const ref = doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, nicheId);
        await updateDoc(ref, updates);
    },

    deleteNiche: async (userId: string, userChannelId: string, nicheId: string) => {
        // Just delete the niche document. 
        // We leave the assignments as "orphaned" references - the UI naturally filters them out
        // because it only renders/counts based on the implementation of the 'niches' list.
        await deleteDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, nicheId));
    },

    // --- Niche View Count Recalculation (Global) ---


    // --- Niche Assignment (Firestore) ---

    subscribeToNicheAssignments: (userId: string, userChannelId: string, callback: (assignments: Record<string, { nicheId: string; addedAt: number }[]>) => void) => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`);
        return onSnapshot(ref, (snapshot) => {
            const data: Record<string, { nicheId: string; addedAt: number }[]> = {};
            snapshot.docs.forEach(doc => {
                data[doc.id] = doc.data().assignments || [];
            });
            callback(data);
        });
    },

    assignVideoToNiche: async (userId: string, userChannelId: string, videoId: string, nicheId: string, videoViewCount: number) => {
        const ref = doc(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`, videoId);
        const snapshot = await getDoc(ref);
        const current = snapshot.exists() ? (snapshot.data().assignments || []) as { nicheId: string; addedAt: number }[] : [];

        if (current.some(a => a.nicheId === nicheId)) return;

        await setDoc(ref, {
            assignments: [...current, { nicheId, addedAt: Date.now() }]
        }, { merge: true });

        // Atomic incremental update for niche viewCount
        const nicheRef = doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, nicheId);
        await updateDoc(nicheRef, {
            viewCount: increment(videoViewCount)
        });
    },

    removeVideoFromNiche: async (userId: string, userChannelId: string, videoId: string, nicheId: string, videoViewCount: number) => {
        const ref = doc(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`, videoId);
        const snapshot = await getDoc(ref);
        if (!snapshot.exists()) return;

        const current: { nicheId: string; addedAt: number }[] = snapshot.data().assignments || [];
        const filtered = current.filter(a => a.nicheId !== nicheId);

        if (filtered.length === 0) {
            await deleteDoc(ref);
        } else {
            await setDoc(ref, { assignments: filtered });
        }

        // Atomic incremental update for niche viewCount (decrement)
        const nicheRef = doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, nicheId);
        await updateDoc(nicheRef, {
            viewCount: increment(-videoViewCount)
        });
    },

    migrateLocalDataToFirestore: async (
        userId: string,
        userChannelId: string,
        niches: TrendNiche[],
        assignments: Record<string, { nicheId: string; addedAt: number }[]>,
        hiddenVideos: HiddenVideo[] = []
    ) => {
        const nicheBatch = writeBatch(db);
        niches.forEach(n => {
            const ref = doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, n.id);
            nicheBatch.set(ref, n);
        });
        await nicheBatch.commit();

        const assignmentBatch = writeBatch(db);
        Object.entries(assignments).forEach(([videoId, videoAssignments]) => {
            const ref = doc(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`, videoId);
            assignmentBatch.set(ref, { assignments: videoAssignments });
        });
        await assignmentBatch.commit();

        if (hiddenVideos.length > 0) {
            const hiddenBatch = writeBatch(db);
            hiddenVideos.forEach(hv => {
                const ref = doc(db, `users/${userId}/channels/${userChannelId}/hiddenVideos`, hv.id);
                hiddenBatch.set(ref, hv);
            });
            await hiddenBatch.commit();
        }
    },

    // --- Niche Split/Merge Operations ---

    /**
     * Batch create multiple niches at once
     */
    batchAddNiches: async (userId: string, userChannelId: string, niches: TrendNiche[]) => {
        const batch = writeBatch(db);
        niches.forEach(niche => {
            const ref = doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, niche.id);
            batch.set(ref, niche);
        });
        await batch.commit();
    },

    /**
     * Batch delete multiple niches at once
     */
    batchDeleteNiches: async (userId: string, userChannelId: string, nicheIds: string[]) => {
        const batch = writeBatch(db);
        nicheIds.forEach(id => {
            const ref = doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, id);
            batch.delete(ref);
        });
        await batch.commit();
    },

    /**
     * Get all video assignments for a specific niche, with video channel info
     */
    getVideoAssignmentsByNiche: async (
        userId: string,
        userChannelId: string,
        nicheId: string,
        videos: TrendVideo[]
    ): Promise<{ videoId: string; channelId: string; viewCount: number }[]> => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`);
        const snapshot = await getDocs(ref);

        const videoMap = new Map(videos.map(v => [v.id, v]));
        const results: { videoId: string; channelId: string; viewCount: number }[] = [];

        snapshot.docs.forEach(docSnap => {
            const videoId = docSnap.id;
            const assignments = docSnap.data().assignments || [];
            const isAssigned = assignments.some((a: { nicheId: string }) => a.nicheId === nicheId);

            if (isAssigned) {
                const video = videoMap.get(videoId);
                if (video) {
                    results.push({
                        videoId,
                        channelId: video.channelId,
                        viewCount: video.viewCount
                    });
                }
            }
        });

        return results;
    },

    /**
     * Migrate all video assignments from one niche to another
     */
    migrateNicheAssignments: async (
        userId: string,
        userChannelId: string,
        fromNicheId: string,
        toNicheId: string
    ) => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`);
        const snapshot = await getDocs(ref);

        const batch = writeBatch(db);

        snapshot.docs.forEach(docSnap => {
            const videoId = docSnap.id;
            const assignments: { nicheId: string; addedAt: number }[] = docSnap.data().assignments || [];
            const hasFromNiche = assignments.some(a => a.nicheId === fromNicheId);
            const hasToNiche = assignments.some(a => a.nicheId === toNicheId);

            if (hasFromNiche) {
                // Remove fromNiche, add toNiche if not already present
                const newAssignments = assignments.filter(a => a.nicheId !== fromNicheId);
                if (!hasToNiche) {
                    newAssignments.push({ nicheId: toNicheId, addedAt: Date.now() });
                }

                const docRef = doc(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`, videoId);
                if (newAssignments.length === 0) {
                    batch.delete(docRef);
                } else {
                    batch.set(docRef, { assignments: newAssignments });
                }
            }
        });

        await batch.commit();
    },

    /**
     * Remove video-niche assignments for videos NOT from the specified channel
     */
    removeNonChannelAssignments: async (
        userId: string,
        userChannelId: string,
        nicheId: string,
        keepChannelId: string,
        videos: TrendVideo[]
    ) => {
        const videoMap = new Map(videos.map(v => [v.id, v]));
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`);
        const snapshot = await getDocs(ref);

        const batch = writeBatch(db);
        let removedViewCount = 0;

        snapshot.docs.forEach(docSnap => {
            const videoId = docSnap.id;
            const video = videoMap.get(videoId);
            const assignments: { nicheId: string; addedAt: number }[] = docSnap.data().assignments || [];

            // Only process if video is NOT from keepChannelId and has this niche
            if (video && video.channelId !== keepChannelId) {
                const hasNiche = assignments.some(a => a.nicheId === nicheId);
                if (hasNiche) {
                    removedViewCount += video.viewCount;
                    const newAssignments = assignments.filter(a => a.nicheId !== nicheId);

                    const docRef = doc(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`, videoId);
                    if (newAssignments.length === 0) {
                        batch.delete(docRef);
                    } else {
                        batch.set(docRef, { assignments: newAssignments });
                    }
                }
            }
        });

        await batch.commit();

        // Update niche viewCount
        if (removedViewCount > 0) {
            const nicheRef = doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, nicheId);
            await updateDoc(nicheRef, {
                viewCount: increment(-removedViewCount)
            });
        }
    },

    /**
     * Reassign videos from one niche to a new niche, filtered by channel
     * Used during split operation
     */
    reassignVideosByChannel: async (
        userId: string,
        userChannelId: string,
        fromNicheId: string,
        toNicheId: string,
        targetChannelId: string,
        videos: TrendVideo[]
    ) => {
        const videoMap = new Map(videos.map(v => [v.id, v]));
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`);
        const snapshot = await getDocs(ref);

        const batch = writeBatch(db);
        let movedViewCount = 0;

        snapshot.docs.forEach(docSnap => {
            const videoId = docSnap.id;
            const video = videoMap.get(videoId);
            const assignments: { nicheId: string; addedAt: number }[] = docSnap.data().assignments || [];

            // Only process if video IS from targetChannelId and has fromNiche
            if (video && video.channelId === targetChannelId) {
                const hasFromNiche = assignments.some(a => a.nicheId === fromNicheId);
                if (hasFromNiche) {
                    movedViewCount += video.viewCount;

                    // Replace fromNiche with toNiche
                    const newAssignments = assignments
                        .filter(a => a.nicheId !== fromNicheId)
                        .concat([{ nicheId: toNicheId, addedAt: Date.now() }]);

                    const docRef = doc(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`, videoId);
                    batch.set(docRef, { assignments: newAssignments });
                }
            }
        });

        await batch.commit();

        // Update new niche viewCount
        if (movedViewCount > 0) {
            const nicheRef = doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, toNicheId);
            await updateDoc(nicheRef, {
                viewCount: increment(movedViewCount)
            });
        }

        return movedViewCount;
    },

    // --- Hidden Videos (Firestore) ---

    subscribeToHiddenVideos: (userId: string, userChannelId: string, callback: (hidden: HiddenVideo[]) => void) => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/hiddenVideos`);
        return onSnapshot(ref, (snapshot) => {
            callback(snapshot.docs.map(d => d.data() as HiddenVideo));
        });
    },

    hideVideos: async (userId: string, userChannelId: string, videos: { id: string; channelId: string }[]) => {
        const batch = writeBatch(db);
        videos.forEach(v => {
            const ref = doc(db, `users/${userId}/channels/${userChannelId}/hiddenVideos`, v.id);
            batch.set(ref, { id: v.id, channelId: v.channelId, hiddenAt: Date.now() });
        });
        await batch.commit();
    },

    restoreVideos: async (userId: string, userChannelId: string, ids: string[]) => {
        const batch = writeBatch(db);
        ids.forEach(id => {
            const ref = doc(db, `users/${userId}/channels/${userChannelId}/hiddenVideos`, id);
            batch.delete(ref);
        });
        await batch.commit();
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
        let initialSyncStats = { totalQuotaUsed: 0, totalNewVideos: 0, quotaBreakdown: { list: 0, details: 0 } };
        try {
            initialSyncStats = await TrendService.syncChannelVideos(userId, userChannelId, newChannel, apiKey);
        } catch (error) {
            console.error('Initial video sync failed:', error);
            // We still return the channel even if sync fails, it will just be empty initially
        }

        return {
            channel: newChannel,
            quotaCost: 1 + initialSyncStats.totalQuotaUsed,
            totalNewVideos: initialSyncStats.totalNewVideos,
            quotaBreakdown: {
                search: 1,
                ...initialSyncStats.quotaBreakdown
            }
        }; // 1 (channel search) + sync cost
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

    updateChannel: async (userId: string, userChannelId: string, channelId: string, updates: Partial<TrendChannel>) => {
        await updateDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, channelId), updates);
    },

    // --- Video Fetching & Caching (IndexedDB) ---

    syncChannelVideos: async (userId: string, userChannelId: string, channel: TrendChannel, apiKey: string, forceFullSync: boolean = false, refreshAvatar: boolean = false): Promise<{ totalNewVideos: number; totalQuotaUsed: number; quotaBreakdown: { list: number; details: number }; newAvatarUrl?: string }> => {
        console.log(`[TrendService] Starting sync for channel: ${channel.title} (Full Sync: ${forceFullSync}, Refresh Avatar: ${refreshAvatar})`);

        let nextPageToken: string | undefined = undefined;
        let totalProcessedVideos = 0;
        let totalQuotaUsed = 0;
        const quotaBreakdown = { list: 0, details: 0 };

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
            quotaBreakdown.list += 1;

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
                quotaBreakdown.details += 1;

                if (statsData.items) {
                    const videos: TrendVideo[] = statsData.items.map((item: YouTubeVideoResource) => ({
                        id: item.id,
                        channelId: channel.id,
                        publishedAt: item.snippet.publishedAt,
                        publishedAtTimestamp: new Date(item.snippet.publishedAt).getTime(),
                        title: item.snippet.title,
                        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
                        viewCount: parseInt(item.statistics.viewCount || '0'),
                        duration: item.contentDetails.duration || '',
                        tags: item.snippet.tags || [],
                        description: item.snippet.description || '',
                    }));

                    // 1. Save to IndexedDB (speed layer)
                    const tx = idb.transaction('videos', 'readwrite');
                    await Promise.all(videos.map(v => tx.store.put(v)));
                    await tx.done;

                    // 2. Save to Firestore (sync layer)
                    const videoBatch = writeBatch(db);
                    videos.forEach(v => {
                        const vRef = doc(db, `users/${userId}/channels/${userChannelId}/trendChannels/${channel.id}/videos`, v.id);
                        videoBatch.set(vRef, v);
                    });
                    await videoBatch.commit();

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

        // Refresh avatar if requested (when current avatar is broken)
        let newAvatarUrl: string | undefined;
        if (refreshAvatar) {
            try {
                const avatarParams = new URLSearchParams({
                    part: 'snippet',
                    id: channel.id,
                    key: apiKey,
                });
                const avatarRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?${avatarParams.toString()}`);
                const avatarData = await avatarRes.json();
                totalQuotaUsed += 1;

                if (avatarData.items?.[0]?.snippet?.thumbnails) {
                    const thumbnails = avatarData.items[0].snippet.thumbnails;
                    newAvatarUrl = thumbnails.medium?.url || thumbnails.default?.url;
                    console.log(`[TrendService] Refreshed avatar for ${channel.title}: ${newAvatarUrl}`);
                }
            } catch (err) {
                console.error('[TrendService] Failed to refresh avatar:', err);
            }
        }

        await updateDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, channel.id), {
            lastUpdated: Date.now(),
            averageViews,
            totalViewCount: totalViews,
            ...(newAvatarUrl ? { avatarUrl: newAvatarUrl } : {})
        });

        return { totalNewVideos: totalProcessedVideos, totalQuotaUsed, quotaBreakdown, newAvatarUrl };
    },

    /**
     * Triggers Server-Side Sync for a user channel.
     * The Cloud Function handles fetching, updating metrics/metadata, and notifications.
     */
    syncChannelCloud: async (channelId: string, targetTrendChannelIds?: string[]): Promise<void> => {
        const { functions } = await import('../../config/firebase');
        const { httpsCallable } = await import('firebase/functions');

        const manualTrendSync = httpsCallable(functions, 'manualTrendSync');

        await manualTrendSync({
            channelId, // The context (User Channel ID)
            targetTrendChannelIds // Optional: specific trend channels to sync
        });
    },

    getVideoCountForChannels: async (channelIds: string[]): Promise<number> => {
        const idb = await getDB();
        const tx = idb.transaction('videos', 'readonly');
        const index = tx.store.index('by-channel');

        // Execute counts in parallel for performance
        const counts = await Promise.all(channelIds.map(id => index.count(id)));
        const total = counts.reduce((acc, c) => acc + c, 0);

        return total;
    },

    getChannelVideosFromCache: async (channelId: string) => {
        const idb = await getDB();
        return idb.getAllFromIndex('videos', 'by-channel', channelId);
    },

    getChannelVideosFromFirestore: async (userId: string, userChannelId: string, channelId: string) => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/trendChannels/${channelId}/videos`);
        const snapshot = await getDocs(ref);
        const videos = snapshot.docs.map(d => d.data() as TrendVideo);

        // Populate Cache
        if (videos.length > 0) {
            const idb = await getDB();
            const tx = idb.transaction('videos', 'readwrite');
            await Promise.all(videos.map(v => tx.store.put(v)));
            await tx.done;
        }

        return videos;
    },

    // Migration helper: Recalculate stats from Firestore to ensure consistency across devices
    recalcChannelStats: async (userId: string, userChannelId: string, channelId: string) => {
        const allVideos = await TrendService.getChannelVideosFromFirestore(userId, userChannelId, channelId);

        const totalViews = allVideos.reduce((sum, v) => sum + v.viewCount, 0);
        const averageViews = allVideos.length > 0 ? totalViews / allVideos.length : 0;

        await updateDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, channelId), {
            totalViewCount: totalViews,
            averageViews,
            lastUpdated: Date.now() // Also mark as updated to prevent immediate sync if they were just migrated
        });

        return totalViews;
    },

    // --- Snapshots (Time-Series) ---

    /**
     * Fetch trend snapshots for a specific channel.
     * Optionally limit by days.
     */
    getTrendSnapshots: async (
        userId: string,
        userChannelId: string,
        trendChannelId: string,
        limitDays: number = 30
    ): Promise<TrendSnapshot[]> => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/trendChannels/${trendChannelId}/snapshots`);

        // Optimization: Fetch only the necessary recent history from Firestore
        // This saves Read quota and bandwidth.
        let q;
        if (limitDays > 0) {
            q = query(ref, orderBy('timestamp', 'desc'), limit(limitDays));
        } else {
            q = query(ref, orderBy('timestamp', 'desc'));
        }

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as TrendSnapshot));

        return data;
    },

    /**
     * Capture a new snapshot for a channel using current video data.
     * Intended to be called by the Cloud Function (or manual server-simulation).
     * 
     * @param videos List of current TrendVideos with up-to-date view counts
     */
    captureSnapshot: async (
        userId: string,
        userChannelId: string,
        trendChannelId: string,
        videos: TrendVideo[],
        type: 'auto' | 'manual' = 'manual'
    ) => {
        const timestamp = Date.now();
        // Use timestamp-based ID for precision
        const id = `${timestamp}`;

        const videoViews: Record<string, number> = {};
        videos.forEach(v => {
            videoViews[v.id] = v.viewCount;
        });

        const snapshot: TrendSnapshot = {
            id,
            timestamp,
            videoViews,
            type
        };

        await setDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels/${trendChannelId}/snapshots`, id), snapshot);
        return snapshot;
    },

    // --- Copy Channel to Another User Channel ---

    /**
     * Check if a TrendChannel exists in a target User Channel.
     */
    channelExistsInUserChannel: async (
        userId: string,
        targetUserChannelId: string,
        trendChannelId: string
    ): Promise<boolean> => {
        const ref = doc(db, `users/${userId}/channels/${targetUserChannelId}/trendChannels`, trendChannelId);
        const snapshot = await getDoc(ref);
        return snapshot.exists();
    },

    /**
     * Get all niches for a specific User Channel.
     */
    getNichesForUserChannel: async (
        userId: string,
        userChannelId: string
    ): Promise<TrendNiche[]> => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/trendNiches`);
        const snapshot = await getDocs(ref);
        return snapshot.docs.map(d => d.data() as TrendNiche);
    },

    /**
     * Copy a TrendChannel (with niches, video assignments, hidden videos) to another User Channel.
     * 
     * @param merge - If true, the channel already exists in target and we merge niche data.
     *                If false, create fresh copy.
     */
    copyTrendChannel: async (
        userId: string,
        sourceUserChannelId: string,
        targetUserChannelId: string,
        trendChannelId: string,
        merge: boolean
    ): Promise<void> => {
        // 1. Get source channel data
        const channelRef = doc(db, `users/${userId}/channels/${sourceUserChannelId}/trendChannels`, trendChannelId);
        const channelSnap = await getDoc(channelRef);
        if (!channelSnap.exists()) {
            throw new Error('Source channel not found');
        }
        const channelData = channelSnap.data() as TrendChannel;

        // 2. Get source niches related to this channel
        const sourceNiches = await TrendService.getNichesForUserChannel(userId, sourceUserChannelId);
        const sourceAssignmentsRef = collection(db, `users/${userId}/channels/${sourceUserChannelId}/videoNicheAssignments`);
        const sourceAssignmentsSnap = await getDocs(sourceAssignmentsRef);

        // Get videos to identify which niches are relevant
        const videosRef = collection(db, `users/${userId}/channels/${sourceUserChannelId}/trendChannels/${trendChannelId}/videos`);
        const videosSnap = await getDocs(videosRef);
        const videoIds = new Set(videosSnap.docs.map(d => d.id));

        // Collect relevant niche IDs (used by this channel's videos)
        const relevantNicheIds = new Set<string>();
        sourceAssignmentsSnap.docs.forEach(doc => {
            if (videoIds.has(doc.id)) {
                const assignments = doc.data().assignments || [];
                assignments.forEach((a: { nicheId: string }) => relevantNicheIds.add(a.nicheId));
            }
        });

        // Also include local niches for this channel
        sourceNiches.forEach(n => {
            if (n.type === 'local' && n.channelId === trendChannelId) {
                relevantNicheIds.add(n.id);
            }
        });

        const nichesToCopy = sourceNiches.filter(n => relevantNicheIds.has(n.id));

        // 3. Get hidden videos for this channel
        const hiddenRef = collection(db, `users/${userId}/channels/${sourceUserChannelId}/hiddenVideos`);
        const hiddenSnap = await getDocs(hiddenRef);
        const hiddenToCopy = hiddenSnap.docs
            .map(d => d.data() as HiddenVideo)
            .filter(hv => hv.channelId === trendChannelId);

        // 4. Get target niches for merge mapping
        let targetNiches: TrendNiche[] = [];
        if (merge) {
            targetNiches = await TrendService.getNichesForUserChannel(userId, targetUserChannelId);
        }

        // Build niche ID mapping: source niche ID -> target niche ID
        const nicheIdMap = new Map<string, string>();

        const batch = writeBatch(db);

        // 5. Copy/create niches
        for (const niche of nichesToCopy) {
            if (merge) {
                // Check if same-name niche exists in target
                const existingNiche = targetNiches.find(n => n.name === niche.name);
                if (existingNiche) {
                    // Map to existing niche
                    nicheIdMap.set(niche.id, existingNiche.id);
                } else {
                    // Create new niche in target
                    const newNicheId = crypto.randomUUID();
                    nicheIdMap.set(niche.id, newNicheId);
                    const newNiche: TrendNiche = {
                        ...niche,
                        id: newNicheId,
                        viewCount: 0, // Will be recalculated
                        createdAt: Date.now()
                    };
                    const nicheRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/trendNiches`, newNicheId);
                    batch.set(nicheRef, newNiche);
                }
            } else {
                // Fresh copy: create new niche with new ID
                const newNicheId = crypto.randomUUID();
                nicheIdMap.set(niche.id, newNicheId);
                const newNiche: TrendNiche = {
                    ...niche,
                    id: newNicheId,
                    viewCount: 0,
                    createdAt: Date.now()
                };
                const nicheRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/trendNiches`, newNicheId);
                batch.set(nicheRef, newNiche);
            }
        }

        // 6. Copy channel (if not merge)
        if (!merge) {
            const targetChannelRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/trendChannels`, trendChannelId);
            batch.set(targetChannelRef, channelData);
        }

        // 7. Copy videos
        for (const videoDoc of videosSnap.docs) {
            const videoData = videoDoc.data();
            const targetVideoRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/trendChannels/${trendChannelId}/videos`, videoDoc.id);
            batch.set(targetVideoRef, videoData);
        }

        // 8. Copy video-niche assignments with mapped IDs
        for (const assignDoc of sourceAssignmentsSnap.docs) {
            if (!videoIds.has(assignDoc.id)) continue;

            const sourceAssignments: { nicheId: string; addedAt: number }[] = assignDoc.data().assignments || [];
            const mappedAssignments = sourceAssignments
                .filter(a => nicheIdMap.has(a.nicheId))
                .map(a => ({
                    nicheId: nicheIdMap.get(a.nicheId)!,
                    addedAt: Date.now()
                }));

            if (mappedAssignments.length > 0) {
                const targetAssignRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/videoNicheAssignments`, assignDoc.id);

                if (merge) {
                    // Get existing assignments and merge
                    const existingSnap = await getDoc(targetAssignRef);
                    const existing: { nicheId: string; addedAt: number }[] = existingSnap.exists()
                        ? (existingSnap.data().assignments || [])
                        : [];

                    // Merge: add new assignments that don't already exist
                    const existingNicheIds = new Set(existing.map(a => a.nicheId));
                    const merged = [
                        ...existing,
                        ...mappedAssignments.filter(a => !existingNicheIds.has(a.nicheId))
                    ];
                    batch.set(targetAssignRef, { assignments: merged });
                } else {
                    batch.set(targetAssignRef, { assignments: mappedAssignments });
                }
            }
        }

        // 9. Copy hidden videos
        for (const hv of hiddenToCopy) {
            const targetHiddenRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/hiddenVideos`, hv.id);
            batch.set(targetHiddenRef, hv);
        }

        // 10. Commit all changes
        await batch.commit();

        // 11. Recalculate niche view counts in target
        // This is done asynchronously to avoid blocking
        const targetNicheIdsToUpdate = new Set(nicheIdMap.values());
        for (const nicheId of targetNicheIdsToUpdate) {
            // Get all videos assigned to this niche in target
            const targetAssignRef = collection(db, `users/${userId}/channels/${targetUserChannelId}/videoNicheAssignments`);
            const allAssigns = await getDocs(targetAssignRef);

            let totalViews = 0;
            for (const doc of allAssigns.docs) {
                const assignments = doc.data().assignments || [];
                if (assignments.some((a: { nicheId: string }) => a.nicheId === nicheId)) {
                    // Get video view count
                    // Try to find in the copied videos first
                    const videoData = videosSnap.docs.find(v => v.id === doc.id)?.data();
                    if (videoData) {
                        totalViews += videoData.viewCount || 0;
                    }
                }
            }

            // Update niche view count
            const nicheRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/trendNiches`, nicheId);
            await updateDoc(nicheRef, { viewCount: increment(totalViews) });
        }
    }
};
