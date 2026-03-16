import { describe, it, expect } from 'vitest'
import TurndownService from 'turndown'
import { parseMarkdownToHTML } from '../utils/markdownParser'

/**
 * Verifies that [title](vid://ID) links survive the markdown → HTML → markdown roundtrip.
 * Guards against regression on turndown/marked upgrades.
 */
describe('vid:// roundtrip (marked → turndown)', () => {
    const turndown = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
    })

    it('preserves [title](vid://ID) through roundtrip', () => {
        const original = '[Autumn Playlist](vid://A4SkhlJ2mK8)'
        const html = parseMarkdownToHTML(original)
        // marked should parse vid:// as a valid href
        expect(html).toContain('href="vid://A4SkhlJ2mK8"')
        expect(html).toContain('Autumn Playlist')

        const markdown = turndown.turndown(html)
        expect(markdown).toContain('[Autumn Playlist](vid://A4SkhlJ2mK8)')
    })

    it('preserves vid:// in a paragraph with other text', () => {
        const original = 'Check [My Video](vid://B5TklM3nL9x) for traffic analysis results.'
        const html = parseMarkdownToHTML(original)
        const markdown = turndown.turndown(html)
        expect(markdown).toContain('[My Video](vid://B5TklM3nL9x)')
    })

    it('preserves multiple vid:// links', () => {
        const original = 'Compare [Video A](vid://A4SkhlJ2mK8) and [Video B](vid://B5TklM3nL9x).'
        const html = parseMarkdownToHTML(original)
        const markdown = turndown.turndown(html)
        expect(markdown).toContain('[Video A](vid://A4SkhlJ2mK8)')
        expect(markdown).toContain('[Video B](vid://B5TklM3nL9x)')
    })

    it('preserves vid:// with custom-* IDs', () => {
        const original = '[Draft](vid://custom-1773061458547)'
        const html = parseMarkdownToHTML(original)
        const markdown = turndown.turndown(html)
        expect(markdown).toContain('[Draft](vid://custom-1773061458547)')
    })
})
