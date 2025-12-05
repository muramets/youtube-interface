import {
    getCollectionRef,
    setDocument,
    deleteDocument,
    subscribeToCollection,
    fetchCollection,
    getDocument
} from './firestore';
import type { VideoDetails, HistoryItem, CoverVersion } from '../utils/youtubeApi';
import { orderBy, getDocs, deleteDoc, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { deleteImageFromStorage } from './storageService';

const getVideosPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/videos`;

export const VideoService = {
    fetchVideos: async (userId: string, channelId: string) => {
        return fetchCollection<VideoDetails>(getVideosPath(userId, channelId));
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
        await setDocument(
            getVideosPath(userId, channelId),
            video.id,
            video
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

    updateVideo: async (
        userId: string,
        channelId: string,
        videoId: string,
        updates: Partial<VideoDetails>
    ) => {
        await setDocument(
            getVideosPath(userId, channelId),
            videoId,
            updates,
            true
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
                addUrl(v.configurationSnapshot.coverImage);
                v.configurationSnapshot.abTestVariants?.forEach(variant => addUrl(variant));
            });

            // A/B Test Variants (if stored at top level)
            video.abTestVariants?.forEach(variant => addUrl(variant));

            // Delete all images
            await Promise.all(Array.from(imagesToDelete).map(url => deleteImageFromStorage(url)));
        }

        // 2. Delete History Subcollection
        const historyPath = `${getVideosPath(userId, channelId)}/${videoId}/history`;
        const historyRef = getCollectionRef(historyPath);
        const historySnapshot = await getDocs(historyRef);
        const deleteHistoryPromises = historySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deleteHistoryPromises);

        // 3. Delete Video Document
        await deleteDocument(
            getVideosPath(userId, channelId),
            videoId
        );
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
