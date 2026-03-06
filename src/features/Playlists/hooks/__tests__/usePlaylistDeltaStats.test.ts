// =============================================================================
// usePlaylistDeltaStats.test.ts — aggregation logic tests
//
// Strategy: mock useVideoDeltaMap to return controlled perVideo Map data,
// then verify that the hook correctly sums totals, handles nulls, and
// reports videosWithData count.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';
import type { VideoDeltaStats } from '../../../../../shared/viewDeltas';

// ---------------------------------------------------------------------------
// Module mock — must be declared before importing the hook under test
// ---------------------------------------------------------------------------

const mockUseVideoDeltaMap = vi.fn<(...args: unknown[]) => { perVideo: Map<string, VideoDeltaStats>; isLoading: boolean }>();

vi.mock('../../../../core/hooks/useVideoDeltaMap', () => ({
    useVideoDeltaMap: (...args: unknown[]) => mockUseVideoDeltaMap(...args),
}));

import { usePlaylistDeltaStats } from '../usePlaylistDeltaStats';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal VideoDetails with a valid 11-char YouTube ID */
function makeVideoDetails(id: string, channelId = 'UCxxxxxx0001'): VideoDetails {
    return {
        id,
        title: `Video ${id}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/default.jpg`,
        channelId,
        channelTitle: 'Test Channel',
        channelAvatar: '',
        publishedAt: '2025-01-01T00:00:00Z',
    };
}

/** VideoDeltaStats factory with optional overrides */
function makeDeltaStats(overrides: Partial<VideoDeltaStats> = {}): VideoDeltaStats {
    return {
        delta24h: null,
        delta7d: null,
        delta30d: null,
        currentViews: null,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePlaylistDeltaStats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // 1. All videos have deltas -> correct sum totals
    // -----------------------------------------------------------------------
    it('sums totals correctly when all videos have non-null deltas', () => {
        const videos = [
            makeVideoDetails('aaaaaaaaaaa'),
            makeVideoDetails('bbbbbbbbbbb'),
            makeVideoDetails('ccccccccccc'),
        ];

        const perVideo = new Map<string, VideoDeltaStats>([
            ['aaaaaaaaaaa', makeDeltaStats({ delta24h: 100, delta7d: 500, delta30d: 2000, currentViews: 10000 })],
            ['bbbbbbbbbbb', makeDeltaStats({ delta24h: 250, delta7d: 1200, delta30d: 5000, currentViews: 20000 })],
            ['ccccccccccc', makeDeltaStats({ delta24h: 50,  delta7d: 300,  delta30d: 1000, currentViews: 5000 })],
        ]);

        mockUseVideoDeltaMap.mockReturnValue({ perVideo, isLoading: false });

        const { result } = renderHook(() => usePlaylistDeltaStats(videos));

        expect(result.current.totals.delta24h).toBe(400);    // 100 + 250 + 50
        expect(result.current.totals.delta7d).toBe(2000);     // 500 + 1200 + 300
        expect(result.current.totals.delta30d).toBe(8000);    // 2000 + 5000 + 1000
        expect(result.current.isLoading).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 2. Some videos have null deltas -> sum only non-null
    // -----------------------------------------------------------------------
    it('sums only non-null deltas when some videos have partial data', () => {
        const videos = [
            makeVideoDetails('aaaaaaaaaaa'),
            makeVideoDetails('bbbbbbbbbbb'),
            makeVideoDetails('ccccccccccc'),
        ];

        const perVideo = new Map<string, VideoDeltaStats>([
            ['aaaaaaaaaaa', makeDeltaStats({ delta24h: 100, delta7d: null,  delta30d: 2000 })],
            ['bbbbbbbbbbb', makeDeltaStats({ delta24h: null, delta7d: 1200, delta30d: null })],
            ['ccccccccccc', makeDeltaStats({ delta24h: 50,  delta7d: 300,  delta30d: 1000 })],
        ]);

        mockUseVideoDeltaMap.mockReturnValue({ perVideo, isLoading: false });

        const { result } = renderHook(() => usePlaylistDeltaStats(videos));

        expect(result.current.totals.delta24h).toBe(150);    // 100 + 50 (skip null)
        expect(result.current.totals.delta7d).toBe(1500);     // 1200 + 300 (skip null)
        expect(result.current.totals.delta30d).toBe(3000);    // 2000 + 1000 (skip null)
    });

    // -----------------------------------------------------------------------
    // 3. All videos null -> totals = null (not 0)
    // -----------------------------------------------------------------------
    it('returns null totals when all videos have null deltas', () => {
        const videos = [
            makeVideoDetails('aaaaaaaaaaa'),
            makeVideoDetails('bbbbbbbbbbb'),
        ];

        const perVideo = new Map<string, VideoDeltaStats>([
            ['aaaaaaaaaaa', makeDeltaStats({ delta24h: null, delta7d: null, delta30d: null })],
            ['bbbbbbbbbbb', makeDeltaStats({ delta24h: null, delta7d: null, delta30d: null })],
        ]);

        mockUseVideoDeltaMap.mockReturnValue({ perVideo, isLoading: false });

        const { result } = renderHook(() => usePlaylistDeltaStats(videos));

        expect(result.current.totals.delta24h).toBeNull();
        expect(result.current.totals.delta7d).toBeNull();
        expect(result.current.totals.delta30d).toBeNull();
    });

    // -----------------------------------------------------------------------
    // 4. Empty playlist -> empty result
    // -----------------------------------------------------------------------
    it('returns empty result for an empty playlist', () => {
        mockUseVideoDeltaMap.mockReturnValue({ perVideo: new Map(), isLoading: false });

        const { result } = renderHook(() => usePlaylistDeltaStats([]));

        expect(result.current.totals.delta24h).toBeNull();
        expect(result.current.totals.delta7d).toBeNull();
        expect(result.current.totals.delta30d).toBeNull();
        expect(result.current.videosWithData).toBe(0);
        expect(result.current.perVideo.size).toBe(0);
        expect(result.current.isLoading).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 5. videosWithData count matches perVideo.size
    // -----------------------------------------------------------------------
    it('reports videosWithData equal to perVideo.size', () => {
        const videos = [
            makeVideoDetails('aaaaaaaaaaa'),
            makeVideoDetails('bbbbbbbbbbb'),
            makeVideoDetails('ccccccccccc'),
        ];

        // Only 2 of 3 videos have snapshot data
        const perVideo = new Map<string, VideoDeltaStats>([
            ['aaaaaaaaaaa', makeDeltaStats({ delta24h: 10, delta7d: 70, delta30d: 300 })],
            ['ccccccccccc', makeDeltaStats({ delta24h: 5,  delta7d: 35, delta30d: 150 })],
        ]);

        mockUseVideoDeltaMap.mockReturnValue({ perVideo, isLoading: false });

        const { result } = renderHook(() => usePlaylistDeltaStats(videos));

        expect(result.current.videosWithData).toBe(2);
        expect(result.current.perVideo.size).toBe(2);
    });

    // -----------------------------------------------------------------------
    // Edge: mixed null across different windows
    // -----------------------------------------------------------------------
    it('handles mixed null pattern: some windows null across all videos, others not', () => {
        const videos = [
            makeVideoDetails('aaaaaaaaaaa'),
            makeVideoDetails('bbbbbbbbbbb'),
        ];

        // delta24h is null everywhere, delta7d has data, delta30d is mixed
        const perVideo = new Map<string, VideoDeltaStats>([
            ['aaaaaaaaaaa', makeDeltaStats({ delta24h: null, delta7d: 800,  delta30d: null })],
            ['bbbbbbbbbbb', makeDeltaStats({ delta24h: null, delta7d: 1200, delta30d: 3000 })],
        ]);

        mockUseVideoDeltaMap.mockReturnValue({ perVideo, isLoading: false });

        const { result } = renderHook(() => usePlaylistDeltaStats(videos));

        expect(result.current.totals.delta24h).toBeNull();    // all null -> null
        expect(result.current.totals.delta7d).toBe(2000);      // 800 + 1200
        expect(result.current.totals.delta30d).toBe(3000);     // only one non-null
    });

    // -----------------------------------------------------------------------
    // Edge: isLoading passthrough
    // -----------------------------------------------------------------------
    it('passes through isLoading from useVideoDeltaMap', () => {
        mockUseVideoDeltaMap.mockReturnValue({ perVideo: new Map(), isLoading: true });

        const { result } = renderHook(() => usePlaylistDeltaStats([]));

        expect(result.current.isLoading).toBe(true);
    });

    // -----------------------------------------------------------------------
    // Edge: single video with all deltas
    // -----------------------------------------------------------------------
    it('handles a single-video playlist correctly', () => {
        const videos = [makeVideoDetails('aaaaaaaaaaa')];

        const perVideo = new Map<string, VideoDeltaStats>([
            ['aaaaaaaaaaa', makeDeltaStats({ delta24h: 42, delta7d: 777, delta30d: 9999, currentViews: 50000 })],
        ]);

        mockUseVideoDeltaMap.mockReturnValue({ perVideo, isLoading: false });

        const { result } = renderHook(() => usePlaylistDeltaStats(videos));

        expect(result.current.totals.delta24h).toBe(42);
        expect(result.current.totals.delta7d).toBe(777);
        expect(result.current.totals.delta30d).toBe(9999);
        expect(result.current.videosWithData).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Edge: zero deltas are valid (not null)
    // -----------------------------------------------------------------------
    it('treats zero deltas as valid data, not null', () => {
        const videos = [
            makeVideoDetails('aaaaaaaaaaa'),
            makeVideoDetails('bbbbbbbbbbb'),
        ];

        const perVideo = new Map<string, VideoDeltaStats>([
            ['aaaaaaaaaaa', makeDeltaStats({ delta24h: 0, delta7d: 0, delta30d: 0 })],
            ['bbbbbbbbbbb', makeDeltaStats({ delta24h: 100, delta7d: 500, delta30d: 2000 })],
        ]);

        mockUseVideoDeltaMap.mockReturnValue({ perVideo, isLoading: false });

        const { result } = renderHook(() => usePlaylistDeltaStats(videos));

        // Zero is a valid value -> included in sum, totals should NOT be null
        expect(result.current.totals.delta24h).toBe(100);    // 0 + 100
        expect(result.current.totals.delta7d).toBe(500);      // 0 + 500
        expect(result.current.totals.delta30d).toBe(2000);    // 0 + 2000
    });

    // -----------------------------------------------------------------------
    // Wiring: videoIds filtering and channelIdHints construction
    // -----------------------------------------------------------------------
    it('passes filtered videoIds and channelIdHints to useVideoDeltaMap', () => {
        const videos = [
            makeVideoDetails('aaaaaaaaaaa', 'UC_chan1'),
            makeVideoDetails('bb', 'UC_chan2'),  // invalid ID (not 11 chars)
            makeVideoDetails('ccccccccccc', 'UC_chan1'),
        ];

        mockUseVideoDeltaMap.mockReturnValue({ perVideo: new Map(), isLoading: false });

        renderHook(() => usePlaylistDeltaStats(videos));

        expect(mockUseVideoDeltaMap).toHaveBeenCalledWith(
            ['aaaaaaaaaaa', 'ccccccccccc'],  // 'bb' filtered out
            new Set(['UC_chan1', 'UC_chan2']),
        );
    });

    it('passes channelIdHints as undefined when all videos lack channelId', () => {
        const videos = [
            { ...makeVideoDetails('aaaaaaaaaaa'), channelId: undefined as unknown as string },
        ];

        mockUseVideoDeltaMap.mockReturnValue({ perVideo: new Map(), isLoading: false });

        renderHook(() => usePlaylistDeltaStats(videos));

        expect(mockUseVideoDeltaMap).toHaveBeenCalledWith(
            ['aaaaaaaaaaa'],
            undefined,  // no valid channelIds → undefined hints
        );
    });

    // -----------------------------------------------------------------------
    // Passes perVideo map reference through to result
    // -----------------------------------------------------------------------
    it('exposes the perVideo map from useVideoDeltaMap in the result', () => {
        const videos = [makeVideoDetails('aaaaaaaaaaa')];

        const perVideo = new Map<string, VideoDeltaStats>([
            ['aaaaaaaaaaa', makeDeltaStats({ delta24h: 10, delta7d: 20, delta30d: 30, currentViews: 1000 })],
        ]);

        mockUseVideoDeltaMap.mockReturnValue({ perVideo, isLoading: false });

        const { result } = renderHook(() => usePlaylistDeltaStats(videos));

        expect(result.current.perVideo).toBe(perVideo);
        expect(result.current.perVideo.get('aaaaaaaaaaa')).toEqual({
            delta24h: 10,
            delta7d: 20,
            delta30d: 30,
            currentViews: 1000,
        });
    });
});
