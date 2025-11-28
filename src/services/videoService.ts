import {
    getCollectionRef,
    setDocument,
    deleteDocument,
    subscribeToCollection,
    fetchCollection
} from './firestore';
import type { VideoDetails } from '../utils/youtubeApi';
import { orderBy, getDocs, deleteDoc } from 'firebase/firestore';

const getVideosPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/videos`;

export const VideoService = {
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
        return fetchCollection<any>(historyPath, [orderBy('timestamp', 'desc')]);
    },

    saveVideoHistory: async (
        userId: string,
        channelId: string,
        videoId: string,
        historyItem: any
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
