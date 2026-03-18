// =============================================================================
// Streaming Slice — transient streaming state + stop action
// =============================================================================

import type { ChatState } from '../types';
import { session } from '../session';
import { ChatService } from '../../../services/ai/chatService';

export function createStreamingSlice(
    get: () => ChatState,
): Pick<
    ChatState,
    | 'isStreaming'
    | 'streamingText'
    | 'retryAttempt'
    | 'activeToolCalls'
    | 'thinkingText'
    | 'stoppedResponse'
    | 'stopGeneration'
> {
    return {
        // State
        isStreaming: false,
        streamingText: '',
        retryAttempt: 0,
        activeToolCalls: [],
        thinkingText: '',
        stoppedResponse: null,

        // Actions
        stopGeneration: () => {
            // 1. Signal server via Firestore BEFORE aborting fetch —
            //    ensures the Cloud Function receives the abort even if
            //    the HTTP connection is severed by the client-side abort.
            const { userId, channelId, activeConversationId } = get();
            if (userId && channelId && activeConversationId) {
                ChatService.requestAbort(userId, channelId, activeConversationId)
                    .catch(() => { /* best-effort — client-side abort still works */ });
            }

            // 2. Abort client-side fetch (existing behavior)
            if (session.activeAbortController) {
                session.activeAbortController.abort();
                session.activeAbortController = null;
            }
        },
    };
}
