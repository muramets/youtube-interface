import { marked } from 'marked'

/**
 * Parses markdown string to HTML using the marked library.
 *
 * Business Logic:
 * - Synchronous parsing to avoid race conditions during initialization
 * - GFM (GitHub Flavored Markdown) support for tables, strikethrough, etc.
 * - Line breaks are preserved (breaks: true)
 * - Used for initial content loading and external value changes
 *
 * @param markdown - Markdown string to parse
 * @returns HTML string ready for Tiptap editor
 */
export function parseMarkdownToHTML(markdown: string): string {
    if (!markdown) return ''

    return marked.parse(markdown, {
        async: false,
        gfm: true,
        breaks: true,
    }) as string
}
