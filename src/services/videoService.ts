import {
    getCollectionRef,
    setDocument,
    deleteDocument,
    subscribeToCollection,
    fetchCollection
} from './firestore';
import type { VideoDetails, HistoryItem, CoverVersion } from '../utils/youtubeApi';
import { orderBy, getDocs, deleteDoc, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';

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
        // 1. Delete History Subcollection
        const historyPath = `${getVideosPath(userId, channelId)}/${videoId}/history`;
        const historyRef = getCollectionRef(historyPath);
        const historySnapshot = await getDocs(historyRef);
        const deleteHistoryPromises = historySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deleteHistoryPromises);

        // 2. Delete Video Document
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
    }
};
