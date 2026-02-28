// =============================================================================
// useTurndownService — HTML → Markdown conversion (memoized)
// =============================================================================

import { useMemo } from 'react';
import TurndownService from 'turndown';

/**
 * Returns a memoized TurndownService configured for sticky note content.
 *
 * Simplified from MonkeyLearn's version — retains only:
 *  - ATX headings (`# Heading`)
 *  - Fenced code blocks (```)
 *  - Empty paragraph preservation via `&nbsp;`
 *
 * Rules for text alignment, indented list items, and colored blockquotes
 * are omitted — not needed in sticky notes.
 */
export function useTurndownService(): TurndownService {
    return useMemo(() => {
        const service = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
        });

        // Preserve <span> and <br> that don't have clean Markdown equivalents
        service.keep(['span', 'br']);

        // Empty-paragraph rule: convert empty <p> to &nbsp; so blank lines persist
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
                );
            },
            replacement() {
                return '&nbsp;\n\n';
            },
        });

        return service;
    }, []);
}
