import {
    setDocument,
    deleteDocument,
    subscribeToCollection,
} from './firestore';
import { orderBy } from 'firebase/firestore';

export interface SavedRanking {
    id: string;
    name: string;
    /** @deprecated Use scopePath for new code. Kept for backward compat with playlist rankings. */
    playlistId?: string;
    videoOrder: string[];
    createdAt: number;
}

const getRankingsPath = (userId: string, channelId: string, scopePath: string) =>
    `users/${userId}/channels/${channelId}/${scopePath}/rankings`;

export const RankingService = {
    subscribeToRankings: (
        userId: string,
        channelId: string,
        scopePath: string,
        callback: (rankings: SavedRanking[]) => void
    ) => {
        return subscribeToCollection<SavedRanking>(
            getRankingsPath(userId, channelId, scopePath),
            callback,
            [orderBy('createdAt')]
        );
    },

    saveRanking: async (
        userId: string,
        channelId: string,
        scopePath: string,
        ranking: SavedRanking
    ) => {
        await setDocument(
            getRankingsPath(userId, channelId, scopePath),
            ranking.id,
            ranking
        );
    },

    deleteRanking: async (
        userId: string,
        channelId: string,
        scopePath: string,
        rankingId: string
    ) => {
        await deleteDocument(
            getRankingsPath(userId, channelId, scopePath),
            rankingId
        );
    },
};
