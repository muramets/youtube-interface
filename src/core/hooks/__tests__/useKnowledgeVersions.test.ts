import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { KnowledgeVersionWithId } from '../../types/knowledge';

// --- Mock service ---

const mockGetVersions = vi.fn<() => Promise<KnowledgeVersionWithId[]>>();
const mockDeleteVersion = vi.fn<() => Promise<void>>();

vi.mock('../../services/knowledge/knowledgeVersionService', () => ({
    KnowledgeVersionService: {
        getVersions: () => mockGetVersions(),
        deleteVersion: () => mockDeleteVersion(),
    },
}));

import { useKnowledgeVersions } from '../useKnowledgeVersions';

// --- Helpers ---

function makeVersion(id: string, createdAt: number, source: 'chat-tool' | 'conclude' | 'manual' = 'chat-tool'): KnowledgeVersionWithId {
    return { id, content: `Content for ${id}`, createdAt, source, model: 'test-model' };
}

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return {
        wrapper: ({ children }: { children: React.ReactNode }) =>
            React.createElement(QueryClientProvider, { client: queryClient }, children),
        queryClient,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetVersions.mockResolvedValue([]);
    mockDeleteVersion.mockResolvedValue(undefined);
});

describe('useKnowledgeVersions', () => {
    it('returns versions sorted by createdAt DESC', async () => {
        const versions = [
            makeVersion('v2', 2000),
            makeVersion('v1', 1000),
        ];
        mockGetVersions.mockResolvedValue(versions);

        const { wrapper } = createWrapper();
        const { result } = renderHook(
            () => useKnowledgeVersions('user1', 'ch1', 'ki-123'),
            { wrapper },
        );

        await waitFor(() => expect(result.current.versions).toHaveLength(2));

        expect(result.current.versions[0].id).toBe('v2');
        expect(result.current.versions[1].id).toBe('v1');
    });

    it('returns empty array when no versions exist', async () => {
        mockGetVersions.mockResolvedValue([]);

        const { wrapper } = createWrapper();
        const { result } = renderHook(
            () => useKnowledgeVersions('user1', 'ch1', 'ki-123'),
            { wrapper },
        );

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.versions).toEqual([]);
    });

    it('deleteVersion mutation invalidates query', async () => {
        mockGetVersions.mockResolvedValue([makeVersion('v1', 1000)]);

        const { wrapper, queryClient } = createWrapper();
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(
            () => useKnowledgeVersions('user1', 'ch1', 'ki-123'),
            { wrapper },
        );

        await waitFor(() => expect(result.current.versions).toHaveLength(1));

        act(() => {
            result.current.deleteVersion('v1');
        });

        await waitFor(() => expect(mockDeleteVersion).toHaveBeenCalledOnce());
        expect(invalidateSpy).toHaveBeenCalled();
    });

    it('does not fetch when kiId is empty', async () => {
        const { wrapper } = createWrapper();
        const { result } = renderHook(
            () => useKnowledgeVersions('user1', 'ch1', ''),
            { wrapper },
        );

        // Wait a tick for any potential query to fire
        await new Promise(r => setTimeout(r, 50));

        expect(mockGetVersions).not.toHaveBeenCalled();
        expect(result.current.versions).toEqual([]);
    });
});
