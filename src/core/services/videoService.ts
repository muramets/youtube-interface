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
import { deleteCsvSnapshot } from './storageService';

export const getVideosPath = (userId: string, channelId: string): string =>
    `users/${userId}/channels/${channelId}/videos`;

export const getSuggestedVideosPath = (userId: string, channelId: string): string =>
    `users/${userId}/channels/${channelId}/cached_suggested_traffic_videos`;

interface BatchUpdateItem {
    videoId: string;
    data: Partial<VideoDetails>;
}



// Helper to cleanup traffic data
const cleanupTrafficData = async (trafficPath: string): Promise<void> => {
    const trafficSnapshot = await getDocs(getCollectionRef(trafficPath));
    if (trafficSnapshot.empty) return;

    const mainDoc = trafficSnapshot.docs.find(d => d.id === 'main');
    if (mainDoc) {
        const trafficData = mainDoc.data();
        if (trafficData && Array.isArray(trafficData.snapshots)) {
            const csvDeletions = trafficData.snapshots
                .filter((s: { storagePath?: string }) => s.storagePath)
                .map((s: { storagePath: string }) => deleteCsvSnapshot(s.storagePath));
            await Promise.all(csvDeletions);
        }
    }

    const deleteTrafficPromises = trafficSnapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deleteTrafficPromises);
};

export const VideoService = {
    fetchVideos: async (userId: string, channelId: string): Promise<VideoDetails[]> => {
        return fetchCollection<VideoDetails>(getVideosPath(userId, channelId));
    },

    fetchSuggestedVideos: async (userId: string, channelId: string): Promise<VideoDetails[]> => {
        return fetchCollection<VideoDetails>(getSuggestedVideosPath(userId, channelId));
    },

    getVideoDocRef(userId: string, channelId: string, videoId: string) {
        return doc(db, getVideosPath(userId, channelId), videoId);
    },

    getVideo: async (userId: string, channelId: string, videoId: string): Promise<VideoDetails | null> => {
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
    ): Promise<void> => {
        const videoWithTimestamp = { ...video };

        if (video.addedToHomeAt) {
            videoWithTimestamp.addedToHomeAt = video.addedToHomeAt;
        } else if (!video.isPlaylistOnly) {
            videoWithTimestamp.addedToHomeAt = Date.now();
        } else {
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
        updates: BatchUpdateItem[]
    ): Promise<void> => {
        const batch = writeBatch(db);
        const path = getVideosPath(userId, channelId);
        updates.forEach(({ videoId, data }) => {
            const docRef = doc(db, path, videoId);
            batch.set(docRef, data, { merge: true });
        });
        await batch.commit();
    },

    batchUpdateSuggestedVideos: async (
        userId: string,
        channelId: string,
        updates: BatchUpdateItem[]
    ): Promise<void> => {
        const batch = writeBatch(db);
        const path = getSuggestedVideosPath(userId, channelId);
        updates.forEach(({ videoId, data }) => {
            const docRef = doc(db, path, videoId);
            batch.set(docRef, data, { merge: true });
        });
        await batch.commit();
    },

    updateVideo: async (
        userId: string,
        channelId: string,
        videoId: string,
        updates: Partial<VideoDetails>
    ): Promise<void> => {
        await updateDocument(
            getVideosPath(userId, channelId),
            videoId,
            updates as DocumentData
        );
    },

    updateVideoSafe: async (
        userId: string,
        channelId: string,
        videoId: string,
        updates: Partial<VideoDetails>,
        expectedRevision?: number
    ): Promise<void> => {
        const { runSafeUpdate } = await import('./firestore');
        await runSafeUpdate<VideoDetails>(
            getVideosPath(userId, channelId),
            videoId,
            'packagingRevision',
            expectedRevision,
            () => updates
        );
    },

    deleteVideo: async (
        userId: string,
        channelId: string,
        videoId: string
    ): Promise<void> => {
        // 1. Storage Cleanup: Delete entire video folder
        try {
            const { deleteFolder } = await import('./storageService');
            // Folder structure: users/{userId}/channels/{channelId}/videos/{videoId}/
            const videoStoragePath = `users/${userId}/channels/${channelId}/videos/${videoId}`;
            await deleteFolder(videoStoragePath);
        } catch (error) {
            console.error('Failed to cleanup storage folder:', error);
            // Continue deletion even if storage cleanup fails partially
        }

        // 2. Traffic Data Cleanup (Firestore)
        const path = `${getVideosPath(userId, channelId)}/${videoId}`;
        const trafficPath = `${path}/traffic`;
        await cleanupTrafficData(trafficPath);

        // 3. History Subcollection Cleanup
        const historyPath = `${path}/history`;
        const historyRef = getCollectionRef(historyPath);
        const historySnapshot = await getDocs(historyRef);
        await Promise.all(historySnapshot.docs.map(d => deleteDoc(d.ref)));

        // 4. Delete Main Video Doc
        await deleteDocument(getVideosPath(userId, channelId), videoId);

        // 5. Cleanup videoOrder
        try {
            const { SettingsService } = await import('./settingsService');
            const currentOrder = await SettingsService.fetchVideoOrder(userId, channelId);
            if (currentOrder && currentOrder.includes(videoId)) {
                const newOrder = currentOrder.filter(id => id !== videoId);
                await SettingsService.updateVideoOrder(userId, channelId, newOrder);
            }
        } catch (error) {
            console.error('Failed to cleanup videoOrder:', error);
        }

        // 6. Cleanup playlists (remove video from all playlists that contain it)
        try {
            const { PlaylistService } = await import('./playlistService');
            const playlists = await PlaylistService.fetchPlaylists(userId, channelId);
            const playlistsWithVideo = playlists.filter(p => p.videoIds.includes(videoId));

            if (playlistsWithVideo.length > 0) {
                const batch = writeBatch(db);
                const playlistsPath = `users/${userId}/channels/${channelId}/playlists`;

                for (const playlist of playlistsWithVideo) {
                    const playlistRef = doc(db, playlistsPath, playlist.id);
                    const updatedVideoIds = playlist.videoIds.filter(id => id !== videoId);
                    batch.update(playlistRef, { videoIds: updatedVideoIds });
                }

                await batch.commit();
            }
        } catch (error) {
            console.error('Failed to cleanup playlists:', error);
        }
    },

    // --- Subcollections ---

    fetchVideoHistory: async (
        userId: string,
        channelId: string,
        videoId: string
    ): Promise<CoverVersion[]> => {
        const historyPath = `${getVideosPath(userId, channelId)}/${videoId}/history`;
        return fetchCollection<CoverVersion>(historyPath, [orderBy('timestamp', 'desc')]);
    },

    saveVideoHistory: async (
        userId: string,
        channelId: string,
        videoId: string,
        historyItem: HistoryItem
    ): Promise<void> => {
        const historyPath = `${getVideosPath(userId, channelId)}/${videoId}/history`;
        const historyId = historyItem.timestamp.toString();
        await setDocument(historyPath, historyId, historyItem);
    },

    deleteVideoHistoryItem: async (
        userId: string,
        channelId: string,
        videoId: string,
        historyId: string
    ): Promise<void> => {
        const historyPath = `${getVideosPath(userId, channelId)}/${videoId}/history`;
        await deleteDocument(historyPath, historyId);
    },

    saveTrafficData: async (
        userId: string,
        channelId: string,
        videoId: string,
        data: Record<string, unknown>
    ): Promise<void> => {
        const trafficPath = `${getVideosPath(userId, channelId)}/${videoId}/traffic`;
        await setDocument(trafficPath, 'main', data);
    },

    fetchTrafficData: async (
        userId: string,
        channelId: string,
        videoId: string
    ): Promise<DocumentData | null> => {
        const trafficPath = `${getVideosPath(userId, channelId)}/${videoId}/traffic`;
        const snapshot = await getDocs(getCollectionRef(trafficPath));
        if (snapshot.empty) return null;
        const mainDoc = snapshot.docs.find(d => d.id === 'main');
        return mainDoc ? mainDoc.data() : null;
    }
};
