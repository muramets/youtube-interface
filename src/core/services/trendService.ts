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
    where,
    type WriteBatch
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { trackRead } from '../utils/debug';
import type { TrendChannel, TrendVideo, TrendNiche, HiddenVideo, TrendSnapshot } from '../types/trends';

/**
 * Everything under `trendChannels/{id}/*` that constitutes "this channel's data".
 * Listed once so copy/delete/future-import stay in sync when new subcollections are added.
 */
export const TREND_CHANNEL_SUBCOLLECTIONS = ['videos', 'snapshots'] as const;

/**
 * Firestore writeBatch is capped at 500 operations per commit. For operations that
 * may exceed this (copying a channel with hundreds of videos + snapshots), split
 * the work across sequential batches of `chunkSize`.
 *
 * Each `write` adds one operation to the current batch. Commits are sequential;
 * if a later chunk fails the earlier ones are already durable — callers relying
 * on atomicity must handle partial state via idempotent retry.
 */
type BatchWrite = (batch: WriteBatch) => void;
const BATCH_CHUNK_SIZE = 400;

const commitInChunks = async (writes: BatchWrite[], chunkSize: number = BATCH_CHUNK_SIZE): Promise<void> => {
    for (let i = 0; i < writes.length; i += chunkSize) {
        const batch = writeBatch(db);
        for (const write of writes.slice(i, i + chunkSize)) {
            write(batch);
        }
        await batch.commit();
    }
};

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

/**
 * Resolve arbitrary user input (URL, @handle, bare handle, UC-id) to the fields
 * needed for the YouTube `channels.list` call.
 *
 * Exactly one of { channelId, handle } is non-empty on return.
 */
export const parseChannelInput = (input: string): { channelId: string; handle: string } => {
    let channelId = '';
    let handle = '';
    const trimmed = input.trim();

    try {
        const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        const pathname = url.pathname;

        const handleMatch = pathname.match(/\/@([^/]+)/);
        if (handleMatch) {
            handle = '@' + handleMatch[1];
        } else if (pathname.includes('/channel/')) {
            const idMatch = pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
            if (idMatch) channelId = idMatch[1];
        } else if (pathname.includes('/c/')) {
            const customMatch = pathname.match(/\/c\/([^/]+)/);
            if (customMatch) handle = '@' + customMatch[1];
        } else if (pathname.includes('/user/')) {
            const userMatch = pathname.match(/\/user\/([^/]+)/);
            if (userMatch) handle = '@' + userMatch[1];
        }
    } catch {
        // Not a URL — treat as bare handle or channel id
    }

    if (!channelId && !handle) {
        if (trimmed.startsWith('@')) {
            handle = trimmed;
        } else if (trimmed.startsWith('UC') && trimmed.length >= 20) {
            channelId = trimmed;
        } else {
            handle = '@' + trimmed;
        }
    }

    return { channelId, handle };
};

export const TrendService = {
    // --- Channel Management (Firestore) ---

    subscribeToTrendChannels: (userId: string, userChannelId: string, callback: (channels: TrendChannel[]) => void) => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/trendChannels`);
        trackRead('trendChannels', 0, true);
        return onSnapshot(ref, (snapshot) => {
            trackRead('trendChannels', snapshot.size, false);
            const channels = snapshot.docs.map(doc => doc.data() as TrendChannel);
            callback(channels);
        });
    },

    fetchTrendChannels: async (userId: string, userChannelId: string): Promise<TrendChannel[]> => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/trendChannels`);
        const snapshot = await getDocs(ref);
        return snapshot.docs.map(d => d.data() as TrendChannel);
    },

    // --- Niche Management (Firestore) ---

    subscribeToNiches: (userId: string, userChannelId: string, callback: (niches: TrendNiche[]) => void) => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/trendNiches`);
        trackRead('trendNiches', 0, true);
        return onSnapshot(ref, (snapshot) => {
            trackRead('trendNiches', snapshot.size, false);
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
        trackRead('videoNicheAssignments', 0, true);
        return onSnapshot(ref, (snapshot) => {
            trackRead('videoNicheAssignments', snapshot.size, false);
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
        trackRead('hiddenVideos', 0, true);
        return onSnapshot(ref, (snapshot) => {
            trackRead('hiddenVideos', snapshot.size, false);
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

    /**
     * Add a competitor channel.
     *
     * 1. Resolve handle/URL/ID to channel metadata via YouTube `channels.list` (1 quota unit).
     * 2. Persist a minimal channel doc to Firestore with `lastUpdated: 0` — the subscribe-to-channels
     *    snapshot immediately surfaces it in the sidebar.
     * 3. Caller is expected to dispatch `syncChannelCloud` for the new channel id, so videos
     *    and snapshots are filled in by the `manualTrendSync` Cloud Function — the same code
     *    path as the header Sync button. See docs/features/trends/sync-pipeline.md.
     */
    addTrendChannel: async (userId: string, userChannelId: string, channelUrl: string, apiKey: string): Promise<{ channel: TrendChannel }> => {
        const { channelId, handle } = parseChannelInput(channelUrl);

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
            lastUpdated: 0,
        };

        await setDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, newChannel.id), newChannel);

        return { channel: newChannel };
    },

    /**
     * Remove a trend channel from a user channel. Routes through deep-delete so
     * all subcollections, niche assignments, hidden videos, and local niches are
     * cleaned up — not just the channel doc.
     */
    removeTrendChannel: async (userId: string, userChannelId: string, channelId: string) => {
        await TrendService.deleteSourceTrendChannelData(userId, userChannelId, channelId);
    },

    toggleVisibility: async (userId: string, userChannelId: string, channelId: string, isVisible: boolean) => {
        await updateDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, channelId), { isVisible });
    },

    updateChannel: async (userId: string, userChannelId: string, channelId: string, updates: Partial<TrendChannel>) => {
        await updateDoc(doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, channelId), updates);
    },

    // --- Video Fetching & Caching (IndexedDB) ---

    /**
     * Triggers Server-Side Sync for a user channel.
     * The Cloud Function handles fetching, updating metrics/metadata, and notifications.
     */
    syncChannelCloud: async (channelId: string, targetTrendChannelIds?: string[], forceAvatarRefresh?: boolean): Promise<void> => {
        const { functions } = await import('../../config/firebase');
        const { httpsCallable } = await import('firebase/functions');

        const manualTrendSync = httpsCallable(functions, 'manualTrendSync');

        await manualTrendSync({
            channelId, // The context (User Channel ID)
            targetTrendChannelIds, // Optional: specific trend channels to sync
            forceAvatarRefresh
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
        const videos = await idb.getAllFromIndex('videos', 'by-channel', channelId);

        // Self-healing: Backfill timestamp if missing in cache
        let hasUpdates = false;
        videos.forEach(v => {
            if ((!v.publishedAtTimestamp || isNaN(v.publishedAtTimestamp)) && v.publishedAt) {
                v.publishedAtTimestamp = new Date(v.publishedAt).getTime();
                hasUpdates = true;
            }
        });

        // If we fixed any videos, update the cache asynchronously
        if (hasUpdates) {
            const tx = idb.transaction('videos', 'readwrite');
            Promise.all(videos.map(v => tx.store.put(v))).catch(err => console.error('[TrendService] Failed to update healed cache:', err));
            // No await needed, let it run in background
        }

        return videos;
    },

    getChannelVideosFromFirestore: async (userId: string, userChannelId: string, channelId: string) => {
        const ref = collection(db, `users/${userId}/channels/${userChannelId}/trendChannels/${channelId}/videos`);
        const snapshot = await getDocs(ref);
        const videos = snapshot.docs.map(d => {
            const data = d.data() as TrendVideo;
            // Self-healing: If timestamp is missing (due to backend bug), calculate it from string
            if ((!data.publishedAtTimestamp || isNaN(data.publishedAtTimestamp)) && data.publishedAt) {
                data.publishedAtTimestamp = new Date(data.publishedAt).getTime();
            }
            return data;
        });

        // DEBUG: Inspect raw data from Firestore (Reduced logging)
        if (videos.length > 0) {
            // Kept minimal for verification if needed, or remove completely if confident
        }

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

        // Time-based query: fetch all snapshots within the window.
        // Using timestamp cutoff (not document limit) ensures correct coverage
        // even when duplicate snapshots exist (e.g. from re-deploy catch-up).
        let q;
        if (limitDays > 0) {
            const cutoff = Date.now() - limitDays * 24 * 60 * 60 * 1000;
            q = query(ref, where('timestamp', '>=', cutoff), orderBy('timestamp', 'desc'));
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
     * Copy a TrendChannel (channel doc + videos + snapshots + niches + video-niche
     * assignments + hidden videos) from one User Channel to another.
     *
     * @param merge - If true, the trend channel already exists in target and we
     *                only merge niches/assignments/hidden (target keeps its own
     *                channel doc, videos, and — critically — its own snapshot
     *                history). If false (fresh copy), everything is copied and
     *                target gets `lastUpdated: 0` so the post-copy cloud sync
     *                dispatch properly refreshes it.
     *
     * Large channels are handled via chunked batches (commitInChunks). After the
     * writes succeed, a fire-and-forget `syncChannelCloud` keeps the target's
     * snapshot chain alive in its own sync context.
     */
    copyTrendChannel: async (
        userId: string,
        sourceUserChannelId: string,
        targetUserChannelId: string,
        trendChannelId: string,
        merge: boolean
    ): Promise<void> => {
        // 1. Read source channel doc
        const channelRef = doc(db, `users/${userId}/channels/${sourceUserChannelId}/trendChannels`, trendChannelId);
        const channelSnap = await getDoc(channelRef);
        if (!channelSnap.exists()) {
            throw new Error('Source channel not found');
        }
        const channelData = channelSnap.data() as TrendChannel;

        // 2. Read source niches + assignments
        const sourceNiches = await TrendService.getNichesForUserChannel(userId, sourceUserChannelId);
        const sourceAssignmentsRef = collection(db, `users/${userId}/channels/${sourceUserChannelId}/videoNicheAssignments`);
        const sourceAssignmentsSnap = await getDocs(sourceAssignmentsRef);

        // 3. Read source subcollections (videos + snapshots) up-front so we can batch-write them
        const videosSnap = await getDocs(collection(db, `users/${userId}/channels/${sourceUserChannelId}/trendChannels/${trendChannelId}/videos`));
        const videoIds = new Set(videosSnap.docs.map(d => d.id));
        const snapshotsSnap = await getDocs(collection(db, `users/${userId}/channels/${sourceUserChannelId}/trendChannels/${trendChannelId}/snapshots`));

        // 4. Determine which niches are relevant (used by this channel's videos + local to this channel)
        const relevantNicheIds = new Set<string>();
        sourceAssignmentsSnap.docs.forEach(assignDoc => {
            if (videoIds.has(assignDoc.id)) {
                const assignments = assignDoc.data().assignments || [];
                assignments.forEach((a: { nicheId: string }) => relevantNicheIds.add(a.nicheId));
            }
        });
        sourceNiches.forEach(n => {
            if (n.type === 'local' && n.channelId === trendChannelId) {
                relevantNicheIds.add(n.id);
            }
        });
        const nichesToCopy = sourceNiches.filter(n => relevantNicheIds.has(n.id));

        // 5. Read hidden videos belonging to this channel
        const hiddenSnap = await getDocs(collection(db, `users/${userId}/channels/${sourceUserChannelId}/hiddenVideos`));
        const hiddenToCopy = hiddenSnap.docs
            .map(d => d.data() as HiddenVideo)
            .filter(hv => hv.channelId === trendChannelId);

        // 6. If merging, pre-read target niches and target assignment docs that would collide
        const targetNiches: TrendNiche[] = merge
            ? await TrendService.getNichesForUserChannel(userId, targetUserChannelId)
            : [];

        const targetAssignmentsForVideos = new Map<string, { nicheId: string; addedAt: number }[]>();
        if (merge) {
            const targetAssignsRef = collection(db, `users/${userId}/channels/${targetUserChannelId}/videoNicheAssignments`);
            const targetAssignsSnap = await getDocs(targetAssignsRef);
            targetAssignsSnap.docs.forEach(d => {
                if (videoIds.has(d.id)) {
                    targetAssignmentsForVideos.set(d.id, d.data().assignments || []);
                }
            });
        }

        // Build niche ID mapping: source niche ID → target niche ID
        const nicheIdMap = new Map<string, string>();
        const writes: BatchWrite[] = [];

        // 7. Niches: reuse same-name niche if merging, else create fresh doc in target
        for (const niche of nichesToCopy) {
            const existingInTarget = merge ? targetNiches.find(n => n.name === niche.name) : undefined;
            if (existingInTarget) {
                nicheIdMap.set(niche.id, existingInTarget.id);
                continue;
            }
            const newNicheId = crypto.randomUUID();
            nicheIdMap.set(niche.id, newNicheId);
            const newNiche: TrendNiche = {
                ...niche,
                id: newNicheId,
                viewCount: 0, // Recalculated after commit
                createdAt: Date.now()
            };
            const nicheRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/trendNiches`, newNicheId);
            writes.push(b => b.set(nicheRef, newNiche));
        }

        // 8. Channel doc (fresh copy only) — reset lastUpdated so post-copy syncChannelCloud
        //    refreshes it and useTrendVideos knows to re-fetch.
        if (!merge) {
            const targetChannelRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/trendChannels`, trendChannelId);
            writes.push(b => b.set(targetChannelRef, { ...channelData, lastUpdated: 0 }));
        }

        // 9. Videos — always copy (even in merge mode, via set+merge to preserve target-only fields)
        for (const videoDoc of videosSnap.docs) {
            const targetVideoRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/trendChannels/${trendChannelId}/videos`, videoDoc.id);
            const videoData = videoDoc.data();
            if (merge) {
                writes.push(b => b.set(targetVideoRef, videoData, { merge: true }));
            } else {
                writes.push(b => b.set(targetVideoRef, videoData));
            }
        }

        // 10. Snapshots — fresh copy only. In merge mode the target has its own history
        //     which must not be overwritten.
        if (!merge) {
            for (const snapDoc of snapshotsSnap.docs) {
                const targetSnapRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/trendChannels/${trendChannelId}/snapshots`, snapDoc.id);
                writes.push(b => b.set(targetSnapRef, snapDoc.data()));
            }
        }

        // 11. Video-niche assignments with remapped niche IDs
        for (const assignDoc of sourceAssignmentsSnap.docs) {
            if (!videoIds.has(assignDoc.id)) continue;
            const sourceAssignments: { nicheId: string; addedAt: number }[] = assignDoc.data().assignments || [];
            const mappedAssignments = sourceAssignments
                .filter(a => nicheIdMap.has(a.nicheId))
                .map(a => ({
                    nicheId: nicheIdMap.get(a.nicheId)!,
                    addedAt: Date.now()
                }));
            if (mappedAssignments.length === 0) continue;

            const targetAssignRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/videoNicheAssignments`, assignDoc.id);
            if (merge) {
                const existing = targetAssignmentsForVideos.get(assignDoc.id) ?? [];
                const existingNicheIds = new Set(existing.map(a => a.nicheId));
                const merged = [
                    ...existing,
                    ...mappedAssignments.filter(a => !existingNicheIds.has(a.nicheId))
                ];
                writes.push(b => b.set(targetAssignRef, { assignments: merged }));
            } else {
                writes.push(b => b.set(targetAssignRef, { assignments: mappedAssignments }));
            }
        }

        // 12. Hidden videos
        for (const hv of hiddenToCopy) {
            const targetHiddenRef = doc(db, `users/${userId}/channels/${targetUserChannelId}/hiddenVideos`, hv.id);
            writes.push(b => b.set(targetHiddenRef, hv));
        }

        // 13. Commit everything (chunked — safe for any channel size)
        await commitInChunks(writes);

        // 14. Recalculate niche viewCount in target for each niche we touched.
        //     increment() by the sum of copied videos' views, which is the delta vs
        //     pre-copy state. For freshly-created niches the pre-copy value was 0.
        const totalViewsByNicheId = new Map<string, number>();
        for (const assignDoc of sourceAssignmentsSnap.docs) {
            if (!videoIds.has(assignDoc.id)) continue;
            const videoData = videosSnap.docs.find(v => v.id === assignDoc.id)?.data();
            const viewCount = (videoData?.viewCount as number | undefined) ?? 0;
            const assignments: { nicheId: string }[] = assignDoc.data().assignments || [];
            for (const a of assignments) {
                const targetNicheId = nicheIdMap.get(a.nicheId);
                if (!targetNicheId) continue;
                totalViewsByNicheId.set(targetNicheId, (totalViewsByNicheId.get(targetNicheId) ?? 0) + viewCount);
            }
        }
        await Promise.all(
            Array.from(totalViewsByNicheId.entries()).map(([nicheId, totalViews]) =>
                updateDoc(doc(db, `users/${userId}/channels/${targetUserChannelId}/trendNiches`, nicheId), {
                    viewCount: increment(totalViews)
                })
            )
        );

        // 15. Fire-and-forget cloud sync so target's snapshot chain continues in its
        //     own sync context. In merge mode target already syncs on its own schedule;
        //     in fresh copy mode the reset lastUpdated=0 would otherwise leave it stale
        //     until the next daily cron.
        if (!merge) {
            TrendService.syncChannelCloud(targetUserChannelId, [trendChannelId], false).catch(() => {
                // Intentional: caller already succeeded. If this dispatch fails the daily
                // cron or manual Sync will fill the gap. Surfacing an error would confuse
                // the user into thinking the copy itself broke.
            });
        }
    },

    /**
     * Delete every piece of data a trend channel owns inside one user channel:
     * the channel doc, its `videos` and `snapshots` subcollections, the
     * `videoNicheAssignments` for those videos, `hiddenVideos` scoped to this
     * channel, and any *local* niches whose `channelId === trendChannelId`.
     *
     * Global niches are preserved because they may still be used by other trend
     * channels in the same user channel. Also clears the IndexedDB cache for
     * this channel's videos.
     *
     * Idempotent: running twice is safe — Firestore's `batch.delete` does not
     * fail on already-deleted docs.
     */
    deleteSourceTrendChannelData: async (
        userId: string,
        userChannelId: string,
        trendChannelId: string
    ): Promise<void> => {
        // 1. Enumerate what exists
        const videosSnap = await getDocs(collection(db, `users/${userId}/channels/${userChannelId}/trendChannels/${trendChannelId}/videos`));
        const videoIds = new Set(videosSnap.docs.map(d => d.id));
        const snapshotsSnap = await getDocs(collection(db, `users/${userId}/channels/${userChannelId}/trendChannels/${trendChannelId}/snapshots`));
        const hiddenSnap = await getDocs(collection(db, `users/${userId}/channels/${userChannelId}/hiddenVideos`));
        const assignmentsSnap = await getDocs(collection(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`));
        const nichesSnap = await getDocs(collection(db, `users/${userId}/channels/${userChannelId}/trendNiches`));

        const writes: BatchWrite[] = [];

        // 2. Subcollections under the trend channel
        videosSnap.docs.forEach(d => {
            const ref = doc(db, `users/${userId}/channels/${userChannelId}/trendChannels/${trendChannelId}/videos`, d.id);
            writes.push(b => b.delete(ref));
        });
        snapshotsSnap.docs.forEach(d => {
            const ref = doc(db, `users/${userId}/channels/${userChannelId}/trendChannels/${trendChannelId}/snapshots`, d.id);
            writes.push(b => b.delete(ref));
        });

        // 3. The trend channel doc itself
        const channelRef = doc(db, `users/${userId}/channels/${userChannelId}/trendChannels`, trendChannelId);
        writes.push(b => b.delete(channelRef));

        // 4. Niche assignments for this channel's videos
        assignmentsSnap.docs.forEach(d => {
            if (videoIds.has(d.id)) {
                const ref = doc(db, `users/${userId}/channels/${userChannelId}/videoNicheAssignments`, d.id);
                writes.push(b => b.delete(ref));
            }
        });

        // 5. Hidden videos for this channel
        hiddenSnap.docs.forEach(d => {
            const data = d.data() as HiddenVideo;
            if (data.channelId === trendChannelId) {
                const ref = doc(db, `users/${userId}/channels/${userChannelId}/hiddenVideos`, d.id);
                writes.push(b => b.delete(ref));
            }
        });

        // 6. Local niches pinned to this channel. Global niches stay — other channels may use them.
        nichesSnap.docs.forEach(d => {
            const data = d.data() as TrendNiche;
            if (data.type === 'local' && data.channelId === trendChannelId) {
                const ref = doc(db, `users/${userId}/channels/${userChannelId}/trendNiches`, d.id);
                writes.push(b => b.delete(ref));
            }
        });

        await commitInChunks(writes);

        // 7. Clear IndexedDB cache for this channel's videos (browser-only; skip on server/test)
        try {
            const idb = await getDB();
            const tx = idb.transaction('videos', 'readwrite');
            const index = tx.store.index('by-channel');
            let cursor = await index.openCursor(IDBKeyRange.only(trendChannelId));
            while (cursor) {
                await cursor.delete();
                cursor = await cursor.continue();
            }
            await tx.done;
        } catch {
            // IDB not available (e.g. in Node test environments) — Firestore state is the source of truth
        }
    },

    /**
     * Move a TrendChannel between User Channels. Composition of copyTrendChannel +
     * deleteSourceTrendChannelData. Non-atomic: if the delete step fails after a
     * successful copy the source is left with leftover data. Callers should surface
     * a "partial move — retry to clean up" state; the delete is idempotent so retry
     * is safe.
     */
    moveTrendChannel: async (
        userId: string,
        sourceUserChannelId: string,
        targetUserChannelId: string,
        trendChannelId: string,
        merge: boolean
    ): Promise<void> => {
        await TrendService.copyTrendChannel(userId, sourceUserChannelId, targetUserChannelId, trendChannelId, merge);
        await TrendService.deleteSourceTrendChannelData(userId, sourceUserChannelId, trendChannelId);
    }
};
