import { describe, it, expect } from 'vitest'
import { buildVideoRefMap } from '../videoRefMap'
import type { VideoDetails } from '../../../../core/utils/youtubeApi'

/** Minimal valid VideoDetails with sensible defaults. */
function makeVideo(overrides: Partial<VideoDetails> & { id: string }): VideoDetails {
    return {
        title: 'Test Video',
        thumbnail: 'https://img.youtube.com/vi/abc/0.jpg',
        channelId: 'UC_channel',
        channelTitle: 'Test Channel',
        channelAvatar: '',
        publishedAt: '2025-01-15T00:00:00Z',
        viewCount: '12345',
        duration: 'PT10M30S',
        ...overrides,
    }
}

describe('buildVideoRefMap', () => {
    it('maps a standard video to correct VideoPreviewData with all fields', () => {
        const video = makeVideo({ id: 'A4SkhlJ2mK8' })
        const map = buildVideoRefMap([video])

        const preview = map.get('A4SkhlJ2mK8')
        expect(preview).toBeDefined()
        expect(preview).toEqual({
            videoId: 'A4SkhlJ2mK8',
            youtubeVideoId: 'A4SkhlJ2mK8',
            title: 'Test Video',
            thumbnailUrl: 'https://img.youtube.com/vi/abc/0.jpg',
            channelTitle: 'Test Channel',
            viewCount: 12345,
            publishedAt: '2025-01-15T00:00:00Z',
            duration: 'PT10M30S',
            ownership: 'own-published',
        })
    })

    it('hasRealData guard: custom video without fetchStatus success has undefined viewCount and publishedAt', () => {
        const video = makeVideo({
            id: 'custom-1234',
            isCustom: true,
            fetchStatus: 'pending',
            viewCount: '1000000',
            publishedAt: '2025-06-01T00:00:00Z',
        })
        const map = buildVideoRefMap([video])

        const preview = map.get('custom-1234')!
        expect(preview.viewCount).toBeUndefined()
        expect(preview.publishedAt).toBeUndefined()
    })

    it('hasRealData guard: custom video WITH fetchStatus success includes viewCount and publishedAt', () => {
        const video = makeVideo({
            id: 'custom-5678',
            isCustom: true,
            fetchStatus: 'success',
            viewCount: '50000',
            publishedAt: '2025-03-10T00:00:00Z',
        })
        const map = buildVideoRefMap([video])

        const preview = map.get('custom-5678')!
        expect(preview.viewCount).toBe(50000)
        expect(preview.publishedAt).toBe('2025-03-10T00:00:00Z')
    })

    it('non-custom video includes viewCount/publishedAt regardless of fetchStatus', () => {
        const video = makeVideo({
            id: 'xyz123',
            isCustom: false,
            fetchStatus: 'pending',
            viewCount: '999',
            publishedAt: '2024-12-01T00:00:00Z',
        })
        const map = buildVideoRefMap([video])

        const preview = map.get('xyz123')!
        expect(preview.viewCount).toBe(999)
        expect(preview.publishedAt).toBe('2024-12-01T00:00:00Z')
    })

    it('publishedVideoId dual-indexing: map contains entries keyed by both v.id and v.publishedVideoId', () => {
        const video = makeVideo({
            id: 'custom-9999',
            publishedVideoId: 'YT_real_id',
        })
        const map = buildVideoRefMap([video])

        expect(map.has('custom-9999')).toBe(true)
        expect(map.has('YT_real_id')).toBe(true)
        // Both keys reference the same preview object
        expect(map.get('custom-9999')).toBe(map.get('YT_real_id'))
    })

    it('publishedVideoId same as id does NOT create duplicate entry', () => {
        const video = makeVideo({
            id: 'A4SkhlJ2mK8',
            publishedVideoId: 'A4SkhlJ2mK8',
        })
        const map = buildVideoRefMap([video])

        expect(map.size).toBe(1)
    })

    it('empty videos array returns empty Map', () => {
        const map = buildVideoRefMap([])

        expect(map.size).toBe(0)
        expect(map).toBeInstanceOf(Map)
    })

    it('viewCount as string is coerced to Number', () => {
        const video = makeVideo({ id: 'v1', viewCount: '987654' })
        const map = buildVideoRefMap([video])

        const preview = map.get('v1')!
        expect(preview.viewCount).toBe(987654)
        expect(typeof preview.viewCount).toBe('number')
    })

    it('ownership mapping: isDraft → own-draft', () => {
        const video = makeVideo({ id: 'draft1', isDraft: true })
        const map = buildVideoRefMap([video])

        expect(map.get('draft1')!.ownership).toBe('own-draft')
    })

    it('ownership mapping: isCustom (not draft) → own-published', () => {
        const video = makeVideo({ id: 'custom-pub', isCustom: true, isDraft: false })
        const map = buildVideoRefMap([video])

        expect(map.get('custom-pub')!.ownership).toBe('own-published')
    })

    it('ownership mapping: neither isDraft nor isCustom → own-published', () => {
        const video = makeVideo({ id: 'normal1', isDraft: false, isCustom: false })
        const map = buildVideoRefMap([video])

        expect(map.get('normal1')!.ownership).toBe('own-published')
    })

    it('dead ternary: isCustom without isDraft still maps to own-published (documents current behavior)', () => {
        // The ternary `v.isDraft ? 'own-draft' : v.isCustom ? 'own-published' : 'own-published'`
        // has a dead branch: both sides of the inner ternary produce the same value.
        // This test documents that isCustom (non-draft) and non-custom yield identical ownership.
        const customVideo = makeVideo({ id: 'custom-x', isCustom: true, isDraft: false })
        const regularVideo = makeVideo({ id: 'regular-x', isCustom: false, isDraft: false })
        const map = buildVideoRefMap([customVideo, regularVideo])

        expect(map.get('custom-x')!.ownership).toBe('own-published')
        expect(map.get('regular-x')!.ownership).toBe('own-published')
        expect(map.get('custom-x')!.ownership).toBe(map.get('regular-x')!.ownership)
    })
})
