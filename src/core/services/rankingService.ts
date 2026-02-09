import {
    setDocument,
    deleteDocument,
    subscribeToCollection,
} from './firestore';
import { orderBy } from 'firebase/firestore';

export interface SavedRanking {
    id: string;
    name: string;
    playlistId: string;
    videoOrder: string[];
    createdAt: number;
}

const getRankingsPath = (userId: string, channelId: string, playlistId: string) =>
    `users/${userId}/channels/${channelId}/playlists/${playlistId}/rankings`;

export const RankingService = {
    subscribeToRankings: (
        userId: string,
        channelId: string,
        playlistId: string,
        callback: (rankings: SavedRanking[]) => void
    ) => {
        return subscribeToCollection<SavedRanking>(
            getRankingsPath(userId, channelId, playlistId),
            callback,
            [orderBy('createdAt')]
        );
    },

    saveRanking: async (
        userId: string,
        channelId: string,
        playlistId: string,
        ranking: SavedRanking
    ) => {
        await setDocument(
            getRankingsPath(userId, channelId, playlistId),
            ranking.id,
            ranking
        );
    },

    deleteRanking: async (
        userId: string,
        channelId: string,
        playlistId: string,
        rankingId: string
    ) => {
        await deleteDocument(
            getRankingsPath(userId, channelId, playlistId),
            rankingId
        );
    },
};
