import { describe, it, expect } from 'vitest'
import { linkifyVideoRefs } from '../linkifyVideoRefs'
import type { VideoPreviewData } from '../../../Video/types'

function makeMap(entries: [string, string][]): Map<string, VideoPreviewData> {
    const map = new Map<string, VideoPreviewData>()
    for (const [id, title] of entries) {
        map.set(id, { videoId: id, title, thumbnailUrl: '', ownership: 'own-published' })
    }
    return map
}

describe('linkifyVideoRefs', () => {
    it('outputs [title](vid://ID) format', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'Autumn Playlist']])
        const result = linkifyVideoRefs('Check A4SkhlJ2mK8 for details', map)
        expect(result).toBe('Check [Autumn Playlist](vid://A4SkhlJ2mK8) for details')
    })

    it('does not output mention:// scheme', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'My Video']])
        const result = linkifyVideoRefs('See A4SkhlJ2mK8', map)
        expect(result).not.toContain('mention://')
        expect(result).toContain('vid://')
    })

    it('returns unchanged markdown when no matches', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'My Video']])
        const md = 'No video IDs here at all'
        expect(linkifyVideoRefs(md, map)).toBe(md)
    })

    it('returns unchanged markdown when videoMap is empty', () => {
        const md = 'Has A4SkhlJ2mK8 but no map'
        expect(linkifyVideoRefs(md, new Map())).toBe(md)
    })

    it('does not double-wrap existing vid:// links', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'My Video']])
        const md = 'See [Autumn](vid://A4SkhlJ2mK8) for details'
        const result = linkifyVideoRefs(md, map)
        // Should not create nested links
        expect(result).toBe(md)
    })

    it('does not double-wrap existing mention:// links', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'My Video']])
        const md = 'See [A4SkhlJ2mK8](mention://A4SkhlJ2mK8) for details'
        const result = linkifyVideoRefs(md, map)
        expect(result).toBe(md)
    })

    it('handles multiple video IDs', () => {
        const map = makeMap([
            ['A4SkhlJ2mK8', 'Video One'],
            ['B5TklM3nL9x', 'Video Two'],
        ])
        const result = linkifyVideoRefs('Compare A4SkhlJ2mK8 and B5TklM3nL9x', map)
        expect(result).toBe('Compare [Video One](vid://A4SkhlJ2mK8) and [Video Two](vid://B5TklM3nL9x)')
    })

    it('handles custom-* IDs', () => {
        const map = makeMap([['custom-1773061458547', 'Draft Video']])
        const result = linkifyVideoRefs('Check custom-1773061458547 now', map)
        expect(result).toBe('Check [Draft Video](vid://custom-1773061458547) now')
    })

    it('uses ID as fallback when title is missing', () => {
        const map = new Map<string, VideoPreviewData>()
        map.set('A4SkhlJ2mK8', { videoId: 'A4SkhlJ2mK8', title: '', thumbnailUrl: '' })
        const result = linkifyVideoRefs('See A4SkhlJ2mK8', map)
        expect(result).toBe('See [A4SkhlJ2mK8](vid://A4SkhlJ2mK8)')
    })
})
