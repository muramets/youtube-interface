import { describe, it, expect } from 'vitest'
import { KiRefMark } from '../extensions/KiRefMark'

/**
 * Helper: call addAttributes() with proper `this` context mock.
 * Returns attribute definitions with parseHTML functions.
 */
function getAttrs() {
    const fn = KiRefMark.config.addAttributes!
    const ctx = { name: 'kiRef', options: {}, storage: {}, parent: undefined }
    const result = fn.call(ctx as never)
    return result as Record<string, { parseHTML: (el: HTMLElement) => string | null }>
}

/**
 * Helper: call renderHTML() with proper `this` context mock.
 */
function callRenderHTML(attrs: Record<string, string>) {
    const fn = KiRefMark.config.renderHTML!
    const ctx = { name: 'kiRef', options: {}, storage: {}, parent: null }
    return fn.call(ctx as never, { HTMLAttributes: attrs, mark: {} as never }) as unknown as [string, Record<string, string>, 0]
}

describe('KiRefMark', () => {
    describe('config', () => {
        it('has inclusive: false (typing after mark does not extend it)', () => {
            expect(KiRefMark.config.inclusive).toBe(false)
        })

        it('has excludes: "" (allows bold/italic/color inside)', () => {
            expect(KiRefMark.config.excludes).toBe('')
        })

        it('has name "kiRef"', () => {
            expect(KiRefMark.config.name).toBe('kiRef')
        })
    })

    describe('parseHTML', () => {
        it('matches <a href="ki://..."> tag selector', () => {
            const fn = KiRefMark.config.parseHTML!
            const ctx = { name: 'kiRef', options: {}, storage: {}, parent: undefined }
            const rules = fn.call(ctx as never) ?? []
            expect(rules).toHaveLength(1)
            expect(rules[0].tag).toBe('a[href^="ki://"]')
        })

        it('extracts kiId from href attribute', () => {
            const attrs = getAttrs()
            const el = document.createElement('a')
            el.href = 'ki://abc123def'
            expect(attrs.kiId.parseHTML(el)).toBe('abc123def')
        })

        it('extracts long Firestore document IDs', () => {
            const attrs = getAttrs()
            const el = document.createElement('a')
            el.href = 'ki://xK9mZ2pQr7sT4uV'
            expect(attrs.kiId.parseHTML(el)).toBe('xK9mZ2pQr7sT4uV')
        })

        it('returns null for non-ki:// href', () => {
            const attrs = getAttrs()
            const el = document.createElement('a')
            el.href = 'https://example.com'
            expect(attrs.kiId.parseHTML(el)).toBeNull()
        })

        it('returns null for vid:// href (does not cross-match)', () => {
            const attrs = getAttrs()
            const el = document.createElement('a')
            el.href = 'vid://A4SkhlJ2mK8'
            expect(attrs.kiId.parseHTML(el)).toBeNull()
        })

        it('extracts title from element textContent', () => {
            const attrs = getAttrs()
            const el = document.createElement('a')
            el.textContent = 'Traffic Analysis — March 2026'
            expect(attrs.title.parseHTML(el)).toBe('Traffic Analysis — March 2026')
        })
    })

    describe('renderHTML', () => {
        it('outputs correct tag, attrs, and content hole', () => {
            const result = callRenderHTML({ kiId: 'abc123def', title: 'Traffic Analysis' })
            expect(result).toEqual([
                'a',
                {
                    href: 'ki://abc123def',
                    'data-ki-ref': 'abc123def',
                    class: 'ki-reference-highlight',
                },
                0,
            ])
        })

        it('handles long Firestore IDs in href', () => {
            const result = callRenderHTML({ kiId: 'xK9mZ2pQr7sT4uV', title: 'Niche Analysis' })
            expect(result[1].href).toBe('ki://xK9mZ2pQr7sT4uV')
            expect(result[1]['data-ki-ref']).toBe('xK9mZ2pQr7sT4uV')
        })
    })
})
