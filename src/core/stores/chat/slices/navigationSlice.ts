// =============================================================================
// Navigation Slice — chat panel open/close, view routing, active IDs
// =============================================================================

import type { ChatView } from '../../../types/chat/chat';
import type { ChatState } from '../types';
import { session } from '../session';

/** Tracks which conversation the memoriesSnapshot was frozen for — survives setActiveConversation(null) navigations. */
let frozenForConversationId: string | null = null;
/** When the snapshot was frozen — used to detect staleness (cache TTL expiry). */
let frozenAt: number | null = null;

/** Anthropic prompt cache TTL. After this period, frozen snapshot provides no cache benefit. */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Sync frozenForConversationId after lazy-create in sendSlice (where setActiveConversation can't be called — it resets messages). */
export function setFrozenConversationId(id: string): void {
    frozenForConversationId = id;
    frozenAt = Date.now();
}

/** Check if the frozen snapshot is stale (older than cache TTL). If so, refresh from live memories. */
export function refreshSnapshotIfStale(get: () => ChatState, set: (partial: Partial<ChatState>) => void): void {
    if (frozenAt !== null && Date.now() - frozenAt > CACHE_TTL_MS) {
        frozenAt = Date.now();
        set({ memoriesSnapshot: get().memories });
    }
}

export function createNavigationSlice(
    set: (partial: Partial<ChatState>) => void,
    get: () => ChatState,
): Pick<
    ChatState,
    | 'isOpen'
    | 'view'
    | 'activeProjectId'
    | 'activeConversationId'
    | 'pendingConversationId'
    | 'toggleOpen'
    | 'setOpen'
    | 'setView'
    | 'setActiveProject'
    | 'setActiveConversation'
    | 'startNewChat'
> {
    return {
        // State
        isOpen: false,
        view: 'conversations' as ChatView,
        activeProjectId: null,
        activeConversationId: null,
        pendingConversationId: null,

        // Actions
        toggleOpen: () => set({ isOpen: !get().isOpen }),
        setOpen: (open) => set({ isOpen: open }),
        setView: (view) => set({ view }),
        setActiveProject: (id) => set({ activeProjectId: id, view: 'conversations' }),

        setActiveConversation: (id) => {
            // Invalidate any running stream's UI callbacks (stream itself keeps running)
            session.streamingNonce++;
            const isStale = frozenAt !== null && Date.now() - frozenAt > CACHE_TTL_MS;
            const shouldRefreshSnapshot = id !== null && (id !== frozenForConversationId || isStale);
            if (shouldRefreshSnapshot) {
                frozenForConversationId = id;
                frozenAt = Date.now();
            }
            set({
                activeConversationId: id,
                pendingConversationId: null,
                pendingModel: null,
                pendingThinkingOptionId: null,
                view: id ? 'chat' : 'conversations',
                messages: [],
                isStreaming: false,
                streamingText: '',
                activeToolCalls: [],
                thinkingText: '',
                stoppedResponse: null,
                isWaitingForServerResponse: false,
                error: null,
                hasMoreMessages: false,
                pendingLargePayloadConfirmation: null,
                // Freeze memories when entering a NEW conversation — returning to the same chat (even via conversation list) keeps the frozen snapshot
                ...(shouldRefreshSnapshot ? { memoriesSnapshot: get().memories } : {}),
            });
        },

        startNewChat: () => {
            // Invalidate any running stream's UI callbacks (stream itself keeps running)
            session.streamingNonce++;
            frozenForConversationId = null;
            frozenAt = Date.now();
            set({
                activeConversationId: null,
                pendingConversationId: crypto.randomUUID(),
                pendingModel: null,
                pendingThinkingOptionId: null,
                view: 'chat',
                messages: [],
                isStreaming: false,
                streamingText: '',
                stoppedResponse: null,
                pendingLargePayloadConfirmation: null,
                // Freeze memories for this conversation — prevents cache invalidation when saveMemory updates Firestore mid-chat
                memoriesSnapshot: get().memories,
            });
        },
    };
}
