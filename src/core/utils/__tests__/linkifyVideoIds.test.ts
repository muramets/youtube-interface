import { describe, it, expect } from 'vitest';
import { linkifyVideoIds } from '../linkifyVideoIds';

function makeMap(entries: [string, string][]): Map<string, { title?: string }> {
    const map = new Map<string, { title?: string }>();
    for (const [id, title] of entries) {
        map.set(id, { title });
    }
    return map;
}

describe('linkifyVideoIds', () => {
    // --- Basic linking ---

    it('wraps raw YouTube ID with vid:// by default', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'Autumn Playlist']]);
        expect(linkifyVideoIds('Check A4SkhlJ2mK8 for details', map))
            .toBe('Check [Autumn Playlist](vid://A4SkhlJ2mK8) for details');
    });

    it('wraps raw YouTube ID with mention:// when scheme is mention', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'Autumn Playlist']]);
        expect(linkifyVideoIds('Check A4SkhlJ2mK8 for details', map, 'mention'))
            .toBe('Check [Autumn Playlist](mention://A4SkhlJ2mK8) for details');
    });

    it('handles custom-* IDs', () => {
        const map = makeMap([['custom-1773061458547', 'Draft Video']]);
        expect(linkifyVideoIds('Check custom-1773061458547 now', map))
            .toBe('Check [Draft Video](vid://custom-1773061458547) now');
    });

    it('handles multiple video IDs', () => {
        const map = makeMap([
            ['A4SkhlJ2mK8', 'Video One'],
            ['B5TklM3nL9x', 'Video Two'],
        ]);
        expect(linkifyVideoIds('Compare A4SkhlJ2mK8 and B5TklM3nL9x', map))
            .toBe('Compare [Video One](vid://A4SkhlJ2mK8) and [Video Two](vid://B5TklM3nL9x)');
    });

    it('uses ID as fallback when title is empty', () => {
        const map = makeMap([['A4SkhlJ2mK8', '']]);
        expect(linkifyVideoIds('See A4SkhlJ2mK8', map))
            .toBe('See [A4SkhlJ2mK8](vid://A4SkhlJ2mK8)');
    });

    it('uses ID as fallback when title is undefined', () => {
        const map = new Map<string, { title?: string }>();
        map.set('A4SkhlJ2mK8', {});
        expect(linkifyVideoIds('See A4SkhlJ2mK8', map))
            .toBe('See [A4SkhlJ2mK8](vid://A4SkhlJ2mK8)');
    });

    // --- No-op cases ---

    it('returns unchanged markdown when no matches', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'My Video']]);
        expect(linkifyVideoIds('No video IDs here at all', map))
            .toBe('No video IDs here at all');
    });

    it('returns unchanged markdown when videoMap is empty', () => {
        expect(linkifyVideoIds('Has A4SkhlJ2mK8 but no map', new Map()))
            .toBe('Has A4SkhlJ2mK8 but no map');
    });

    // --- Skip existing links ---

    it('does not double-wrap existing vid:// links', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'My Video']]);
        const md = 'See [Autumn](vid://A4SkhlJ2mK8) for details';
        expect(linkifyVideoIds(md, map)).toBe(md);
    });

    it('does not double-wrap existing mention:// links', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'My Video']]);
        const md = 'See [A4SkhlJ2mK8](mention://A4SkhlJ2mK8) for details';
        expect(linkifyVideoIds(md, map)).toBe(md);
    });

    it('does not touch IDs inside other markdown links', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'My Video']]);
        const md = 'See [click here](https://example.com/A4SkhlJ2mK8)';
        expect(linkifyVideoIds(md, map)).toBe(md);
    });

    // --- Code block protection ---

    it('does not linkify inside fenced code blocks', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        const md = 'Check this:\n```json\n{ "videoId": "GXA9nB0SBgE" }\n```\nDone.';
        expect(linkifyVideoIds(md, map)).toBe(md);
    });

    it('linkifies video ID inside inline code (strips backticks)', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        const md = 'The ID is `GXA9nB0SBgE` in the response';
        expect(linkifyVideoIds(md, map))
            .toBe('The ID is [Comfort Playlist](vid://GXA9nB0SBgE) in the response');
    });

    it('protects inline code containing non-ID content', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        const md = 'Use `videoId: GXA9nB0SBgE` in config';
        expect(linkifyVideoIds(md, map)).toBe(md);
    });

    it('linkifies inline code ID with mention:// scheme', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        const md = 'Check `GXA9nB0SBgE` for details';
        expect(linkifyVideoIds(md, map, 'mention'))
            .toBe('Check [Comfort Playlist](mention://GXA9nB0SBgE) for details');
    });

    it('linkifies inline code ID alongside bare ID', () => {
        const map = makeMap([
            ['GXA9nB0SBgE', 'Video One'],
            ['B5TklM3nL9x', 'Video Two'],
        ]);
        const md = 'Compare `GXA9nB0SBgE` and B5TklM3nL9x';
        expect(linkifyVideoIds(md, map))
            .toBe('Compare [Video One](vid://GXA9nB0SBgE) and [Video Two](vid://B5TklM3nL9x)');
    });

    it('linkifies custom ID inside inline code', () => {
        const map = makeMap([['custom-1773061458547', 'Draft Video']]);
        const md = 'Check `custom-1773061458547` now';
        expect(linkifyVideoIds(md, map))
            .toBe('Check [Draft Video](vid://custom-1773061458547) now');
    });

    it('linkifies outside code block but not inside', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        const md = 'See GXA9nB0SBgE here.\n```\nGXA9nB0SBgE\n```\nAnd GXA9nB0SBgE again.';
        const result = linkifyVideoIds(md, map);
        expect(result).toBe(
            'See [Comfort Playlist](vid://GXA9nB0SBgE) here.\n```\nGXA9nB0SBgE\n```\nAnd [Comfort Playlist](vid://GXA9nB0SBgE) again.',
        );
    });

    // --- URL protection ---

    it('does not linkify ID inside YouTube URL with ?v=', () => {
        const map = makeMap([['GXA9nB0SBgE', 'My Video']]);
        const md = 'Watch at https://youtube.com/watch?v=GXA9nB0SBgE';
        expect(linkifyVideoIds(md, map)).toBe(md);
    });

    it('does not linkify ID inside URL with &v=', () => {
        const map = makeMap([['GXA9nB0SBgE', 'My Video']]);
        const md = 'See https://example.com/page?foo=bar&v=GXA9nB0SBgE';
        expect(linkifyVideoIds(md, map)).toBe(md);
    });

    it('does not linkify ID inside URL path segment', () => {
        const map = makeMap([['GXA9nB0SBgE', 'My Video']]);
        const md = 'See https://youtube.com/embed/GXA9nB0SBgE for embed';
        expect(linkifyVideoIds(md, map)).toBe(md);
    });

    // --- Boundary cases ---

    it('linkifies ID in bold markdown', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        expect(linkifyVideoIds('**GXA9nB0SBgE** — anomaly', map))
            .toBe('**[Comfort Playlist](vid://GXA9nB0SBgE)** — anomaly');
    });

    it('linkifies ID in parentheses', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        expect(linkifyVideoIds('The video (GXA9nB0SBgE) is interesting', map))
            .toBe('The video ([Comfort Playlist](vid://GXA9nB0SBgE)) is interesting');
    });

    it('linkifies ID at start of line', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        expect(linkifyVideoIds('GXA9nB0SBgE showed growth', map))
            .toBe('[Comfort Playlist](vid://GXA9nB0SBgE) showed growth');
    });

    it('linkifies ID at end of line', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        expect(linkifyVideoIds('Check GXA9nB0SBgE', map))
            .toBe('Check [Comfort Playlist](vid://GXA9nB0SBgE)');
    });

    it('matches longer custom ID before shorter numeric suffix', () => {
        const map = makeMap([
            ['custom-1773061458547', 'Full Custom'],
            ['1773061458547', 'Numeric Only'],
        ]);
        const result = linkifyVideoIds('See custom-1773061458547 here', map);
        expect(result).toBe('See [Full Custom](vid://custom-1773061458547) here');
    });

    // --- Escaping ---

    it('escapes brackets in titles to prevent broken markdown', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'Video [One] (test)']]);
        expect(linkifyVideoIds('Check A4SkhlJ2mK8', map))
            .toBe('Check [Video \\[One\\] (test)](vid://A4SkhlJ2mK8)');
    });

    // --- Additional edge cases ---

    it('returns empty string unchanged', () => {
        const map = makeMap([['A4SkhlJ2mK8', 'Video']]);
        expect(linkifyVideoIds('', map)).toBe('');
    });

    it('linkifies ID followed by punctuation (period)', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        expect(linkifyVideoIds('See GXA9nB0SBgE.', map))
            .toBe('See [Comfort Playlist](vid://GXA9nB0SBgE).');
    });

    it('linkifies ID followed by comma', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        expect(linkifyVideoIds('Videos GXA9nB0SBgE, other', map))
            .toBe('Videos [Comfort Playlist](vid://GXA9nB0SBgE), other');
    });

    it('linkifies same ID appearing multiple times', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Comfort Playlist']]);
        expect(linkifyVideoIds('First GXA9nB0SBgE then GXA9nB0SBgE again', map))
            .toBe('First [Comfort Playlist](vid://GXA9nB0SBgE) then [Comfort Playlist](vid://GXA9nB0SBgE) again');
    });

    it('does not linkify ID preceded by hash in URL fragment', () => {
        const map = makeMap([['GXA9nB0SBgE', 'Video']]);
        const md = 'See https://example.com/page#GXA9nB0SBgE';
        expect(linkifyVideoIds(md, map)).toBe(md);
    });
});
