import { useState, useCallback, useMemo } from 'react';

export interface SavedRanking {
    id: string;
    name: string;
    playlistId: string;
    videoOrder: string[];
    createdAt: number;
}

const STORAGE_KEY_PREFIX = 'rankings';

function getStorageKey(channelId: string, playlistId: string): string {
    return `${STORAGE_KEY_PREFIX}-${channelId}-${playlistId}`;
}

function loadRankings(channelId: string, playlistId: string): SavedRanking[] {
    try {
        const raw = localStorage.getItem(getStorageKey(channelId, playlistId));
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function persistRankings(channelId: string, playlistId: string, rankings: SavedRanking[]): void {
    localStorage.setItem(getStorageKey(channelId, playlistId), JSON.stringify(rankings));
}

export function usePlaylistRankings(channelId: string, playlistId: string) {
    const [rankings, setRankings] = useState<SavedRanking[]>(() => loadRankings(channelId, playlistId));

    const saveRanking = useCallback((name: string, videoOrder: string[]) => {
        const newRanking: SavedRanking = {
            id: `ranking-${Date.now()}`,
            name,
            playlistId,
            videoOrder,
            createdAt: Date.now(),
        };
        setRankings(prev => {
            const next = [...prev, newRanking];
            persistRankings(channelId, playlistId, next);
            return next;
        });
        return newRanking;
    }, [channelId, playlistId]);

    const deleteRanking = useCallback((rankingId: string) => {
        setRankings(prev => {
            const next = prev.filter(r => r.id !== rankingId);
            persistRankings(channelId, playlistId, next);
            return next;
        });
    }, [channelId, playlistId]);

    const getRanking = useCallback((rankingId: string) => {
        return rankings.find(r => r.id === rankingId) ?? null;
    }, [rankings]);

    return useMemo(() => ({
        rankings,
        saveRanking,
        deleteRanking,
        getRanking,
    }), [rankings, saveRanking, deleteRanking, getRanking]);
}
