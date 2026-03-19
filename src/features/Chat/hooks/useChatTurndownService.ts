import { useMemo } from 'react'
import type TurndownService from 'turndown'
import { createBaseTurndownService } from '../../../components/ui/organisms/RichTextEditor/utils/baseTurndownService'

/**
 * Simplified Turndown service for chat input.
 *
 * Uses the shared base factory (ATX headings, fenced code, span/br preservation,
 * empty paragraph rule). No additional rules needed — chat input doesn't
 * support tables, lists, alignment, blockquotes, or details.
 */
export function useChatTurndownService(): TurndownService {
    return useMemo(() => createBaseTurndownService(), [])
}
