// =============================================================================
// htmlProcessor — Preserve empty paragraphs during HTML → Markdown roundtrip
// =============================================================================

/**
 * Injects Zero-Width Space into empty `<p>` tags produced by TipTap so that
 * Turndown doesn't strip them. This ensures blank lines survive the
 * HTML → Markdown → HTML roundtrip.
 */
export function preprocessEmptyParagraphs(html: string): string {
    // <p></p>
    html = html.replace(/<p><\/p>/g, '<p>&#8203;</p>');
    // <p><br></p> or <p><br/></p>
    html = html.replace(/<p><br\s*\/?><\/p>/g, '<p>&#8203;</p>');
    // <p><br class="ProseMirror-trailingBreak"></p>
    html = html.replace(/<p><br\s+class="[^"]*"\s*\/?><\/p>/g, '<p>&#8203;</p>');
    // <p>&nbsp;</p>
    html = html.replace(/<p>&nbsp;<\/p>/g, '<p>&#8203;</p>');
    return html;
}
