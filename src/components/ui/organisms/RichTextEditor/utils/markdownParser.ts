import { marked } from 'marked'

/**
 * Parses markdown string to HTML using the marked library.
 *
 * Business Logic:
 * - Synchronous parsing to avoid race conditions during initialization
 * - GFM (GitHub Flavored Markdown) support for tables, strikethrough, etc.
 * - Line breaks are preserved (breaks: true)
 * - Post-processes <details> blocks to add data-type wrappers for Tiptap
 * - Used for initial content loading and external value changes
 *
 * @param markdown - Markdown string to parse
 * @returns HTML string ready for Tiptap editor
 */
export function parseMarkdownToHTML(markdown: string): string {
    if (!markdown) return ''

    let html = marked.parse(markdown, {
        async: false,
        gfm: true,
        breaks: true,
    }) as string

    html = wrapDetailsContent(html)

    return html
}

/**
 * Wraps non-summary content inside <details> with a <div data-type="details-content"> wrapper.
 *
 * Tiptap's parseHTML for DetailsContent matches div[data-type="details-content"],
 * but markdown-loaded HTML has raw <details><summary>...</summary>content...</details>.
 * This function bridges the gap by adding the wrapper that Tiptap expects.
 *
 * Uses DOMParser for robust handling of nested details blocks.
 */
function wrapDetailsContent(html: string): string {
    if (!html.includes('<details')) return html

    const parser = new DOMParser()
    const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')

    doc.querySelectorAll('details').forEach(details => {
        // Skip if already wrapped (e.g. from editor round-trip)
        if (details.querySelector(':scope > [data-type="details-content"]')) return

        const summary = details.querySelector(':scope > summary')
        const wrapper = doc.createElement('div')
        wrapper.setAttribute('data-type', 'details-content')

        // Move all non-summary children into the wrapper
        const children = Array.from(details.childNodes)
        for (const child of children) {
            if (child !== summary) {
                wrapper.appendChild(child)
            }
        }

        details.appendChild(wrapper)
    })

    return doc.body.innerHTML
}
