/**
 * HTML preprocessing utilities for the RichTextEditor
 *
 * These utilities handle edge cases in HTML-to-Markdown conversion,
 * particularly around empty paragraphs and whitespace preservation.
 */

/**
 * Preprocesses HTML before converting to Markdown to preserve empty paragraphs.
 *
 * Business Logic:
 * - Tiptap represents empty lines as <p></p> or <p><br></p>
 * - Turndown's "blank" rule strips these by default
 * - We inject Zero-Width Space (&#8203;) to make paragraphs "non-empty"
 * - ZWSP is invisible but counts as content, preventing removal
 * - This ensures empty lines survive the HTML -> Markdown -> HTML roundtrip
 *
 * @param html - Raw HTML from Tiptap editor
 * @returns Processed HTML with preserved empty paragraphs
 */
export function preprocessEmptyParagraphs(html: string): string {
    // Replace completely empty paragraphs
    html = html.replace(/<p><\/p>/g, '<p>&#8203;</p>')

    // Replace paragraphs with only a break tag
    html = html.replace(/<p><br\s*\/?><\/p>/g, '<p>&#8203;</p>')

    // Handle paragraphs with class-based breaks (ProseMirror-trailingBreak)
    html = html.replace(/<p><br\s+class="[^"]*"\s*\/?><\/p>/g, '<p>&#8203;</p>')

    // Normalize &nbsp; to ZWSP (previous attempts might have used &nbsp;)
    html = html.replace(/<p>&nbsp;<\/p>/g, '<p>&#8203;</p>')

    return html
}

/**
 * Strips color and background-color styles from pasted HTML.
 *
 * Business Logic:
 * - External paste should not bring unwanted colors into the editor
 * - Users can apply colors using the editor's color picker
 * - Other formatting (alignment, etc.) is preserved
 * - Internal paste (ProseMirror) is detected by data-pm-slice attribute
 *
 * @param html - Pasted HTML content
 * @returns HTML with color styles removed (if external paste)
 */
export function stripColorStyles(html: string): string {
    // Check if content comes from ProseMirror/Tiptap (internal paste)
    // If so, preserve all formatting including colors
    if (html.includes('data-pm-slice')) {
        return html
    }

    // External paste: strip color-related styles only
    return html
        .replace(/color\s*:[^;"]+;?/gi, '')
        .replace(/background(-color)?\s*:[^;"]+;?/gi, '')
}
