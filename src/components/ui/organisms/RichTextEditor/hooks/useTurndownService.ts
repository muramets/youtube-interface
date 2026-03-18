import { useMemo } from 'react'
import TurndownService from 'turndown'

/**
 * Custom hook for configuring and memoizing the Turndown service.
 *
 * Turndown converts HTML back to Markdown when the editor content changes.
 *
 * Business Logic:
 * - ATX heading style (# Heading) instead of Setext (underlined)
 * - Fenced code blocks (```) instead of indented
 * - Preserves HTML elements that don't have Markdown equivalents (span, br, tables)
 * - Custom rules for indented list items (visual indentation via margin-left)
 * - Custom rules for text-aligned paragraphs (center, right, justify)
 * - Custom rules for empty paragraphs (converts to &nbsp; for persistence)
 *
 * @returns Configured TurndownService instance
 */
export function useTurndownService(): TurndownService {
    return useMemo(() => {
        const service = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        })

        // Preserve HTML elements that don't map cleanly to Markdown
        service.keep(['span', 'br'])

        // Preserve tables in HTML format (Markdown tables are limited)
        service.keep(['table', 'thead', 'tbody', 'tr', 'th', 'td'])

        /**
         * Rule: Compact list items
         *
         * Turndown default produces "1.  " (double space) and adds blank lines
         * between items when <p> is inside <li> (which Tiptap always does).
         * This rule matches LLM-style compact markdown: "1. " (single space),
         * no blank lines between items.
         */
        service.addRule('compact-list-item', {
            filter: function (node) {
                // Match all <li> EXCEPT indented ones (those have their own rule)
                return node.nodeName === 'LI' &&
                    (!node.style.marginLeft || node.style.marginLeft === '0px')
            },
            replacement: function (content, node) {
                const element = node as HTMLElement

                // Clean content: strip leading/trailing newlines, normalize internal ones
                const cleaned = content
                    .replace(/^\n+/, '')
                    .replace(/\n+$/, '')
                    .replace(/\n/gm, '\n    ')  // indent continuation lines

                // Determine prefix: numbered or bullet
                const parent = element.parentNode as HTMLElement
                const isOrdered = parent?.nodeName === 'OL'

                let prefix: string
                if (isOrdered) {
                    const start = parseInt(parent.getAttribute('start') || '1', 10)
                    const index = Array.from(parent.children).indexOf(element)
                    prefix = `${start + index}. `  // single space after number
                } else {
                    prefix = '* '
                }

                // Single newline between items, not double
                const suffix = element.nextElementSibling ? '\n' : ''
                return prefix + cleaned + suffix
            },
        })

        /**
         * Rule: Preserve indented list items
         *
         * Our IndentedListItem extension adds visual indentation via margin-left.
         * This isn't standard Markdown, so we preserve it as HTML.
         */
        service.addRule('indented-list-item', {
            filter: function (node) {
                return (
                    node.nodeName === 'LI' &&
                    !!node.style.marginLeft &&
                    node.style.marginLeft !== '0px'
                )
            },
            replacement: function (content, node) {
                const element = node as HTMLElement
                const style = element.getAttribute('style')

                // Wrap markdown content in HTML <li> to preserve style
                // The newlines ensure markdown inside is parsed correctly
                return `<li style="${style}">\n\n${content}\n\n</li>`
            }
        })

        /**
         * Rule: Preserve text-aligned paragraphs
         *
         * Markdown doesn't support text alignment, so we preserve it as HTML.
         */
        service.addRule('aligned-paragraph', {
            filter: function (node) {
                return (
                    node.nodeName === 'P' &&
                    (node.style.textAlign === 'center' ||
                        node.style.textAlign === 'right' ||
                        node.style.textAlign === 'justify')
                )
            },
            replacement: function (content, node) {
                const element = node as HTMLElement
                const style = element.getAttribute('style')
                return `<p style="${style}">${content}</p>`
            }
        })

        /**
         * Rule: Preserve empty paragraphs
         *
         * Empty lines are important for document structure.
         * We convert them to &nbsp; which survives the Markdown roundtrip.
         */
        service.addRule('empty-paragraph', {
            filter: function (node) {
                // Detect empty paragraphs in various forms:
                // - <p></p>
                // - <p><br></p>
                // - <p>&#8203;</p> (Zero-Width Space from our preprocessing)
                return (
                    node.nodeName === 'P' &&
                    (
                        node.innerHTML.trim() === '' ||
                        node.innerHTML === '<br>' ||
                        node.textContent?.trim() === '' ||
                        node.textContent === '\u200B' || // Zero Width Space
                        (node.childNodes.length === 1 && node.firstChild?.nodeName === 'BR')
                    )
                )
            },
            replacement: function () {
                // Return &nbsp; to create a paragraph with content in Markdown
                // This ensures 'marked' produces <p>&nbsp;</p> on load
                return '&nbsp;\n\n'
            }
        })

        /**
         * Rule: Preserve blockquote border colors
         *
         * Custom border colors are stored in data-border-color attribute.
         * We preserve this as HTML to maintain the color across save/load.
         */
        service.addRule('colored-blockquote', {
            filter: function (node) {
                return (
                    node.nodeName === 'BLOCKQUOTE' &&
                    node.hasAttribute('data-border-color')
                )
            },
            replacement: function (content, node) {
                const element = node as HTMLElement
                const borderColor = element.getAttribute('data-border-color')
                const style = element.getAttribute('style') || ''

                // Preserve both data attribute and inline style
                return `<blockquote data-border-color="${borderColor}" style="${style}">\n\n${content}\n\n</blockquote>`
            }
        })

        /**
         * Rule: Convert details-summary div to <summary> HTML tag
         *
         * Preserves inner HTML (may contain inline formatting).
         */
        service.addRule('details-summary', {
            filter: function (node) {
                return (
                    node.nodeName === 'DIV' &&
                    (node as HTMLElement).getAttribute('data-type') === 'details-summary'
                )
            },
            replacement: function (_content, node) {
                const el = node as HTMLElement
                return `<summary>${el.innerHTML.trim()}</summary>\n`
            }
        })

        /**
         * Rule: Strip details-content wrapper, pass through children as markdown
         */
        service.addRule('details-content', {
            filter: function (node) {
                return (
                    node.nodeName === 'DIV' &&
                    (node as HTMLElement).getAttribute('data-type') === 'details-content'
                )
            },
            replacement: function (_content, node) {
                // Use innerHTML to preserve HTML structure inside the content
                // (markdown won't be parsed inside HTML blocks by marked)
                const el = node as HTMLElement
                return el.innerHTML.trim()
            }
        })

        /**
         * Rule: Convert details div wrapper to <details> HTML tag
         *
         * No blank lines inside — keeps it as a single HTML block for marked.
         */
        service.addRule('details-block', {
            filter: function (node) {
                return (
                    node.nodeName === 'DIV' &&
                    (node as HTMLElement).getAttribute('data-type') === 'details'
                )
            },
            replacement: function (content) {
                return `\n<details>\n${content.trim()}\n</details>\n\n`
            }
        })

        return service
    }, [])
}
