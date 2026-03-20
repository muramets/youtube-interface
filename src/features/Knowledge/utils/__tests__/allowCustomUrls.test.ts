import { describe, it, expect } from 'vitest'
import { allowCustomUrls } from '../diffUtils'

describe('allowCustomUrls', () => {
    // Allowed protocols
    it('allows http:// URLs', () => {
        expect(allowCustomUrls('http://example.com')).toBe('http://example.com')
    })

    it('allows https:// URLs', () => {
        expect(allowCustomUrls('https://example.com/path?q=1')).toBe('https://example.com/path?q=1')
    })

    it('allows vid:// URIs', () => {
        expect(allowCustomUrls('vid://A4SkhlJ2mK8')).toBe('vid://A4SkhlJ2mK8')
    })

    it('allows mention:// URIs', () => {
        expect(allowCustomUrls('mention://custom-123')).toBe('mention://custom-123')
    })

    it('allows ki:// URIs', () => {
        expect(allowCustomUrls('ki://ki-1234567890')).toBe('ki://ki-1234567890')
    })

    // Relative URLs
    it('allows relative paths', () => {
        expect(allowCustomUrls('some/path')).toBe('some/path')
    })

    it('allows hash anchors', () => {
        expect(allowCustomUrls('#section-1')).toBe('#section-1')
    })

    it('allows root-relative paths', () => {
        expect(allowCustomUrls('/path/to/page')).toBe('/path/to/page')
    })

    it('allows query-only URLs', () => {
        expect(allowCustomUrls('?key=value')).toBe('?key=value')
    })

    // Blocked protocols (XSS vectors)
    it('blocks javascript: URIs', () => {
        expect(allowCustomUrls('javascript:alert(1)')).toBe('')
    })

    it('blocks data: URIs', () => {
        expect(allowCustomUrls('data:text/html,<script>alert(1)</script>')).toBe('')
    })

    it('blocks vbscript: URIs', () => {
        expect(allowCustomUrls('vbscript:MsgBox("XSS")')).toBe('')
    })

    it('blocks unknown protocols', () => {
        expect(allowCustomUrls('ftp://files.example.com')).toBe('')
    })

    it('blocks mailto: URIs', () => {
        expect(allowCustomUrls('mailto:evil@example.com')).toBe('')
    })
})
