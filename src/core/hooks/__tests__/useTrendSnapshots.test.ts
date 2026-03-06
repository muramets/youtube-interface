// =============================================================================
// useTrendSnapshots.test.ts — TanStack Query caching behavior tests
//
// Verifies:
//   - First call triggers Firestore read
//   - Second call with same params is a cache hit (no extra Firestore reads)
//   - lastUpdated change invalidates cache (new Firestore read)
//   - Multiple channels fetched independently
//   - Disabled when userId/channelId undefined
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TrendChannel, TrendSnapshot } from '../../types/trends';

// ---------------------------------------------------------------------------
// Mock TrendService
// ---------------------------------------------------------------------------

const mockGetTrendSnapshots = vi.fn<(...args: unknown[]) => Promise<TrendSnapshot[]>>();

vi.mock('../../services/trendService', () => ({
    TrendService: {
        getTrendSnapshots: (...args: unknown[]) => mockGetTrendSnapshots(...args),
    },
}));

import { useTrendSnapshots } from '../useTrendSnapshots';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrendChannel(id: string, lastUpdated = 1000): TrendChannel {
    return {
        id,
        title: `Channel ${id}`,
        isVisible: true,
        lastUpdated,
    } as TrendChannel;
}

function makeSnapshot(timestamp: number, videoViews: Record<string, number> = {}): TrendSnapshot {
    return {
        id: `snap-${timestamp}`,
        timestamp,
        videoViews,
        type: 'auto',
    };
}

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTrendSnapshots', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('fetches snapshots from Firestore on first call', async () => {
        const snapshots = [makeSnapshot(2000), makeSnapshot(1000)];
        mockGetTrendSnapshots.mockResolvedValue(snapshots);

        const channel = makeTrendChannel('UC001', 5000);

        const { result } = renderHook(
            () => useTrendSnapshots('user1', 'ch1', [channel]),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(mockGetTrendSnapshots).toHaveBeenCalledOnce();
        expect(result.current.snapshotMap.get('UC001')).toEqual(snapshots);
    });

    it('returns cache hit on second render with same params (no extra Firestore reads)', async () => {
        const snapshots = [makeSnapshot(2000)];
        mockGetTrendSnapshots.mockResolvedValue(snapshots);

        const channel = makeTrendChannel('UC001', 5000);
        const wrapper = createWrapper();

        const { result, rerender } = renderHook(
            () => useTrendSnapshots('user1', 'ch1', [channel]),
            { wrapper },
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(mockGetTrendSnapshots).toHaveBeenCalledOnce();

        // Re-render with identical params — should be a cache hit
        rerender();

        expect(mockGetTrendSnapshots).toHaveBeenCalledOnce(); // Still 1 call
        expect(result.current.snapshotMap.get('UC001')).toEqual(snapshots);
    });

    it('invalidates cache when lastUpdated changes', async () => {
        const oldSnapshots = [makeSnapshot(1000)];
        const newSnapshots = [makeSnapshot(2000), makeSnapshot(1000)];
        mockGetTrendSnapshots
            .mockResolvedValueOnce(oldSnapshots)
            .mockResolvedValueOnce(newSnapshots);

        const wrapper = createWrapper();

        const { result, rerender } = renderHook(
            ({ channel }) => useTrendSnapshots('user1', 'ch1', [channel]),
            {
                wrapper,
                initialProps: { channel: makeTrendChannel('UC001', 5000) },
            },
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(mockGetTrendSnapshots).toHaveBeenCalledTimes(1);
        expect(result.current.snapshotMap.get('UC001')).toEqual(oldSnapshots);

        // Simulate sync: lastUpdated changed → new query key → cache miss
        rerender({ channel: makeTrendChannel('UC001', 9999) });

        await waitFor(() => {
            expect(mockGetTrendSnapshots).toHaveBeenCalledTimes(2);
        });

        expect(result.current.snapshotMap.get('UC001')).toEqual(newSnapshots);
    });

    it('fetches multiple channels independently', async () => {
        const snapsA = [makeSnapshot(2000, { v1: 100 })];
        const snapsB = [makeSnapshot(2000, { v2: 200 })];
        mockGetTrendSnapshots
            .mockResolvedValueOnce(snapsA)
            .mockResolvedValueOnce(snapsB);

        const channels = [
            makeTrendChannel('UC_A', 1000),
            makeTrendChannel('UC_B', 2000),
        ];

        const { result } = renderHook(
            () => useTrendSnapshots('user1', 'ch1', channels),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(mockGetTrendSnapshots).toHaveBeenCalledTimes(2);
        expect(result.current.snapshotMap.get('UC_A')).toEqual(snapsA);
        expect(result.current.snapshotMap.get('UC_B')).toEqual(snapsB);
    });

    it('does not fetch when userId is undefined (queries disabled)', async () => {
        const channel = makeTrendChannel('UC001', 5000);

        const { result } = renderHook(
            () => useTrendSnapshots(undefined, 'ch1', [channel]),
            { wrapper: createWrapper() },
        );

        // Should not be loading and no calls made
        expect(mockGetTrendSnapshots).not.toHaveBeenCalled();
        expect(result.current.snapshotMap.size).toBe(0);
    });

    it('does not fetch when channelId is undefined (queries disabled)', async () => {
        const channel = makeTrendChannel('UC001', 5000);

        const { result } = renderHook(
            () => useTrendSnapshots('user1', undefined, [channel]),
            { wrapper: createWrapper() },
        );

        expect(mockGetTrendSnapshots).not.toHaveBeenCalled();
        expect(result.current.snapshotMap.size).toBe(0);
    });

    it('degrades gracefully when fetch fails (empty map for failed channel)', async () => {
        mockGetTrendSnapshots.mockRejectedValue(new Error('Firestore unavailable'));

        const channel = makeTrendChannel('UC001', 5000);

        const { result } = renderHook(
            () => useTrendSnapshots('user1', 'ch1', [channel]),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        // Failed channel simply absent from map — no throw
        expect(result.current.snapshotMap.size).toBe(0);
    });

    it('returns data for successful channels even when one channel fails', async () => {
        const successSnapshots = [makeSnapshot(2000, { v1: 100 })];

        mockGetTrendSnapshots.mockImplementation(async (...args: unknown[]) => {
            const trendChannelId = args[2] as string;
            if (trendChannelId === 'UC_FAIL') {
                throw new Error('Network error');
            }
            return successSnapshots;
        });

        const channels = [
            makeTrendChannel('UC_OK', 1000),
            makeTrendChannel('UC_FAIL', 2000),
        ];

        const { result } = renderHook(
            () => useTrendSnapshots('user1', 'ch1', channels),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        // UC_OK succeeds, UC_FAIL absent
        expect(result.current.snapshotMap.get('UC_OK')).toEqual(successSnapshots);
        expect(result.current.snapshotMap.has('UC_FAIL')).toBe(false);
    });

    it('returns empty map when no trend channels provided', async () => {
        const { result } = renderHook(
            () => useTrendSnapshots('user1', 'ch1', []),
            { wrapper: createWrapper() },
        );

        expect(mockGetTrendSnapshots).not.toHaveBeenCalled();
        expect(result.current.snapshotMap.size).toBe(0);
        expect(result.current.isLoading).toBe(false);
    });
});
