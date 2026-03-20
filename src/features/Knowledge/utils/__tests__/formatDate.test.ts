import { describe, it, expect } from 'vitest'
import { getOriginLabel, getEditLabel, getSourceLabel, formatVersionLabel } from '../formatDate'

describe('getOriginLabel', () => {
    it('returns "Chat" for chat-tool', () => {
        expect(getOriginLabel('chat-tool')).toBe('Chat')
    })

    it('returns "Memorize" for conclude', () => {
        expect(getOriginLabel('conclude')).toBe('Memorize')
    })

    it('returns "Manual" for manual', () => {
        expect(getOriginLabel('manual')).toBe('Manual')
    })

    it('returns "LLM Edit" for chat-edit', () => {
        expect(getOriginLabel('chat-edit')).toBe('LLM Edit')
    })

    it('defaults to "Chat" for unknown source', () => {
        expect(getOriginLabel('something-else')).toBe('Chat')
    })
})

describe('getEditLabel', () => {
    it('returns "Manually edited" for manual', () => {
        expect(getEditLabel('manual')).toBe('Manually edited')
    })

    it('returns "LLM edited" for chat-edit', () => {
        expect(getEditLabel('chat-edit')).toBe('LLM edited')
    })

    it('returns "LLM edited" for conclude', () => {
        expect(getEditLabel('conclude')).toBe('LLM edited')
    })

    it('returns "LLM edited" for chat-tool', () => {
        expect(getEditLabel('chat-tool')).toBe('LLM edited')
    })
})

describe('getSourceLabel', () => {
    it('returns "via Chat" for chat-tool', () => {
        expect(getSourceLabel('chat-tool')).toBe('via Chat')
    })

    it('returns "via Memorize" for conclude', () => {
        expect(getSourceLabel('conclude')).toBe('via Memorize')
    })

    it('returns "Manual edit" for manual', () => {
        expect(getSourceLabel('manual')).toBe('Manual edit')
    })

    it('returns "LLM edit" for chat-edit', () => {
        expect(getSourceLabel('chat-edit')).toBe('LLM edit')
    })
})

describe('formatVersionLabel', () => {
    it('combines date and source label', () => {
        const ts = new Date('2026-03-14T12:00:00Z').getTime()
        const label = formatVersionLabel(ts, 'chat-edit')
        expect(label).toContain('Mar')
        expect(label).toContain('2026')
        expect(label).toContain('LLM edit')
    })
})
