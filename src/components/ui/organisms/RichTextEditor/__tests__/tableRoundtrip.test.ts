import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTurndownService } from '../hooks/useTurndownService'
import { parseMarkdownToHTML } from '../utils/markdownParser'

/**
 * Verifies that GFM pipe tables survive the markdown → HTML → markdown roundtrip.
 * Guards against the table format bloat bug where pipe tables were saved as HTML,
 * doubling content size and breaking diff views.
 */
describe('table roundtrip (marked → turndown)', () => {
    function roundtrip(markdown: string): string {
        const { result } = renderHook(() => useTurndownService())
        const html = parseMarkdownToHTML(markdown)
        return result.current.turndown(html)
    }

    it('converts HTML table back to pipe format', () => {
        const { result } = renderHook(() => useTurndownService())
        const html = `
            <table>
                <thead><tr><th>Source</th><th>Views</th></tr></thead>
                <tbody><tr><td>Search</td><td>1,200</td></tr></tbody>
            </table>
        `
        const md = result.current.turndown(html)
        expect(md).toContain('| Source | Views |')
        expect(md).toContain('|---|---|')
        expect(md).toContain('| Search | 1,200 |')
        expect(md).not.toContain('<table')
    })

    it('preserves pipe table through full roundtrip', () => {
        const original = [
            '| Source | Views | CTR |',
            '| --- | --- | --- |',
            '| Suggested videos | 9,086 | 2.91% |',
            '| Browse features | 5,072 | 4.38% |',
        ].join('\n')

        const result = roundtrip(original)
        expect(result).toContain('| Source | Views | CTR |')
        expect(result).toContain('| Suggested videos | 9,086 | 2.91% |')
        expect(result).toContain('| Browse features | 5,072 | 4.38% |')
        expect(result).not.toContain('<table')
    })

    it('handles cells with dashes', () => {
        const original = [
            '| Source | Views | Impressions |',
            '| --- | --- | --- |',
            '| Direct | 822 | – |',
        ].join('\n')

        const result = roundtrip(original)
        expect(result).toContain('| Direct | 822 |')
    })

    it('handles empty cells', () => {
        const { result } = renderHook(() => useTurndownService())
        const html = `
            <table>
                <thead><tr><th>A</th><th>B</th></tr></thead>
                <tbody><tr><td>val</td><td></td></tr></tbody>
            </table>
        `
        const md = result.current.turndown(html)
        expect(md).toContain('| val |  |')
    })

    it('escapes pipe characters in cell content', () => {
        const { result } = renderHook(() => useTurndownService())
        const html = `
            <table>
                <thead><tr><th>Name</th></tr></thead>
                <tbody><tr><td>A | B</td></tr></tbody>
            </table>
        `
        const md = result.current.turndown(html)
        expect(md).toContain('A \\| B')
    })

    it('preserves bold text inside table cells', () => {
        const { result } = renderHook(() => useTurndownService())
        const html = `
            <table>
                <thead><tr><th>Day</th><th>Note</th></tr></thead>
                <tbody><tr><td>5</td><td><strong>Major spike</strong></td></tr></tbody>
            </table>
        `
        const md = result.current.turndown(html)
        expect(md).toContain('**Major spike**')
    })

    it('converts horizontal rule to --- format', () => {
        const { result } = renderHook(() => useTurndownService())
        const md = result.current.turndown('<hr>')
        expect(md.trim()).toBe('---')
    })

    it('does not bloat content size on roundtrip', () => {
        const original = [
            '| Source | Views | Impressions | CTR |',
            '| --- | --- | --- | --- |',
            '| Suggested videos | 9,086 | 90,412 | 2.91% |',
            '| Browse features | 5,072 | 99,593 | 4.38% |',
            '| Direct/unknown | 822 | – | – |',
        ].join('\n')

        const result = roundtrip(original)
        // Roundtripped content should be similar size (not 2x)
        expect(result.length).toBeLessThan(original.length * 1.5)
    })
})
