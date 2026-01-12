import {
    getCollectionRef,
    setDocument,
    deleteDocument,
    subscribeToCollection,
    fetchCollection,
    getDocument,
    updateDocument
} from './firestore';
import type { DocumentData } from 'firebase/firestore';
import type { VideoDetails, HistoryItem, CoverVersion } from '../utils/youtubeApi';
import { orderBy, getDocs, deleteDoc, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { deleteImageFromStorage } from './storageService';

export const getVideosPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/videos`;

export const getSuggestedVideosPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/cached_suggested_traffic_videos`;

export const VideoService = {
    fetchVideos: async (userId: string, channelId: string) => {
        return fetchCollection<VideoDetails>(getVideosPath(userId, channelId));
    },

    fetchSuggestedVideos: async (userId: string, channelId: string) => {
        return fetchCollection<VideoDetails>(getSuggestedVideosPath(userId, channelId));
    },

    getVideoDocRef(userId: string, channelId: string, videoId: string) {
        return doc(db, getVideosPath(userId, channelId), videoId);
    },

    getVideo: async (userId: string, channelId: string, videoId: string) => {
        const path = `${getVideosPath(userId, channelId)}/${videoId}`;
        return getDocument<VideoDetails>(path);
    },

    subscribeToVideos: (
        userId: string,
        channelId: string,
        callback: (videos: VideoDetails[]) => void
    ) => {
        return subscribeToCollection<VideoDetails>(
            getVideosPath(userId, channelId),
            callback
        );
    },

    addVideo: async (
        userId: string,
        channelId: string,
        video: VideoDetails
    ) => {
        const videoWithTimestamp = { ...video };

        // Auto-set addedToHomeAt if not provided and video is not playlist-only.
        // If it is playlist-only, we do NOT want this field (it stays undefined/missing).
        // Firestore setDoc throws on 'undefined', so we must ensure it's not present in the object.
        if (video.addedToHomeAt) {
            videoWithTimestamp.addedToHomeAt = video.addedToHomeAt;
        } else if (!video.isPlaylistOnly) {
            videoWithTimestamp.addedToHomeAt = Date.now();
        } else {
            // Explicitly delete if it exists as undefined to be safe
            delete videoWithTimestamp.addedToHomeAt;
        }

        await setDocument(
            getVideosPath(userId, channelId),
            video.id,
            videoWithTimestamp
        );
    },


    batchUpdateVideos: async (
        userId: string,
        channelId: string,
        updates: { videoId: string; data: Partial<VideoDetails> }[]
    ) => {
        const batch = writeBatch(db);
        updates.forEach(({ videoId, data }) => {
            const docRef = doc(db, getVideosPath(userId, channelId), videoId);
            batch.set(docRef, data, { merge: true });
        });
        await batch.commit();
    },

    batchUpdateSuggestedVideos: async (
        userId: string,
        channelId: string,
        updates: { videoId: string; data: Partial<VideoDetails> }[]
    ) => {
        const batch = writeBatch(db);
        updates.forEach(({ videoId, data }) => {
            const docRef = doc(db, getSuggestedVideosPath(userId, channelId), videoId);
            batch.set(docRef, data, { merge: true });
        });
        await batch.commit();
    },

    updateVideo: async (
        userId: string,
        channelId: string,
        videoId: string,
        updates: Partial<VideoDetails>
    ) => {
        // Use updateDoc to properly replace fields (including arrays) instead of merge
        await updateDocument(
            getVideosPath(userId, channelId),
            videoId,
            updates as DocumentData
        );
    },

    /**
     * BUSINESS LOGIC: Safe Update with Optimistic Locking
     * 
     * Uses packagingRevision to prevent concurrent edit conflicts.
     */
    updateVideoSafe: async (
        userId: string,
        channelId: string,
        videoId: string,
        updates: Partial<VideoDetails>,
        expectedRevision?: number
    ) => {
        const { runSafeUpdate } = await import('./firestore');
        return runSafeUpdate<VideoDetails>(
            getVideosPath(userId, channelId),
            videoId,
            'packagingRevision',
            expectedRevision,
            () => {
                // Determine if we need to auto-apply revision based on which fields are changing
                // For now, any explicit call to updateVideoSafe assumes a revision increment is desired.
                return updates;
            }
        );
    },

    deleteVideo: async (
        userId: string,
        channelId: string,
        videoId: string
    ) => {
        // 1. Fetch video details to get image URLs
        const videoPath = `${getVideosPath(userId, channelId)}/${videoId}`;
        const video = await getDocument<VideoDetails>(videoPath);

        if (video) {
            const imagesToDelete = new Set<string>();

            // Helper to add URL if it's a storage URL
            const addUrl = (url?: string | null) => {
                if (url && url.includes('firebasestorage.googleapis.com')) {
                    // CRITICAL: Only delete if the URL path contains this specific video's ID
                    // The path structure is users/{userId}/channels/{channelId}/videos/{videoId}/...
                    // Or for legacy: covers/{userId}/...
                    // If we are deleting a video, we should only delete files in its specific folder if following new structure.
                    // For legacy structure, we might still have issues, but let's at least protect against cross-video deletion if we can identify the path.
                    // Decoded URL contains the path.
                    try {
                        const decodedUrl = decodeURIComponent(url);
                        // Check if the path contains the video ID
                        if (decodedUrl.includes(videoId)) {
                            imagesToDelete.add(url);
                        } else if (decodedUrl.includes(`covers/${userId}`)) {
                            // Legacy path: tricky. If it's a clone, this might be shared.
                            // If it's a clone, `clonedFromId` will be set.
                            // However, we don't know if other videos use it. 
                            // SAFEST BET: Don't delete legacy files automatically if we are unsure.
                            // Or maybe just don't delete legacy files at all to be safe?
                            // User complaint was about missing covers after delete.
                            // Let's being conservative: ONLY delete if it explicitly matches the new structure with videoId.
                            // imagesToDelete.add(url); // SKIP LEGACY DELETE TO BE SAFE
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            };

            // Collect URLs
            addUrl(video.customImage);

            // History
            video.coverHistory?.forEach(h => addUrl(h.url));

            // Packaging History
            video.packagingHistory?.forEach(v => {
                if (v.configurationSnapshot) {
                    addUrl(v.configurationSnapshot.coverImage);
                    v.configurationSnapshot.abTestVariants?.forEach(variant => addUrl(variant));
                }
            });

            // A/B Test Variants (if stored at top level)
            video.abTestVariants?.forEach(variant => addUrl(variant));

            // Delete all images
            await Promise.all(Array.from(imagesToDelete).map(url => deleteImageFromStorage(url)));
        }

        // 2. Traffic Data Cleanup (Snapshots & CSVs)
        const trafficPath = `${getVideosPath(userId, channelId)}/${videoId}/traffic`;
        const trafficSnapshot = await getDocs(getCollectionRef(trafficPath));

        if (!trafficSnapshot.empty) {
            // Fetch the main traffic document to get snapshots
            const mainDoc = trafficSnapshot.docs.find(d => d.id === 'main');
            if (mainDoc) {
                const trafficData = mainDoc.data() as any; // Cast to avoid type issues if types are not perfectly aligned
                if (trafficData.snapshots && Array.isArray(trafficData.snapshots)) {
                    const { deleteCsvSnapshot } = await import('./storageService');
                    // Delete all CSV snapshots from Cloud Storage
                    const csvDeletions = trafficData.snapshots
                        .filter((s: any) => s.storagePath)
                        .map((s: any) => deleteCsvSnapshot(s.storagePath));

                    await Promise.all(csvDeletions);
                }
            }

            // Delete traffic subcollection documents
            const deleteTrafficPromises = trafficSnapshot.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deleteTrafficPromises);
        }

        // 3. Delete History Subcollection
        const historyPath = `${getVideosPath(userId, channelId)}/${videoId}/history`;
        const historyRef = getCollectionRef(historyPath);
        const historySnapshot = await getDocs(historyRef);
        const deleteHistoryPromises = historySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deleteHistoryPromises);

        // 4. Delete Video Document
        await deleteDocument(
            getVideosPath(userId, channelId),
            videoId
        );

        // 5. CLEANUP: Remove from videoOrder
        try {
            const { SettingsService } = await import('./settingsService');
            const currentOrder = await SettingsService.fetchVideoOrder(userId, channelId);
            if (currentOrder && currentOrder.includes(videoId)) {
                const newOrder = currentOrder.filter(id => id !== videoId);
                await SettingsService.updateVideoOrder(userId, channelId, newOrder);
            }
        } catch (error) {
            console.error('Failed to cleanup videoOrder:', error);
            // Don't throw - video is already deleted, this is just cleanup
        }
    },

    // History Subcollection
    fetchVideoHistory: async (
        userId: string,
        channelId: string,
        videoId: string
    ) => {
        const historyPath = `${getVideosPath(userId, channelId)}/${videoId}/history`;
        return fetchCollection<CoverVersion>(historyPath, [orderBy('timestamp', 'desc')]);
    },

    saveVideoHistory: async (
        userId: string,
        channelId: string,
        videoId: string,
        historyItem: HistoryItem
    ) => {
        const historyPath = `${getVideosPath(userId, channelId)}/${videoId}/history`;
        const historyId = historyItem.timestamp.toString();
        await setDocument(historyPath, historyId, historyItem);
    },

    deleteVideoHistoryItem: async (
        userId: string,
        channelId: string,
        videoId: string,
        historyId: string
    ) => {
        const historyPath = `${getVideosPath(userId, channelId)}/${videoId}/history`;
        await deleteDocument(historyPath, historyId);
    },

    // Traffic Data Subcollection
    saveTrafficData: async (
        userId: string,
        channelId: string,
        videoId: string,
        data: any // Using any to avoid circular dependency with types/traffic.ts if not imported yet, but better to import
    ) => {
        const trafficPath = `${getVideosPath(userId, channelId)}/${videoId}/traffic`;
        await setDocument(trafficPath, 'main', data);
    },

    fetchTrafficData: async (
        userId: string,
        channelId: string,
        videoId: string
    ) => {
        const trafficPath = `${getVideosPath(userId, channelId)}/${videoId}/traffic`;
        const snapshot = await getDocs(getCollectionRef(trafficPath));
        if (snapshot.empty) return null;
        // Assuming only one document 'main' exists
        const doc = snapshot.docs.find(d => d.id === 'main');
        return doc ? doc.data() : null;
    }
};
