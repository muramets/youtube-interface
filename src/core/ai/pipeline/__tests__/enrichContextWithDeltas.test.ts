// @vitest-environment node
// =============================================================================
// enrichContextWithDeltas.test.ts — Unit tests for delta enrichment middleware
//
// Verifies that VideoCardContext items are patched with delta24h/7d/30d data,
// non-video items pass through unchanged, and failures degrade gracefully.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppContextItem, VideoCardContext, CanvasSelectionContext, SuggestedTrafficContext } from '../../../types/appContext';
import type { VideoDeltaStats } from '../../../../../shared/viewDeltas';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockComputeVideoDeltas = vi.fn<(...args: unknown[]) => Promise<Map<string, VideoDeltaStats>>>();

vi.mock('../../../utils/computeVideoDeltas', () => ({
    computeVideoDeltas: (...args: unknown[]) => mockComputeVideoDeltas(...args),
}));

vi.mock('../../../stores/trends/trendStore', () => ({
    useTrendStore: {
        getState: vi.fn(() => ({ channels: [{ id: 'tc1' }] })),
    },
}));

vi.mock('../../../stores/channelStore', () => ({
    useChannelStore: {
        getState: vi.fn(() => ({ currentChannel: { id: 'ch1' } })),
    },
}));

vi.mock('../../../utils/debug', () => ({
    debug: {
        context: vi.fn(),
    },
}));

// Re-import mocked stores so we can override per-test
import { useTrendStore } from '../../../stores/trends/trendStore';
import { useChannelStore } from '../../../stores/channelStore';
import { enrichContextWithDeltas } from '../enrichContextWithDeltas';

// ---------------------------------------------------------------------------
// Fixture Helpers
// ---------------------------------------------------------------------------

function makeVideoCard(
    videoId: string,
    overrides: Partial<Omit<VideoCardContext, 'type'>> = {},
): VideoCardContext {
    return {
        type: 'video-card',
        ownership: 'own-published',
        videoId,
        title: `Video ${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/0.jpg`,
        ...overrides,
    };
}

function makeCanvasContext(): CanvasSelectionContext {
    return {
        type: 'canvas-selection',
        nodes: [
            {
                nodeType: 'sticky-note',
                content: 'Test note',
                noteColor: '#ffff00',
            },
        ],
    };
}

function makeTrafficContext(): SuggestedTrafficContext {
    return {
        type: 'suggested-traffic',
        sourceVideo: {
            videoId: 'src1',
            title: 'Source Video',
            description: 'desc',
            tags: [],
            thumbnailUrl: 'https://img.youtube.com/vi/src1/0.jpg',
        },
        suggestedVideos: [],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enrichContextWithDeltas', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Reset store mocks to default "healthy" state
        vi.mocked(useTrendStore.getState).mockReturnValue({
            channels: [{ id: 'tc1' }],
        } as unknown as ReturnType<typeof useTrendStore.getState>);

        vi.mocked(useChannelStore.getState).mockReturnValue({
            currentChannel: { id: 'ch1' },
        } as ReturnType<typeof useChannelStore.getState>);

        mockComputeVideoDeltas.mockResolvedValue(new Map());
    });

    // -----------------------------------------------------------------------
    // 1. No video-card items
    // -----------------------------------------------------------------------
    it('returns items unchanged when there are no video-card items', async () => {
        const items: AppContextItem[] = [makeCanvasContext(), makeTrafficContext()];

        const result = await enrichContextWithDeltas(items, 'user1');

        expect(result).toBe(items); // Same reference — early return
        expect(mockComputeVideoDeltas).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // 2. Video-card items with matching deltas
    // -----------------------------------------------------------------------
    it('patches video-card items with matching delta data', async () => {
        const items: AppContextItem[] = [
            makeVideoCard('v1'),
            makeVideoCard('v2'),
        ];

        mockComputeVideoDeltas.mockResolvedValue(
            new Map<string, VideoDeltaStats>([
                ['v1', { delta24h: 100, delta7d: 500, delta30d: 2000, currentViews: 10000 }],
                ['v2', { delta24h: 50, delta7d: null, delta30d: 1000, currentViews: 5000 }],
            ]),
        );

        const result = await enrichContextWithDeltas(items, 'user1');

        expect(result).toHaveLength(2);

        const v1 = result[0] as VideoCardContext;
        expect(v1.videoId).toBe('v1');
        expect(v1.delta24h).toBe(100);
        expect(v1.delta7d).toBe(500);
        expect(v1.delta30d).toBe(2000);

        const v2 = result[1] as VideoCardContext;
        expect(v2.videoId).toBe('v2');
        expect(v2.delta24h).toBe(50);
        expect(v2.delta7d).toBeNull();
        expect(v2.delta30d).toBe(1000);
    });

    // -----------------------------------------------------------------------
    // 3. Video-card items without matching deltas
    // -----------------------------------------------------------------------
    it('returns video-card items unchanged when no deltas match', async () => {
        const items: AppContextItem[] = [makeVideoCard('v1')];

        // deltaMap has data for a different video
        mockComputeVideoDeltas.mockResolvedValue(
            new Map<string, VideoDeltaStats>([
                ['v_other', { delta24h: 100, delta7d: 200, delta30d: 300, currentViews: 1000 }],
            ]),
        );

        const result = await enrichContextWithDeltas(items, 'user1');

        expect(result).toHaveLength(1);
        const v1 = result[0] as VideoCardContext;
        expect(v1.videoId).toBe('v1');
        expect(v1.delta24h).toBeUndefined();
        expect(v1.delta7d).toBeUndefined();
        expect(v1.delta30d).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // 4. No trend channels — graceful early return
    // -----------------------------------------------------------------------
    it('returns items unchanged when trendChannels is empty', async () => {
        vi.mocked(useTrendStore.getState).mockReturnValue({
            channels: [],
        } as unknown as ReturnType<typeof useTrendStore.getState>);

        const items: AppContextItem[] = [makeVideoCard('v1')];

        const result = await enrichContextWithDeltas(items, 'user1');

        expect(result).toBe(items); // Same reference — early return
        expect(mockComputeVideoDeltas).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // 5. No currentChannel — graceful early return
    // -----------------------------------------------------------------------
    it('returns items unchanged when currentChannel is null', async () => {
        vi.mocked(useChannelStore.getState).mockReturnValue({
            currentChannel: null,
        } as ReturnType<typeof useChannelStore.getState>);

        const items: AppContextItem[] = [makeVideoCard('v1')];

        const result = await enrichContextWithDeltas(items, 'user1');

        expect(result).toBe(items); // Same reference — early return
        expect(mockComputeVideoDeltas).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // 6. Mixed item types — only video-card is patched
    // -----------------------------------------------------------------------
    it('patches only video-card items in a mixed array', async () => {
        const canvas = makeCanvasContext();
        const traffic = makeTrafficContext();
        const video = makeVideoCard('v1');

        const items: AppContextItem[] = [canvas, video, traffic];

        mockComputeVideoDeltas.mockResolvedValue(
            new Map<string, VideoDeltaStats>([
                ['v1', { delta24h: 42, delta7d: 300, delta30d: 1500, currentViews: 8000 }],
            ]),
        );

        const result = await enrichContextWithDeltas(items, 'user1');

        expect(result).toHaveLength(3);

        // Canvas — unchanged, same reference
        expect(result[0]).toBe(canvas);
        expect(result[0].type).toBe('canvas-selection');

        // Video — enriched (new object)
        const enrichedVideo = result[1] as VideoCardContext;
        expect(enrichedVideo.type).toBe('video-card');
        expect(enrichedVideo.delta24h).toBe(42);
        expect(enrichedVideo.delta7d).toBe(300);
        expect(enrichedVideo.delta30d).toBe(1500);

        // Traffic — unchanged, same reference
        expect(result[2]).toBe(traffic);
        expect(result[2].type).toBe('suggested-traffic');
    });

    // -----------------------------------------------------------------------
    // 7. computeVideoDeltas throws — graceful fallback
    // -----------------------------------------------------------------------
    it('returns original items when computeVideoDeltas throws', async () => {
        const items: AppContextItem[] = [makeVideoCard('v1')];

        mockComputeVideoDeltas.mockRejectedValue(new Error('Firestore unavailable'));

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await enrichContextWithDeltas(items, 'user1');

        expect(result).toBe(items); // Same reference — fallback return
        expect(consoleSpy).toHaveBeenCalledWith(
            '[enrichContextWithDeltas] Error during enrichment:',
            expect.any(Error),
        );

        consoleSpy.mockRestore();
    });

    // -----------------------------------------------------------------------
    // Edge: empty deltaMap — returns items as-is
    // -----------------------------------------------------------------------
    it('returns items unchanged when deltaMap is empty', async () => {
        const items: AppContextItem[] = [makeVideoCard('v1')];

        mockComputeVideoDeltas.mockResolvedValue(new Map());

        const result = await enrichContextWithDeltas(items, 'user1');

        expect(result).toBe(items); // Same reference — early return after empty map check
    });

    // -----------------------------------------------------------------------
    // Verify correct arguments passed to computeVideoDeltas
    // -----------------------------------------------------------------------
    it('passes correct arguments to computeVideoDeltas', async () => {
        const items: AppContextItem[] = [
            makeVideoCard('v1'),
            makeVideoCard('v2'),
        ];

        mockComputeVideoDeltas.mockResolvedValue(new Map());

        await enrichContextWithDeltas(items, 'user42');

        expect(mockComputeVideoDeltas).toHaveBeenCalledOnce();
        expect(mockComputeVideoDeltas).toHaveBeenCalledWith(
            ['v1', 'v2'],
            [{ id: 'tc1' }],
            'user42',
            'ch1',
            undefined, // channelIdHints — undefined when video cards have no channelId
        );
    });
});
