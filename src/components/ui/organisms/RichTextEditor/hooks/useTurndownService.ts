import { useMemo } from 'react'
import type TurndownService from 'turndown'
import { createBaseTurndownService } from '../utils/baseTurndownService'

/**
 * Full Turndown service for the RichTextEditor.
 *
 * Extends the shared base (ATX headings, fenced code, span/br, empty paragraphs)
 * with rules for tables, lists, alignment, blockquotes, and details blocks.
 */
export function useTurndownService(): TurndownService {
    return useMemo(() => {
        const service = createBaseTurndownService()

        /**
         * Rule: Convert HTML tables to GFM pipe-format markdown
         *
         * Ensures stable round-trip: LLM writes pipe tables → editor parses
         * to HTML → Turndown converts back to pipe format. Without this,
         * tables stay as HTML on each save, bloating content 2x and breaking
         * diff views with phantom changes.
         */
        service.addRule('gfm-table', {
            filter: 'table',
            replacement: function (_content, node) {
                const table = node as HTMLElement
                const rows = Array.from(table.querySelectorAll('tr'))
                if (rows.length === 0) return ''

                // Build matrix: each row → array of cell markdown
                // Use service.turndown() per cell to preserve inline formatting
                // (bold, italic, links) instead of losing it via textContent
                const matrix = rows.map(row => {
                    const cells = Array.from(row.querySelectorAll('th, td'))
                    return cells.map(cell => {
                        const cellMd = service.turndown(cell.innerHTML)
                        return cellMd.trim()
                            .replace(/\|/g, '\\|')
                            .replace(/\n/g, ' ')
                    })
                })

                const colCount = Math.max(...matrix.map(r => r.length))
                const pad = (arr: string[]) =>
                    Array.from({ length: colCount }, (_, i) => arr[i] || '')

                const header = '| ' + pad(matrix[0] || []).join(' | ') + ' |'
                const separator = '|' + Array.from({ length: colCount }, () => '---').join('|') + '|'
                const body = matrix.slice(1).map(row =>
                    '| ' + pad(row).join(' | ') + ' |'
                )

                return '\n\n' + [header, separator, ...body].join('\n') + '\n\n'
            }
        })

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
