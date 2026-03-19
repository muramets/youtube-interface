import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatTurndownService } from '../useChatTurndownService';

describe('useChatTurndownService', () => {
    it('converts plain text paragraph', () => {
        const { result } = renderHook(() => useChatTurndownService());
        expect(result.current.turndown('<p>hello world</p>')).toBe('hello world');
    });

    it('converts paragraph with hardBreak', () => {
        const { result } = renderHook(() => useChatTurndownService());
        const output = result.current.turndown('<p>line one<br>line two</p>');
        expect(output).toContain('line one');
        expect(output).toContain('line two');
    });

    it('converts video ref mark link', () => {
        const { result } = renderHook(() => useChatTurndownService());
        const html = '<p>Check <a href="vid://abc123">My Video</a> here</p>';
        expect(result.current.turndown(html)).toBe(
            'Check [My Video](vid://abc123) here'
        );
    });

    it('converts KI ref mark link', () => {
        const { result } = renderHook(() => useChatTurndownService());
        const html = '<p>See <a href="ki://item456">Analysis Report</a></p>';
        expect(result.current.turndown(html)).toBe(
            'See [Analysis Report](ki://item456)'
        );
    });

    it('handles empty paragraph with <br> via empty-paragraph rule', () => {
        const { result } = renderHook(() => useChatTurndownService());
        // Tiptap emits <p><br></p> for empty lines (not bare <p></p>)
        const output = result.current.turndown('<p><br></p>');
        expect(output).toContain('&nbsp;');
    });

    it('handles empty paragraph with zero-width space', () => {
        const { result } = renderHook(() => useChatTurndownService());
        const output = result.current.turndown('<p>\u200B</p>');
        expect(output).toContain('&nbsp;');
    });

    it('separates multiple paragraphs with double newline', () => {
        const { result } = renderHook(() => useChatTurndownService());
        const html = '<p>First</p><p>Second</p>';
        const output = result.current.turndown(html);
        expect(output).toContain('First');
        expect(output).toContain('Second');
        expect(output).toMatch(/First\n\nSecond/);
    });

    it('converts mixed content with multiple ref links', () => {
        const { result } = renderHook(() => useChatTurndownService());
        const html =
            '<p>Text <a href="vid://v1">Video Title</a> more text <a href="ki://k1">KI Title</a></p>';
        expect(result.current.turndown(html)).toBe(
            'Text [Video Title](vid://v1) more text [KI Title](ki://k1)'
        );
    });

    it('returns empty string for empty input', () => {
        const { result } = renderHook(() => useChatTurndownService());
        expect(result.current.turndown('')).toBe('');
    });
});
