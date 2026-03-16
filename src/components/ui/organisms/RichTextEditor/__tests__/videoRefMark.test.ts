import { describe, it, expect } from 'vitest'
import { VideoRefMark } from '../extensions/VideoRefMark'

/**
 * Helper: call addAttributes() with proper `this` context mock.
 * Returns attribute definitions with parseHTML functions.
 */
function getAttrs() {
    const fn = VideoRefMark.config.addAttributes!
    const ctx = { name: 'videoRef', options: {}, storage: {}, parent: undefined }
    const result = fn.call(ctx as never)
    return result as Record<string, { parseHTML: (el: HTMLElement) => string | null }>
}

/**
 * Helper: call renderHTML() with proper `this` context mock.
 */
function callRenderHTML(attrs: Record<string, string>) {
    const fn = VideoRefMark.config.renderHTML!
    const ctx = { name: 'videoRef', options: {}, storage: {}, parent: null }
    return fn.call(ctx as never, { HTMLAttributes: attrs, mark: {} as never }) as unknown as [string, Record<string, string>, 0]
}

describe('VideoRefMark', () => {
    describe('config', () => {
        it('has inclusive: false (typing after mark does not extend it)', () => {
            expect(VideoRefMark.config.inclusive).toBe(false)
        })

        it('has excludes: "" (allows bold/italic/color inside)', () => {
            expect(VideoRefMark.config.excludes).toBe('')
        })

        it('has name "videoRef"', () => {
            expect(VideoRefMark.config.name).toBe('videoRef')
        })
    })

    describe('parseHTML', () => {
        it('matches <a href="vid://..."> tag selector', () => {
            const fn = VideoRefMark.config.parseHTML!
            const ctx = { name: 'videoRef', options: {}, storage: {}, parent: undefined }
            const rules = fn.call(ctx as never) ?? []
            expect(rules).toHaveLength(1)
            expect(rules[0].tag).toBe('a[href^="vid://"]')
        })

        it('extracts videoId from href attribute', () => {
            const attrs = getAttrs()
            const el = document.createElement('a')
            el.href = 'vid://A4SkhlJ2mK8'
            expect(attrs.videoId.parseHTML(el)).toBe('A4SkhlJ2mK8')
        })

        it('extracts custom-* video IDs', () => {
            const attrs = getAttrs()
            const el = document.createElement('a')
            el.href = 'vid://custom-1773061458547'
            expect(attrs.videoId.parseHTML(el)).toBe('custom-1773061458547')
        })

        it('returns null for non-vid:// href', () => {
            const attrs = getAttrs()
            const el = document.createElement('a')
            el.href = 'https://youtube.com'
            expect(attrs.videoId.parseHTML(el)).toBeNull()
        })

        it('extracts title from element textContent', () => {
            const attrs = getAttrs()
            const el = document.createElement('a')
            el.textContent = 'Autumn Playlist'
            expect(attrs.title.parseHTML(el)).toBe('Autumn Playlist')
        })
    })

    describe('renderHTML', () => {
        it('outputs correct tag, attrs, and content hole', () => {
            const result = callRenderHTML({ videoId: 'A4SkhlJ2mK8', title: 'Autumn Playlist' })
            expect(result).toEqual([
                'a',
                {
                    href: 'vid://A4SkhlJ2mK8',
                    'data-video-ref': 'A4SkhlJ2mK8',
                    class: 'video-reference-highlight',
                },
                0,
            ])
        })

        it('includes custom-* IDs in href', () => {
            const result = callRenderHTML({ videoId: 'custom-123', title: 'Draft' })
            expect(result[1].href).toBe('vid://custom-123')
            expect(result[1]['data-video-ref']).toBe('custom-123')
        })
    })
})
