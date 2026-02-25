// =============================================================================
// useMarkdownSync — Bidirectional Markdown ↔ HTML sync for TipTap
// =============================================================================

import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import type TurndownService from 'turndown';
import { preprocessEmptyParagraphs } from './htmlProcessor';
import { parseMarkdownToHTML } from './markdownParser';

/**
 * Keeps a TipTap editor in sync with an external Markdown value.
 *
 * Two directions:
 *  1. User types → HTML → Turndown → onChange(markdown)
 *  2. External `value` changes → marked → setContent(html)
 *
 * Prevents cursor jumps by tracking the last emitted value and skipping
 * re-imports when the editor itself caused the change.
 */
export function useMarkdownSync(
    editor: Editor | null,
    value: string,
    onChange: (value: string) => void,
    turndownService: TurndownService,
): void {
    const lastValueRef = useRef(value);

    // Direction 2: external value → editor HTML
    useEffect(() => {
        if (!editor) return;

        const currentHTML = editor.getHTML();
        const currentMarkdown = turndownService.turndown(currentHTML);

        if (value !== currentMarkdown && value !== lastValueRef.current) {
            const html = parseMarkdownToHTML(value);
            // Don't overwrite while user is typing
            if (!editor.isFocused) {
                editor.commands.setContent(html);
            }
        }
    }, [value, editor, turndownService]);

    // Direction 1: editor HTML → markdown
    useEffect(() => {
        if (!editor) return;

        const handleUpdate = () => {
            let html = editor.getHTML();
            html = preprocessEmptyParagraphs(html);
            const markdown = turndownService.turndown(html);

            if (markdown !== lastValueRef.current) {
                lastValueRef.current = markdown;
                onChange(markdown);
            }
        };

        editor.on('update', handleUpdate);
        return () => { editor.off('update', handleUpdate); };
    }, [editor, onChange, turndownService]);
}
