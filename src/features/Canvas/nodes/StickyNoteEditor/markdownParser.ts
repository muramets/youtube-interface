// =============================================================================
// markdownParser — Markdown → HTML conversion for TipTap initialization
// =============================================================================

import { marked } from 'marked';

/**
 * Synchronously parses a Markdown string into HTML for TipTap's `setContent`.
 *
 * Uses GFM (GitHub Flavored Markdown) with `breaks: true` so single newlines
 * become `<br>` — matching the sticky note's `remarkBreaks` behavior in view mode.
 */
export function parseMarkdownToHTML(markdown: string): string {
    if (!markdown) return '';

    return marked.parse(markdown, {
        async: false,
        gfm: true,
        breaks: true,
    }) as string;
}
