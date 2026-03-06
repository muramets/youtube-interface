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
            if (session.activeAbortController) {
                session.activeAbortController.abort();
                session.activeAbortController = null;
            }
        },
    };
}
