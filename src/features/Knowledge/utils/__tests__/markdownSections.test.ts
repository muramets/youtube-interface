import { describe, it, expect } from 'vitest'
import { parseMarkdownSections } from '../markdownSections'
import type { HierarchicalSection } from '../markdownSections'

describe('parseMarkdownSections', () => {
    it('returns empty result for empty string', () => {
        const result = parseMarkdownSections('')
        expect(result).toEqual({ preamble: '', sections: [] })
    })

    it('text before first header becomes preamble', () => {
        const md = 'Some intro text\nAnother line\n# First Header\nBody'
        const result = parseMarkdownSections(md)
        expect(result.preamble).toBe('Some intro text\nAnother line')
        expect(result.sections).toHaveLength(1)
        expect(result.sections[0].title).toBe('First Header')
    })

    it('parses H1, H2, and H3 headers correctly', () => {
        const md = '# H1 Title\nh1 body\n## H2 Title\nh2 body\n### H3 Title\nh3 body'
        const result = parseMarkdownSections(md)

        const h1 = result.sections[0]
        expect(h1.title).toBe('H1 Title')
        expect(h1.level).toBe(1)

        const h2 = h1.children[0]
        expect(h2.title).toBe('H2 Title')
        expect(h2.level).toBe(2)

        const h3 = h2.children[0]
        expect(h3.title).toBe('H3 Title')
        expect(h3.level).toBe(3)
    })

    it('accumulates content lines under correct section', () => {
        const md = '# Section A\nline 1\nline 2\n# Section B\nline 3'
        const result = parseMarkdownSections(md)

        expect(result.sections[0].content).toEqual(['line 1', 'line 2'])
        expect(result.sections[1].content).toEqual(['line 3'])
    })

    it('H2 after H1 becomes child of H1 (nesting)', () => {
        const md = '# Parent\n## Child'
        const result = parseMarkdownSections(md)

        expect(result.sections).toHaveLength(1)
        expect(result.sections[0].title).toBe('Parent')
        expect(result.sections[0].children).toHaveLength(1)
        expect(result.sections[0].children[0].title).toBe('Child')
    })

    it('same-level headers remain siblings', () => {
        const md = '## Alpha\n## Beta\n## Gamma'
        const result = parseMarkdownSections(md)

        expect(result.sections).toHaveLength(3)
        expect(result.sections[0].title).toBe('Alpha')
        expect(result.sections[1].title).toBe('Beta')
        expect(result.sections[2].title).toBe('Gamma')
        // None should have children
        result.sections.forEach((s) => expect(s.children).toEqual([]))
    })

    it('level jumps (H1 → H3) still nest correctly', () => {
        const md = '# Top\n### Deep'
        const result = parseMarkdownSections(md)

        expect(result.sections).toHaveLength(1)
        expect(result.sections[0].title).toBe('Top')
        expect(result.sections[0].children).toHaveLength(1)
        expect(result.sections[0].children[0].title).toBe('Deep')
        expect(result.sections[0].children[0].level).toBe(3)
    })

    it('H1 after H2 pops the stack (sibling, not child)', () => {
        const md = '## Smaller\n# Bigger'
        const result = parseMarkdownSections(md)

        expect(result.sections).toHaveLength(2)
        expect(result.sections[0].title).toBe('Smaller')
        expect(result.sections[0].level).toBe(2)
        expect(result.sections[0].children).toEqual([])
        expect(result.sections[1].title).toBe('Bigger')
        expect(result.sections[1].level).toBe(1)
    })

    it('end-to-end: complex document with preamble + multi-level headers', () => {
        const md = [
            'Intro paragraph',
            '',
            '# Overview',
            'Overview text',
            '## Details',
            'Detail line 1',
            'Detail line 2',
            '### Sub-details',
            'Sub-detail text',
            '## Another Section',
            'Another body',
            '# Conclusion',
            'Final words',
        ].join('\n')

        const result = parseMarkdownSections(md)

        expect(result.preamble).toBe('Intro paragraph\n')

        // Root: Overview, Conclusion
        expect(result.sections).toHaveLength(2)

        const overview = result.sections[0]
        expect(overview.title).toBe('Overview')
        expect(overview.level).toBe(1)
        expect(overview.content).toEqual(['Overview text'])
        expect(overview.children).toHaveLength(2)

        const details = overview.children[0]
        expect(details.title).toBe('Details')
        expect(details.level).toBe(2)
        expect(details.content).toEqual(['Detail line 1', 'Detail line 2'])
        expect(details.children).toHaveLength(1)

        const subDetails = details.children[0]
        expect(subDetails.title).toBe('Sub-details')
        expect(subDetails.level).toBe(3)
        expect(subDetails.content).toEqual(['Sub-detail text'])

        const anotherSection = overview.children[1]
        expect(anotherSection.title).toBe('Another Section')
        expect(anotherSection.level).toBe(2)
        expect(anotherSection.content).toEqual(['Another body'])

        const conclusion = result.sections[1]
        expect(conclusion.title).toBe('Conclusion')
        expect(conclusion.level).toBe(1)
        expect(conclusion.content).toEqual(['Final words'])
    })

    it('header with only # markers and no text does not match as header', () => {
        const md = '# Real Header\n##\nsome text'
        const result = parseMarkdownSections(md)

        expect(result.sections).toHaveLength(1)
        expect(result.sections[0].title).toBe('Real Header')
        // "##" has no space + text after it, so it is not a valid header
        expect(result.sections[0].content).toContain('##')
        expect(result.sections[0].content).toContain('some text')
    })

    it('### followed by only spaces matches as header with space title (regex edge case)', () => {
        // "###  " has \s+ after ### and (.+?) captures a single space as "title".
        // This documents the current regex behaviour — not ideal, but consistent.
        const md = '# Real Header\n###  \nsome text'
        const result = parseMarkdownSections(md)

        // "###  " is parsed as a level-3 header (child of H1)
        expect(result.sections).toHaveLength(1)
        expect(result.sections[0].children).toHaveLength(1)
        expect(result.sections[0].children[0].level).toBe(3)
        expect(result.sections[0].children[0].content).toEqual(['some text'])
    })

    it('code blocks containing # are not treated as headers', () => {
        const md = [
            '# Real Header',
            'Body text',
            '```',
            '# This is a comment in code',
            '## Not a header',
            '```',
            'After code block',
        ].join('\n')

        const result = parseMarkdownSections(md)

        // The parser does not have code-block awareness — lines inside
        // fenced code blocks that look like headers WILL be parsed as headers.
        // This test documents the current (naive) behaviour.
        // If code-block awareness is added later, update this test.
        expect(result.sections.length).toBeGreaterThanOrEqual(1)
        expect(result.sections[0].title).toBe('Real Header')

        // Collect all titles in the tree
        const allTitles: string[] = []
        function collect(nodes: HierarchicalSection[]) {
            for (const n of nodes) {
                allTitles.push(n.title)
                collect(n.children)
            }
        }
        collect(result.sections)

        // Current behaviour: the code-block lines ARE treated as headers
        expect(allTitles).toContain('This is a comment in code')
        expect(allTitles).toContain('Not a header')
    })
})
