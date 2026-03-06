// @vitest-environment node
// =============================================================================
// computeVideoDeltas.test.ts — Tests for video delta computation logic
//
// Covers: snapshot matching, delta arithmetic, filtering, error handling.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeVideoDeltas } from '../computeVideoDeltas';
import type { TrendChannel, TrendSnapshot } from '../../types/trends';


// ---------------------------------------------------------------------------
// Mock — TrendService.getTrendSnapshots
// ---------------------------------------------------------------------------

const mockGetTrendSnapshots = vi.fn<
    (userId: string, channelId: string, trendChannelId: string, limitCount: number) => Promise<TrendSnapshot[]>
>();

vi.mock('../../services/trendService', () => ({
    TrendService: {
        getTrendSnapshots: (...args: Parameters<typeof mockGetTrendSnapshots>) =>
            mockGetTrendSnapshots(...args),
    },
}));

// ---------------------------------------------------------------------------
// Fake timers — deterministic Date.now()
// ---------------------------------------------------------------------------

const NOW = new Date('2026-03-06T12:00:00Z').getTime();
const ONE_DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockGetTrendSnapshots.mockReset();
});

afterEach(() => {
    vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTrendChannel(
    id: string,
    overrides: Partial<Omit<TrendChannel, 'id'>> = {},
): TrendChannel {
    return {
        id,
        title: `Channel ${id}`,
        avatarUrl: '',
        uploadsPlaylistId: `UU${id.slice(2)}`,
        isVisible: true,
        lastUpdated: NOW,
        ...overrides,
    };
}

function makeSnapshot(
    timestamp: number,
    videoViews: Record<string, number>,
    overrides: Partial<Omit<TrendSnapshot, 'timestamp' | 'videoViews'>> = {},
): TrendSnapshot {
    return {
        id: `snap-${timestamp}`,
        timestamp,
        videoViews,
        type: 'auto',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const USER_ID = 'user-123';
const CHANNEL_ID = 'ch-abc';

// Realistic 11-char YouTube video IDs
const VID_A = 'dQw4w9WgXcQ'; // 11 chars
const VID_B = 'jNQXAC9IVRw'; // 11 chars


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeVideoDeltas', () => {
    // -----------------------------------------------------------------------
    // 1. Single channel, 3 snapshots (24h, 7d, 30d) → correct deltas
    // -----------------------------------------------------------------------
    it('computes correct 24h/7d/30d deltas from a single channel with 3 historical snapshots', async () => {
        const channel = makeTrendChannel('UC_channel1');

        // Snapshots sorted DESC (newest first)
        const snapshots: TrendSnapshot[] = [
            makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 1000 }), // latest (just under 1 day ago — still newest)
            makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 900 }),         // ~2 days ago → will match 24h lookup
            makeSnapshot(NOW - 8 * ONE_DAY, { [VID_A]: 600 }),         // ~8 days ago → will match 7d lookup
            makeSnapshot(NOW - 31 * ONE_DAY, { [VID_A]: 200 }),        // ~31 days ago → will match 30d lookup
        ];

        mockGetTrendSnapshots.mockResolvedValue(snapshots);

        const result = await computeVideoDeltas(
            [VID_A],
            [channel],
            USER_ID,
            CHANNEL_ID,
        );

        expect(result.size).toBe(1);

        const stats = result.get(VID_A)!;
        // current = 1000 (from latestSnapshot = snapshots[0])
        expect(stats.currentViews).toBe(1000);
        // 24h: findSnapshot(NOW - 1d) → first with ts <= (NOW - 1d) → snapshots[1] (ts = NOW - 2d)
        // delta = 1000 - 900 = 100
        expect(stats.delta24h).toBe(100);
        // 7d: findSnapshot(NOW - 7d) → first with ts <= (NOW - 7d) → snapshots[2] (ts = NOW - 8d)
        // delta = 1000 - 600 = 400
        expect(stats.delta7d).toBe(400);
        // 30d: findSnapshot(NOW - 30d) → first with ts <= (NOW - 30d) → snapshots[3] (ts = NOW - 31d)
        // delta = 1000 - 200 = 800
        expect(stats.delta30d).toBe(800);
    });

    // -----------------------------------------------------------------------
    // 2. Video missing from old snapshot → null delta (appeared after snapshot)
    // -----------------------------------------------------------------------
    it('returns null delta when video is missing from a historical snapshot', async () => {
        const channel = makeTrendChannel('UC_channel1');

        // VID_A only appears in the latest snapshot; old snapshots don't have it
        const snapshots: TrendSnapshot[] = [
            makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 500 }),   // latest
            makeSnapshot(NOW - 2 * ONE_DAY, { }),                       // 24h match — no VID_A
            makeSnapshot(NOW - 8 * ONE_DAY, { }),                       // 7d match — no VID_A
        ];

        mockGetTrendSnapshots.mockResolvedValue(snapshots);

        const result = await computeVideoDeltas([VID_A], [channel], USER_ID, CHANNEL_ID);

        const stats = result.get(VID_A)!;
        expect(stats.currentViews).toBe(500);
        expect(stats.delta24h).toBeNull();
        expect(stats.delta7d).toBeNull();
        expect(stats.delta30d).toBeNull();
    });

    // -----------------------------------------------------------------------
    // 3. Video missing from latest snapshot → excluded from result
    // -----------------------------------------------------------------------
    it('excludes video entirely when it is not in the latest snapshot', async () => {
        const channel = makeTrendChannel('UC_channel1');

        // Latest snapshot has VID_B but not VID_A
        const snapshots: TrendSnapshot[] = [
            makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_B]: 300 }),    // latest
            makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 100, [VID_B]: 250 }),
        ];

        mockGetTrendSnapshots.mockResolvedValue(snapshots);

        const result = await computeVideoDeltas([VID_A, VID_B], [channel], USER_ID, CHANNEL_ID);

        expect(result.has(VID_A)).toBe(false);
        expect(result.has(VID_B)).toBe(true);
        expect(result.get(VID_B)!.currentViews).toBe(300);
    });

    // -----------------------------------------------------------------------
    // 4. No snapshots at all → empty Map
    // -----------------------------------------------------------------------
    it('returns empty Map when no snapshots exist', async () => {
        const channel = makeTrendChannel('UC_channel1');
        mockGetTrendSnapshots.mockResolvedValue([]);

        const result = await computeVideoDeltas([VID_A], [channel], USER_ID, CHANNEL_ID);

        expect(result.size).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 5. Multiple channels, no overlap — each channel contributes its own videos
    // -----------------------------------------------------------------------
    // NOTE: When multiple channels track the SAME videoId, the refactored
    // `computeVideoDeltas` uses "first channel with data wins" merge strategy —
    // each channel computes deltas independently via `calculateViewDeltas`,
    // then results are merged with `if (!merged.has(videoId))`.

    it('uses first channel data when multiple channels track the same video (first wins)', async () => {
        const ch1 = makeTrendChannel('UC_ch1');
        const ch2 = makeTrendChannel('UC_ch2');

        // Both channels track VID_A but with different view counts
        mockGetTrendSnapshots.mockImplementation(async (_userId, _channelId, trendChannelId) => {
            if (trendChannelId === 'UC_ch1') {
                return [
                    makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 1000 }),
                    makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 800 }),
                ];
            }
            if (trendChannelId === 'UC_ch2') {
                return [
                    makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 5000 }),
                    makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 4500 }),
                ];
            }
            return [];
        });

        const result = await computeVideoDeltas([VID_A], [ch1, ch2], USER_ID, CHANNEL_ID);

        // First channel (ch1) wins — its data should be used
        expect(result.size).toBe(1);
        expect(result.get(VID_A)!.currentViews).toBe(1000);
        expect(result.get(VID_A)!.delta24h).toBe(200); // 1000 - 800, NOT 500
    });

    // -----------------------------------------------------------------------
    // 6. channelIdHints filters to subset of channels
    // -----------------------------------------------------------------------
    it('only queries channels that match channelIdHints', async () => {
        const ch1 = makeTrendChannel('UC_ch1');
        const ch2 = makeTrendChannel('UC_ch2');
        const ch3 = makeTrendChannel('UC_ch3');

        mockGetTrendSnapshots.mockResolvedValue([
            makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 500 }),
            makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 400 }),
        ]);

        const hints = new Set(['UC_ch1', 'UC_ch3']);
        await computeVideoDeltas([VID_A], [ch1, ch2, ch3], USER_ID, CHANNEL_ID, hints);

        // Should only call getTrendSnapshots for ch1 and ch3, NOT ch2
        expect(mockGetTrendSnapshots).toHaveBeenCalledTimes(2);
        const calledIds = mockGetTrendSnapshots.mock.calls.map(call => call[2]);
        expect(calledIds).toContain('UC_ch1');
        expect(calledIds).toContain('UC_ch3');
        expect(calledIds).not.toContain('UC_ch2');
    });

    it('returns empty Map when channelIdHints matches none of the channels', async () => {
        const ch1 = makeTrendChannel('UC_ch1');

        const hints = new Set(['UC_nonexistent']);
        const result = await computeVideoDeltas([VID_A], [ch1], USER_ID, CHANNEL_ID, hints);

        expect(result.size).toBe(0);
        expect(mockGetTrendSnapshots).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // 7. Invalid video IDs (non-11-char) → filtered out
    // -----------------------------------------------------------------------
    it('filters out invalid video IDs that do not match the 11-char YouTube pattern', async () => {
        const channel = makeTrendChannel('UC_channel1');

        mockGetTrendSnapshots.mockResolvedValue([
            makeSnapshot(NOW - 1 * ONE_DAY + 100, {
                [VID_A]: 1000,
                'short': 500,        // too short, but in snapshot
                'toolongvideoid123': 800, // too long, but in snapshot
            }),
            makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 900 }),
        ]);

        const result = await computeVideoDeltas(
            [VID_A, 'short', 'toolongvideoid123', '', '   '],
            [channel],
            USER_ID,
            CHANNEL_ID,
        );

        // Only VID_A should be in the result
        expect(result.size).toBe(1);
        expect(result.has(VID_A)).toBe(true);
    });

    it('returns empty Map when all video IDs are invalid', async () => {
        const channel = makeTrendChannel('UC_channel1');

        const result = await computeVideoDeltas(
            ['short', '', 'has spaces!!'],
            [channel],
            USER_ID,
            CHANNEL_ID,
        );

        expect(result.size).toBe(0);
        // Should not even call getTrendSnapshots
        expect(mockGetTrendSnapshots).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // 8. Zero growth → delta = 0, not null
    // -----------------------------------------------------------------------
    it('returns delta of 0 (not null) when view count has not changed', async () => {
        const channel = makeTrendChannel('UC_channel1');

        const snapshots: TrendSnapshot[] = [
            makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 500 }),
            makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 500 }),
            makeSnapshot(NOW - 8 * ONE_DAY, { [VID_A]: 500 }),
            makeSnapshot(NOW - 31 * ONE_DAY, { [VID_A]: 500 }),
        ];

        mockGetTrendSnapshots.mockResolvedValue(snapshots);

        const result = await computeVideoDeltas([VID_A], [channel], USER_ID, CHANNEL_ID);

        const stats = result.get(VID_A)!;
        expect(stats.currentViews).toBe(500);
        expect(stats.delta24h).toBe(0);
        expect(stats.delta7d).toBe(0);
        expect(stats.delta30d).toBe(0);

        // Explicitly verify it is 0, not null
        expect(stats.delta24h).not.toBeNull();
        expect(stats.delta7d).not.toBeNull();
        expect(stats.delta30d).not.toBeNull();
    });

    // -----------------------------------------------------------------------
    // 9. Negative growth (viewCount decreased) → negative delta
    // -----------------------------------------------------------------------
    it('returns negative delta when view count has decreased', async () => {
        const channel = makeTrendChannel('UC_channel1');

        // Views went down (e.g., YouTube removed spam views)
        const snapshots: TrendSnapshot[] = [
            makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 800 }),   // current
            makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 1000 }),        // was higher 2 days ago
            makeSnapshot(NOW - 8 * ONE_DAY, { [VID_A]: 1200 }),        // even higher 8 days ago
        ];

        mockGetTrendSnapshots.mockResolvedValue(snapshots);

        const result = await computeVideoDeltas([VID_A], [channel], USER_ID, CHANNEL_ID);

        const stats = result.get(VID_A)!;
        expect(stats.currentViews).toBe(800);
        expect(stats.delta24h).toBe(-200);  // 800 - 1000
        expect(stats.delta7d).toBe(-400);   // 800 - 1200
    });

    // -----------------------------------------------------------------------
    // 10. Error in one channel → other channels still computed (graceful)
    // -----------------------------------------------------------------------
    it('gracefully handles errors in one channel while still computing others', async () => {
        const ch1 = makeTrendChannel('UC_failing');
        const ch2 = makeTrendChannel('UC_working');

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockGetTrendSnapshots.mockImplementation(async (_userId, _channelId, trendChannelId) => {
            if (trendChannelId === 'UC_failing') {
                throw new Error('Firestore quota exceeded');
            }
            return [
                makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 700 }),
                makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 600 }),
            ];
        });

        const result = await computeVideoDeltas([VID_A], [ch1, ch2], USER_ID, CHANNEL_ID);

        // ch2's data should still be present
        expect(result.has(VID_A)).toBe(true);
        expect(result.get(VID_A)!.currentViews).toBe(700);
        expect(result.get(VID_A)!.delta24h).toBe(100);

        // Warning should have been logged for the failing channel
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0][0]).toContain('UC_failing');

        warnSpy.mockRestore();
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    it('returns empty Map when trendChannels array is empty', async () => {
        const result = await computeVideoDeltas([VID_A], [], USER_ID, CHANNEL_ID);

        expect(result.size).toBe(0);
        expect(mockGetTrendSnapshots).not.toHaveBeenCalled();
    });

    it('returns empty Map when videoIds array is empty', async () => {
        const channel = makeTrendChannel('UC_channel1');
        const result = await computeVideoDeltas([], [channel], USER_ID, CHANNEL_ID);

        expect(result.size).toBe(0);
        expect(mockGetTrendSnapshots).not.toHaveBeenCalled();
    });

    it('handles multiple videos across different channels correctly', async () => {
        const ch1 = makeTrendChannel('UC_ch1');
        const ch2 = makeTrendChannel('UC_ch2');

        // ch1 has VID_A, ch2 has VID_B — no overlap
        mockGetTrendSnapshots.mockImplementation(async (_userId, _channelId, trendChannelId) => {
            if (trendChannelId === 'UC_ch1') {
                return [
                    makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 1000 }),
                    makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 900 }),
                ];
            }
            if (trendChannelId === 'UC_ch2') {
                return [
                    makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_B]: 500 }),
                    makeSnapshot(NOW - 2 * ONE_DAY, { [VID_B]: 300 }),
                ];
            }
            return [];
        });

        const result = await computeVideoDeltas([VID_A, VID_B], [ch1, ch2], USER_ID, CHANNEL_ID);

        expect(result.size).toBe(2);
        expect(result.get(VID_A)!.currentViews).toBe(1000);
        expect(result.get(VID_A)!.delta24h).toBe(100);
        expect(result.get(VID_B)!.currentViews).toBe(500);
        expect(result.get(VID_B)!.delta24h).toBe(200);
    });

    it('only computes deltas for time windows that have matching snapshots', async () => {
        const channel = makeTrendChannel('UC_channel1');

        // Only has a snapshot for 24h window, nothing for 7d or 30d
        const snapshots: TrendSnapshot[] = [
            makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 1000 }),  // latest
            makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 950 }),         // matches 24h
            // No snapshot old enough for 7d or 30d
        ];

        mockGetTrendSnapshots.mockResolvedValue(snapshots);

        const result = await computeVideoDeltas([VID_A], [channel], USER_ID, CHANNEL_ID);

        const stats = result.get(VID_A)!;
        expect(stats.currentViews).toBe(1000);
        expect(stats.delta24h).toBe(50);
        expect(stats.delta7d).toBeNull();
        expect(stats.delta30d).toBeNull();
    });

    it('passes correct arguments to TrendService.getTrendSnapshots', async () => {
        const channel = makeTrendChannel('UC_test');
        mockGetTrendSnapshots.mockResolvedValue([]);

        await computeVideoDeltas([VID_A], [channel], USER_ID, CHANNEL_ID);

        expect(mockGetTrendSnapshots).toHaveBeenCalledWith(USER_ID, CHANNEL_ID, 'UC_test', 35);
    });

    it('correctly identifies snapshot boundaries using <= comparison', async () => {
        const channel = makeTrendChannel('UC_channel1');

        // Snapshot at exactly NOW - 1 day should be found by findSnapshot(NOW - 1 day)
        const snapshots: TrendSnapshot[] = [
            makeSnapshot(NOW - 100, { [VID_A]: 1000 }),             // latest
            makeSnapshot(NOW - ONE_DAY, { [VID_A]: 900 }),          // exactly 24h ago
            makeSnapshot(NOW - 7 * ONE_DAY, { [VID_A]: 500 }),     // exactly 7d ago
        ];

        mockGetTrendSnapshots.mockResolvedValue(snapshots);

        const result = await computeVideoDeltas([VID_A], [channel], USER_ID, CHANNEL_ID);

        const stats = result.get(VID_A)!;
        // findSnapshot scans DESC: snapshot at NOW-1d has ts <= NOW-1d → match
        expect(stats.delta24h).toBe(100);  // 1000 - 900
        expect(stats.delta7d).toBe(500);   // 1000 - 500
    });

    it('returns mixed nulls when video exists in some snapshots but not others', async () => {
        const channel = makeTrendChannel('UC_channel1');

        // VID_A is in latest and 24h snapshot, but absent from 7d and 30d snapshots
        const snapshots: TrendSnapshot[] = [
            makeSnapshot(NOW - 1 * ONE_DAY + 100, { [VID_A]: 1000 }),   // latest — has VID_A
            makeSnapshot(NOW - 2 * ONE_DAY, { [VID_A]: 900 }),          // 24h match — has VID_A
            makeSnapshot(NOW - 8 * ONE_DAY, { [VID_B]: 500 }),          // 7d match — only VID_B
            makeSnapshot(NOW - 31 * ONE_DAY, { [VID_B]: 200 }),         // 30d match — only VID_B
        ];

        mockGetTrendSnapshots.mockResolvedValue(snapshots);

        const result = await computeVideoDeltas([VID_A], [channel], USER_ID, CHANNEL_ID);

        const stats = result.get(VID_A)!;
        expect(stats.currentViews).toBe(1000);
        expect(stats.delta24h).toBe(100);   // 1000 - 900
        expect(stats.delta7d).toBeNull();    // VID_A not in 7d snapshot
        expect(stats.delta30d).toBeNull();   // VID_A not in 30d snapshot
    });

    it('rejects video IDs with special characters that are not in [a-zA-Z0-9_-]', async () => {
        const channel = makeTrendChannel('UC_channel1');
        mockGetTrendSnapshots.mockResolvedValue([
            makeSnapshot(NOW - 100, { [VID_A]: 100 }),
        ]);

        const result = await computeVideoDeltas(
            [VID_A, 'abc!@#$%^&*(', 'hello world'],
            [channel],
            USER_ID,
            CHANNEL_ID,
        );

        expect(result.size).toBe(1);
        expect(result.has(VID_A)).toBe(true);
    });
});
