// =============================================================================
// Streaming Slice — transient streaming state + stop action
// =============================================================================

import type { ChatState } from '../types';
import { session } from '../session';

export function createStreamingSlice(): Pick<
    ChatState,
    | 'isStreaming'
    | 'streamingText'
    | 'retryAttempt'
    | 'activeToolCalls'
    | 'thinkingText'
    | 'stopGeneration'
> {
    return {
        // State
        isStreaming: false,
        streamingText: '',
        retryAttempt: 0,
        activeToolCalls: [],
        thinkingText: '',

        // Actions
        stopGeneration: () => {
            if (session.activeAbortController) {
                session.activeAbortController.abort();
                session.activeAbortController = null;
            }
        },
    };
}
