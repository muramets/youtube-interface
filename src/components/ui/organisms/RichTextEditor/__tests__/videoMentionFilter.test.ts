import { describe, it, expect } from 'vitest'
import type { VideoPreviewData } from '../../../../../features/Video/types'

/**
 * Test the items filter logic from VideoMention extension.
 * Extracted as pure function for unit testing (same logic as in the extension).
 */
function filterVideos(catalog: VideoPreviewData[], query: string): VideoPreviewData[] {
    if (query.length < 2) return []
    const q = query.toLowerCase()
    return catalog
        .filter(v =>
            v.title.toLowerCase().includes(q) ||
            v.videoId.toLowerCase().includes(q) ||
            (v.youtubeVideoId && v.youtubeVideoId.toLowerCase().includes(q))
        )
        .slice(0, 10)
}

const catalog: VideoPreviewData[] = [
    { videoId: 'A4SkhlJ2mK8', title: 'Autumn Playlist Ideas', thumbnailUrl: '', ownership: 'own-published' },
    { videoId: 'B5TklM3nL9x', title: 'Best Autumn Moments', thumbnailUrl: '', ownership: 'competitor' },
    { videoId: 'C6UmnN4oP0y', title: 'Summer Vibes', thumbnailUrl: '', ownership: 'own-published' },
    { videoId: 'D7VnoO5pQ1z', title: 'Autumn Road Trip', thumbnailUrl: '', ownership: 'own-draft' },
    { videoId: 'E8WopP6qR2a', title: 'Winter Playlist', thumbnailUrl: '', ownership: 'own-published' },
    { videoId: 'F9XpqQ7rS3b', title: 'Spring Cleaning', thumbnailUrl: '', ownership: 'competitor' },
    ...Array.from({ length: 15 }, (_, i) => ({
        videoId: `fill-${i}`,
        title: `Auto Generated Video ${i}`,
        thumbnailUrl: '',
        ownership: 'own-published' as const,
    })),
]

describe('VideoMention items filter', () => {
    it('returns [] for empty query (below threshold)', () => {
        expect(filterVideos(catalog, '')).toEqual([])
    })

    it('returns [] for 1-char query (below threshold)', () => {
        expect(filterVideos(catalog, 'a')).toEqual([])
    })

    it('returns matching videos for 2+ char query', () => {
        const results = filterVideos(catalog, 'au')
        expect(results.length).toBeGreaterThan(0)
        expect(results.every(v => v.title.toLowerCase().includes('au'))).toBe(true)
    })

    it('matches with spaces (allowSpaces behavior)', () => {
        const results = filterVideos(catalog, 'autumn playlist')
        expect(results).toHaveLength(1)
        expect(results[0].videoId).toBe('A4SkhlJ2mK8')
    })

    it('matches by video ID', () => {
        const results = filterVideos(catalog, 'A4SkhlJ2mK8')
        expect(results).toHaveLength(1)
        expect(results[0].title).toBe('Autumn Playlist Ideas')
    })

    it('matches by partial video ID', () => {
        const results = filterVideos(catalog, 'B5Tkl')
        expect(results).toHaveLength(1)
        expect(results[0].title).toBe('Best Autumn Moments')
    })

    it('matches by youtubeVideoId (custom video with publishedVideoId)', () => {
        const customCatalog: VideoPreviewData[] = [
            { videoId: 'custom-123', youtubeVideoId: 'xYz789AbCdE', title: 'My Draft', thumbnailUrl: '', ownership: 'own-published' },
        ]
        const results = filterVideos(customCatalog, 'xYz789')
        expect(results).toHaveLength(1)
        expect(results[0].videoId).toBe('custom-123')
    })

    it('returns max 10 results', () => {
        const results = filterVideos(catalog, 'vi') // matches "Video" in fill items + others
        expect(results.length).toBeLessThanOrEqual(10)
    })

    it('is case insensitive', () => {
        const upper = filterVideos(catalog, 'AUTUMN')
        const lower = filterVideos(catalog, 'autumn')
        expect(upper).toEqual(lower)
    })

    it('returns [] when no matches', () => {
        expect(filterVideos(catalog, 'xyz123')).toEqual([])
    })
})
