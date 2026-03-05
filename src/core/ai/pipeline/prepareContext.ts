// =============================================================================
// prepareContext — Context enrichment, merge & persistence
//
// Extracted from chatStore.sendMessage() for SRP.
// Pipeline step: enrich raw context → merge with existing → persist.
// =============================================================================

import type { AppContextItem } from '../../types/appContext';
import { mergeContextItems } from '../../types/appContext';
import { enrichContextWithDeltas } from './enrichContextWithDeltas';
import { ChatService } from '../../services/chatService';
import { debug } from '../../utils/debug';

export interface PreparedContext {
    /** Enriched context items for this message (undefined if no context attached) */
    appContext: AppContextItem[] | undefined;
    /** Merged persisted context (accumulated from all conversation messages) */
    persistedContext: AppContextItem[] | undefined;
}

/**
 * Enrich raw context with deltas + traffic sources, merge with existing
 * conversation context, and persist to Firestore.
 *
 * @param rawItems - Raw context items snapshot from appContextStore
 * @param userId - Firebase user ID
 * @param channelId - Current channel ID
 * @param convId - Conversation ID
 * @param existingPersisted - Previously persisted context from conversation doc
 * @returns Prepared context bundle for building system prompt
 */
export async function prepareContext(
    rawItems: AppContextItem[],
    userId: string,
    channelId: string,
    convId: string,
    existingPersisted: AppContextItem[],
): Promise<PreparedContext> {
    // 1. Enrich (runs in background while user sees dots)
    let enrichedItems = rawItems;

    if (enrichedItems.length > 0) {
        enrichedItems = await enrichContextWithDeltas(enrichedItems, userId);
        // Traffic sources enrichment removed — now handled by analyzeTrafficSources tool
    }

    const appContext = enrichedItems.length > 0 ? enrichedItems : undefined;

    // 2. Merge with existing persistent context
    const mergedContext = appContext
        ? mergeContextItems(existingPersisted, appContext)
        : existingPersisted;
    const persistedContext = mergedContext.length > 0 ? mergedContext : undefined;

    // 3. Persist merged context to conversation doc (fire-and-forget)
    if (persistedContext && appContext) {
        ChatService.updateConversation(userId, channelId, convId, { persistedContext })
            .catch((err: unknown) => debug.chat('⚠️ Failed to persist context:', err));
    }

    return { appContext, persistedContext };
}
