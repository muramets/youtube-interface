import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { KnowledgeService } from '../services/knowledge/knowledgeService';
import { KnowledgeCategoryService } from '../services/knowledge/knowledgeCategoryService';
import type { KnowledgeItem, KnowledgeCategoryEntry } from '../types/knowledge';

// =============================================================================
// Video Knowledge Items
// =============================================================================

export const useVideoKnowledgeItems = (userId: string, channelId: string, videoId: string) => {
    const queryClient = useQueryClient();
    const queryKey = useMemo(
        () => ['knowledgeItems', userId, channelId, videoId],
        [userId, channelId, videoId]
    );

    const EMPTY: KnowledgeItem[] = useMemo(() => [], []);

    const { data: rawItems, isLoading, error } = useQuery<KnowledgeItem[]>({
        queryKey,
        queryFn: () => KnowledgeService.getVideoKnowledgeItems(userId, channelId, videoId),
        staleTime: Infinity,
        enabled: !!userId && !!channelId && !!videoId,
    });

    // Real-time subscription
    useEffect(() => {
        if (!userId || !channelId || !videoId) return;
        const unsubscribe = KnowledgeService.subscribeToVideoKnowledgeItems(
            userId, channelId, videoId,
            (data) => queryClient.setQueryData(queryKey, data)
        );
        return () => unsubscribe();
    }, [userId, channelId, videoId, queryClient, queryKey]);

    return { items: rawItems || EMPTY, isLoading, error };
};

// =============================================================================
// Channel Knowledge Items
// =============================================================================

export const useChannelKnowledgeItems = (userId: string, channelId: string) => {
    const queryClient = useQueryClient();
    const queryKey = useMemo(
        () => ['knowledgeItems', userId, channelId, 'channel'],
        [userId, channelId]
    );

    const EMPTY: KnowledgeItem[] = useMemo(() => [], []);

    const { data: rawItems, isLoading, error } = useQuery<KnowledgeItem[]>({
        queryKey,
        queryFn: () => KnowledgeService.getChannelKnowledgeItems(userId, channelId),
        staleTime: Infinity,
        enabled: !!userId && !!channelId,
    });

    // Real-time subscription
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsubscribe = KnowledgeService.subscribeToChannelKnowledgeItems(
            userId, channelId,
            (data) => queryClient.setQueryData(queryKey, data)
        );
        return () => unsubscribe();
    }, [userId, channelId, queryClient, queryKey]);

    return { items: rawItems || EMPTY, isLoading, error };
};

// =============================================================================
// Knowledge Categories
// =============================================================================

export const useKnowledgeCategories = (userId: string, channelId: string) => {
    const EMPTY: KnowledgeCategoryEntry[] = useMemo(() => [], []);

    const { data: rawCategories, isLoading, error } = useQuery<KnowledgeCategoryEntry[]>({
        queryKey: ['knowledgeCategories', userId, channelId],
        queryFn: () => KnowledgeCategoryService.getCategories(userId, channelId),
        staleTime: 5 * 60 * 1000, // 5 min — categories change rarely
        enabled: !!userId && !!channelId,
    });

    return { categories: rawCategories || EMPTY, isLoading, error };
};

// =============================================================================
// Mutations
// =============================================================================

export const useUpdateKnowledgeItem = (userId: string, channelId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            itemId,
            updates,
        }: {
            itemId: string;
            updates: Partial<Pick<KnowledgeItem, 'title' | 'content' | 'summary'>>;
        }) => {
            await KnowledgeService.updateKnowledgeItem(userId, channelId, itemId, updates);
        },
        onSuccess: () => {
            // Invalidate all KI queries for this channel — both video and channel level
            queryClient.invalidateQueries({
                queryKey: ['knowledgeItems', userId, channelId],
            });
        },
    });
};

export const useDeleteKnowledgeItem = (userId: string, channelId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (itemId: string) => {
            await KnowledgeService.deleteKnowledgeItem(userId, channelId, itemId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['knowledgeItems', userId, channelId],
            });
        },
    });
};

export const useCreateKnowledgeItem = (userId: string, channelId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (item: {
            category: string;
            title: string;
            content: string;
            summary: string;
            scope: 'video' | 'channel';
            videoId?: string;
        }) => {
            return KnowledgeService.createManualKnowledgeItem(userId, channelId, item);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['knowledgeItems', userId, channelId],
            });
        },
    });
};
