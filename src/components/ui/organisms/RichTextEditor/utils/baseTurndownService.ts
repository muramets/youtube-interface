import TurndownService from 'turndown'

/**
 * Create a base TurndownService with common configuration shared
 * across all lightweight editors (chat input, sticky notes).
 *
 * Includes:
 * - ATX headings, fenced code blocks
 * - Preserved span/br elements (for marks and hard breaks)
 * - Empty paragraph rule (converts empty <p> to &nbsp;)
 *
 * The full RichTextEditor extends this with additional rules
 * (tables, lists, alignment, blockquotes, details).
 */
export function createBaseTurndownService(): TurndownService {
    const service = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
    })

    service.keep(['span', 'br'])

    service.addRule('empty-paragraph', {
        filter(node) {
            return (
                node.nodeName === 'P' &&
                (
                    node.innerHTML.trim() === '' ||
                    node.innerHTML === '<br>' ||
                    node.textContent?.trim() === '' ||
                    node.textContent === '\u200B' ||
                    (node.childNodes.length === 1 && node.firstChild?.nodeName === 'BR')
                )
            )
        },
        replacement() {
            return '&nbsp;\n\n'
        },
    })

    return service
}
