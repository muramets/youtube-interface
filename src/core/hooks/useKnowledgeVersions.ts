import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { KnowledgeVersionService } from '../services/knowledge/knowledgeVersionService';
import type { KnowledgeVersionWithId } from '../types/knowledge';

/**
 * TanStack Query hook for KI version history.
 * Fetches versions subcollection, provides delete mutation.
 */
export const useKnowledgeVersions = (
    userId: string,
    channelId: string,
    kiId: string,
) => {
    const queryClient = useQueryClient();
    const queryKey = useMemo(
        () => ['knowledgeVersions', userId, channelId, kiId],
        [userId, channelId, kiId],
    );

    const EMPTY: KnowledgeVersionWithId[] = useMemo(() => [], []);

    const { data: versions, isLoading } = useQuery<KnowledgeVersionWithId[]>({
        queryKey,
        queryFn: () => KnowledgeVersionService.getVersions(userId, channelId, kiId),
        staleTime: 30_000, // 30s — versions change infrequently
        enabled: !!userId && !!channelId && !!kiId,
    });

    const deleteMutation = useMutation({
        mutationFn: (versionId: string) =>
            KnowledgeVersionService.deleteVersion(userId, channelId, kiId, versionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    const deleteVersionsMutation = useMutation({
        mutationFn: (versionIds: string[]) =>
            KnowledgeVersionService.deleteVersions(userId, channelId, kiId, versionIds),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    return {
        versions: versions || EMPTY,
        isLoading,
        deleteVersion: deleteMutation.mutate,
        deleteVersions: deleteVersionsMutation.mutate,
    };
};
