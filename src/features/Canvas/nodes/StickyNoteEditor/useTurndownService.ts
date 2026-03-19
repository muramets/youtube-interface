// =============================================================================
// useTurndownService — HTML → Markdown conversion (memoized)
// =============================================================================

import { useMemo } from 'react';
import type TurndownService from 'turndown';
import { createBaseTurndownService } from '../../../../components/ui/organisms/RichTextEditor/utils/baseTurndownService';

/**
 * Returns a memoized TurndownService configured for sticky note content.
 *
 * Uses the shared base factory (ATX headings, fenced code, span/br preservation,
 * empty paragraph rule). No additional rules needed — sticky notes don't
 * use text alignment, indented list items, or colored blockquotes.
 */
export function useTurndownService(): TurndownService {
    return useMemo(() => createBaseTurndownService(), []);
}
