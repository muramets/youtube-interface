import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RankingService, type SavedRanking } from '../../../core/services/rankingService';

export type { SavedRanking } from '../../../core/services/rankingService';

export function usePlaylistRankings(userId: string, channelId: string, playlistId: string) {
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => ['rankings', userId, channelId, playlistId], [userId, channelId, playlistId]);
    const enabled = !!userId && !!channelId && !!playlistId;

    // Initial fetch
    useQuery<SavedRanking[]>({
        queryKey,
        queryFn: () => Promise.resolve([]), // Populated by subscription
        enabled,
        staleTime: Infinity,
    });

    // Realtime subscription
    useEffect(() => {
        if (!enabled) return;
        const unsubscribe = RankingService.subscribeToRankings(userId, channelId, playlistId, (data) => {
            queryClient.setQueryData(queryKey, data);
        });
        return () => unsubscribe();
    }, [userId, channelId, playlistId, enabled, queryClient, queryKey]);

    const rawRankings = queryClient.getQueryData<SavedRanking[]>(queryKey);
    const rankings = useMemo(() => rawRankings || [], [rawRankings]);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: async ({ name, videoOrder }: { name: string; videoOrder: string[] }) => {
            const ranking: SavedRanking = {
                id: `ranking-${Date.now()}`,
                name,
                playlistId,
                videoOrder,
                createdAt: Date.now(),
            };
            await RankingService.saveRanking(userId, channelId, playlistId, ranking);
            return ranking;
        },
        onMutate: async ({ name, videoOrder }) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<SavedRanking[]>(queryKey) || [];
            const optimistic: SavedRanking = {
                id: `ranking-${Date.now()}`,
                name,
                playlistId,
                videoOrder,
                createdAt: Date.now(),
            };
            queryClient.setQueryData(queryKey, [...prev, optimistic]);
            return { prev };
        },
        onError: (_err, _vars, context) => {
            if (context?.prev) queryClient.setQueryData(queryKey, context.prev);
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (rankingId: string) => {
            await RankingService.deleteRanking(userId, channelId, playlistId, rankingId);
        },
        onMutate: async (rankingId: string) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<SavedRanking[]>(queryKey) || [];
            queryClient.setQueryData(queryKey, prev.filter(r => r.id !== rankingId));
            return { prev };
        },
        onError: (_err, _vars, context) => {
            if (context?.prev) queryClient.setQueryData(queryKey, context.prev);
        },
    });

    const saveRanking = useCallback((name: string, videoOrder: string[]) => {
        saveMutation.mutate({ name, videoOrder });
    }, [saveMutation]);

    const deleteRanking = useCallback((rankingId: string) => {
        deleteMutation.mutate(rankingId);
    }, [deleteMutation]);

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
