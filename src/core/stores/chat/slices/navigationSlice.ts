// =============================================================================
// Navigation Slice — chat panel open/close, view routing, active IDs
// =============================================================================

import type { ChatView, ConversationMemory } from '../../../types/chat/chat';
import type { ChatState } from '../types';
import { session } from '../session';

/** Anthropic prompt cache TTL. After this period, frozen snapshot provides no cache benefit. */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FROZEN_META_KEY = 'chat:frozenSnapshot';       // id + at (lightweight)
const FROZEN_DATA_KEY = 'chat:frozenMemories';       // actual snapshot (~14KB)

/** Tracks which conversation the memoriesSnapshot was frozen for — survives page reload via sessionStorage. */
let frozenForConversationId: string | null = null;
/** When the snapshot was frozen — used to detect staleness (cache TTL expiry). */
let frozenAt: number | null = null;
/** One-time restored snapshot from sessionStorage — consumed on first setActiveConversation after reload. */
let restoredSnapshot: ConversationMemory[] | null = null;

// Restore frozen state from sessionStorage (survives page reload within same tab)
try {
    const meta = sessionStorage.getItem(FROZEN_META_KEY);
    if (meta) {
        const parsed = JSON.parse(meta) as { id: string; at: number };
        frozenForConversationId = parsed.id;
        frozenAt = parsed.at;
    }
    const data = sessionStorage.getItem(FROZEN_DATA_KEY);
    if (data && frozenForConversationId) {
        restoredSnapshot = JSON.parse(data) as ConversationMemory[];
    }
} catch { /* sessionStorage unavailable or corrupt — start fresh */ }

function persistFrozenMeta(): void {
    try {
        if (frozenForConversationId) {
            sessionStorage.setItem(FROZEN_META_KEY, JSON.stringify({ id: frozenForConversationId, at: frozenAt }));
        } else {
            sessionStorage.removeItem(FROZEN_META_KEY);
            sessionStorage.removeItem(FROZEN_DATA_KEY);
        }
    } catch { /* sessionStorage unavailable — no-op */ }
}

function persistFrozenData(snapshot: ConversationMemory[]): void {
    try {
        sessionStorage.setItem(FROZEN_DATA_KEY, JSON.stringify(snapshot));
    } catch { /* sessionStorage full or unavailable — no-op, graceful degradation */ }
}

/** Sync frozenForConversationId after lazy-create in sendSlice (where setActiveConversation can't be called — it resets messages). */
export function setFrozenConversationId(id: string): void {
    frozenForConversationId = id;
    frozenAt = Date.now();
    persistFrozenMeta();
}

/** Check if the frozen snapshot is stale (older than cache TTL). If so, refresh from live memories.
 *  Called before each sendMessage — also extends frozenAt to track cache TTL renewal
 *  (Anthropic resets TTL on each cache use, so sending a message = cache still alive). */
export function refreshSnapshotIfStale(get: () => ChatState, set: (partial: Partial<ChatState>) => void): void {
    if (frozenAt === null) return;
    if (Date.now() - frozenAt > CACHE_TTL_MS) {
        // Stale — cache expired, refresh snapshot with live memories
        const snapshot = get().memories;
        frozenAt = Date.now();
        persistFrozenMeta();
        persistFrozenData(snapshot);
        set({ memoriesSnapshot: snapshot });
    } else {
        // Not stale — extend TTL tracking (cache was just used by this message)
        frozenAt = Date.now();
        persistFrozenMeta();
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
            // Determine which snapshot to use
            let snapshotUpdate: { memoriesSnapshot: ConversationMemory[] } | Record<string, never> = {};
            if (shouldRefreshSnapshot) {
                // New or stale conversation — fresh snapshot from live memories
                const snapshot = get().memories;
                frozenForConversationId = id;
                frozenAt = Date.now();
                persistFrozenMeta();
                persistFrozenData(snapshot);
                snapshotUpdate = { memoriesSnapshot: snapshot };
            } else if (restoredSnapshot) {
                // Returning to frozen conversation after page reload — restore saved snapshot
                snapshotUpdate = { memoriesSnapshot: restoredSnapshot };
                restoredSnapshot = null;
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
                ...snapshotUpdate,
            });
        },

        startNewChat: () => {
            // Invalidate any running stream's UI callbacks (stream itself keeps running)
            session.streamingNonce++;
            const snapshot = get().memories;
            frozenForConversationId = null;
            frozenAt = Date.now();
            persistFrozenMeta();
            persistFrozenData(snapshot);
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
                memoriesSnapshot: snapshot,
            });
        },
    };
}
